import type { GraphNode, GraphNodeType } from '../../../types/graph'
import { nodeKey } from '../crud/graphNodesCRUD'
import { tintToWhite } from '../forceGraph'

import {
	CLOUD_RADIUS,
	createFocusedGroupLayout,
	DESCRIPTION_FONT_SIZE,
	FONT_FAMILY,
	GROUP_FOCUS_SIZE,
	SUB_NODE_CORNER,
	SUB_NODE_DOT_RADIUS,
	TITLE_FONT_SIZE,
	WARNING_COLOR,
	WARNING_DOT_RADIUS,
	type CloudLayout,
} from '../forceGraphCloud'
import { GraphLayer, type LayerEntry } from './graphLayer'

/**
 * Слой узлов. Группа строится один раз и дальше только меняет атрибуты: ссылки на её части держатся в
 * записи слоя, поэтому обновление не ищет элементы по DOM. Раскладка и мерка текста вызываются только
 * для узлов из `dirtyKeys` — правка подписи одного узла не должна прогонять канву по всей карте.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Обводка — цвет типа в полную силу, потому что заливка светлая. */
const BODY_STROKE_WIDTH = 1.5
const TITLE_COLOR = '#1a1a1a'
const DESCRIPTION_COLOR = '#555'
const SELECTED_COLOR = '#e4572e'

/** По этому классу панель зума отличает фон карты от узла, чтобы жестом не перехватить drag. */
export const NODE_CLASS = 'force-graph__node'

/**
 * Фиксированный состав детей группы: часть, которой у этого типа нет, остаётся в дереве без атрибутов и
 * текста, поэтому ссылаться на части можно без поиска по DOM.
 */
const PART_TAGS = {
	/** В нативной подсказке полный текст, хотя на карте подпись обрезана. */
	tooltip: 'title',
	focusRing: 'circle',
	body: 'rect',
	heading: 'text',
	description: 'text',
	warning: 'circle',
	dot: 'circle',
} as const

interface NodeParts {
	tooltip: SVGTitleElement
	body: SVGRectElement
	focusRing: SVGCircleElement
	heading: SVGTextElement
	description: SVGTextElement
	warning: SVGCircleElement
	dot: SVGCircleElement
	subGraph: SVGGElement
}

export interface NodeEntry extends LayerEntry<GraphNode> {
	element: SVGGElement
	parts: NodeParts
	subGraph?: SubGraph
	renderedKey?: string
	selected?: boolean
}

export interface NodeLayerOptions {
	/** Раскладка считается снаружи: мерка текста живёт в отрисовке, а не в слое. */
	layoutOf: (node: GraphNode) => CloudLayout
	/** Цвет типа — один на всю сцену, чтобы оттенок типа не менялся между обновлениями. */
	colorOf: (type: GraphNodeType) => string
	attach?: (element: SVGGElement) => void
	attachChild?: (element: SVGGElement, onDrag: () => void) => void
}

/**
 * Совпал ключ — группу не трогаем. Страховка от перерисовки по чужой причине: смена типа у соседа
 * помечает связь, а не узел.
 */
function renderKey(node: GraphNode, layout: CloudLayout): string {
	return [
		node.type,
		layout.width,
		layout.height,
		layout.title,
		layout.description,
		layout.warning ? 1 : 0,
		layout.focusedGroup ? 1 : 0,
		layout.focusedSize ?? '',
	].join('|')
}

/** Склейка здесь, а не в данных: на карте виден обрезанный `title`, полный текст — в подсказке. */
export function nodeTooltip(node: GraphNode): string {
	const description = node.type === 'group' ? `${node.children?.nodes.length ?? 0} элементов` : node.description
	return [node.title, description].filter(Boolean).join('\n')
}

/** Атрибуты, общие для всех типов и не зависящие от данных, пишутся один раз при создании. */
interface SubGraph {
	element: SVGGElement
}

function createNodeGroup(): { element: SVGGElement; parts: NodeParts } {
	const element = document.createElementNS(SVG_NS, 'g')
	element.setAttribute('class', NODE_CLASS)
	element.setAttribute('cursor', 'pointer')
	element.setAttribute('font-family', FONT_FAMILY)
	element.setAttribute('dominant-baseline', 'middle')

	const parts = Object.fromEntries(
		Object.entries(PART_TAGS).map(([name, tag]) => [name, document.createElementNS(SVG_NS, tag)]),
	) as unknown as NodeParts
	parts.subGraph = document.createElementNS(SVG_NS, 'g')

	parts.heading.setAttribute('font-size', String(TITLE_FONT_SIZE))
	parts.heading.setAttribute('fill', TITLE_COLOR)
	parts.description.setAttribute('font-size', String(DESCRIPTION_FONT_SIZE))
	parts.description.setAttribute('fill', DESCRIPTION_COLOR)
	parts.warning.setAttribute('r', String(WARNING_DOT_RADIUS))
	parts.warning.setAttribute('fill', WARNING_COLOR)
	parts.dot.setAttribute('r', String(SUB_NODE_DOT_RADIUS))
	parts.focusRing.setAttribute('fill', 'none')
	parts.focusRing.setAttribute('pointer-events', 'none')

	;[
		parts.tooltip,
		parts.body,
		parts.subGraph,
		parts.focusRing,
		parts.heading,
		parts.description,
		parts.warning,
		parts.dot,
	].forEach((child) => element.appendChild(child))

	return { element, parts }
}

