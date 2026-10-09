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
import Style from 'ol/style/Style';
import { createGroupVisibility } from '../../graph/groupVisibility';
import { createTypeColors } from '../../graph/nodeColors';
import { GROUP_DETAIL_SCALE } from '../../graph/nodeGeometry';
import { GRAPH_HEIGHT, GRAPH_WIDTH } from '../../graph/sceneSize';
import { createTextMeasurer } from '../../graph/textMeasure';
import type { GraphData } from '../../types/graph';
import { graphViewportFromMapExtent } from './openLayerCoordinates';
import {
    createGroupBackgroundFeatures,
    createLinkFeatures,
    createNestedFeatures,
    createNodeFeatures,
} from './openLayerFeatures';
import { hitOpenLayerNode } from './openLayerHitTest';

const projection = new Projection({ code: 'GRAPH', units: 'pixels' });
const linkStyle = new Style({ stroke: new Stroke({ color: '#9999', width: 1.5 }) });
const groupBackgroundStyle = new Style({ fill: new Fill({ color: 'rgba(125, 190, 145, 0.16)' }) });

/** Проекция плоская; карта только координирует OL-слои и их жизненный цикл. */
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
    const viewport = () => graphViewportFromMapExtent(view.calculateExtent(map.getSize()));
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
        const nested = createNestedFeatures(currentData, colors, measure);
        nestedLinks.addFeatures(nested.links);
        nestedNodes.addFeatures(nested.nodes);
    }

    map.on('moveend', updateNestedFeatures);
    map.on('singleclick', (event) => {
        const feature = hitOpenLayerNode(nodes.getFeatures(), event.pixel as [number, number], map, view);
        const id = feature?.getId();
        if (typeof id === 'string') onNodeClick(id);
    });

    return {
        update(data: GraphData, selectedId: string | null) {
            currentData = data;
            links.clear();
            links.addFeatures(createLinkFeatures(data));
            nodes.clear();
            nodes.addFeatures(createNodeFeatures(data, selectedId, measure, 1 / Math.max(initialScale(), 0.001)));
            groupBackgrounds.clear();
            groupBackgrounds.addFeatures(
                createGroupBackgroundFeatures(data, measure, 1 / Math.max(initialScale(), 0.001)),
            );
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
