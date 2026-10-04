import type { GraphNode } from '../../types/graph'

/** Формирует нативную подсказку для узла; Canvas использует её у единственного элемента сцены. */
export function nodeTooltip(node: GraphNode): string {
	return node.description ? `${node.title}\n${node.description}` : node.title
}
