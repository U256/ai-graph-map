import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom'
import type { GraphNode } from '../../types/graph'
import { DRAG_CLICK_SLOP } from './forceGraph'

/** Drag меняет только выбранный узел: статичная раскладка не должна разогревать соседей. */
function createDrag(onDrag: () => void): {
	behavior: DragBehavior<SVGGElement, GraphNode, GraphNode>
	wasDragging: () => boolean
} {
	let dragging = false
	let startX = 0
	let startY = 0

	function dragstarted(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		dragging = false
		startX = event.sourceEvent?.clientX ?? 0
		startY = event.sourceEvent?.clientY ?? 0
	}

	function dragged(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		const source = event.sourceEvent as MouseEvent | undefined
		// порог в пикселях: дрожащая рука не должна превращать намеренный клик в жест
		if (source && Math.hypot(source.clientX - startX, source.clientY - startY) > DRAG_CLICK_SLOP) dragging = true
		subject.x = event.x
		subject.y = event.y
		onDrag()
	}

	function dragended(_event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {}

	const behavior = drag<SVGGElement, GraphNode, GraphNode>()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended)

	return { behavior, wasDragging: () => dragging }
}

/** Подключает drag и клик отдельно от устройства отрисовки узла. */
export function attachNodeInteractions(
	element: SVGGElement,
	onDrag: () => void,
	onNodeClick?: (id: string) => void,
): void {
	const { behavior, wasDragging } = createDrag(onDrag)
	const group = select<SVGGElement, GraphNode>(element).call(behavior)
	if (!onNodeClick) return
	group.on('click', (_event: MouseEvent, node: GraphNode) => {
		// d3-drag не глушит `click`, который браузер стреляет после отпускания мыши
		if (wasDragging()) return
		onNodeClick(node.id)
	})
}

/** Дочерний граф группы перемещается тем же жестом и обновляет позиции через callback. */
export function attachChildDrag(element: SVGGElement, onDrag: () => void): void {
	const { behavior } = createDrag(onDrag)
	select<SVGGElement, GraphNode>(element).call(behavior)
}

/** Узлы уводят жест себе; колесо над узлом остаётся зумом. */
function createZoomButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
	const button = document.createElement('button')
	button.type = 'button'
	button.textContent = label
	button.title = title
	button.setAttribute('aria-label', title)
	button.addEventListener('click', onClick)
	return button
}

/** Pan/zoom для Canvas; hit-testing узлов остаётся у renderer-а. */
export function attachCanvasPanZoom(
	canvas: HTMLCanvasElement,
	zoomIndicator: HTMLDivElement,
	onTransform: (transform: ZoomTransform) => void,
	onScale: (scale: number) => void,
	isNodeAt: (x: number, y: number) => boolean,
): {
	controls: HTMLDivElement
	getTransform: () => ZoomTransform
	setTransform: (transform: ZoomTransform) => void
	destroy: () => void
} {
	let current = zoomIdentity
	const indicator = zoomIndicator
	const zoomExtent: [number, number] = [0.1, 8]
	const pointerPosition = (event: MouseEvent | WheelEvent): [number, number] => {
		const rect = canvas.getBoundingClientRect()
		const scale = Math.min(rect.width / 928, rect.height / 680)
		return [
			(event.clientX - rect.left - rect.width / 2) / scale,
			(event.clientY - rect.top - rect.height / 2) / scale,
		]
	}
	const behavior = zoom<HTMLCanvasElement, unknown>()
		.scaleExtent(zoomExtent)
		.filter((event) => {
			if (event.type === 'wheel') return true
			return !isNodeAt(event.clientX, event.clientY)
		})
		.on('zoom', (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
			current = event.transform
			onTransform(current)
			onScale(current.k)
			indicator.textContent = `Зум: ${current.k.toFixed(1)}`
		})
	select(canvas)
		.call(behavior)
		.on('wheel.zoom', (event) => {
			const delta = -(event as WheelEvent).deltaY * ((event as WheelEvent).deltaMode === 1 ? 0.05 : 0.002)
			select(canvas).call(behavior.scaleBy, 2 ** delta, pointerPosition(event))
			event.preventDefault()
		})
	const getTransform = () => current
	const setTransform = (transform: ZoomTransform) => select(canvas).call(behavior.transform, transform)
	const controls = document.createElement('div')
	controls.className = 'force-graph__zoom-controls'
	controls.append(
		createZoomButton('□', 'Отцентровать карту', () => setTransform(zoomIdentity)),
		createZoomButton('+', 'Приблизить карту', () =>
			select(canvas).call(behavior.scaleBy, Math.min(zoomExtent[1], current.k + 0.3) / current.k),
		),
		createZoomButton('−', 'Отдалить карту', () =>
			select(canvas).call(behavior.scaleBy, Math.max(zoomExtent[0], current.k - 0.3) / current.k),
		),
	)
	return {
		controls,
		getTransform,
		setTransform,
		destroy: () => {
			select(canvas).on('.zoom', null)
			controls.remove()
		},
	}
}
