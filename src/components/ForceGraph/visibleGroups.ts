import type { GraphNode } from '../../types/graph'
import { groupFocusSize } from './forceGraphCloud'

/** Снимок координат групп без ссылок на объекты симуляции. */
export type VisibilityGroup = { id: string; x: number; y: number; radius: number; children: VisibilityGroup[] }
export type VisibilityViewport = { left: number; right: number; top: number; bottom: number }

/** У вложенных групп тот же масштаб, что при рисовании вложенного графа. */
export function snapshotGroups(nodes: GraphNode[]): VisibilityGroup[] {
	return nodes.flatMap((node) => {
		if (node.type !== 'group') return []
		return [
			{
				id: node.id,
				x: node.x ?? 0,
				y: node.y ?? 0,
				radius: groupFocusSize(node.children?.nodes.length ?? 0) / 2,
				children: snapshotGroups(node.children?.nodes ?? []),
			},
		]
	})
}

/** Проверяет пересечение кругов групп с областью видимости в координатах внешнего графа. */
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
			visit(group.children, x, y, scale * 0.2)
		})
	}
	visit(groups, 0, 0, 1)
	return [...new Set(ids)]
}
