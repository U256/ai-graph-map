import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type ForceLink, type Simulation } from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'
import type { GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'

/** Размер окна сцены; viewBox вокруг нуля — все силы целятся в ноль. */
export const GRAPH_WIDTH = 928
export const GRAPH_HEIGHT = 680

/** Масштаб раскладки: отталкивание растянуто по площади (`LAYOUT_SCALE ** 2`); притяжение к нулю линейно и масштабируется заодно. */
export const LAYOUT_SCALE = 8

/** Дистанция покоя связи короче общей растяжки: связанные узлы должны стоять плотнее просто отталкивающихся. */
export const LINK_DISTANCE = 100

/**
 * Плоское значение для всех связей вместо правила d3 (`1 / min(степеней концов)`): оно перегружало
 * листовые связи. Замер: слабее 0.35 связки расползаются, «желе» так не лечится.
 */
export const LINK_STRENGTH = 0.5

/** Связь группы с внешним узлом не должна стягивать большую группу к соседу. */
export const GROUP_LINK_STRENGTH = 0.15

/** Не крутить: простор между облаками держится именно зарядом. */
export const CHARGE_STRENGTH = -30

/** Множитель отталкивания соседей внутри группы по числу её элементов. */
export function groupNeighborChargeMultiplier(elementCount: number): number {
	const count = Math.max(0, elementCount)
	return Math.max(1, 0.0001811594 * count ** 2 + 0.0264493 * count + 0.652174)
}

function isGroupLink(link: GraphLink): boolean {
	const { source } = link
	const { target } = link
	return (
		(typeof source === 'object' && source !== null && source.type === 'group') ||
		(typeof target === 'object' && target !== null && target.type === 'group')
	)
}

export const LINK_FORCE_DEFAULT = 2

/** Выше дефолта d3 (0.4), чтобы карта не «плыла» как желе после сдвига. */
export const VELOCITY_DECAY = 0.6

/** Тело не прозрачное — под подписями не должны просвечивать связи. */
export const BODY_FILL_WHITE = 0.85

/** Симуляция мутирует узлы и связи, поэтому ей отдаются копии данных. */
export function prepareGraph(data: GraphData): { nodes: GraphNode[]; links: GraphLink[] } {
	return {
		nodes: data.nodes.map((node) => ({ ...node })),
		links: data.links.map((link) => ({ ...link })),
	}
}

/** Сила связи отдельно от симуляции: при обновлении её нужно переключить на новый список, не пересобирая остальные силы. */
export function createLinkForce(links: GraphLink[]): ForceLink<GraphNode, GraphLink> {
	return forceLink<GraphNode, GraphLink>(links)
		.id((node) => node.id)
		.distance(LINK_DISTANCE)
		.strength((link) => (isGroupLink(link) ? GROUP_LINK_STRENGTH : LINK_STRENGTH))
}

/** Позиционирующие силы вместо центрирующей: у графа много несвязных компонент, и `forceCenter` разносит их за пределы сцены. */
export function createSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
	const link = createLinkForce(links)
	const charge = CHARGE_STRENGTH
	const scale = LAYOUT_SCALE

	return forceSimulation(nodes)
		.force('link', link)
		.force(
			'charge',
			forceManyBody<GraphNode>().strength((node) => charge * scale ** 2 * (node.chargeMultiplier ?? 1)),
		)
		.force('x', forceX())
		.force('y', forceY())
		.velocityDecay(VELOCITY_DECAY)
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
