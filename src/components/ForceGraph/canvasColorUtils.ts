import { schemeCategory10 } from 'd3-scale-chromatic'
import type { GraphNode, GraphNodeType } from '../../types/graph'

/** Тело не прозрачное — под подписями не должны просвечивать связи. */
export const BODY_FILL_WHITE = 0.85

/** Оттенки в порядке первого появления типа, поэтому легенда не нужна; тип, приехавший с обновлением, держит свой оттенок. */
export function createTypeColors(nodes: GraphNode[]): (type: GraphNodeType) => string {
	const byType = new Map<GraphNodeType, string>()
	const fixedColors: Partial<Record<GraphNodeType, string>> = { group: '#2e8b57', subNode: '#777777' }

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
