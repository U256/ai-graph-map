import Feature from 'ol/Feature';
import Circle from 'ol/geom/Circle';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Style, { type RenderFunction } from 'ol/style/Style';
import { nestedGroupLinkChildren } from '../../graph/nestedLinks';
import { createTypeColors } from '../../graph/nodeColors';
import {
    createCloudLayouts,
    createFocusedGroupLayout,
    GROUP_FOCUS_SIZE,
    NESTED_GRAPH_SCALE,
    type CloudLayout,
} from '../../graph/nodeGeometry';
import { resolveLinks } from '../../graph/resolveLinks';
import { createTextMeasurer } from '../../graph/textMeasure';
import type { GraphData, GraphNode } from '../../types/graph';
import { graphCoordinate, nestedCoordinate } from './openLayerCoordinates';
import { drawOpenLayerNode } from './openLayerNodeDrawing';

function nodeRenderer(node: GraphNode, groupLayout: CloudLayout, color: string): RenderFunction {
    return (pixelCoordinates, state) => {
        if (!Array.isArray(pixelCoordinates) || typeof pixelCoordinates[0] !== 'number') return;
        const [x, y] = pixelCoordinates as [number, number];
        const { context } = state;
        drawOpenLayerNode(
            context,
            { node, layout: groupLayout, x, y, selected: false, loading: node.childrenLoading },
            () => color,
        );
    };
}

function nestedEntries(data: GraphData, x: number, y: number, scale: number): NestedEntry[] {
    return data.nodes.flatMap((node) => [
        { node, x: x + (node.x ?? 0) * scale, y: y + (node.y ?? 0) * scale },
        ...(node.type === 'group' && node.children && node.childrenLoading !== true
            ? nestedEntries(
                  node.children,
                  x + (node.x ?? 0) * scale,
                  y + (node.y ?? 0) * scale,
                  scale * NESTED_GRAPH_SCALE,
              )
            : []),
    ]);
}

type NestedEntry = { node: GraphNode; x: number; y: number };

function nestedRadius(data: GraphData, measure: ReturnType<typeof createTextMeasurer>, baseResolution: number): number {
    const entries = nestedEntries(data, 0, 0, NESTED_GRAPH_SCALE);
    if (!entries.length) return GROUP_FOCUS_SIZE / 2;
    return entries.reduce((radius, entry) => {
        const layout = createCloudLayouts([entry.node], measure).get(entry.node)!;
        const bodyRadius = (Math.hypot(layout.width, layout.height) * baseResolution) / 2;
        return Math.max(radius, Math.hypot(entry.x, entry.y) + bodyRadius);
    }, 0);
}

function focusedLayout(
    node: GraphNode,
    baseLayout: CloudLayout,
    measure: ReturnType<typeof createTextMeasurer>,
    baseResolution: number,
): CloudLayout {
    const size = node.children ? nestedRadius(node.children, measure, baseResolution) * 2 : GROUP_FOCUS_SIZE;
    return createFocusedGroupLayout({ ...baseLayout, focusedSize: size });
}

/** Создаёт features внешних узлов; в OL они остаются отдельными для hit-test. */
export function createNodeFeatures(
    data: GraphData,
    selectedId: string | null,
    measure: ReturnType<typeof createTextMeasurer>,
    baseResolution: number,
): Feature<Point>[] {
    const colorOf = createTypeColors(data.nodes);
    const layouts = createCloudLayouts(data.nodes, measure);
    return data.nodes.map((node) => {
        const color = node.id === selectedId ? '#e4572e' : colorOf(node.type);
        const baseLayout = layouts.get(node)!;
        const groupLayout =
            node.type === 'group' && node.children && node.childrenLoading !== true
                ? focusedLayout(node, baseLayout, measure, baseResolution)
                : baseLayout;
        const feature = new Feature(new Point(graphCoordinate(node)));
        feature.setId(node.id);
        feature.set('baseLayout', baseLayout);
        feature.set('groupLayout', groupLayout);
        feature.set('baseStyle', new Style({ renderer: nodeRenderer(node, baseLayout, color) }));
        feature.set('groupStyle', new Style({ renderer: nodeRenderer(node, groupLayout, color) }));
        feature.set('activeLayout', baseLayout);
        feature.setStyle(feature.get('baseStyle'));
        return feature;
    });
}

