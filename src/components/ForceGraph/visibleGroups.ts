import type { GraphNode } from '../../types/graph'
import { createCloudLayouts, createFocusedGroupLayout, groupFocusSize, NESTED_GRAPH_SCALE } from './forceGraphCloud'

/** Снимок координат групп без ссылок на объекты симуляции. */
export type VisibilityGroup = { id: string; x: number; y: number; radius: number; children: VisibilityGroup[] }
export type VisibilityViewport = { left: number; right: number; top: number; bottom: number }

const APPROXIMATE_TEXT_MEASURE = (text: string, size: number): number => text.length * size * 0.55

function groupVisibilityRadius(node: GraphNode): number {
	const layout = createCloudLayouts([node], APPROXIMATE_TEXT_MEASURE).get(node)
	if (!layout) return groupFocusSize(node.children?.nodes.length ?? 0) / 2
	const focused = createFocusedGroupLayout(layout)
	return Math.max(
		(focused.focusedSize ?? groupFocusSize(node.children?.nodes.length ?? 0)) / 2,
		focused.width / 2,
		focused.height / 2,
	)
}

/** У вложенных групп тот же масштаб, что при рисовании вложенного графа. */
export function snapshotGroups(nodes: GraphNode[]): VisibilityGroup[] {
	return nodes.flatMap((node) => {
		if (node.type !== 'group') return []
		return [
			{
				id: node.id,
				x: node.x ?? 0,
				y: node.y ?? 0,
				radius: groupVisibilityRadius(node),
				children: snapshotGroups(node.children?.nodes ?? []),
			},
		]
	})
}

/** Проверяет пересечение отрисованной области групп с viewport в координатах внешнего графа. */
export function visibleGroupIds(groups: VisibilityGroup[], viewport: VisibilityViewport): string[] {
	const ids: string[] = []
	function visit(items: VisibilityGroup[], parentX: number, parentY: number, scale: number): void {
		items.forEach((group) => {
			const x = parentX + group.x * scale
			const y = parentY + group.y * scale
			const radius = group.radius * scale
			if (
				x + radius >= viewport.left &&
				x - radius <= viewport.right &&
				y + radius >= viewport.top &&
				y - radius <= viewport.bottom
			)
				ids.push(group.id)
			// Вложенный круг может выходить за пределы родителя.
			visit(group.children, x, y, scale * NESTED_GRAPH_SCALE)
		})
	}
	visit(groups, 0, 0, 1)
	return [...new Set(ids)]
}
