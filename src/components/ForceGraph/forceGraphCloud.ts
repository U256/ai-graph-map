import type { GraphNode } from '../../types/graph'
import { GROUP_FOCUS_SIZE, groupFocusSize } from './groupMetrics'

export { GROUP_FOCUS_SIZE, GROUP_FOCUS_SIZE_AT_40, GROUP_FOCUS_SIZE_EXPONENT, groupFocusSize } from './groupMetrics'

/**
 * Геометрия узлов. Модуль чистый: DOM не трогает, мерку текста получает аргументом, поэтому его можно
 * прогонять в Node с фейковой меркой. Всё считается от центра узла, чтобы группу двигал один `translate`.
 */

export type MeasureText = (text: string, fontSize: number) => number

/** Размеры тела и координаты подписей — всё относительно центра узла. */
export interface CloudLayout {
	width: number
	height: number
	/** У `subNode` — пустая строка. */
	title: string
	description: string
	textX: number
	/** Текст рисуется с `dominant-baseline: middle`. */
	titleY: number
	descriptionY: number
	/** Поля нет, если предупреждения у узла нет. */
	warning?: { x: number; y: number }
	focusedGroup?: boolean
	focusedSize?: number
}

export const TITLE_FONT_SIZE = 14
export const DESCRIPTION_FONT_SIZE = 12

/** То же семейство, что в `src/index.css`: иначе мера текста разойдётся с отрисовкой. */
export const FONT_FAMILY = 'system-ui, sans-serif'

/** Фиксированные: облако не должно «дышать» от строки к строке. */
export const TITLE_LINE_HEIGHT = 17
export const DESCRIPTION_LINE_HEIGHT = 15
export const LINE_GAP = 2

export const CLOUD_PADDING_X = 10
export const CLOUD_PADDING_Y = 8

/** Иначе длинное описание растянет облако на всю карту. */
export const CLOUD_MAX_TEXT_WIDTH = 220

export const CLOUD_RADIUS = 12

/** Текст сдвигается вправо, чтобы красная точка его не задевала. */
export const WARNING_GUTTER = 8
export const WARNING_DOT_RADIUS = 3
export const WARNING_COLOR = '#d92b2b'

export const SUB_NODE_SIZE = 16
export const SUB_NODE_CORNER = 7
export const SUB_NODE_DOT_RADIUS = 4
/** Масштаб, начиная с которого Canvas раскрывает вложенные группы. */
export const GROUP_DETAIL_SCALE = 1

/** Вложенный граф рисуется в локальной системе координат группы. */
export const NESTED_GRAPH_SCALE = 0.2

/** Увеличенный круг группы; диаметр и вертикальный вынос заголовка зависят от одной величины. */
export function createFocusedGroupLayout(layout: CloudLayout): CloudLayout {
	const size = layout.focusedSize ?? GROUP_FOCUS_SIZE
	const radius = size / 2
	return {
		...layout,
		titleY: -radius + layout.titleY,
		descriptionY: -radius + layout.descriptionY,
		focusedGroup: true,
		focusedSize: size,
	}
}

const ELLIPSIS = '…'

/**
 * Самый длинный префикс, который вместе с «…» ещё влезает (поиск делением пополам — ширины строк
 * монотонны по префиксу). Хвостовые пробелы перед «…» срезаются; если не влезает даже «…» — пусто.
 */
export function truncateToWidth(text: string, fontSize: number, maxWidth: number, measure: MeasureText): string {
	if (measure(text, fontSize) <= maxWidth) return text
	if (measure(ELLIPSIS, fontSize) > maxWidth) return ''

	let fit = 0
	let low = 0
	let high = text.length
	while (low <= high) {
		const middle = Math.floor((low + high) / 2)
		const candidate = `${text.slice(0, middle).replace(/\s+$/, '')}${ELLIPSIS}`
		if (measure(candidate, fontSize) <= maxWidth) {
			fit = middle
			low = middle + 1
		} else {
			high = middle - 1
		}
	}
	return `${text.slice(0, fit).replace(/\s+$/, '')}${ELLIPSIS}`
}

/** Раскладка иконки `subNode`: тело фиксированного размера, подписей нет. */
function createSubNodeLayout(): CloudLayout {
	return {
		width: SUB_NODE_SIZE,
		height: SUB_NODE_SIZE,
		title: '',
		description: '',
		textX: 0,
		titleY: 0,
		descriptionY: 0,
	}
}

/** Подпись группы показывает размер вложенного графа, а не описание исходной работы. */
function groupDescription(node: GraphNode): string {
	return `${node.children?.nodes.length ?? 0} элементов`
}

/** Раскладка облака `node`: ширина — по самой широкой обрезанной строке, блок строк центрирован по вертикали. */
function createCloudLayout(node: GraphNode, measure: MeasureText): CloudLayout {
	const gutter = node.hasWarning ? WARNING_GUTTER : 0
	const title = truncateToWidth(node.title, TITLE_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure)
	const sourceDescription = node.type === 'group' ? groupDescription(node) : (node.description ?? '')
	const description = truncateToWidth(sourceDescription, DESCRIPTION_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure)
	const textWidth = Math.max(
		measure(title, TITLE_FONT_SIZE),
		description ? measure(description, DESCRIPTION_FONT_SIZE) : 0,
	)
	const width = 2 * CLOUD_PADDING_X + gutter + textWidth
	const height = 2 * CLOUD_PADDING_Y + TITLE_LINE_HEIGHT + (description ? LINE_GAP + DESCRIPTION_LINE_HEIGHT : 0)
	const blockTop = -height / 2 + CLOUD_PADDING_Y

	return {
		width,
		height,
		title,
		description,
		textX: -width / 2 + CLOUD_PADDING_X + gutter,
		titleY: blockTop + TITLE_LINE_HEIGHT / 2,
		descriptionY: blockTop + TITLE_LINE_HEIGHT + LINE_GAP + DESCRIPTION_LINE_HEIGHT / 2,
		warning: node.hasWarning
			? { x: -width / 2 + CLOUD_PADDING_X / 2, y: -height / 2 + CLOUD_PADDING_Y / 2 }
			: undefined,
		focusedSize: node.type === 'group' ? groupFocusSize(node.children?.nodes.length ?? 0) : undefined,
	}
}

export function createCloudLayouts(nodes: GraphNode[], measure: MeasureText): Map<GraphNode, CloudLayout> {
	const layouts = new Map<GraphNode, CloudLayout>()
	nodes.forEach((node) => {
		layouts.set(node, node.type === 'subNode' ? createSubNodeLayout() : createCloudLayout(node, measure))
	})
	return layouts
}
