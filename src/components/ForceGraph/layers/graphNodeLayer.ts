import type { GraphNode, GraphNodeType } from '../../../types/graph'
import { nodeKey } from '../crud/graphNodesCRUD'
import { tintToWhite } from '../forceGraph'
import {
	CLOUD_RADIUS,
	DESCRIPTION_FONT_SIZE,
	FONT_FAMILY,
	SUB_NODE_CORNER,
	SUB_NODE_DOT_RADIUS,
	TITLE_FONT_SIZE,
	WARNING_COLOR,
	WARNING_DOT_RADIUS,
	type CloudLayout,
} from '../forceGraphCloud'
import { GraphLayer, type LayerEntry } from './graphLayer'

/**
 * Слой узлов: у `node` — облако по размеру текста с подписями, у `subNode` — иконка с точкой.
 * Группа строится один раз и дальше только меняет атрибуты: ссылки на её части держатся в записи
 * слоя, поэтому обновление не ищет элементы по DOM и не пересобирает группу заново.
 *
 * Всё внутри группы считается от нуля (группу двигает один `translate`), поэтому координаты
 * берутся прямо из раскладки облака.
 *
 * Раскладка и мерка текста вызываются только для узлов, которым план обновления выставил флаг
 * изменения (`sync(data, dirtyKeys)`): правка подписи одного узла не должна прогонять канву по
 * всей карте.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Обводка тела узла — цвет типа в полную силу, потому что заливка светлая. */
const BODY_STROKE_WIDTH = 1.5
/** Цвета подписей облака: заголовок темнее, описание приглушённое. */
const TITLE_COLOR = '#1a1a1a'
const DESCRIPTION_COLOR = '#555'

/** Класс группы узла: по нему панель зума отличает фон карты от узла, чтобы не перехватить drag. */
export const NODE_CLASS = 'force-graph__node'

/**
 * Фиксированный состав группы узла. Часть, которой у этого типа узла нет, остаётся в дереве, но
 * без атрибутов и текста: пустые элементы не видны, зато состав группы не меняется от обновления
 * к обновлению, и ссылаться на части можно без поиска по DOM.
 */
const PART_TAGS = {
	/** Нативная подсказка: в ней полный текст, хотя на карте подпись обрезана. */
	tooltip: 'title',
	body: 'rect',
	heading: 'text',
	description: 'text',
	warning: 'circle',
	dot: 'circle',
} as const

interface NodeParts {
	tooltip: SVGTitleElement
	body: SVGRectElement
	heading: SVGTextElement
	description: SVGTextElement
	warning: SVGCircleElement
	dot: SVGCircleElement
}

/** Запись слоя: элемент, его части и ключ последнего записанного вида. */
export interface NodeEntry extends LayerEntry<GraphNode> {
	element: SVGGElement
	parts: NodeParts
	/** Ключ последнего записанного вида; по нему видно, что группу пора перерисовать. */
	renderedKey?: string
}

export interface NodeLayerOptions {
	/** Раскладка узла считается снаружи: мерка текста живёт в отрисовке, а не в слое. */
	layoutOf: (node: GraphNode) => CloudLayout
	/** Цвет типа узла — один на всю сцену, чтобы оттенок типа не менялся между обновлениями. */
	colorOf: (type: GraphNodeType) => string
	/** Навесить обработчики на новую группу (например, drag). Вызывается в create(). */
	attach?: (element: SVGGElement) => void
}

/**
 * Вид узла — из типа и раскладки. В ключ сворачивается всё, что влияет на атрибуты: если ключ
 * не изменился, группу не трогаем — это страховка от лишней перерисовки внутри одного обновления,
 * когда узел попал в `dirtyKeys` по чужой причине (например, из-за смены типа у его соседа).
 */
function renderKey(node: GraphNode, layout: CloudLayout): string {
	return [node.type, layout.width, layout.height, layout.title, layout.description, layout.warning ? 1 : 0].join('|')
}

/** Подсказка узла: короткий заголовок и, если он есть, полный текст описания. */
export function nodeTooltip(node: GraphNode): string {
	return [node.title, node.description].filter(Boolean).join('\n')
}

