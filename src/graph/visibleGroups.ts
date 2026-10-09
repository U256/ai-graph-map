import type { GraphNode } from '../types/graph';
import {
    createCloudLayouts,
    createFocusedGroupLayout,
    groupFocusSize,
    NESTED_GRAPH_SCALE,
    nestedGraphBounds,
} from './nodeGeometry';

/** Снимок координат групп без ссылок на объекты симуляции. */
export type VisibilityGroup = { id: string; x: number; y: number; radius: number; children: VisibilityGroup[] };
export type VisibilityViewport = { left: number; right: number; top: number; bottom: number };

const APPROXIMATE_TEXT_MEASURE = (text: string, size: number): number => text.length * size * 0.55;

function groupVisibilityRadius(node: GraphNode): number {
    const layout = createCloudLayouts([node], APPROXIMATE_TEXT_MEASURE).get(node);
    const childrenCount = node.childrenCount ?? node.children?.nodes.length ?? 0;
    if (node.children && node.childrenLoading !== true)
        return nestedGraphBounds(node.children, APPROXIMATE_TEXT_MEASURE).radius;
    if (!layout) return groupFocusSize(childrenCount) / 2;
    const focused = createFocusedGroupLayout(layout);
    return Math.max(focused.focusedSize ?? groupFocusSize(childrenCount), focused.width, focused.height) / 2;
}

/** Снимки нужны worker-у, чтобы не передавать ему объекты сцены. */
export function snapshotGroups(nodes: GraphNode[]): VisibilityGroup[] {
    return nodes.flatMap((node) => {
        if (node.type !== 'group' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return [];
        return [
            {
                id: node.id,
                x: node.x ?? 0,
                y: node.y ?? 0,
                radius: groupVisibilityRadius(node),
                children: snapshotGroups(node.children?.nodes ?? []),
            },
        ];
    });
}

/** Проверяет пересечение группы с видимой областью на любом масштабе карты. */
export function visibleGroupIds(groups: VisibilityGroup[], viewport: VisibilityViewport): string[] {
    const ids = new Set<string>();
    function visit(items: VisibilityGroup[], parentX: number, parentY: number, scale: number): void {
        items.forEach((group) => {
            const x = parentX + group.x * scale;
            const y = parentY + group.y * scale;
            const radius = group.radius * scale;
            if (
                x + radius >= viewport.left &&
                x - radius <= viewport.right &&
                y + radius >= viewport.top &&
                y - radius <= viewport.bottom
            )
                ids.add(group.id);
            // Вложенная группа может выходить за пределы родительской.
            visit(group.children, x, y, scale * NESTED_GRAPH_SCALE);
        });
    }
    visit(groups, 0, 0, 1);
    return [...ids];
}
