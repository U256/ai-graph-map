import type Feature from 'ol/Feature';
import type Point from 'ol/geom/Point';
import type Map from 'ol/Map';
import { type CloudLayout } from '../../graph/nodeGeometry';

/** Находит внешнюю ноду по экранному телу, а не только по точке feature. */
export function hitOpenLayerNode(
    features: Feature<Point>[],
    pixel: [number, number],
    map: Map,
): Feature<Point> | undefined {
    return features
        .slice()
        .reverse()
        .find((candidate) => {
            const point = candidate.getGeometry();
            const layout = candidate.get('activeLayout') as CloudLayout;
            if (!point) return false;
            const [x, y] = map.getPixelFromCoordinate(point.getCoordinates());
            return Math.abs(pixel[0] - x) <= layout.width / 2 && Math.abs(pixel[1] - y) <= layout.height / 2;
        });
}