/** Собрать группу узла: фиксированный состав детей и ссылки на них. */
function createNodeGroup(): { element: SVGGElement; parts: NodeParts } {
	const element = document.createElementNS(SVG_NS, 'g')
	element.setAttribute('class', NODE_CLASS)
	element.setAttribute('cursor', 'pointer')
	element.setAttribute('font-family', FONT_FAMILY)
	element.setAttribute('dominant-baseline', 'middle')

	const parts = Object.fromEntries(
		Object.entries(PART_TAGS).map(([name, tag]) => [name, document.createElementNS(SVG_NS, tag)]),
	) as unknown as NodeParts

	parts.heading.setAttribute('font-size', String(TITLE_FONT_SIZE))
	parts.heading.setAttribute('fill', TITLE_COLOR)
	parts.description.setAttribute('font-size', String(DESCRIPTION_FONT_SIZE))
	parts.description.setAttribute('fill', DESCRIPTION_COLOR)
	parts.warning.setAttribute('r', String(WARNING_DOT_RADIUS))
	parts.warning.setAttribute('fill', WARNING_COLOR)
	parts.dot.setAttribute('r', String(SUB_NODE_DOT_RADIUS))

	Object.values(parts).forEach((child) => element.appendChild(child))

	return { element, parts }
}

/**
 * Написать в группу атрибуты по раскладке. Части, которых у этого типа узла нет, очищаются от
 * текста и координат, а не удаляются: узел мог сменить тип, и старая подпись выглядела бы лишней.
 */
function writeBody(body: SVGRectElement, layout: CloudLayout, fill: string, isCloud: boolean): void {
	body.setAttribute('x', String(-layout.width / 2))
	body.setAttribute('y', String(-layout.height / 2))
	body.setAttribute('width', String(layout.width))
	body.setAttribute('height', String(layout.height))
	body.setAttribute('rx', String(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER))
	body.setAttribute('ry', String(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER))
	body.setAttribute('fill', tintToWhite(fill))
	body.setAttribute('stroke', fill)
	body.setAttribute('stroke-width', String(BODY_STROKE_WIDTH))
}

/** Подпись-заголовок: край и кегль берутся из раскладки; пустая строка остаётся без текста. */
function writeHeading(heading: SVGTextElement, text: string, layout: CloudLayout): void {
	// eslint-disable-next-line no-param-reassign
	heading.textContent = text
	heading.setAttribute('x', String(layout.textX))
	heading.setAttribute('y', String(layout.titleY))
}

function writeNode(entry: NodeEntry, layout: CloudLayout, fill: string): void {
	const { parts } = entry
	const isCloud = entry.datum.type === 'node'

	writeBody(parts.body, layout, fill, isCloud)
	writeHeading(parts.heading, layout.title, layout)
	// описание со своим кеглем и краем: у узла без описания оно остаётся пустым
	parts.description.textContent = layout.description
	parts.description.setAttribute('x', String(layout.textX))
	parts.description.setAttribute('y', String(layout.descriptionY))
	// у иконки данных на сцене нет: только яркая точка, узел должен читаться без подписи
	parts.dot.setAttribute('fill', isCloud ? 'none' : fill)

	if (layout.warning) {
		parts.warning.setAttribute('cx', String(layout.warning.x))
		parts.warning.setAttribute('cy', String(layout.warning.y))
	}
	parts.warning.setAttribute('r', layout.warning ? String(WARNING_DOT_RADIUS) : '0')

	parts.tooltip.textContent = nodeTooltip(entry.datum)
}

/**
 * Тело узла — скруглённый прямоугольник вокруг центра: у облака крупное скругление, у иконки почти
 * круг. Заливка — светлый оттенок цвета типа (тело не прозрачное: связи под ним не просвечивают),
 * обводка — цвет типа в полную силу.
 */

function renderEntry(entry: NodeEntry, options: NodeLayerOptions): void {
	const layout = options.layoutOf(entry.datum)
	const key = renderKey(entry.datum, layout)

	if (entry.renderedKey === key) return

	// eslint-disable-next-line no-param-reassign
	entry.renderedKey = key
	writeNode(entry, layout, options.colorOf(entry.datum.type))
}

export class NodeLayer extends GraphLayer<GraphNode> {
	constructor(layer: SVGGElement, options: NodeLayerOptions) {
		super(layer, (node) => nodeKey(node.id), {
			create: (node) => {
				const { element, parts } = createNodeGroup()
				const entry: NodeEntry = { element, parts, datum: node }
				options.attach?.(element)
				renderEntry(entry, options)
				return element
			},
			update: (entry) => renderEntry(entry as NodeEntry, options),
		})
	}

	/** Сдвиг группы узла координатами симуляции — вызывается на каждый тик. */
	drawPositions(): void {
		this.draw(({ element, datum }) => {
			element.setAttribute('transform', `translate(${datum.x ?? 0},${datum.y ?? 0})`)
		})
	}
}
