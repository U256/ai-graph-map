import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import type { ForceLink, Simulation } from 'd3-force'
import { select, type Selection } from 'd3-selection'
import { zoom, type D3ZoomEvent } from 'd3-zoom'
import type { GraphData, GraphLink, GraphNode } from '../../types/graph'
import {
	asDrawnLinks,
	createSimulation,
	createTypeColors,
	DRAG_ALPHA_TARGET,
	GRAPH_HEIGHT,
	GRAPH_WIDTH,
	prepareGraph,
	UPDATE_ALPHA,
} from './forceGraph'
import { createCloudLayouts, type CloudLayout } from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { buildGraphState, collectSeeds, createPreviousGraph, planGraphUpdate } from './forceGraphUpdate'
import { LinkLayer } from './layers/graphLinkLayer'
import { NODE_CLASS, NodeLayer } from './layers/graphNodeLayer'

/**
 * Сборка svg-сцены графа и её инкрементальное обновление. Физика, геометрия облаков, разбор
 * изменений и жизненный цикл нод/связей живут в своих модулях, здесь остаются только svg, drag,
 * панорама/зум и порядок применения обновления к симуляции.
 */

export interface ForceGraphOptions {
	/** Панорама перетаскиванием фона и зум колесом. */
	panZoom?: boolean
}

/** Готовый граф: svg собран, его остаётся вставить в DOM. */
export interface ForceGraphHandle {
	svg: SVGSVGElement
	/**
	 * Перерисовать сцену под новые данные: добавить новые узлы и связи, обновить изменившиеся и
	 * убрать удалённые. Раскладка, вид панорамы/зума и сама симуляция при этом сохраняются — сцена
	 * не пересобирается, поэтому карта не «мигает» и не уезжает в начало раскладки.
	 */
	update: (data: GraphData) => void
	/** Останавливает симуляцию и убирает svg — вызывается при размонтировании. */
	destroy: () => void
}

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>
type ContentSelection = Selection<SVGGElement, unknown, null, undefined>

const SVG_NS = 'http://www.w3.org/2000/svg'
const ARIA_LABEL = 'Граф связей научных работ и патентов'
/** Пределы зума: без них граф легко потерять за краем экрана. */
const ZOOM_EXTENT: [number, number] = [0.5, 8]

/**
 * Drag узла: узел держится под курсором, симуляция разогревается на время жеста
 * (`DRAG_ALPHA_TARGET` — слабо, чтобы не разъезжалась вся карта) и остывает после отпускания.
 * Предмет жеста берётся в локальную переменную, чтобы не мутировать параметр обработчика.
 */
function createDrag(simulation: Simulation<GraphNode, GraphLink>): DragBehavior<SVGGElement, GraphNode, GraphNode> {
	function dragstarted(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		if (!event.active) simulation.alphaTarget(DRAG_ALPHA_TARGET).restart()
		subject.fx = subject.x
		subject.fy = subject.y
	}

	function dragged(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		subject.fx = event.x
		subject.fy = event.y
	}

	function dragended(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		if (!event.active) simulation.alphaTarget(0)
		subject.fx = null
		subject.fy = null
	}

	return drag<SVGGElement, GraphNode, GraphNode>().on('start', dragstarted).on('drag', dragged).on('end', dragended)
}

/**
 * Панорама и зум: сцена едет за курсором. Узлы уводят жест себе (d3-drag глушит всплытие), поэтому
 * перетаскивание узла и перетаскивание фона не конфликтуют. Колесо поверх узла при этом остаётся
 * зумом: drag узла колесо не перехватывает, и без этой оговорки зум работал бы только по пустому
 * месту, а на плотной карте — почти никогда.
 */
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

/** Создать svg сцены и две группы: связи под узлами, порядок слоёв задан данными, а не z-index. */
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
	// цвет и непрозрачность связей держатся на группе слоя: на линии остаётся только толщина и концы
	const links = content.append('g').attr('stroke', '#999').attr('stroke-opacity', 0.6)
	const nodes = content.append('g')

	return { svg, content, linkLayer: links.node() as SVGGElement, nodeLayer: nodes.node() as SVGGElement }
}

export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { panZoom = true } = options
	const { svg, content, linkLayer: linkGroup, nodeLayer: nodeGroup } = createScene()
	const root = select(svg)

	const measure = createTextMeasurer()
	const { nodes: initialNodes, links: initialLinks } = prepareGraph(data)
	// палитра живёт вместе со сценой: тип, приехавший с обновлением, получит свой оттенок и сохранит
	// его, а прежние типы не перекрасятся (цвет, что значил до обновления, значит то же и после)
	const colorOf = createTypeColors(initialNodes)
	const simulation = createSimulation(initialNodes, initialLinks)
	const linkForce = simulation.force<ForceLink<GraphNode, GraphLink>>('link') as ForceLink<GraphNode, GraphLink>
	const dragBehavior = createDrag(simulation)

	const layers = {
		links: new LinkLayer(linkGroup),
		nodes: new NodeLayer(nodeGroup, {
			colorOf,
			// раскладка одного узла: мерка текста вызывается один раз на изменённый узел, не на сцену
			layoutOf: (node) => createCloudLayouts([node], measure).get(node) as CloudLayout,
			// drag навешивается при создании: новые группы узнают о нем сразу, а прежние не трогаются
			attach: (element) => select<SVGGElement, GraphNode>(element).call(dragBehavior),
		}),
	}

	function drawTick(): void {
		layers.links.drawPositions()
		layers.nodes.drawPositions()
	}

	let previous = createPreviousGraph(initialNodes, initialLinks)

	layers.links.sync(asDrawnLinks(initialLinks))
	layers.nodes.sync(initialNodes)
	// новые элементы должны встать на свои координаты сразу, не дожидаясь первого тика
	drawTick()

	/**
	 * Применение новых данных к существующей симуляции. Порядок здесь принципиален:
	 * `nodes()` присваивает узлам `index`, `linkForce.links()` по этим `index`-ам разрешает концы
	 * связей и пересчитывает `bias`, и только потом поднимается `alpha` — иначе остывшая симуляция
	 * (её таймер гаснет на `alphaMin`) осталась бы неподвижной.
	 */
	function update(next: GraphData): void {
		const plan = planGraphUpdate(previous, next)
		const state = buildGraphState(previous, plan, collectSeeds(previous))

		simulation.nodes(state.nodes)
		linkForce.links(state.links)
		simulation.alpha(UPDATE_ALPHA).restart()

		layers.links.sync(asDrawnLinks(state.links))
		layers.nodes.sync(state.nodes)
		drawTick()

		previous = createPreviousGraph(state.nodes, state.links)
	}

	simulation.on('tick', drawTick)
	if (panZoom) attachPanZoom(root, content)

	return {
		svg,
		update,
		destroy: () => {
			simulation.on('tick', null)
			simulation.stop()
			// снимает данные с удалённых элементов: иначе снятый DOM держит объекты симуляции
			layers.links.clear()
			layers.nodes.clear()
			svg.remove()
		},
	}
}
