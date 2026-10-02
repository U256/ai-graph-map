import type { DrawnLink, GraphNode, GraphNodeType } from '../../types/graph'
import { drawNestedGraph } from './canvasNestedGraph'
import { createCanvasPointerHandlers } from './canvasPointerHandlers'
import { GRAPH_HEIGHT, GRAPH_WIDTH, tintToWhite } from './forceGraph'
import {
	CLOUD_RADIUS,
	createFocusedGroupLayout,
	DESCRIPTION_FONT_SIZE,
	FONT_FAMILY,
	GROUP_FOCUS_SIZE,
	SUB_NODE_CORNER,
	SUB_NODE_DOT_RADIUS,
	TITLE_FONT_SIZE,
	WARNING_COLOR,
	WARNING_DOT_RADIUS,
	type CloudLayout,
} from './forceGraphCloud'
import { nodeTooltip } from './layers/graphNodeLayer'

const LINK_COLOR = '#999'
const TITLE_COLOR = '#1a1a1a'
const DESCRIPTION_COLOR = '#555'
const SELECTED_COLOR = '#e4572e'
const LINK_FORCE_DEFAULT = 2
const BODY_STROKE_WIDTH = 1.5

export type CanvasRenderer = {
	canvas: HTMLCanvasElement
	render: () => void
	setNodes: (nodes: GraphNode[]) => void
	setLinks: (links: DrawnLink[]) => void
	setSelectedNode: (id: string | null) => void
	setZoomScale: (scale: number) => void
	getTransform: () => { x: number; y: number; k: number }
	isNodeAt: (clientX: number, clientY: number) => boolean
	setZoomTransform: (x: number, y: number, k: number) => void
	destroy: () => void
}

type HitNode = {
	node: GraphNode
	layout: CloudLayout
	x: number
	y: number
	selected: boolean
	fx?: number | null
	fy?: number | null
}

