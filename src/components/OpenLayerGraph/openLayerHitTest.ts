import type Feature from 'ol/Feature';
import type Point from 'ol/geom/Point';
import type Map from 'ol/Map';
import type View from 'ol/View';
import { GROUP_FOCUS_SIZE, type CloudLayout } from '../../graph/nodeGeometry';

/** Находит внешнюю ноду по экранному телу, а не только по точке feature. */
export function hitOpenLayerNode(
    features: Feature<Point>[],
    pixel: [number, number],
    map: Map,
    view: View,
): Feature<Point> | undefined {
    return features
        .slice()
        .reverse()
        .find((candidate) => {
            const point = candidate.getGeometry();
            const expanded = (candidate.get('groupLayout') as CloudLayout).focusedGroup;
            const layout = candidate.get('baseLayout') as CloudLayout;
            if (!point) return false;
            const [x, y] = map.getPixelFromCoordinate(point.getCoordinates());
            const groupLayout = candidate.get('groupLayout') as CloudLayout;
            const offsetY = expanded
                ? -(groupLayout.focusedSize ?? GROUP_FOCUS_SIZE) / (2 * (view.getResolution() ?? 1))
                : 0;
            return Math.abs(pixel[0] - x) <= layout.width / 2 && Math.abs(pixel[1] - y - offsetY) <= layout.height / 2;
        });
}
