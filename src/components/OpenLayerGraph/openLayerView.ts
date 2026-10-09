import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import Circle from 'ol/geom/Circle';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import Projection from 'ol/proj/Projection';
import VectorSource from 'ol/source/Vector';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style, { type RenderFunction } from 'ol/style/Style';
import type { GraphData, GraphNode } from '../../types/graph';
import { createTypeColors } from '../ForceGraph/canvasColorUtils';
import { drawCanvasNode } from '../ForceGraph/canvasNodeRenderer';
import { GRAPH_HEIGHT, GRAPH_WIDTH } from '../ForceGraph/canvasRenderer';
import {
    createCloudLayouts,
    createFocusedGroupLayout,
    GROUP_DETAIL_SCALE,
    GROUP_FOCUS_SIZE,
    NESTED_GRAPH_SCALE,
    type CloudLayout,
} from '../ForceGraph/forceGraphCloud';
import { createTextMeasurer } from '../ForceGraph/forceGraphText';
import { createGroupVisibility } from '../ForceGraph/groupVisibility';
import { resolveLinks } from '../ForceGraph/resolveLinks';

const projection = new Projection({ code: 'GRAPH', units: 'pixels' });
const linkStyle = new Style({ stroke: new Stroke({ color: '#9999', width: 1.5 }) });
const GROUP_BACKGROUND = 'rgba(125, 190, 145, 0.16)';
const groupBackgroundStyle = new Style({ fill: new Fill({ color: GROUP_BACKGROUND }) });

/** Canvas считает Y вниз, а вид OpenLayers — вверх. */
function coordinate(node: GraphNode): [number, number] {
    return [node.x ?? 0, -(node.y ?? 0)];
}

function nodeRenderer(
    node: GraphNode,
    baseLayout: CloudLayout,
    groupLayout: CloudLayout,
    color: string,
): RenderFunction {
    return (pixelCoordinates, state) => {
        if (!Array.isArray(pixelCoordinates) || typeof pixelCoordinates[0] !== 'number') return;
        const [x, y] = pixelCoordinates as [number, number];
        const { context } = state;
        if (node.type === 'group' && groupLayout.focusedGroup) {
            const radius = (groupLayout.focusedSize ?? GROUP_FOCUS_SIZE) / (2 * state.resolution);
            drawCanvasNode(
                context,
                { node, layout: baseLayout, x, y: y - radius, selected: false, loading: node.childrenLoading },
                () => color,
            );
        } else {
            drawCanvasNode(context, { node, layout: baseLayout, x, y, selected: false }, () => color);
        }
    };
}

function groupBackgroundFeatures(
    data: GraphData,
    measure: ReturnType<typeof createTextMeasurer>,
    baseResolution: number,
): Feature<Circle>[] {
    return data.nodes.flatMap((node) => {
        if (node.type !== 'group' || !node.children || node.childrenLoading === true) return [];
        const radius = nestedRadius(node.children, measure, baseResolution);
        const feature = new Feature(new Circle(coordinate(node), radius));
        feature.setId(node.id);
        return [feature];
    });
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

/** Отдельные features позволяют выбирать только внешние узлы штатным hit-test OpenLayers. */
function nodeFeatures(
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
        const feature = new Feature(new Point(coordinate(node)));
        feature.setId(node.id);
        feature.set('baseLayout', baseLayout);
        feature.set('groupLayout', groupLayout);
        const renderer = nodeRenderer(node, baseLayout, groupLayout, color);
        feature.setStyle(new Style({ renderer }));
        return feature;
    });
}

type NestedEntry = { node: GraphNode; x: number; y: number };

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

/** Экранные тела детей учитываем на пороге раскрытия, где их размер в координатах карты максимален. */
function nestedRadius(data: GraphData, measure: ReturnType<typeof createTextMeasurer>, baseResolution: number): number {
    const entries = nestedEntries(data, 0, 0, NESTED_GRAPH_SCALE);
    if (!entries.length) return GROUP_FOCUS_SIZE / 2;
    return entries.reduce((radius, entry) => {
        const layout = createCloudLayouts([entry.node], measure).get(entry.node)!;
        const bodyRadius = (Math.hypot(layout.width, layout.height) * baseResolution) / 2;
        return Math.max(radius, Math.hypot(entry.x, entry.y) + bodyRadius);
    }, 0);
}

function nestedCoordinate(entry: NestedEntry): [number, number] {
    return [entry.x, -entry.y];
}

function nestedFeatures(
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
        const feature = new Feature(new Point(nestedCoordinate(entry)));
        feature.set('nested', true);
        feature.setStyle(new Style({ renderer: nodeRenderer(entry.node, layout, layout, colorOf(entry.node.type)) }));
        return feature;
    });
    entries.forEach((entry) => {
        if (entry.node.type === 'group' && entry.node.children && entry.node.childrenLoading !== true) {
            nestedGraphs.push({ data: entry.node.children, x: entry.x, y: entry.y, scale: NESTED_GRAPH_SCALE });
        }
    });
    const links = nestedGraphs
        .flatMap((graph) =>
            resolveLinks(graph.data.nodes, graph.data.links).map((link) => {
                const source = nodeById.get(link.source);
                const target = nodeById.get(link.target);
                return source && target
                    ? new Feature(new LineString([nestedCoordinate(source), nestedCoordinate(target)]))
                    : null;
            }),
        )
        .filter((feature): feature is Feature<LineString> => feature !== null);
    return { nodes, links };
}

