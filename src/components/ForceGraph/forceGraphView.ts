import { select, type Selection } from 'd3-selection'
import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { DrawnLink, GraphData, GraphLink, GraphNode } from '../../types/graph'
import { createSimulation, createTypeColors, GRAPH_HEIGHT, GRAPH_WIDTH, type GraphPhysics } from './forceGraph'
import { createCloudLayouts, type CloudLayout } from './forceGraphCloud'
import { attachChildDrag, attachNodeInteractions, attachPanZoom } from './forceGraphInteractions'
import { createTextMeasurer } from './forceGraphText'
import { applyGraphUpdate, planGraphUpdate, readGraphState } from './forceGraphUpdate'
import { LinkLayer } from './layers/graphLinkLayer'
import { NodeLayer } from './layers/graphNodeLayer'

/** Компоновщик SVG-сцены: слои и взаимодействия подключаются отдельными адаптерами. */

export interface ForceGraphOptions {
	panZoom?: boolean
	physics?: GraphPhysics
	/**
	 * Наружу уходит только id: данные живут в стейте вызывающего, а `__data__` группы после правки может
	 * держать прежний объект симуляции. Клоны (`nodeClones > 1`) дают id вида `2-…`, которого в данных
	 * нет — вызывающий сам решает, что с этим делать (см. `App`).
	 */
	onNodeClick?: (id: string) => void
}

export interface ForceGraphHandle {
	svg: SVGSVGElement
	zoomIndicator: HTMLDivElement
	zoomControls: HTMLDivElement
	getZoomTransform: () => ZoomTransform
	setZoomTransform: (transform: ZoomTransform) => void
	setSelectedNode: (id: string | null) => void
	updateData: (data: GraphData) => void
	destroy: () => void
}

type ContentSelection = Selection<SVGGElement, unknown, null, undefined>

const SVG_NS = 'http://www.w3.org/2000/svg'
const ARIA_LABEL = 'Граф связей научных работ и патентов'
const INCREMENTAL_TICKS = 180
const TEMPORARY_OLD_CHARGE = 0.15
const OLD_POSITION_BLEND = 0.24
const DISCONNECTED_SEED_RADIUS = 180
const DISCONNECTED_SEED_STEP = 26

/** Две группы: связи под узлами — порядок слоёв задан разметкой, а не z-index. */
function createScene(): {
	svg: SVGSVGElement
	content: ContentSelection
	linkLayer: SVGGElement
	nodeLayer: SVGGElement
} {
	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('viewBox', `${-GRAPH_WIDTH / 2} ${-GRAPH_HEIGHT / 2} ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`)
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
	svg.setAttribute('role', 'img')
	svg.setAttribute('aria-label', ARIA_LABEL)

	const content = select(svg).append('g')
	// цвет и непрозрачность — на группе слоя, чтобы на линии оставалась только толщина
	const links = content.append('g').attr('stroke', '#999').attr('stroke-opacity', 0.6)
	const nodes = content.append('g')

	return { svg, content, linkLayer: links.node() as SVGGElement, nodeLayer: nodes.node() as SVGGElement }
}

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
	const { panZoom = true, onNodeClick } = options
	const physics = options.physics ?? {}
	const { svg, content, linkLayer: linkGroup, nodeLayer: nodeGroup } = createScene()
	const zoomIndicator = document.createElement('div')
	zoomIndicator.className = 'force-graph__zoom'
	zoomIndicator.textContent = 'Зум: 1.0'
	let zoomControls = document.createElement('div')
	let getZoomTransform = () => zoomIdentity
	let setZoomTransform = (_transform: ZoomTransform) => {}
	const root = select(svg)

	const measure = createTextMeasurer()
	const initialNodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const initialLinks: GraphLink[] = data.links.map((link) => ({ ...link }))
	// палитра живёт вместе со сценой: прежние типы не перекрасятся, новый получит свой оттенок
	const colorOf = createTypeColors(initialNodes)
	const drawnLinks = resolveLinks(initialNodes, initialLinks)
	let currentNodes = initialNodes
	let currentLinks = drawnLinks
	let drawPositions = (): void => {}
	const layers = {
		links: new LinkLayer(linkGroup),
		nodes: new NodeLayer(nodeGroup, {
			colorOf,
			layoutOf: (node) => createCloudLayouts([node], measure).get(node) as CloudLayout,
			// навешивается при создании: прежние группы не трогаются
			attach: (element) => attachNodeInteractions(element, () => drawPositions(), onNodeClick),
			attachChild: attachChildDrag,
		}),
	}

	layers.links.sync(drawnLinks)
	layers.nodes.sync(initialNodes)
	layers.nodes.setSelectedNode(null)
	drawPositions = (): void => {
		layers.links.drawPositions()
		layers.nodes.drawPositions()
	}
	drawPositions()
	function setSelectedNode(id: string | null): void {
		layers.nodes.setSelectedNode(id)
	}
	function updateData(nextData: GraphData): void {
		const state = readGraphState(currentNodes, currentLinks)
		const plan = planGraphUpdate(state, nextData)
		const result = applyGraphUpdate(state, plan)
		settleAddedNodes(result.nodes, result.links, new Set(plan.addedNodes.map(({ node }) => node.id)), physics)
		const nextLinks = resolveLinks(result.nodes, result.links)
		const dirtyLinks = new Set([...result.addedLinkKeys, ...result.changedLinkKeys])

		currentNodes = result.nodes
		currentLinks = nextLinks
		layers.links.sync(nextLinks, dirtyLinks)
		layers.nodes.sync(result.nodes, result.changedNodeKeys)
		drawPositions()
	}

	if (panZoom) {
		const panZoomState = attachPanZoom(root, content, zoomIndicator, (scale) => layers.nodes.setZoomScale(scale))
		zoomControls = panZoomState.controls
		getZoomTransform = panZoomState.getTransform
		setZoomTransform = panZoomState.setTransform
	}

	return {
		svg,
		zoomIndicator,
		zoomControls,
		getZoomTransform,
		setZoomTransform,
		setSelectedNode,
		updateData,
		destroy: () => {
			layers.links.clear()
			layers.nodes.clear()
			svg.remove()
			zoomIndicator.remove()
			zoomControls.remove()
		},
	}
}