function drawNode(
	context: CanvasRenderingContext2D,
	entry: HitNode,
	colorOf: (type: GraphNodeType) => string,
	layoutOf: (node: GraphNode) => CloudLayout,
): void {
	const { node, layout, x, y, selected } = entry
	const baseColor = selected ? SELECTED_COLOR : colorOf(node.type)
	const isCloud = node.type !== 'subNode'
	const offsetY = layout.focusedGroup ? -(layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2 : 0
	const left = x - layout.width / 2
	const top = y - layout.height / 2 + offsetY

	context.fillStyle = tintToWhite(baseColor)
	context.strokeStyle = baseColor
	context.lineWidth = BODY_STROKE_WIDTH
	const radius = Math.min(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER, layout.width / 2, layout.height / 2)
	context.beginPath()
	context.moveTo(left + radius, top)
	context.arcTo(left + layout.width, top, left + layout.width, top + layout.height, radius)
	context.arcTo(left + layout.width, top + layout.height, left, top + layout.height, radius)
	context.arcTo(left, top + layout.height, left, top, radius)
	context.arcTo(left, top, left + layout.width, top, radius)
	context.closePath()
	context.fill()
	context.stroke()

	if (node.children) {
		drawNestedGraph(context, node, x, y, (nestedContext, child, childX, childY) =>
			drawNode(
				nestedContext,
				{ node: child, layout: layoutOf(child), x: childX, y: childY, selected: false },
				colorOf,
				layoutOf,
			),
		)
	}
	if (layout.focusedGroup) {
		context.beginPath()
		context.arc(x, y, (layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2, 0, Math.PI * 2)
		context.strokeStyle = baseColor
		context.lineWidth = 2
		context.stroke()
	}

	context.textBaseline = 'middle'
	context.textAlign = 'left'
	context.font = `${TITLE_FONT_SIZE}px ${FONT_FAMILY}`
	context.fillStyle = TITLE_COLOR
	context.fillText(layout.title, x + layout.textX, y + layout.titleY)
	context.font = `${DESCRIPTION_FONT_SIZE}px ${FONT_FAMILY}`
	context.fillStyle = DESCRIPTION_COLOR
	context.fillText(layout.description, x + layout.textX, y + layout.descriptionY)

	if (layout.warning) {
		context.beginPath()
		context.arc(x + layout.warning.x, y + layout.warning.y, WARNING_DOT_RADIUS, 0, Math.PI * 2)
		context.fillStyle = WARNING_COLOR
		context.fill()
	}
	if (!isCloud) {
		context.beginPath()
		context.arc(x, y, SUB_NODE_DOT_RADIUS, 0, Math.PI * 2)
		context.fillStyle = baseColor
		context.fill()
	}
}

/** Canvas-рендер хранит визуальное состояние отдельно от расчёта координат графа. */
// eslint-disable-next-line max-lines-per-function
export function createCanvasRenderer(
	colorOf: (type: GraphNodeType) => string,
	layoutOf: (node: GraphNode) => CloudLayout,
	onDrag: () => void,
	onNodeClick?: (id: string) => void,
): CanvasRenderer {
	const canvas = document.createElement('canvas')
	canvas.className = 'force-graph__canvas-element'
	canvas.setAttribute('role', 'img')
	canvas.setAttribute('aria-label', 'Граф связей научных работ и патентов')
	canvas.setAttribute('data-transform', '0,0,1')
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Браузер не поддерживает Canvas 2D')
	let nodes: GraphNode[] = []
	let links: DrawnLink[] = []
	let selectedId: string | null = null
	let zoomScale = 1
	let width = 0
	let height = 0
	const transform = { x: 0, y: 0, k: 1 }
	let resizeObserver: ResizeObserver | null = null
	let hitNodes: HitNode[] = []
	const nodeClick = onNodeClick
	let render = (): void => {}

	function resize(): void {
		const bounds = canvas.getBoundingClientRect()
		const dpr = window.devicePixelRatio || 1
		width = bounds.width
		height = bounds.height
		canvas.width = Math.max(1, Math.round(width * dpr))
		canvas.height = Math.max(1, Math.round(height * dpr))
		render()
	}

	function baseScale(): number {
		return Math.min(width / GRAPH_WIDTH, height / GRAPH_HEIGHT)
	}

	function worldPoint(clientX: number, clientY: number): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect()
		return {
			x: ((clientX - rect.left - width / 2) / baseScale() - transform.x) / transform.k,
			y: ((clientY - rect.top - height / 2) / baseScale() - transform.y) / transform.k,
		}
	}

	function findHit(clientX: number, clientY: number): HitNode | null {
		const point = worldPoint(clientX, clientY)
		for (let index = hitNodes.length - 1; index >= 0; index -= 1) {
			const entry = hitNodes[index]
			const { width: nodeWidth, height: nodeHeight } = entry.layout
			const offsetY = entry.layout.focusedGroup ? -(entry.layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2 : 0
			if (
				point.x >= entry.x - nodeWidth / 2 &&
				point.x <= entry.x + nodeWidth / 2 &&
				point.y >= entry.y - nodeHeight / 2 + offsetY &&
				point.y <= entry.y + nodeHeight / 2 + offsetY
			)
				return entry
		}
		return null
	}

	Object.assign(canvas, {
		__hitTest: (x: number, y: number) => findHit(x, y) !== null,
		__hitNode: (x: number, y: number) => findHit(x, y)?.node ?? null,
	})

	// eslint-disable-next-line max-lines-per-function
	render = (): void => {
		if (!context || width <= 0 || height <= 0) return
		const dpr = window.devicePixelRatio || 1
		const scale = baseScale()
		context.setTransform(dpr, 0, 0, dpr, 0, 0)
		context.clearRect(0, 0, width, height)
		context.setTransform(
			dpr * transform.k * scale,
			0,
			0,
			dpr * transform.k * scale,
			dpr * (width / 2 + scale * transform.x),
			dpr * (height / 2 + scale * transform.y),
		)
		const prepared = nodes.map((node) => {
			const baseLayout = layoutOf(node)
			const layout = zoomScale > 1 && node.type === 'group' ? createFocusedGroupLayout(baseLayout) : baseLayout
			return {
				node,
				layout,
				x: node.x ?? 0,
				y: node.y ?? 0,
				selected: node.id === selectedId,
				fx: node.fx,
				fy: node.fy,
			}
		})
		hitNodes = prepared
		context.lineCap = 'round'
		context.globalAlpha = 0.6
		context.strokeStyle = LINK_COLOR
		links.forEach((link) => {
			context.lineWidth = Math.sqrt(link.force ?? LINK_FORCE_DEFAULT)
			context.beginPath()
			context.moveTo(link.source.x ?? 0, link.source.y ?? 0)
			context.lineTo(link.target.x ?? 0, link.target.y ?? 0)
			context.stroke()
		})
		context.globalAlpha = 1
		prepared.forEach((entry) => drawNode(context, entry, colorOf, layoutOf))
	}

	const pointerHandlers = createCanvasPointerHandlers(
		canvas,
		{ pointerDownPosition: null, dragging: null, dragStart: null, didDrag: false, transform },
		(x, y) => worldPoint(x, y),
		(x, y) => findHit(x, y),
		render,
		onDrag,
		nodeClick,
		nodeTooltip,
	)

	canvas.addEventListener('pointerdown', pointerHandlers.pointerDown)
	canvas.addEventListener('pointermove', pointerHandlers.pointerMove)
	canvas.addEventListener('pointerup', pointerHandlers.pointerUp)
	canvas.addEventListener('pointercancel', pointerHandlers.pointerUp)
	resizeObserver = new ResizeObserver(resize)
	resizeObserver.observe(canvas)
	resize()

	return {
		canvas,
		render,
		setNodes: (next) => {
			nodes = next
			Object.assign(canvas, { __graphNodes: next })
			render()
		},
		setLinks: (next) => {
			links = next
			render()
		},
		setSelectedNode: (id) => {
			selectedId = id
			render()
		},
		setZoomScale: (scaleValue) => {
			zoomScale = scaleValue
			render()
		},
		getTransform: () => transform,
		isNodeAt: (x, y) => findHit(x, y) !== null,
		setZoomTransform: (x, y, k) => {
			transform.x = x
			transform.y = y
			transform.k = k
			canvas.setAttribute('data-transform', `${x},${y},${k}`)
			render()
		},
		destroy: () => {
			resizeObserver?.disconnect()
			canvas.removeEventListener('pointerdown', pointerHandlers.pointerDown)
			canvas.removeEventListener('pointermove', pointerHandlers.pointerMove)
			canvas.removeEventListener('pointerup', pointerHandlers.pointerUp)
			canvas.removeEventListener('pointercancel', pointerHandlers.pointerUp)
			canvas.remove()
		},
	}
}
