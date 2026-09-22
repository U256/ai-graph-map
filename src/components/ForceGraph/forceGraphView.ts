import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import type { Simulation } from 'd3-force'
import { select, type Selection } from 'd3-selection'
import { zoom, type D3ZoomEvent } from 'd3-zoom'
import type { DrawnLink, GraphData, GraphLink, GraphNode } from './forceGraph'
import {
	GRAPH_HEIGHT,
	GRAPH_WIDTH,
	NODE_RADIUS,
	asDrawnLinks,
	createGroupColors,
	createSimulation,
	prepareGraph,
} from './forceGraph'
import { createGridPattern, type GridPattern } from './forceGraphGrid'

/**
 * Сборка svg-сцены графа — 1:1 с ноутбуком @d3/disjoint-force-directed-graph/2:
 * линии связей, кружки узлов с подсказками и drag по узлам. Сетка, панорама и зум —
 * добавка к ноутбуку, их можно выключить через опции.
 */

export interface ForceGraphOptions {
	/** Пунктирная сетка на фоне сцены. */
	grid?: boolean
	/** Панорама перетаскиванием фона и зум колесом. */
	panZoom?: boolean
	/** Уникальный id узора сетки: несколько графов на странице не должны делить один узор. */
	gridId?: string
}

/** Готовый граф: svg собран, его остаётся вставить в DOM. */
export interface ForceGraphHandle {
	svg: SVGSVGElement
	/** Останавливает симуляцию и убирает svg — вызывается при размонтировании. */
	destroy: () => void
}

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>
type ContentSelection = Selection<SVGGElement, unknown, null, undefined>
type LineSelection = Selection<SVGLineElement, DrawnLink, SVGGElement, unknown>
type NodeSelection = Selection<SVGCircleElement, GraphNode, SVGGElement, unknown>

const SVG_NS = 'http://www.w3.org/2000/svg'
const ARIA_LABEL = 'Граф связей научных работ и патентов'
/** Пределы зума: без них граф легко потерять за краем экрана. */
const ZOOM_EXTENT: [number, number] = [0.5, 8]

/** Толщина связи — корень из value, как в ноутбуке (в данных value всегда равен 2). */
function appendLinks(content: ContentSelection, links: DrawnLink[]): LineSelection {
	return content
		.append('g')
		.attr('stroke', '#999')
		.attr('stroke-opacity', 0.6)
		.selectAll<SVGLineElement, DrawnLink>('line')
		.data(links)
		.join('line')
		.attr('stroke-width', (link) => Math.sqrt(link.value))
}

/**
 * Drag из ноутбука: узел держится под курсором, симуляция разогревается на время жеста
 * и остывает после отпускания. Предмет жеста берётся в локальную переменную, чтобы
 * не мутировать параметр обработчика.
 */
function createDrag(
	simulation: Simulation<GraphNode, GraphLink>,
): DragBehavior<SVGCircleElement, GraphNode, GraphNode> {
	function dragstarted(event: D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
		const { subject } = event
		if (!event.active) simulation.alphaTarget(0.3).restart()
		subject.fx = subject.x
		subject.fy = subject.y
	}

	function dragged(event: D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
		const { subject } = event
		subject.fx = event.x
		subject.fy = event.y
	}

	function dragended(event: D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
		const { subject } = event
		if (!event.active) simulation.alphaTarget(0)
		subject.fx = null
		subject.fy = null
	}

	return drag<SVGCircleElement, GraphNode, GraphNode>()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended)
}

/** Узлы: радиус и белая обводка из ноутбука, цвет — по группе, во всплывающей подсказке — id. */
function appendNodes(
	content: ContentSelection,
	nodes: GraphNode[],
	color: (group: string) => string,
	simulation: Simulation<GraphNode, GraphLink>,
): NodeSelection {
	const node = content
		.append('g')
		.attr('stroke', '#fff')
		.attr('stroke-width', 1.5)
		.selectAll<SVGCircleElement, GraphNode>('circle')
		.data(nodes)
		.join('circle')
		.attr('r', NODE_RADIUS)
		.attr('fill', (datum) => color(datum.group))
		.attr('cursor', 'grab')

	node.append('title').text((datum) => datum.id)
	return node.call(createDrag(simulation))
}

/**
 * Панорама и зум: сцена едет за курсором, сетка сдвигается вместе с ней, оставаясь
 * в экранных координатах. Узлы уводят жест себе (d3-drag глушит всплытие), поэтому
 * перетаскивание узла и перетаскивание фона не конфликтуют.
 */
function attachPanZoom(root: SvgSelection, content: ContentSelection, grid: GridPattern | null): void {
	root.call(
		zoom<SVGSVGElement, unknown>()
			.scaleExtent(ZOOM_EXTENT)
			.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
				const { x, y, k } = event.transform
				content.attr('transform', `translate(${x},${y}) scale(${k})`)
				grid?.shift(x, y)
			}),
	)
}

/** Переносит координаты симуляции в атрибуты svg — как в ноутбуке. */
function drawTick(link: LineSelection, node: NodeSelection): void {
	link
		.attr('x1', (datum) => datum.source.x ?? 0)
		.attr('y1', (datum) => datum.source.y ?? 0)
		.attr('x2', (datum) => datum.target.x ?? 0)
		.attr('y2', (datum) => datum.target.y ?? 0)

	node.attr('cx', (datum) => datum.x ?? 0).attr('cy', (datum) => datum.y ?? 0)
}

export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { grid: optionGrid = true, panZoom = true, gridId = 'force-graph-grid' } = options
	const { nodes, links } = prepareGraph(data)
	const simulation = createSimulation(nodes, links)

	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('viewBox', `${-GRAPH_WIDTH / 2} ${-GRAPH_HEIGHT / 2} ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`)
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
	svg.setAttribute('role', 'img')
	svg.setAttribute('aria-label', ARIA_LABEL)

	const root = select(svg)
	const grid = optionGrid ? createGridPattern(svg, gridId) : null
	const content = root.append('g')
	const link = appendLinks(content, asDrawnLinks(links))
	const node = appendNodes(content, nodes, createGroupColors(nodes), simulation)

	simulation.on('tick', () => drawTick(link, node))
	if (panZoom) attachPanZoom(root, content, grid)

	return {
		svg,
		destroy: () => {
			simulation.on('tick', null)
			simulation.stop()
			svg.remove()
		},
	}
}
