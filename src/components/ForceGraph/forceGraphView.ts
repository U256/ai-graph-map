import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import { forceManyBody, type ForceLink, type Simulation } from 'd3-force'
import { select, type Selection } from 'd3-selection'
import { zoom, type D3ZoomEvent } from 'd3-zoom'
import type { GraphData, GraphLink, GraphNode } from '../../types/graph'
import {
	asDrawnLinks,
	CHARGE_STRENGTH,
	createSimulation,
	createTypeColors,
	DRAG_ALPHA_TARGET,
	DRAG_CLICK_SLOP,
	GRAPH_HEIGHT,
	GRAPH_WIDTH,
	LAYOUT_SCALE,
	prepareGraph,
	UPDATE_ALPHA,
	type GraphPhysics,
} from './forceGraph'
import { createCloudLayouts, type CloudLayout } from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { applyGraphUpdate, planGraphUpdate, readGraphState, type GraphUpdateResult } from './forceGraphUpdate'
import { LinkLayer } from './layers/graphLinkLayer'
import { NODE_CLASS, NodeLayer } from './layers/graphNodeLayer'

/**
 * Сборка svg-сцены графа и её инкрементальное обновление: здесь только svg, drag, панорама/зум и
 * порядок применения обновления к симуляции.
 */

export interface ForceGraphOptions extends GraphPhysics {
	panZoom?: boolean
	/**
	 * Наружу уходит только id: данные живут в стейте вызывающего, а `__data__` группы после правки может
	 * держать прежний объект симуляции. Клоны (`nodeClones > 1`) дают id вида `2-…`, которого в данных
	 * нет — вызывающий сам решает, что с этим делать (см. `App`).
	 */
	onNodeClick?: (id: string) => void
}

export interface ForceGraphHandle {
	svg: SVGSVGElement
	/** Сцена не пересобирается: раскладка, вид панорамы/зума и симуляция сохраняются, карта не «мигает». */
	update: (data: GraphData) => void
	/** Силы и разогревы читаются из одного объекта замыкания, поэтому достаточно их переписать и разогреть карту. */
	setPhysics: (physics: GraphPhysics) => void
	destroy: () => void
}

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>
type ContentSelection = Selection<SVGGElement, unknown, null, undefined>

const SVG_NS = 'http://www.w3.org/2000/svg'
const ARIA_LABEL = 'Граф связей научных работ и патентов'
/** Без них граф легко потерять за краем экрана. */
const ZOOM_EXTENT: [number, number] = [0.5, 8]

/**
 * Узел держится под курсором, симуляция разогревается на время жеста слабо, чтобы не разъезжалась вся
 * карта. Возвращается и признак «был перетаскиванием»: d3-drag не глушит `click` после отпускания мыши.
 */
function createDrag(
	simulation: Simulation<GraphNode, GraphLink>,
	physics: GraphPhysics,
): { behavior: DragBehavior<SVGGElement, GraphNode, GraphNode>; wasDragging: () => boolean } {
	let dragging = false
	let startX = 0
	let startY = 0

	function dragstarted(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		dragging = false
		startX = event.sourceEvent?.clientX ?? 0
		startY = event.sourceEvent?.clientY ?? 0
		if (!event.active) simulation.alphaTarget(physics.dragAlphaTarget ?? DRAG_ALPHA_TARGET).restart()
		subject.fx = subject.x
		subject.fy = subject.y
	}

	function dragged(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		const source = event.sourceEvent as MouseEvent | undefined
		// порог в пикселях: дрожащая рука не должна превращать намеренный клик в жест
		if (source && Math.hypot(source.clientX - startX, source.clientY - startY) > DRAG_CLICK_SLOP) dragging = true
		subject.fx = event.x
		subject.fy = event.y
	}

	function dragended(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		if (!event.active) simulation.alphaTarget(0)
		subject.fx = null
		subject.fy = null
	}

	const behavior = drag<SVGGElement, GraphNode, GraphNode>()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended)

	return { behavior, wasDragging: () => dragging }
}

/** Узлы уводят жест себе (d3-drag глушит всплытие). Колесо поверх узла остаётся зумом: drag его не перехватывает, иначе на плотной карте зум работал бы почти никогда. */
function attachPanZoom(root: SvgSelection, content: ContentSelection): void {
	root.call(
		zoom<SVGSVGElement, unknown>()
			.scaleExtent(ZOOM_EXTENT)
			.filter((event) => event.type === 'wheel' || !(event.target as Element).closest(`.${NODE_CLASS}`))
			.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
				const { x, y, k } = event.transform
				content.attr('transform', `translate(${x},${y}) scale(${k})`)
			}),
	)
}

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