/** Проекция плоская; масштаб при старте соответствует базовой области Canvas. */
export function createOpenLayerView(
    target: HTMLElement,
    onNodeClick: (id: string) => void,
    onVisibleGroupsChange: (ids: string[]) => void = () => {},
) {
    const links = new VectorSource<Feature<LineString>>();
    const groupBackgrounds = new VectorSource<Feature<Circle>>();
    const nodes = new VectorSource<Feature<Point>>();
    const nestedLinks = new VectorSource<Feature<LineString>>();
    const nestedNodes = new VectorSource<Feature<Point>>();
    const groupBackgroundLayer = new VectorLayer({ source: groupBackgrounds, style: groupBackgroundStyle });
    const nestedLinksLayer = new VectorLayer({ source: nestedLinks, style: linkStyle });
    const nestedNodesLayer = new VectorLayer({ source: nestedNodes, declutter: true });
    const view = new View({ projection, center: [0, 0], resolution: 1, minResolution: 0.02, maxResolution: 32 });
    const map = new Map({
        target,
        layers: [
            new VectorLayer({ source: links, style: linkStyle }),
            groupBackgroundLayer,
            new VectorLayer({ source: nodes, declutter: true }),
            nestedLinksLayer,
            nestedNodesLayer,
        ],
        view,
        controls: [],
    });
    let initialized = false;
    let currentData: GraphData = { nodes: [], links: [] };
    const measure = createTextMeasurer();
    const initialScale = () => Math.min(target.clientWidth / GRAPH_WIDTH, target.clientHeight / GRAPH_HEIGHT);
    const scale = () => 1 / (initialScale() * (view.getResolution() ?? 1));
    const viewport = () => {
        const extent = view.calculateExtent(map.getSize());
        return { left: extent[0], right: extent[2], top: -extent[3], bottom: -extent[1] };
    };
    const visibility = createGroupVisibility(
        () => ({ nodes: currentData.nodes, viewport: map.getSize() ? viewport() : null, scale: scale() }),
        onVisibleGroupsChange,
    );
    const reset = () => {
        view.setCenter([0, 0]);
        view.setResolution(1 / Math.max(initialScale(), 0.001));
    };
    const observer = new ResizeObserver(() => {
        map.updateSize();
        if (!initialized) reset();
        visibility.markDirty();
    });
    observer.observe(target);
    map.on('moveend', visibility.markDirty);
    function updateNestedFeatures(): void {
        const expanded = scale() >= GROUP_DETAIL_SCALE;
        groupBackgroundLayer.setVisible(expanded);
        nestedLinks.clear();
        nestedNodes.clear();
        nestedLinksLayer.setVisible(expanded);
        nestedNodesLayer.setVisible(expanded);
        if (!expanded) return;
        const colors = createTypeColors(currentData.nodes);
        const nested = nestedFeatures(currentData, colors, measure);
        nestedLinks.addFeatures(nested.links);
        nestedNodes.addFeatures(nested.nodes);
    }
    map.on('moveend', updateNestedFeatures);
    map.on('singleclick', (event) => {
        // OL ищет point-feature по координате центра, а custom renderer рисует тело шире точки.
        const feature = nodes
            .getFeatures()
            .reverse()
            .find((candidate) => {
                const point = candidate.getGeometry();
                const expanded = (candidate.get('groupLayout') as CloudLayout).focusedGroup;
                const layout = candidate.get('baseLayout') as CloudLayout;
                if (!point) return false;
                const [x, y] = map.getPixelFromCoordinate(point.getCoordinates());
                const factor = 1;
                const groupLayout = candidate.get('groupLayout') as CloudLayout;
                const offsetY = expanded
                    ? -(groupLayout.focusedSize ?? GROUP_FOCUS_SIZE) / (2 * (view.getResolution() ?? 1))
                    : 0;
                return (
                    Math.abs(event.pixel[0] - x) <= (layout.width * factor) / 2 &&
                    Math.abs(event.pixel[1] - y - offsetY * factor) <= (layout.height * factor) / 2
                );
            });
        const id = feature?.getId();
        if (typeof id === 'string') onNodeClick(id);
    });

    return {
        update(data: GraphData, selectedId: string | null) {
            currentData = data;
            links.clear();
            links.addFeatures(
                resolveLinks(data.nodes, data.links).map(
                    (link) => new Feature(new LineString([coordinate(link.source), coordinate(link.target)])),
                ),
            );
            nodes.clear();
            nodes.addFeatures(nodeFeatures(data, selectedId, measure, 1 / Math.max(initialScale(), 0.001)));
            groupBackgrounds.clear();
            groupBackgrounds.addFeatures(groupBackgroundFeatures(data, measure, 1 / Math.max(initialScale(), 0.001)));
            updateNestedFeatures();
            visibility.markDirty();
            if (!initialized) {
                initialized = true;
                reset();
            }
        },
        reset,
        zoomBy(factor: number) {
            view.setResolution((view.getResolution() ?? 1) / factor);
        },
        destroy() {
            observer.disconnect();
            visibility.destroy();
            map.setTarget(undefined);
        },
    };
}