/**
 * Тело узла — скруглённый прямоугольник вокруг центра: у облака крупное скругление, у иконки почти круг.
 * Части, которых у этого типа нет, очищаются от текста и координат, а не удаляются: узел мог сменить тип.
 */
function writeBody(body: SVGRectElement, layout: CloudLayout, fill: string, isCloud: boolean): void {
	const yOffset = layout.focusedGroup ? -(layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2 : 0
	body.setAttribute('x', String(-layout.width / 2))
	body.setAttribute('y', String(-layout.height / 2 + yOffset))
	body.setAttribute('width', String(layout.width))
	body.setAttribute('height', String(layout.height))
	body.setAttribute('rx', String(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER))
	body.setAttribute('ry', String(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER))
	body.setAttribute('fill', tintToWhite(fill))
	body.setAttribute('stroke', fill)
	body.setAttribute('stroke-width', String(BODY_STROKE_WIDTH))
}

function writeHeading(heading: SVGTextElement, text: string, layout: CloudLayout): void {
	// eslint-disable-next-line no-param-reassign
	heading.textContent = text
	heading.setAttribute('x', String(layout.textX))
	heading.setAttribute('y', String(layout.titleY))
	heading.setAttribute('text-anchor', 'start')
	heading.setAttribute('font-size', String(TITLE_FONT_SIZE))
	heading.setAttribute('fill', TITLE_COLOR)
}

function writeNode(entry: NodeEntry, layout: CloudLayout, fill: string): void {
	const { parts } = entry
	const isCloud = entry.datum.type !== 'subNode'
	const bodyFill = entry.selected ? SELECTED_COLOR : fill

	writeBody(parts.body, layout, bodyFill, isCloud)
	parts.focusRing.setAttribute('cx', '0')
	parts.focusRing.setAttribute('cy', '0')
	parts.focusRing.setAttribute('r', layout.focusedGroup ? String((layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2) : '0')
	parts.focusRing.setAttribute('stroke', bodyFill)
	parts.focusRing.setAttribute('stroke-width', '2')
	writeHeading(parts.heading, layout.title, layout)
	parts.description.textContent = layout.description
	parts.description.setAttribute('x', String(layout.textX))
	parts.description.setAttribute('y', String(layout.descriptionY))
	// у иконки данных на сцене нет: только яркая точка
	parts.dot.setAttribute('fill', isCloud ? 'none' : bodyFill)

	if (layout.warning) {
		parts.warning.setAttribute('cx', String(layout.warning.x))
		parts.warning.setAttribute('cy', String(layout.warning.y))
	}
	parts.warning.setAttribute('r', layout.warning ? String(WARNING_DOT_RADIUS) : '0')

	parts.tooltip.textContent = nodeTooltip(entry.datum)
}

function createSubGraph(
	node: GraphNode,
	colorOf: (type: GraphNodeType) => string,
	layoutOf: (node: GraphNode) => CloudLayout,
	attachChild?: (element: SVGGElement, onDrag: () => void) => void,
): SubGraph | null {
	if (node.type !== 'group' || !node.children) return null

	const element = document.createElementNS(SVG_NS, 'g')
	element.setAttribute('class', 'force-graph__subgraph')
	element.setAttribute('pointer-events', 'auto')
	element.setAttribute('visibility', 'hidden')
	element.setAttribute('transform', 'scale(0.2)')
	const nodes: GraphNode[] = node.children.nodes.map((child) => ({ ...child }))
	const links = node.children.links.map((link) => ({ ...link }))
	const byId = new Map(nodes.map((child) => [child.id, child]))
	const drawnLinks = links.flatMap((link) => {
		const source = byId.get(link.source)
		const target = byId.get(link.target)
		return source && target ? [{ ...link, source, target }] : []
	})
	const linkElements = drawnLinks.map(({ source, target }) => {
		const line = document.createElementNS(SVG_NS, 'line')
		line.setAttribute('stroke', '#777')
		line.setAttribute('stroke-width', '5')
		element.appendChild(line)
		return { line, source, target }
	})

	nodes.forEach((child) => {
		const { element: childElement, parts } = createNodeGroup()
		const childSubGraph = createSubGraph(child, colorOf, layoutOf, attachChild)
		if (childSubGraph) parts.subGraph.appendChild(childSubGraph.element)
		const entry: NodeEntry = { element: childElement, parts, datum: child }
		writeNode(entry, layoutOf(child), colorOf(child.type))
		childElement.setAttribute('transform', `translate(${child.x ?? 0},${child.y ?? 0})`)
		childElement.setAttribute('data-node-id', child.id)
		attachChild?.(childElement, () => {
			childElement.setAttribute('transform', `translate(${child.x ?? 0},${child.y ?? 0})`)
			linkElements.forEach(({ line, source, target }) => {
				line.setAttribute('x1', String(source.x ?? 0))
				line.setAttribute('y1', String(source.y ?? 0))
				line.setAttribute('x2', String(target.x ?? 0))
				line.setAttribute('y2', String(target.y ?? 0))
			})
		})
		element.appendChild(childElement)
		;(childElement as unknown as { __data__: GraphNode }).__data__ = child
	})
	linkElements.forEach(({ line, source, target }) => {
		line.setAttribute('x1', String(source.x ?? 0))
		line.setAttribute('y1', String(source.y ?? 0))
		line.setAttribute('x2', String(target.x ?? 0))
		line.setAttribute('y2', String(target.y ?? 0))
	})
	return { element }
}

function renderEntry(entry: NodeEntry, options: NodeLayerOptions, zoomed = false): void {
	const baseLayout = options.layoutOf(entry.datum)
	const layout = zoomed && entry.datum.type === 'group' ? createFocusedGroupLayout(baseLayout) : baseLayout
	const key = renderKey(entry.datum, layout)

	if (entry.renderedKey === key) return

	// eslint-disable-next-line no-param-reassign
	entry.renderedKey = key
	writeNode(entry, layout, options.colorOf(entry.datum.type))
}

/** Показывает вложенный граф только в том же режиме, где группа раскрывает круг. */
function setSubGraphVisibility(entry: NodeEntry, visible: boolean): void {
	if (!entry.subGraph) return
	const visibility = visible ? 'visible' : 'hidden'
	entry.subGraph.element.setAttribute('visibility', visibility)
	entry.subGraph.element
		.querySelectorAll<SVGGElement>('.force-graph__subgraph')
		.forEach((element) => element.setAttribute('visibility', visibility))
}

export class NodeLayer extends GraphLayer<GraphNode, NodeEntry> {
	private readonly colorOf: (type: GraphNodeType) => string

	private readonly zoomState: { zoomed: boolean }

	private readonly options: NodeLayerOptions

	constructor(layer: SVGGElement, options: NodeLayerOptions) {
		const zoomState = { zoomed: false }
		super(layer, (node) => nodeKey(node.id), {
			create: (node): NodeEntry => {
				const { element, parts } = createNodeGroup()
				const subGraph = createSubGraph(node, options.colorOf, options.layoutOf, options.attachChild)
				if (subGraph) parts.subGraph.appendChild(subGraph.element)
				const entry: NodeEntry = { element, parts, datum: node, subGraph: subGraph ?? undefined }
				options.attach?.(element)
				renderEntry(entry, options, zoomState.zoomed)
				return entry
			},
			update: (entry) => renderEntry(entry, options, zoomState.zoomed),
		})
		this.colorOf = options.colorOf
		this.zoomState = zoomState
		this.options = options
		this.forEachEntry((entry) => setSubGraphVisibility(entry, zoomState.zoomed))
	}

	/** Переключает вид групп по масштабу, не меняя DOM остальных узлов. */
	setZoomScale(scale: number): void {
		const zoomed = scale >= 1
		if (zoomed === this.zoomState.zoomed) return
		this.zoomState.zoomed = zoomed
		this.forEachEntry((entry) => {
			if (entry.datum.type === 'group') {
				renderEntry(entry, this.options, zoomed)
				setSubGraphVisibility(entry, zoomed)
			}
		})
	}

	/** Перекрашивает только две сменившиеся ноды, не трогая раскладку и мерку текста. */
	setSelectedNode(id: string | null): void {
		this.forEachEntry((entry) => {
			const selected = id !== null && entry.datum.id === id
			if (entry.selected === selected) return
			// состояние выделения хранится в записи слоя, а не в данных симуляции
			// eslint-disable-next-line no-param-reassign
			entry.selected = selected
			const fill = this.colorOf(entry.datum.type)
			const bodyFill = selected ? SELECTED_COLOR : fill
			entry.parts.body.setAttribute('fill', tintToWhite(bodyFill))
			entry.parts.body.setAttribute('stroke', bodyFill)
			entry.parts.dot.setAttribute('fill', entry.datum.type === 'subNode' ? bodyFill : 'none')
		})
	}

	/** Сдвиг группы узла координатами симуляции — вызывается на каждый тик. */
	drawPositions(): void {
		this.draw(({ element, datum }) => {
			element.setAttribute('transform', `translate(${datum.x ?? 0},${datum.y ?? 0})`)
		})
	}
}
