import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { GraphData, GraphNode } from '../../types/graph'
import { attachCanvasPanZoom } from './canvasPanZoom'
import { createCanvasRenderer } from './canvasRenderer'
import { createTypeColors } from './forceGraph'
import { createCloudLayouts, type CloudLayout } from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { createGroupVisibility } from './groupVisibility'
import { createLocalMotion, LOCAL_RADIUS_PX } from './localMotion'
import { resolveLinks } from './resolveLinks'

/** Компоновщик Canvas-сцены; раскладка и обновление графа остаются независимы от отрисовки. */

export interface ForceGraphOptions {
	/** Наружу уходит только id: данные живут в стейте вызывающего. */
	onNodeClick?: (id: string) => void
	onVisibleGroupsChange?: (ids: string[]) => void
}

export interface ForceGraphHandle {
	canvas: HTMLCanvasElement
	zoomIndicator: HTMLDivElement
	zoomControls: {
		zoomIn: () => void
		zoomOut: () => void
		resetZoom: () => void
	}
	getZoomTransform: () => ZoomTransform
	setZoomTransform: (transform: ZoomTransform) => void
	setSelectedNode: (id: string | null) => void
	updateData: (data: GraphData) => void
	destroy: () => void
}

/** Создаёт сцену отображения; координаты приходят только от сервера. */
export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { onNodeClick, onVisibleGroupsChange } = options
	const measure = createTextMeasurer()
	const initialNodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	let currentNodes = initialNodes
	let currentScale = 1
	const initialLinks = data.links.map((link) => ({ ...link }))
	const colorOf = createTypeColors(initialNodes)
	const drawnLinks = resolveLinks(initialNodes, initialLinks) // Отбрасывает связи с отсутствующими концами
	let layouts = new WeakMap<GraphNode, CloudLayout>()
	const layoutOf = (node: GraphNode): CloudLayout => {
		const cached = layouts.get(node)
		if (cached) return cached
		const layout = createCloudLayouts([node], measure).get(node)!
		layouts.set(node, layout)
		return layout
	}

	let renderMotion = () => {}
	let motion = createLocalMotion(initialNodes, () => renderMotion())
	let focusGroup = (_id: string): void => {}
	const handleNodeClick = (id: string): void => {
		onNodeClick?.(id)
		focusGroup(id)
	}
	let markVisibilityDirty = () => {}
	const renderer = createCanvasRenderer(colorOf, layoutOf, handleNodeClick, () => markVisibilityDirty())
	const visibility = createGroupVisibility(
		() => ({ nodes: currentNodes, viewport: renderer.getViewport(), scale: currentScale }),
		onVisibleGroupsChange,
	)
	markVisibilityDirty = visibility.markDirty
	renderMotion = renderer.render
	const zoomIndicator = document.createElement('div')
	zoomIndicator.className = 'force-graph__zoom'
	zoomIndicator.textContent = 'Зум: 1.0'
	renderer.setNodes(initialNodes)
	renderer.setLinks(drawnLinks)
	markVisibilityDirty()
	function setSelectedNode(id: string | null): void {
		renderer.setSelectedNode(id)
	}
	function updateData(nextData: GraphData): void {
		motion.stop()
		const nextNodes = nextData.nodes.map((node) => ({ ...node }))
		currentNodes = nextNodes
		const nextLinks = resolveLinks(
			nextNodes,
			nextData.links.map((link) => ({ ...link })),
		)
		layouts = new WeakMap<GraphNode, CloudLayout>()
		motion = createLocalMotion(nextNodes, () => renderMotion())
		renderer.setNodes(nextNodes)
		renderer.setLinks(nextLinks)
		renderer.render()
		markVisibilityDirty()
	}

	let previousScale = 1
	const panZoomState = attachCanvasPanZoom(
		renderer.canvas,
		zoomIndicator,
		(transform) => renderer.setZoomTransform(transform.x, transform.y, transform.k),
		(scale) => {
			currentScale = scale
			renderer.setZoomScale(scale)
			if (scale === previousScale) return
			previousScale = scale
			const viewport = renderer.getViewport()
			if (!viewport) return
			const centerX = (viewport.left + viewport.right) / 2
			const centerY = (viewport.top + viewport.bottom) / 2
			const pixelsPerUnit = renderer.getPixelsPerWorldUnit()
			const closest = currentNodes.reduce<GraphNode | null>((best, node) => {
				if (node.type !== 'group' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return best
				const distance = Math.hypot((node.x ?? 0) - centerX, (node.y ?? 0) - centerY)
				if (distance * pixelsPerUnit > LOCAL_RADIUS_PX) return best
				if (!best) return node
				return distance < Math.hypot((best.x ?? 0) - centerX, (best.y ?? 0) - centerY) ? node : best
			}, null)
			if (closest) motion.start(closest, pixelsPerUnit)
		},
		renderer.isNodeAt,
	)
	focusGroup = (id) => {
		const node = currentNodes.find((item) => item.id === id)
		if (!node || node.type !== 'group' || panZoomState.getTransform().k >= 1) return
		panZoomState.setTransform(zoomIdentity.translate(-(node.x ?? 0), -(node.y ?? 0)))
	}

	return {
		canvas: renderer.canvas,
		zoomIndicator,
		zoomControls: panZoomState.controls,
		getZoomTransform: panZoomState.getTransform,
		setZoomTransform: panZoomState.setTransform,
		setSelectedNode,
		updateData,
		destroy: () => {
			motion.stop()
			visibility.destroy()
			renderer.destroy()
			zoomIndicator.remove()
		},
	}
}