/** Переключает размер внешних групп вместе с порогом раскрытия вложенного графа. */
export function setNodeFeaturesExpanded(features: Feature<Point>[], expanded: boolean): void {
    features.forEach((feature) => {
        const layout = (expanded ? feature.get('groupLayout') : feature.get('baseLayout')) as CloudLayout;
        feature.set('activeLayout', layout);
        feature.setStyle(feature.get(expanded ? 'groupStyle' : 'baseStyle'));
    });
}

/** Создаёт фон вложенного графа на фиксированном пороге раскрытия. */
export function createGroupBackgroundFeatures(
    data: GraphData,
    measure: ReturnType<typeof createTextMeasurer>,
    baseResolution: number,
): Feature<Circle>[] {
    return data.nodes.flatMap((node) => {
        if (node.type !== 'group' || !node.children || node.childrenLoading === true) return [];
        const radius = nestedRadius(node.children, measure, baseResolution);
        const feature = new Feature(new Circle(graphCoordinate(node), radius));
        feature.setId(node.id);
        return [feature];
    });
}

/** Создаёт features узлов и связей всех загруженных вложенных графов. */
export function createNestedFeatures(
    data: GraphData,
    colorOf: (type: GraphNode['type']) => string,
    measure: ReturnType<typeof createTextMeasurer>,
): { nodes: Feature<Point>[]; links: Feature<LineString>[] } {
    const nestedGraphs = data.nodes.flatMap((node) =>
        node.type === 'group' && node.children && node.childrenLoading !== true
            ? [{ data: node.children, x: node.x ?? 0, y: node.y ?? 0, scale: NESTED_GRAPH_SCALE }]
            : [],
    );
    const entries = data.nodes.flatMap((node) =>
        node.type === 'group' && node.children && node.childrenLoading !== true
            ? nestedEntries(node.children, node.x ?? 0, node.y ?? 0, NESTED_GRAPH_SCALE)
            : [],
    );
    const nodeById = new globalThis.Map(entries.map((entry) => [entry.node, entry]));
    const nodes = entries.map((entry) => {
        const layout = createCloudLayouts([entry.node], measure).get(entry.node)!;
        const feature = new Feature(new Point(nestedCoordinate(entry.x, entry.y)));
        feature.set('nested', true);
        feature.setStyle(new Style({ renderer: nodeRenderer(entry.node, layout, colorOf(entry.node.type)) }));
        return feature;
    });
    entries.forEach((entry) => {
        if (entry.node.type === 'group' && entry.node.children && entry.node.childrenLoading !== true) {
            nestedGraphs.push({ data: entry.node.children, x: entry.x, y: entry.y, scale: NESTED_GRAPH_SCALE });
        }
    });
    const parentLinks = nestedGraphs.flatMap((graph) =>
        nestedGroupLinkChildren(graph.data.nodes).map(
            (child) =>
                new Feature(
                    new LineString([
                        nestedCoordinate(graph.x, graph.y),
                        nestedCoordinate(
                            graph.x + (child.x ?? 0) * graph.scale,
                            graph.y + (child.y ?? 0) * graph.scale,
                        ),
                    ]),
                ),
        ),
    );
    const links = parentLinks.concat(
        nestedGraphs
            .flatMap((graph) =>
                resolveLinks(graph.data.nodes, graph.data.links).map((link) => {
                    const source = nodeById.get(link.source);
                    const target = nodeById.get(link.target);
                    return source && target
                        ? new Feature(
                              new LineString([
                                  nestedCoordinate(source.x, source.y),
                                  nestedCoordinate(target.x, target.y),
                              ]),
                          )
                        : null;
                }),
            )
            .filter((feature): feature is Feature<LineString> => feature !== null),
    );
    return { nodes, links };
}

/** Создаёт OL features связей верхнего уровня. */
export function createLinkFeatures(data: GraphData): Feature<LineString>[] {
    return resolveLinks(data.nodes, data.links).map(
        (link) => new Feature(new LineString([graphCoordinate(link.source), graphCoordinate(link.target)])),
    );
}
