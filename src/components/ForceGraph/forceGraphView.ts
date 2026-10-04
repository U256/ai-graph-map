import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { GraphData, GraphNode } from '../../types/graph'
import { attachCanvasPanZoom } from './canvasPanZoom'
import { createCanvasRenderer } from './canvasRenderer'
import { createTypeColors } from './forceGraph'
import { createCloudLayouts } from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { createGroupVisibility } from './groupVisibility'
import { applyLayout, calculateLayout } from './layout'
import { resolveLinks } from './resolveLinks'

/** Компоновщик Canvas-сцены; раскладка и обновление графа остаются независимы от отрисовки. */

export interface ForceGraphOptions {
	panZoom?: boolean
	/**
	 * Наружу уходит только id: данные живут в стейте вызывающего. Клоны (`nodeClones > 1`) дают id вида `2-…`, которого в данных
	 * нет — вызывающий сам решает, что с этим делать (см. `App`).
	 */
	onNodeClick?: (id: string) => void
	onVisibleGroupsChange?: (ids: string[]) => void
}

export interface ForceGraphHandle {
	canvas: HTMLCanvasElement
	zoomIndicator: HTMLDivElement
	zoomControls: HTMLDivElement
	getZoomTransform: () => ZoomTransform
	setZoomTransform: (transform: ZoomTransform) => void
	setSelectedNode: (id: string | null) => void
	updateData: (data: GraphData) => void
	destroy: () => void
}

/** Создаёт сцену один раз; обновления данных сохраняют существующие объекты и жесты. */
export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { panZoom = true, onNodeClick, onVisibleGroupsChange } = options
	const measure = createTextMeasurer()
	const initialNodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const initialLinks = data.links.map((link) => ({ ...link }))
	const colorOf = createTypeColors(initialNodes)
	const drawnLinks = resolveLinks(initialNodes, initialLinks)
	let currentNodes = initialNodes
	let transitionFrame: number | null = null
	let layoutRevision = 0
	let pendingLayout: ReturnType<typeof calculateLayout> | null = null
	let draggedIds = new Set<string>()
	let zoomControls = document.createElement('div')
	let getZoomTransform = () => zoomIdentity
	let setZoomTransform = (_transform: ZoomTransform) => {}
	let markVisibilityDirty = () => {}
	const renderer = createCanvasRenderer(
		colorOf,
		(node) => createCloudLayouts([node], measure).get(node)!,
		(node) => {
			draggedIds.add(node.id)
			renderer.render()
		},
		() => renderer.render(),
		onNodeClick,
		() => markVisibilityDirty(),
	)
	const visibility = createGroupVisibility(
		() => ({ nodes: currentNodes, viewport: renderer.getViewport(), scale: getZoomTransform().k }),
		onVisibleGroupsChange,
	)
	markVisibilityDirty = visibility.markDirty
	const zoomIndicator = document.createElement('div')
	zoomIndicator.className = 'force-graph__zoom'
	zoomIndicator.textContent = 'Зум: 1.0'
	renderer.setNodes(initialNodes)
	renderer.setLinks(drawnLinks)
	function setSelectedNode(id: string | null): void {
		renderer.setSelectedNode(id)
	}
	function updateData(nextData: GraphData): void {
		layoutRevision += 1
		const revision = layoutRevision
		pendingLayout?.cancel()
		const layout = calculateLayout(nextData, revision)
		pendingLayout = layout
		layout.promise
			.then((result) => {
				if (result.revision !== layoutRevision) return
				pendingLayout = null
				const positioned = applyLayout(nextData, result)
				const previous = new Map(currentNodes.map((node) => [node.id, node]))
				const nextNodes: GraphNode[] = positioned.nodes.map((node) => {
					const old = previous.get(node.id)
					if (old) return Object.assign(old, node, { x: old.x, y: old.y })
					return { ...node } as GraphNode
				})
				const nextLinks = resolveLinks(
					nextNodes,
					positioned.links.map((link) => ({ ...link })),
				)
				const targets = new Map(result.positions.map(({ id, x, y }) => [id, { x, y }]))
				const from = new Map(nextNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
				const started = performance.now()
				const duration = 450
				if (transitionFrame !== null) cancelAnimationFrame(transitionFrame)
				currentNodes = nextNodes
				renderer.setNodes(nextNodes)
				renderer.setLinks(nextLinks)
				const animate = (now: number): void => {
					const progress = Math.min(1, (now - started) / duration)
					const eased = 1 - (1 - progress) ** 3
					nextNodes.forEach((entry) => {
						if (!draggedIds.has(entry.id)) {
							const start = from.get(entry.id)!
							const target = targets.get(entry.id) ?? start
							Object.assign(entry, {
								x: start.x + (target.x - start.x) * eased,
								y: start.y + (target.y - start.y) * eased,
							})
						}
					})
					renderer.render()
					markVisibilityDirty()
					if (progress < 1) transitionFrame = requestAnimationFrame(animate)
					else {
						transitionFrame = null
						draggedIds = new Set()
					}
				}
				transitionFrame = requestAnimationFrame(animate)
			})
			.catch(() => {
				if (revision === layoutRevision) pendingLayout = null
			})
	}

	if (panZoom) {
		const panZoomState = attachCanvasPanZoom(
			renderer.canvas,
			zoomIndicator,
			(transform) => renderer.setZoomTransform(transform.x, transform.y, transform.k),
			(scale) => renderer.setZoomScale(scale),
			renderer.isNodeAt,
		)
		zoomControls = panZoomState.controls
		getZoomTransform = panZoomState.getTransform
		setZoomTransform = panZoomState.setTransform
	}

	return {
		canvas: renderer.canvas,
		zoomIndicator,
		zoomControls,
		getZoomTransform,
		setZoomTransform,
		setSelectedNode,
		updateData,
		destroy: () => {
			layoutRevision += 1
			pendingLayout?.cancel()
			if (transitionFrame !== null) cancelAnimationFrame(transitionFrame)
			visibility.destroy()
			renderer.destroy()
			zoomIndicator.remove()
			zoomControls.remove()
		},
	}
}
