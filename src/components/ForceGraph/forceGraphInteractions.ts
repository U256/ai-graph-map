import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import { select, type Selection } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom'
import type { GraphNode } from '../../types/graph'
import { DRAG_CLICK_SLOP } from './forceGraph'
import { NODE_CLASS } from './layers/graphNodeLayer'

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>
type ContentSelection = Selection<SVGGElement, unknown, null, undefined>

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

/** Подключает pan/zoom к SVG и отдаёт элементы управления отдельно для React-контейнера. */
export function attachPanZoom(
	root: SvgSelection,
	content: ContentSelection,
	zoomIndicator: HTMLDivElement,
	onScale: (scale: number) => void,
): { controls: HTMLDivElement; getTransform: () => ZoomTransform; setTransform: (transform: ZoomTransform) => void } {
	const indicator = zoomIndicator
	let currentScale = zoomIdentity.k
	const zoomExtent: [number, number] = [0.1, 8]
	const behavior = zoom<SVGSVGElement, unknown>()
		.scaleExtent(zoomExtent)
		.filter((event) => event.type === 'wheel' || !(event.target as Element).closest(`.${NODE_CLASS}`))
		.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
			const { x, y, k } = event.transform
			currentScale = k
			content.attr('transform', `translate(${x},${y}) scale(${k})`)
			onScale(k)
			indicator.textContent = `Зум: ${k.toFixed(1)}`
		})
	root.call(behavior)
	const getTransform = () => root.property('__zoom') ?? zoomIdentity
	const setTransform = (transform: ZoomTransform) => root.call(behavior.transform, transform)

	const controls = document.createElement('div')
	controls.className = 'force-graph__zoom-controls'
	controls.append(
		createZoomButton('□', 'Отцентровать карту', () => root.call(behavior.transform, zoomIdentity)),
		createZoomButton('+', 'Приблизить карту', () => {
			const nextScale = Math.min(zoomExtent[1], currentScale + 0.3)
			root.call(behavior.scaleBy, nextScale / currentScale)
		}),
		createZoomButton('−', 'Отдалить карту', () => {
			const nextScale = Math.max(zoomExtent[0], currentScale - 0.3)
			root.call(behavior.scaleBy, nextScale / currentScale)
		}),
	)
	return { controls, getTransform, setTransform }
}
