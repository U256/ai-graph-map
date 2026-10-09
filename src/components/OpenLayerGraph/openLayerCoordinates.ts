import type { Coordinate } from 'ol/coordinate';
import type { Extent } from 'ol/extent';
import type { GraphNode } from '../../types/graph';

/** Переводит координаты графа (Y вниз) в координаты плоской карты (Y вверх). */
export function graphCoordinate(node: GraphNode): Coordinate {
    return [node.x ?? 0, -(node.y ?? 0)];
}

/** Переводит точку вложенного графа в координаты карты. */
export function nestedCoordinate(x: number, y: number): Coordinate {
    return [x, -y];
}

/** Возвращает viewport в системе координат графа, инвертируя ось Y карты. */
export function graphViewportFromMapExtent(extent: Extent) {
    return { left: extent[0], right: extent[2], top: -extent[3], bottom: -extent[1] };
}