/** Мерка текста за обновление вызывается ровно столько раз, сколько подписей правда поменялось. */
function dirtyNodeKeys(result: GraphUpdateResult): Set<string> {
	return new Set([...result.changedNodeKeys, ...result.addedNodeKeys])
}

/** Толщина пересчитывается и при смене типа у любого из концов связи. */
function dirtyLinkKeys(result: GraphUpdateResult): Set<string> {
	return new Set([...result.changedLinkKeys, ...result.addedLinkKeys])
}

export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { panZoom = true, onNodeClick, ...initialPhysics } = options
	const { svg, content, linkLayer: linkGroup, nodeLayer: nodeGroup } = createScene()
	const root = select(svg)

	// всеми силами и drag'ом читается этот объект: setPhysics пишет в него, а не пересобирает сцену
	const physics: GraphPhysics = { ...initialPhysics }

	const measure = createTextMeasurer()
	const { nodes: initialNodes, links: initialLinks } = prepareGraph(data)
	// палитра живёт вместе со сценой: прежние типы не перекрасятся, новый получит свой оттенок
	const colorOf = createTypeColors(initialNodes)
	const simulation = createSimulation(initialNodes, initialLinks, physics)
	const linkForce = simulation.force<ForceLink<GraphNode, GraphLink>>('link') as ForceLink<GraphNode, GraphLink>
	const { behavior: dragBehavior, wasDragging } = createDrag(simulation, physics)

	const layers = {
		links: new LinkLayer(linkGroup),
		nodes: new NodeLayer(nodeGroup, {
			colorOf,
			layoutOf: (node) => createCloudLayouts([node], measure).get(node) as CloudLayout,
			// навешивается при создании: прежние группы не трогаются
			attach: (element) => {
				const group = select<SVGGElement, GraphNode>(element)
				group.call(dragBehavior)
				if (!onNodeClick) return
				group.on('click', (_event: MouseEvent, node: GraphNode) => {
					// d3-drag не глушит `click`, который браузер стреляет после отпускания мыши
					if (wasDragging()) return
					onNodeClick(node.id)
				})
			},
		}),
	}

	function drawTick(): void {
		layers.links.drawPositions()
		layers.nodes.drawPositions()
	}

	layers.links.sync(asDrawnLinks(initialLinks))
	layers.nodes.sync(initialNodes)
	// новые элементы встают на свои координаты сразу, не дожидаясь первого тика
	drawTick()

	/**
	 * Порядок принципиален: `nodes()` присваивает узлам `index`, `linkForce.links()` по ним разрешает
	 * концы и пересчитывает `bias`, и только потом поднимается `alpha` — иначе остывшая симуляция
	 * осталась бы неподвижной. Состояние читается из симуляции и силы связей, а не хранится отдельно:
	 * рассинхрон между ними и слоем невозможен.
	 */
	function update(next: GraphData): void {
		const state = readGraphState(simulation.nodes(), linkForce.links())
		const result = applyGraphUpdate(state, planGraphUpdate(state, next))

		simulation.nodes(result.nodes)
		linkForce.links(result.links)
		simulation.alpha(physics.updateAlpha ?? UPDATE_ALPHA).restart()

		layers.links.sync(asDrawnLinks(linkForce.links() ?? []), dirtyLinkKeys(result))
		layers.nodes.sync(result.nodes, dirtyNodeKeys(result))
		drawTick()
	}

	/** Drag читает `dragAlphaTarget` из того же объекта `physics`, поэтому его перенавешивать не нужно. */
	function setPhysics(next: GraphPhysics): void {
		Object.assign(physics, next)
		if (physics.linkDistance !== undefined) linkForce.distance(physics.linkDistance)
		if (physics.linkStrength !== undefined) linkForce.strength(physics.linkStrength)
		if (physics.velocityDecay !== undefined) simulation.velocityDecay(physics.velocityDecay)
		// заряд задан через масштаб раскладки (`charge * scale ** 2`), поэтому пересобирается сила целиком
		if (physics.chargeStrength !== undefined || physics.layoutScale !== undefined) {
			const charge = physics.chargeStrength ?? CHARGE_STRENGTH
			const scale = physics.layoutScale ?? LAYOUT_SCALE
			simulation.force('charge', forceManyBody().strength(charge * scale ** 2))
		}
		simulation.alpha(physics.updateAlpha ?? UPDATE_ALPHA).restart()
	}

	simulation.on('tick', drawTick)
	if (panZoom) attachPanZoom(root, content)

	return {
		svg,
		update,
		setPhysics,
		destroy: () => {
			simulation.on('tick', null)
			simulation.stop()
			// иначе снятый DOM держит объекты симуляции
			layers.links.clear()
			layers.nodes.clear()
			svg.remove()
		},
	}
}
