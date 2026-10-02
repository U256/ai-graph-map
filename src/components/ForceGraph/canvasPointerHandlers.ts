import type { GraphNode } from '../../types/graph'

interface PointerState {
	pointerDownPosition: { x: number; y: number } | null
	dragging: { node: GraphNode } | null
	dragStart: { x: number; y: number } | null
	didDrag: boolean
	transform: { x: number; y: number; k: number }
}

/** Подключает pan, drag и click к Canvas, не смешивая жесты с отрисовкой. */
export function createCanvasPointerHandlers(
	canvas: HTMLCanvasElement,
	state: PointerState,
	worldPoint: (clientX: number, clientY: number) => { x: number; y: number },
	findHit: (clientX: number, clientY: number) => { node: GraphNode } | null,
	render: () => void,
	onDrag: () => void,
	onNodeClick: ((id: string) => void) | undefined,
	nodeTooltip: (node: GraphNode) => string,
): {
	pointerDown: (event: PointerEvent) => void
	pointerMove: (event: PointerEvent) => void
	pointerUp: (event: PointerEvent) => void
} {
	const pointerState = state
	const targetCanvas = canvas

	function pointerDown(event: PointerEvent): void {
		const hit = findHit(event.clientX, event.clientY)
		if (hit) {
			event.preventDefault()
			event.stopImmediatePropagation()
			pointerState.dragging = hit
			pointerState.dragStart = { x: event.clientX, y: event.clientY }
			pointerState.didDrag = false
			targetCanvas.setPointerCapture(event.pointerId)
			return
		}
		pointerState.pointerDownPosition = worldPoint(event.clientX, event.clientY)
	}

	function pointerMove(event: PointerEvent): void {
		if (pointerState.pointerDownPosition && !pointerState.dragging) {
			const point = worldPoint(event.clientX, event.clientY)
			pointerState.transform.x += point.x - pointerState.pointerDownPosition.x
			pointerState.transform.y += point.y - pointerState.pointerDownPosition.y
			pointerState.pointerDownPosition = point
			targetCanvas.setAttribute(
				'data-transform',
				`${pointerState.transform.x},${pointerState.transform.y},${pointerState.transform.k}`,
			)
			render()
			return
		}
		if (pointerState.dragging && pointerState.dragStart) {
			if (Math.hypot(event.clientX - pointerState.dragStart.x, event.clientY - pointerState.dragStart.y) > 3)
				pointerState.didDrag = true
			const point = worldPoint(event.clientX, event.clientY)
			pointerState.dragging.node.x = point.x
			pointerState.dragging.node.y = point.y
			pointerState.dragging.node.fx = point.x
			pointerState.dragging.node.fy = point.y
			onDrag()
			render()
			return
		}
		const hit = findHit(event.clientX, event.clientY)
		targetCanvas.style.cursor = hit ? 'pointer' : 'grab'
		if (hit) targetCanvas.title = nodeTooltip(hit.node)
		else targetCanvas.removeAttribute('title')
	}

	function pointerUp(event: PointerEvent): void {
		if (!pointerState.dragging) {
			pointerState.pointerDownPosition = null
			return
		}
		const selected = pointerState.dragging.node
		if (!pointerState.didDrag) onNodeClick?.(selected.id)
		selected.fx = null
		selected.fy = null
		pointerState.dragging = null
		pointerState.dragStart = null
		pointerState.didDrag = false
		if (targetCanvas.hasPointerCapture(event.pointerId)) targetCanvas.releasePointerCapture(event.pointerId)
	}

	return { pointerDown, pointerMove, pointerUp }
}
