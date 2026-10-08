import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { GraphData, GraphNode, GraphNodeInput } from '../../types/graph'
import { attachCanvasPanZoom } from './canvasPanZoom'
import { createCanvasRenderer, type CanvasRenderer } from './canvasRenderer'
import { createTypeColors } from './canvasColorUtils'
import {
	createCloudLayouts,
	GROUP_DETAIL_SCALE,
	GROUP_FOCUS_SIZE,
	nestedGraphBounds,
	type CloudLayout,
} from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { createGroupVisibility } from './groupVisibility'
import { createLocalMotion, localRadius } from './localMotion'
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

function rootNode(node: GraphNode): GraphNode {
	const fields = { ...node }
	delete fields.children
	delete fields.childrenLoading
	return fields
}

function rootNodeSignature(node: GraphNodeInput): string {
	const fields = { ...node }
	delete fields.children
	delete fields.childrenLoading
	return JSON.stringify(fields)
}

function rootDataSignature(graph: GraphData): string {
	return JSON.stringify({ nodes: graph.nodes.map(rootNodeSignature), links: graph.links })
}

function syncNestedGroups(
	graph: GraphData,
	currentNodes: GraphNode[],
	renderer: CanvasRenderer,
	boundsByGroup: Map<string, ReturnType<typeof nestedGraphBounds>>,
	measure: ReturnType<typeof createTextMeasurer>,
): void {
	const seen = new Set<string>()
	function visit(current: GraphData): void {
		current.nodes.forEach((node) => {
			if (node.type !== 'group') return
			seen.add(node.id)
			renderer.setNestedGroup(node.id, node.children ?? null, node.childrenLoading === true)
			if (node.children && node.childrenLoading !== true) {
				const bounds = nestedGraphBounds(node.children, measure)
				boundsByGroup.set(node.id, bounds)
				renderer.setNestedGroupBounds(node.id, bounds)
			} else {
				boundsByGroup.delete(node.id)
				renderer.setNestedGroupBounds(node.id, null)
			}
			if (node.children) visit(node.children)
		})
	}
	visit(graph)
	currentNodes.forEach((node) => {
		if (node.type === 'group' && !seen.has(node.id)) renderer.setNestedGroup(node.id, null, false)
	})
}

/** Создаёт сцену отображения; координаты приходят только от сервера. */
export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { onNodeClick, onVisibleGroupsChange } = options
	const measure = createTextMeasurer()
	const initialNodes: GraphNode[] = data.nodes.map(rootNode)
	let currentNodes = initialNodes
	let currentScale = 1
	let currentRootSignature = rootDataSignature(data)
	const initialLinks = data.links.map((link) => ({ ...link }))
	const colorOf = createTypeColors(initialNodes)
	const drawnLinks = resolveLinks(initialNodes, initialLinks) // Отбрасывает связи с отсутствующими концами
	let layouts = new WeakMap<GraphNode, CloudLayout>()
	const boundsByGroup = new Map<string, ReturnType<typeof nestedGraphBounds>>()
	const layoutOf = (node: GraphNode): CloudLayout => {
		const cached = layouts.get(node)
		if (cached) return cached
		const layout = createCloudLayouts([node], measure).get(node)!
		layouts.set(node, layout)
		return layout
	}

	let renderMotion = () => {}
	const groupRadius = (node: GraphNode): number => boundsByGroup.get(node.id)?.radius ?? GROUP_FOCUS_SIZE / 2
	let motion = createLocalMotion(initialNodes, () => renderMotion(), groupRadius)
	let pendingMotionGroupId: string | null = null
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
	syncNestedGroups(data, currentNodes, renderer, boundsByGroup, measure)
	markVisibilityDirty()
	function updateData(nextData: GraphData): void {
		const nextRootSignature = rootDataSignature(nextData)
		if (nextRootSignature === currentRootSignature) {
			syncNestedGroups(nextData, currentNodes, renderer, boundsByGroup, measure)
			const pendingGroup = pendingMotionGroupId
			const readyGroup = pendingGroup ? currentNodes.find((node) => node.id === pendingGroup) : undefined
			if (readyGroup && boundsByGroup.has(readyGroup.id) && currentScale >= GROUP_DETAIL_SCALE) {
				motion.start(readyGroup, renderer.getPixelsPerWorldUnit())
			} else {
				motion.stop()
			}
			return
		}
		currentRootSignature = nextRootSignature
		const previousNodes = currentNodes
		motion.stop(false)
		const positions = new Map(previousNodes.map((node) => [node.id, { x: node.x, y: node.y }]))
		const nextNodes = nextData.nodes.map(rootNode)
		nextNodes.forEach((node) => {
			const nextNode = node
			const position = positions.get(node.id)
			if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
				nextNode.x = position.x
				nextNode.y = position.y
			}
		})
		currentNodes = nextNodes
		const nextLinks = resolveLinks(
			nextNodes,
			nextData.links.map((link) => ({ ...link })),
		)
		layouts = new WeakMap<GraphNode, CloudLayout>()
		boundsByGroup.clear()
		motion = createLocalMotion(nextNodes, () => renderMotion(), groupRadius)
		renderer.setNodes(nextNodes)
		renderer.setLinks(nextLinks)
		syncNestedGroups(nextData, currentNodes, renderer, boundsByGroup, measure)
		const readyGroup = pendingMotionGroupId ? nextNodes.find((node) => node.id === pendingMotionGroupId) : undefined
		if (readyGroup && boundsByGroup.has(readyGroup.id) && currentScale >= GROUP_DETAIL_SCALE) {
			motion.start(readyGroup, renderer.getPixelsPerWorldUnit())
		}
		renderer.render()
		markVisibilityDirty()
	}

	const panZoomState = attachCanvasPanZoom(
		renderer.canvas,
		zoomIndicator,
		(transform) => renderer.setZoomTransform(transform.x, transform.y, transform.k),
		(scale) => {
			currentScale = scale
			renderer.setZoomScale(scale)
			if (scale < 1) {
				motion.stop()
				pendingMotionGroupId = null
				return
			}
			const viewport = renderer.getViewport()
			if (!viewport) return
			const centerX = (viewport.left + viewport.right) / 2
			const centerY = (viewport.top + viewport.bottom) / 2
			const pixelsPerUnit = renderer.getPixelsPerWorldUnit()
			const closest = currentNodes.reduce<GraphNode | null>((best, node) => {
				if (node.type !== 'group' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return best
				const distance = Math.hypot((node.x ?? 0) - centerX, (node.y ?? 0) - centerY)
				if (distance > localRadius(groupRadius(node), pixelsPerUnit)) return best
				if (!best) return node
				return distance < Math.hypot((best.x ?? 0) - centerX, (best.y ?? 0) - centerY) ? node : best
			}, null)
			pendingMotionGroupId = closest?.id ?? null
			if (closest && boundsByGroup.has(closest.id)) motion.start(closest, pixelsPerUnit)
			else motion.stop()
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
		setSelectedNode: (id) => renderer.setSelectedNode(id),
		updateData,
		destroy: () => {
			motion.stop()
			visibility.destroy()
			renderer.destroy()
			zoomIndicator.remove()
		},
	}
}
