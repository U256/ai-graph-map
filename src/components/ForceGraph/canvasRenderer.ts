import type { DrawnLink, GraphNode, GraphNodeType } from '../../types/graph'
import { drawNestedGraph } from './canvasNestedRenderer'
import { drawCanvasNode, type CanvasNodeEntry } from './canvasNodeRenderer'
import { createCanvasPointerHandlers } from './canvasPointerHandlers'
import { GRAPH_HEIGHT, GRAPH_WIDTH } from './forceGraph'
import { createFocusedGroupLayout, GROUP_DETAIL_SCALE, GROUP_FOCUS_SIZE, type CloudLayout } from './forceGraphCloud'
import { nodeTooltip } from './nodePresentation'

const LINK_COLOR = '#999'
const LINK_FORCE_DEFAULT = 2

export interface CanvasRenderer {
	canvas: HTMLCanvasElement
	render: () => void
	setNodes: (nodes: GraphNode[]) => void
	setLinks: (links: DrawnLink[]) => void
	setSelectedNode: (id: string | null) => void
	setZoomScale: (scale: number) => void
	onSceneChanged?: () => void
	getViewport: () => { left: number; right: number; top: number; bottom: number } | null
	isNodeAt: (clientX: number, clientY: number) => boolean
	setZoomTransform: (x: number, y: number, k: number) => void
	destroy: () => void
}

interface HitNode extends CanvasNodeEntry {
	fx?: number | null
	fy?: number | null
}

/** Canvas-рендер хранит визуальное состояние отдельно от расчёта координат графа. */
// eslint-disable-next-line max-lines-per-function
export function createCanvasRenderer(
	colorOf: (type: GraphNodeType) => string,
	layoutOf: (node: GraphNode) => CloudLayout,
	onDrag: (node: GraphNode) => void,
	onDragEnd: () => void,
	onNodeClick?: (id: string) => void,
	onSceneChanged?: () => void,
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
	const markVisibilityDirty = onSceneChanged ?? (() => {})
	let render = (): void => {}

	function baseScale(): number {
		return Math.min(width / GRAPH_WIDTH, height / GRAPH_HEIGHT)
	}

	function groupInViewport(node: GraphNode): boolean {
		const viewportWidth = width / baseScale() / transform.k
		const viewportHeight = height / baseScale() / transform.k
		const centerX = -transform.x / transform.k
		const centerY = -transform.y / transform.k
		const radius = (layoutOf(node).focusedSize ?? GROUP_FOCUS_SIZE) / 2
		const x = node.x ?? 0
		const y = node.y ?? 0
		return (
			x + radius >= centerX - viewportWidth / 2 &&
			x - radius <= centerX + viewportWidth / 2 &&
			y + radius >= centerY - viewportHeight / 2 &&
			y - radius <= centerY + viewportHeight / 2
		)
	}

	function resize(): void {
		const bounds = canvas.getBoundingClientRect()
		const dpr = window.devicePixelRatio || 1
		width = bounds.width
		height = bounds.height
		canvas.width = Math.max(1, Math.round(width * dpr))
		canvas.height = Math.max(1, Math.round(height * dpr))
		render()
		markVisibilityDirty()
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
			const layout =
				zoomScale >= GROUP_DETAIL_SCALE && node.type === 'group' ? createFocusedGroupLayout(baseLayout) : baseLayout
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
		prepared.forEach((entry) => {
			drawCanvasNode(context, entry, colorOf)
			if (zoomScale >= GROUP_DETAIL_SCALE && entry.node.type === 'group' && groupInViewport(entry.node)) {
				context.save()
				context.translate(entry.x, entry.y)
				drawNestedGraph(context, entry.node, colorOf, layoutOf)
				context.restore()
			}
		})
	}

	const pointerHandlers = createCanvasPointerHandlers(
		canvas,
		{ pointerDownPosition: null, dragging: null, dragStart: null, didDrag: false, transform },
		(x, y) => worldPoint(x, y),
		(x, y) => findHit(x, y),
		render,
		onDrag,
		onDragEnd,
		() => markVisibilityDirty(),
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
			markVisibilityDirty()
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
			markVisibilityDirty()
		},
		getViewport: () => {
			const scale = baseScale()
			if (width <= 0 || height <= 0 || !Number.isFinite(scale) || scale <= 0) return null
			return {
				left: (-width / 2 / scale - transform.x) / transform.k,
				right: (width / 2 / scale - transform.x) / transform.k,
				top: (-height / 2 / scale - transform.y) / transform.k,
				bottom: (height / 2 / scale - transform.y) / transform.k,
			}
		},
		isNodeAt: (x, y) => findHit(x, y) !== null,
		setZoomTransform: (x, y, k) => {
			transform.x = x
			transform.y = y
			transform.k = k
			canvas.setAttribute('data-transform', `${x},${y},${k}`)
			markVisibilityDirty()
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
