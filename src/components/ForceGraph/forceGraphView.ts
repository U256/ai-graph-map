import type { ForceLink } from 'd3-force'
import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { DrawnLink, GraphData, GraphLink, GraphNode } from '../../types/graph'
import { createCanvasRenderer } from './canvasRenderer'
import {
	createSimulation,
	createTypeColors,
	DRAG_ALPHA_TARGET,
	DYNAMIC_ALPHA_TARGET,
	UPDATE_ALPHA,
	type GraphPhysics,
} from './forceGraph'
import { createCloudLayouts } from './forceGraphCloud'
import { attachCanvasPanZoom } from './forceGraphInteractions'
import { createTextMeasurer } from './forceGraphText'
import { applyGraphUpdate, planGraphUpdate, readGraphState } from './forceGraphUpdate'
import { createGroupVisibility } from './groupVisibility'

/** Компоновщик Canvas-сцены; раскладка и обновление графа остаются независимы от отрисовки. */

export interface ForceGraphOptions {
	panZoom?: boolean
	dynamic?: boolean
	physics?: GraphPhysics
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

const INCREMENTAL_TICKS = 180
const TEMPORARY_OLD_CHARGE = 0.15
const OLD_POSITION_BLEND = 0.24
const DISCONNECTED_SEED_RADIUS = 180
const DISCONNECTED_SEED_STEP = 26

/** Превращает строковые концы входных связей в узлы, как раньше это делал `forceLink`. */
function resolveLinks(nodes: GraphNode[], links: GraphLink[]): DrawnLink[] {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	return links.flatMap((link) => {
		const source = typeof link.source === 'string' ? byId.get(link.source) : link.source
		const target = typeof link.target === 'string' ? byId.get(link.target) : link.target
		return source && target ? [{ ...link, source, target } as DrawnLink] : []
	})
}

/**
 * Коротко доводит только новые узлы: старые закреплены на прежних координатах, поэтому добавление компоненты
 * не перетряхивает уже разложенную карту. Для полностью новой компоненты стартовые точки разводятся заранее,
 * иначе одинаковый запасной seed оставляет все её узлы в центре до первого тика.
 */
function settleAddedNodes(nodes: GraphNode[], links: GraphLink[], addedIds: Set<string>, physics: GraphPhysics): void {
	if (addedIds.size === 0) return
	const existingIds = new Set(nodes.filter((node) => !addedIds.has(node.id)).map((node) => node.id))
	const oldPositions = new Map(nodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
	const simulationNodes = nodes.map((node, index) => {
		const added = addedIds.has(node.id)
		const hasExistingNeighbor = links.some((link) => {
			const source = String(link.source)
			const target = String(link.target)
			return (
				added &&
				((source === node.id && existingIds.has(target)) || (target === node.id && existingIds.has(source)))
			)
		})
		const angle = index * 2.399963
		const radius = DISCONNECTED_SEED_RADIUS + index * DISCONNECTED_SEED_STEP
		return {
			...node,
			x: hasExistingNeighbor ? node.x : (node.x ?? 0) + Math.cos(angle) * radius,
			y: hasExistingNeighbor ? node.y : (node.y ?? 0) + Math.sin(angle) * radius,
			vx: 0,
			vy: 0,
			fx: null,
			fy: null,
			chargeMultiplier: added ? node.chargeMultiplier : TEMPORARY_OLD_CHARGE,
			index,
		}
	})
	const simulationLinks = links.map((link) => ({ ...link }))
	const simulation = createSimulation(simulationNodes, simulationLinks, physics).stop()

	for (let tick = 0; tick < INCREMENTAL_TICKS; tick += 1) simulation.tick()

	const positions = new Map(simulationNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
	nodes.forEach((node) => {
		const position = positions.get(node.id)
		if (position) {
			const oldPosition = oldPositions.get(node.id)
			if (oldPosition && !addedIds.has(node.id)) {
				position.x = oldPosition.x + (position.x - oldPosition.x) * OLD_POSITION_BLEND
				position.y = oldPosition.y + (position.y - oldPosition.y) * OLD_POSITION_BLEND
			}
			// eslint-disable-next-line no-param-reassign
			node.x = position.x
			// eslint-disable-next-line no-param-reassign
			node.y = position.y
		}
	})
}

export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { panZoom = true, dynamic = false, onNodeClick, onVisibleGroupsChange } = options
	const physics = options.physics ?? {}
	const measure = createTextMeasurer()
	const initialNodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const initialLinks: GraphLink[] = data.links.map((link) => ({ ...link }))
	const colorOf = createTypeColors(initialNodes)
	const drawnLinks = resolveLinks(initialNodes, initialLinks)
	let currentNodes = initialNodes
	let currentLinks = drawnLinks
	let simulation: ReturnType<typeof createSimulation> | null = null
	let zoomControls = document.createElement('div')
	let getZoomTransform = () => zoomIdentity
	let setZoomTransform = (_transform: ZoomTransform) => {}
	let markVisibilityDirty = () => {}
	const renderer = createCanvasRenderer(
		colorOf,
		(node) => createCloudLayouts([node], measure).get(node)!,
		() => {
			renderer.render()
			if (simulation) simulation.alphaTarget(physics.dragAlphaTarget ?? DRAG_ALPHA_TARGET).restart()
		},
		() => {
			if (simulation) simulation.alphaTarget(DYNAMIC_ALPHA_TARGET)
			renderer.render()
		},
		onNodeClick,
	)
	const visibility = createGroupVisibility(
		() => ({ nodes: currentNodes, viewport: renderer.getViewport(), scale: getZoomTransform().k }),
		onVisibleGroupsChange,
	)
	markVisibilityDirty = visibility.markDirty
	renderer.setVisibleGroupsCallback(markVisibilityDirty)
	const zoomIndicator = document.createElement('div')
	zoomIndicator.className = 'force-graph__zoom'
	zoomIndicator.textContent = 'Зум: 1.0'
	renderer.setNodes(initialNodes)
	renderer.setLinks(drawnLinks)
	if (dynamic) {
		simulation = createSimulation(initialNodes, drawnLinks, physics)
			.alphaTarget(DYNAMIC_ALPHA_TARGET)
			.on('tick', () => {
				renderer.render()
				markVisibilityDirty()
			})
	}
	function setSelectedNode(id: string | null): void {
		renderer.setSelectedNode(id)
	}
	function updateData(nextData: GraphData): void {
		const state = readGraphState(currentNodes, currentLinks)
		const plan = planGraphUpdate(state, nextData)
		const result = applyGraphUpdate(state, plan)
		settleAddedNodes(result.nodes, result.links, new Set(plan.addedNodes.map(({ node }) => node.id)), physics)
		const nextLinks = resolveLinks(result.nodes, result.links)
		currentNodes = result.nodes
		currentLinks = nextLinks
		if (simulation) {
			const linkForce = simulation.force('link') as ForceLink<GraphNode, DrawnLink> | null
			simulation.nodes(currentNodes)
			linkForce?.links(nextLinks)
			simulation.alpha(physics.updateAlpha ?? UPDATE_ALPHA).restart()
		}
		renderer.setNodes(result.nodes)
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
			simulation?.stop().on('tick', null)
			simulation = null
			visibility.destroy()
			renderer.destroy()
			zoomIndicator.remove()
			zoomControls.remove()
		},
	}
}
