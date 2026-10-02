import type { GraphNode } from '../../types/graph'

export type DrawNestedNode = (context: CanvasRenderingContext2D, node: GraphNode, x: number, y: number) => void

/** Рисует содержимое раскрытой группы в том же масштабе, что и SVG-подграф. */
export function drawNestedGraph(
	context: CanvasRenderingContext2D,
	node: GraphNode,
	x: number,
	y: number,
	drawNode: DrawNestedNode,
): void {
	if (!node.children) return

	context.save()
	context.translate(x, y)
	context.scale(0.2, 0.2)
	context.globalAlpha = 0.6
	node.children.links.forEach((link) => {
		const source = node.children?.nodes.find((child) => child.id === link.source) as GraphNode | undefined
		const target = node.children?.nodes.find((child) => child.id === link.target) as GraphNode | undefined
		if (!source || !target) return
		context.lineWidth = 5
		context.strokeStyle = '#777'
		context.beginPath()
		context.moveTo(source.x ?? 0, source.y ?? 0)
		context.lineTo(target.x ?? 0, target.y ?? 0)
		context.stroke()
	})
	context.globalAlpha = 1
	node.children.nodes.forEach((child) => {
		const childNode = child as GraphNode
		drawNode(context, childNode, childNode.x ?? 0, childNode.y ?? 0)
	})
	context.restore()
}
