import type { GraphNode } from '../../types/graph'

/**
 * Геометрия узлов: облако узла `node` собирается вокруг текста, узел `subNode` — маленькая
 * иконка. Модуль чистый: DOM не трогает, мерку текста получает аргументом, поэтому его можно
 * прогонять в Node с фейковой меркой (см. AGENTS.md). Всё считается от центра узла, чтобы
 * группу узла двигал один `translate`.
 */

/** Мерка текста: возвращает ширину строки в пикселях сцены для заданного кегля. */
export type MeasureText = (text: string, fontSize: number) => number

/** Раскладка узла: размеры тела и координаты подписей — всё относительно центра узла. */
export interface CloudLayout {
	width: number
	height: number
	/** Заголовок, обрезанный до потолка ширины текста; у `subNode` — пустая строка. */
	title: string
	/** Описание, обрезанное с «…»; у `subNode` и у узлов без описания — пустая строка. */
	description: string
	/** Левый край текста относительно центра узла. */
	textX: number
	/** Вертикальный центр заголовка; текст рисуется с `dominant-baseline: middle`. */
	titleY: number
	/** Вертикальный центр описания. */
	descriptionY: number
	/** Центр красной точки предупреждения; поля нет, если предупреждения у узла нет. */
	warning?: { x: number; y: number }
}

/** Кегли подписей: заголовок крупнее и темнее, описание мельче и приглушённое. */
export const TITLE_FONT_SIZE = 14
export const DESCRIPTION_FONT_SIZE = 12

/** Семейство шрифта — то же, что в `src/index.css`: иначе мера текста разойдётся с отрисовкой. */
export const FONT_FAMILY = 'system-ui, sans-serif'

/** Высоты строк и зазор между ними — фиксированные: облако не должно «дышать» от строки к строке. */
export const TITLE_LINE_HEIGHT = 17
export const DESCRIPTION_LINE_HEIGHT = 15
export const LINE_GAP = 2

/** Паддинги облака от края до текста. */
export const CLOUD_PADDING_X = 10
export const CLOUD_PADDING_Y = 8

/** Потолок ширины текста: длинные описания обрезаются, иначе облако растянется на всю карту. */
export const CLOUD_MAX_TEXT_WIDTH = 220

/** Скругление облака. */
export const CLOUD_RADIUS = 12

/** Колонка под красную точку: текст сдвигается вправо, чтобы точка его не задевала. */
export const WARNING_GUTTER = 8
export const WARNING_DOT_RADIUS = 3
export const WARNING_COLOR = '#d92b2b'

/** Узел-иконка `subNode`: квадрат со скруглением (почти круг) и яркая точка по центру. */
export const SUB_NODE_SIZE = 16
export const SUB_NODE_CORNER = 7
export const SUB_NODE_DOT_RADIUS = 4

/** Знак, которым помечается отрезанный текст. */
const ELLIPSIS = '…'

/**
 * Обрезает строку до ширины `maxWidth`, дописывая «…»: берётся самый длинный префикс, который
 * вместе с многоточием ещё влезает (поиск делением пополам — ширины строк монотонны по префиксу).
 * Хвостовые пробелы перед «…» срезаются. Если не влезает даже «…», возвращается пустая строка.
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

/**
 * Раскладка облака узла `node`: ширина — по самой широкой обрезанной строке, высота — заголовок
 * плюс опциональное описание. Текст выравнивается по левому краю, блок строк центрируется
 * по вертикали; при `hasWarning` слева резервируется колонка под красную точку.
 */
function createCloudLayout(node: GraphNode, measure: MeasureText): CloudLayout {
	const gutter = node.hasWarning ? WARNING_GUTTER : 0
	const title = truncateToWidth(node.title, TITLE_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure)
	const description = truncateToWidth(node.description ?? '', DESCRIPTION_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure)
	const textWidth = Math.max(
		measure(title, TITLE_FONT_SIZE),
		description ? measure(description, DESCRIPTION_FONT_SIZE) : 0,
	)
	const width = 2 * CLOUD_PADDING_X + gutter + textWidth
	const height = 2 * CLOUD_PADDING_Y + TITLE_LINE_HEIGHT + (description ? LINE_GAP + DESCRIPTION_LINE_HEIGHT : 0)
	// левый верхний угол блока строк: облако выше блока ровно на паддинги
	const blockTop = -height / 2 + CLOUD_PADDING_Y

	return {
		width,
		height,
		title,
		description,
		textX: -width / 2 + CLOUD_PADDING_X + gutter,
		titleY: blockTop + TITLE_LINE_HEIGHT / 2,
		descriptionY: blockTop + TITLE_LINE_HEIGHT + LINE_GAP + DESCRIPTION_LINE_HEIGHT / 2,
		// точка живёт в зоне паддинга, то есть по центру левой верхней «полки» облака
		warning: node.hasWarning
			? { x: -width / 2 + CLOUD_PADDING_X / 2, y: -height / 2 + CLOUD_PADDING_Y / 2 }
			: undefined,
	}
}

/** Раскладка всех узлов: облако для `node`, иконка для `subNode`. */
export function createCloudLayouts(nodes: GraphNode[], measure: MeasureText): Map<GraphNode, CloudLayout> {
	const layouts = new Map<GraphNode, CloudLayout>()
	nodes.forEach((node) => {
		layouts.set(node, node.type === 'node' ? createCloudLayout(node, measure) : createSubNodeLayout())
	})
	return layouts
}
