import { select, type Selection } from 'd3-selection'
import { GRAPH_HEIGHT, GRAPH_WIDTH } from './forceGraph'

/**
 * Сетка под графом — добавка к ноутбуку (в оригинале сцена статична). Узор из defs плюс
 * прямоугольник во всю сцену: линии всегда толщиной 1px, потому что сетка живёт в экранных
 * координатах, а вместе с графом её двигает панорама.
 */

/** Шаг сетки в пикселях сцены. */
const GRID_STEP = 20

export interface GridPattern {
	/** Сдвигает узор вслед за панорамой, чтобы сетка не «отклеивалась» от графа. */
	shift: (x: number, y: number) => void
}

/** Линии левого и верхнего края плитки: их повторение и даёт сетку. */
function appendTile(pattern: Selection<SVGPatternElement, unknown, null, undefined>): void {
	pattern
		.append('path')
		.attr('d', `M${GRID_STEP} 0H0V${GRID_STEP}`)
		.attr('fill', 'none')
		.attr('stroke', 'currentColor')
		.attr('stroke-opacity', 0.15)
		.attr('stroke-width', 1)
}

/** Подложка на всю сцену: добавляется первой, поэтому остаётся под связями и узлами. */
function appendBackdrop(root: Selection<SVGSVGElement, unknown, null, undefined>, id: string): void {
	root
		.append('rect')
		.attr('x', -GRAPH_WIDTH / 2)
		.attr('y', -GRAPH_HEIGHT / 2)
		.attr('width', GRAPH_WIDTH)
		.attr('height', GRAPH_HEIGHT)
		.attr('fill', `url(#${id})`)
}

export function createGridPattern(svg: SVGSVGElement, id: string): GridPattern {
	const root = select(svg)
	const pattern = root
		.append('defs')
		.append('pattern')
		.attr('id', id)
		.attr('width', GRID_STEP)
		.attr('height', GRID_STEP)
		.attr('patternUnits', 'userSpaceOnUse')

	appendTile(pattern)
	appendBackdrop(root, id)

	return { shift: (x, y) => pattern.attr('patternTransform', `translate(${x},${y})`) }
}
