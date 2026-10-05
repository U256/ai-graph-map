import { schemeCategory10 } from 'd3-scale-chromatic'
import type { GraphNode, GraphNodeType } from '../../types/graph'

/** Размер окна сцены; viewBox вокруг нуля — все силы целятся в ноль. */
export const GRAPH_WIDTH = 928
export const GRAPH_HEIGHT = 680

/** Масштаб раскладки: отталкивание растянуто по площади (`LAYOUT_SCALE ** 2`); притяжение к нулю линейно и масштабируется заодно. */
export const LINK_FORCE_DEFAULT = 2

/** Тело не прозрачное — под подписями не должны просвечивать связи. */
export const BODY_FILL_WHITE = 0.85

/** Сравниваются значения, а не идентичность объекта: данные приезжают новым массивом и могли измениться на месте. */
export interface NodeRenderData {
	title: string
	description?: string
	hasWarning: boolean
	type: GraphNodeType
}

/** Точка высадки нового узла. */
export interface SeedPoint {
	x: number
	y: number
}

/** Оттенки в порядке первого появления типа, поэтому легенда не нужна; тип, приехавший с обновлением, держит свой оттенок. */
export function createTypeColors(nodes: GraphNode[]): (type: GraphNodeType) => string {
	const byType = new Map<GraphNodeType, string>()
	const fixedColors: Partial<Record<GraphNodeType, string>> = { group: '#2e8b57' }

	const allocate = (type: GraphNodeType): string => {
		const fixed = fixedColors[type]
		if (fixed) {
			byType.set(type, fixed)
			return fixed
		}
		const color = schemeCategory10[byType.size % schemeCategory10.length]
		byType.set(type, color)
		return color
	}

	nodes.forEach((node) => {
		if (!byType.has(node.type)) allocate(node.type)
	})

	return (type) => byType.get(type) ?? allocate(type)
}

/** Заливка тела выходит почти фоновой, но с оттенком типа. */
export function tintToWhite(hex: string, ratio: number = BODY_FILL_WHITE): string {
	const value = Number.parseInt(hex.slice(1), 16)
	const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
	const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * ratio))
	return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
