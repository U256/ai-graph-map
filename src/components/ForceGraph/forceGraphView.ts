import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import type { Simulation } from 'd3-force'
import { select, type Selection } from 'd3-selection'
import { zoom, type D3ZoomEvent } from 'd3-zoom'
import type { DrawnLink, GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'
import {
	GRAPH_HEIGHT,
	GRAPH_WIDTH,
	LINK_FORCE_DEFAULT,
	asDrawnLinks,
	createSimulation,
	createTypeColors,
	prepareGraph,
} from './forceGraph'
import {
	CLOUD_RADIUS,
	DESCRIPTION_FONT_SIZE,
	FONT_FAMILY,
	SUB_NODE_CORNER,
	SUB_NODE_DOT_RADIUS,
	TITLE_FONT_SIZE,
	WARNING_COLOR,
	WARNING_DOT_RADIUS,
	createCloudLayouts,
	type CloudLayout,
} from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'

/**
 * Сборка svg-сцены графа: линии связей, узлы-облака с подписями и drag по узлам. Физика,
 * геометрия облаков и мерка текста живут отдельно (`forceGraph.ts`, `forceGraphCloud.ts`,
 * `forceGraphText.ts`), здесь остаётся только сборка svg. Панорама и зум — добавка к ноутбуку.
 */

export interface ForceGraphOptions {
	/** Панорама перетаскиванием фона и зум колесом. */
	panZoom?: boolean
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
type NodeSelection = Selection<SVGGElement, GraphNode, SVGGElement, unknown>
/** Выбор одного узла внутри `each`: данных у него нет, всё нужное берётся из замыкания. */
type NodeGroupSelection = Selection<SVGGElement, unknown, null, undefined>

const SVG_NS = 'http://www.w3.org/2000/svg'
const ARIA_LABEL = 'Граф связей научных работ и патентов'
/** Пределы зума: без них граф легко потерять за краем экрана. */
const ZOOM_EXTENT: [number, number] = [0.5, 8]

/** Тело узла — цвет типа: заливка сильно прозрачная, обводка в полную силу. */
const BODY_FILL_OPACITY = 0.12
const BODY_STROKE_WIDTH = 1.5
/** Цвета подписей облака: заголовок темнее, описание приглушённое. */
const TITLE_COLOR = '#1a1a1a'
const DESCRIPTION_COLOR = '#555'

/** Толщина связи — √force, как в ноутбуке; если силы в данных нет, берётся значение по умолчанию. */
function appendLinks(content: ContentSelection, links: DrawnLink[]): LineSelection {
	return content
		.append('g')
		.attr('stroke', '#999')
		.attr('stroke-opacity', 0.6)
		.selectAll<SVGLineElement, DrawnLink>('line')
		.data(links)
		.join('line')
		.attr('stroke-width', (link) => Math.sqrt(link.force ?? LINK_FORCE_DEFAULT))
}

/** Тело узла — скруглённый прямоугольник вокруг центра: у облака крупное скругление, у иконки — почти круг. */
function appendNodeBody(group: NodeGroupSelection, layout: CloudLayout, fill: string, radius: number): void {
	group
		.append('rect')
		.attr('x', -layout.width / 2)
		.attr('y', -layout.height / 2)
		.attr('width', layout.width)
		.attr('height', layout.height)
		.attr('rx', radius)
		.attr('ry', radius)
		.attr('fill', fill)
		.attr('fill-opacity', BODY_FILL_OPACITY)
		.attr('stroke', fill)
		.attr('stroke-width', BODY_STROKE_WIDTH)
}

/** Подписи облака — заголовок и, если он есть, обрезанное описание; края строк берутся из раскладки. */
function appendCloudTexts(group: NodeGroupSelection, layout: CloudLayout): void {
	group
		.append('text')
		.attr('x', layout.textX)
		.attr('y', layout.titleY)
		.attr('font-size', TITLE_FONT_SIZE)
		.attr('fill', TITLE_COLOR)
		.text(layout.title)

	if (!layout.description) return
	group
		.append('text')
		.attr('x', layout.textX)
		.attr('y', layout.descriptionY)
		.attr('font-size', DESCRIPTION_FONT_SIZE)
		.attr('fill', DESCRIPTION_COLOR)
		.text(layout.description)
}

/** Красная точка предупреждения — в левом верхнем углу облака, в зоне паддинга. */
function appendWarningDot(group: NodeGroupSelection, warning: CloudLayout['warning']): void {
	if (!warning) return
	group
		.append('circle')
		.attr('cx', warning.x)
		.attr('cy', warning.y)
		.attr('r', WARNING_DOT_RADIUS)
		.attr('fill', WARNING_COLOR)
}

/** Яркая точка в центре иконки `subNode`: узел должен читаться на карте без подписи. */
function appendSubNodeDot(group: NodeGroupSelection, fill: string): void {
	group.append('circle').attr('r', SUB_NODE_DOT_RADIUS).attr('fill', fill)
}

/** Подсказка узла: короткий заголовок и, если он есть, полный текст описания. */
function nodeTooltip(node: GraphNode): string {
	return [node.title, node.description].filter(Boolean).join('\n')
}

/**
 * Drag из ноутбука: узел держится под курсором, симуляция разогревается на время жеста
 * и остывает после отпускания. Предмет жеста берётся в локальную переменную, чтобы
 * не мутировать параметр обработчика.
 */
function createDrag(simulation: Simulation<GraphNode, GraphLink>): DragBehavior<SVGGElement, GraphNode, GraphNode> {
	function dragstarted(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		if (!event.active) simulation.alphaTarget(0.3).restart()
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
 * Узлы: у `node` — облако по размеру текста с подписями, у `subNode` — иконка с точкой.
 * Раскладка считается до отрисовки, поэтому все атрибуты — просто числа из `CloudLayout`.
 */
function appendNodes(
	content: ContentSelection,
	nodes: GraphNode[],
	color: (type: GraphNodeType) => string,
	simulation: Simulation<GraphNode, GraphLink>,
): NodeSelection {
	const layouts = createCloudLayouts(nodes, createTextMeasurer())
	const node = content
		.append('g')
		.selectAll<SVGGElement, GraphNode>('g')
		.data(nodes)
		.join('g')
		.attr('class', 'force-graph__node')
		.attr('cursor', 'grab')
		.attr('font-family', FONT_FAMILY)
		.attr('dominant-baseline', 'middle')

	// подсказка полная: на карте текст обрезан, а здесь видно всё
	node.append('title').text(nodeTooltip)

	node.each((datum, index) => {
		const layout = layouts.get(datum)
		if (!layout) return
		const group = select(node.nodes()[index])
		const fill = color(datum.type)
		if (datum.type === 'node') {
			appendNodeBody(group, layout, fill, CLOUD_RADIUS)
			appendCloudTexts(group, layout)
		} else {
			appendNodeBody(group, layout, fill, SUB_NODE_CORNER)
			appendSubNodeDot(group, fill)
		}
		appendWarningDot(group, layout.warning)
	})

	return node.call(createDrag(simulation))
}

/**
 * Панорама и зум: сцена едет за курсором. Узлы уводят жест себе (d3-drag глушит всплытие),
 * поэтому перетаскивание узла и перетаскивание фона не конфликтуют.
 */
function attachPanZoom(root: SvgSelection, content: ContentSelection): void {
	root.call(
		zoom<SVGSVGElement, unknown>()
			.scaleExtent(ZOOM_EXTENT)
			.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
				const { x, y, k } = event.transform
				content.attr('transform', `translate(${x},${y}) scale(${k})`)
			}),
	)
}

/** Переносит координаты симуляции в атрибуты svg: связи — концами, узлы — сдвигом группы. */
function drawTick(link: LineSelection, node: NodeSelection): void {
	link
		.attr('x1', (datum) => datum.source.x ?? 0)
		.attr('y1', (datum) => datum.source.y ?? 0)
		.attr('x2', (datum) => datum.target.x ?? 0)
		.attr('y2', (datum) => datum.target.y ?? 0)

	node.attr('transform', (datum) => `translate(${datum.x ?? 0},${datum.y ?? 0})`)
}

export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { panZoom = true } = options
	const { nodes, links } = prepareGraph(data)
	const simulation = createSimulation(nodes, links)

	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('viewBox', `${-GRAPH_WIDTH / 2} ${-GRAPH_HEIGHT / 2} ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`)
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
	svg.setAttribute('role', 'img')
	svg.setAttribute('aria-label', ARIA_LABEL)

	const root = select(svg)
	const content = root.append('g')
	const link = appendLinks(content, asDrawnLinks(links))
	const node = appendNodes(content, nodes, createTypeColors(nodes), simulation)

	simulation.on('tick', () => drawTick(link, node))
	if (panZoom) attachPanZoom(root, content)

	return {
		svg,
		destroy: () => {
			simulation.on('tick', null)
			simulation.stop()
			svg.remove()
		},
	}
}
