import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { GraphData, GraphNode, GraphNodeInput } from '../../types/graph'
import { attachCanvasPanZoom } from './canvasPanZoom'
import { createCanvasRenderer } from './canvasRenderer'
import { createSimulation, createTypeColors } from './forceGraph'
import { createCloudLayouts } from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { createGroupVisibility } from './groupVisibility'
import { resolveLinks } from './resolveLinks'

const LOCAL_LAYOUT_TICKS = 180

function nodeFieldsEqual(left: GraphNodeInput, right: GraphNodeInput): boolean {
	return (
		left.title === right.title &&
		left.description === right.description &&
		left.hasWarning === right.hasWarning &&
		left.type === right.type &&
		left.chargeMultiplier === right.chargeMultiplier
	)
}

function linkKey(link: { source: string; target: string }): string {
	return `${link.source}>${link.target}`
}

function locallyPositionData(
	nextData: GraphData,
	previousNodes: GraphNode[],
	previousLinks: GraphData['links'],
): GraphData {
	const previousById = new Map(previousNodes.map((node) => [node.id, node]))
	const previousIds = new Set(previousById.keys())
	const nextIds = new Set(nextData.nodes.map((node) => node.id))
	const forceIds = new Set<string>()
	const previousLinkKeys = new Set(previousLinks.map(linkKey))
	const nextLinkKeys = new Set(nextData.links.map(linkKey))
	const linksChanged =
		previousLinks.length !== nextData.links.length ||
		[...previousLinkKeys].some((key) => !nextLinkKeys.has(key)) ||
		[...nextLinkKeys].some((key) => !previousLinkKeys.has(key))

	nextData.nodes.forEach((node) => {
		const previous = previousById.get(node.id)
		if (!previous || previous.chargeMultiplier !== node.chargeMultiplier || previous.type !== node.type)
			forceIds.add(node.id)
	})
	previousNodes.forEach((node) => {
		if (!nextIds.has(node.id)) forceIds.add(node.id)
	})
	if (linksChanged) {
		previousLinks.forEach((link) => {
			if (nextLinkKeys.has(linkKey(link))) return
			forceIds.add(link.source)
			forceIds.add(link.target)
		})
		nextData.links.forEach((link) => {
			if (previousLinkKeys.has(linkKey(link))) return
			forceIds.add(link.source)
			forceIds.add(link.target)
		})
	}
	const nodes: GraphNode[] = nextData.nodes.map((node) => {
		const previous = previousById.get(node.id)
		return previous && nodeFieldsEqual(previous, node) ? previous : { ...node, x: previous?.x, y: previous?.y }
	})
	const nodeById = new Map(nodes.map((node) => [node.id, node]))
	const neighborIds = new Set(forceIds)
	;[...previousLinks, ...nextData.links].forEach((link) => {
		if (forceIds.has(link.source)) neighborIds.add(link.target)
		if (forceIds.has(link.target)) neighborIds.add(link.source)
	})
	const added = nodes.filter((node) => !previousIds.has(node.id))
	added.forEach((entry, index) => {
		const node = entry
		const neighbors = nextData.links
			.filter((link) => link.source === node.id || link.target === node.id)
			.map((link) => nodeById.get(link.source === node.id ? link.target : link.source))
			.filter((neighbor): neighbor is GraphNode =>
				Boolean(neighbor && Number.isFinite(neighbor.x) && Number.isFinite(neighbor.y)),
			)
		const anchor = neighbors[0]
		node.x = anchor?.x ?? (index + 1) * 12
		node.y = anchor?.y ?? (index + 1) * 12
	})

	if (forceIds.size > 0) {
		const simulated = nodes.map((node) => ({ ...node }))
		const simulation = createSimulation(
			simulated,
			nextData.links.map((link) => ({ ...link })),
		).stop()
		simulated.forEach((entry) => {
			const node = entry
			if (!neighborIds.has(node.id)) {
				node.fx = node.x
				node.fy = node.y
			}
		})
		for (let tick = 0; tick < LOCAL_LAYOUT_TICKS; tick += 1) simulation.tick()
		simulated.forEach((node, index) => {
			if (!neighborIds.has(node.id)) return
			if (previousIds.has(node.id)) {
				// Локальный расчёт не вправе менять объект, на который смотрит Canvas и активный drag.
				nodes[index] = { ...nodes[index], x: node.x, y: node.y }
			} else {
				nodes[index].x = node.x
				nodes[index].y = node.y
			}
		})
		simulation.stop()
	}

	return { nodes, links: nextData.links }
}

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
	let inputLinks = data.links.map((link) => ({ ...link }))
	let zoomControls = document.createElement('div')
	let getZoomTransform = () => zoomIdentity
	let setZoomTransform = (_transform: ZoomTransform) => {}
	let markVisibilityDirty = () => {}
	const renderer = createCanvasRenderer(
		colorOf,
		(node) => createCloudLayouts([node], measure).get(node)!,
		(_node) => renderer.render(),
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
		const positioned = locallyPositionData(nextData, currentNodes, inputLinks)
		const nextNodes = positioned.nodes as GraphNode[]
		const nextLinks = resolveLinks(
			nextNodes,
			positioned.links.map((link) => ({ ...link })),
		)
		currentNodes = nextNodes
		inputLinks = positioned.links.map((link) => ({ ...link }))
		renderer.setNodes(nextNodes)
		renderer.setLinks(nextLinks)
		markVisibilityDirty()
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
			visibility.destroy()
			renderer.destroy()
			zoomIndicator.remove()
			zoomControls.remove()
		},
	}
}
