import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type ForceLink, type Simulation } from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'
import type { DrawnLink, GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'

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

/** Не крутить: простор между облаками держится именно зарядом. */
export const CHARGE_STRENGTH = -30

export const LINK_FORCE_DEFAULT = 2

/** Без `restart()` остывшая симуляция не сдвинется, даже если `alpha` поднять; ниже стартовой единицы, чтобы карта не «взрывалась». */
export const UPDATE_ALPHA = 0.3

/** Иначе d3 разводит новый узел спиралью от нуля, и он «прилетает из центра карты». */
export const NEW_NODE_SEED_RADIUS = 24

/** Посев узла без связей; смещение ненулевое: совпавшие координаты двух тел дают в силах деление на ноль. */
export const NEW_NODE_SEED_FALLBACK = 12

/** Выше дефолта d3 (0.4), чтобы карта не «плыла» как желе после сдвига. */
export const VELOCITY_DECAY = 0.6

/**
 * Главная ручка «желе» и она же предел: замер на жесте в 320 единиц даёт при 0.1 прокат остальных узлов
 * 1788 (пик 2.8 за тик), при 0.05 — 879 и 1.5. Ниже 0.05 соседи за курсором уже не поспевают.
 */
export const DRAG_ALPHA_TARGET = 0.1

/** d3-drag не глушит последующий `click`: без порога любой сдвиг узла открывал бы форму правки. */
export const DRAG_CLICK_SLOP = 4

/** Тело не прозрачное — под подписями не должны просвечивать связи. */
export const BODY_FILL_WHITE = 0.85

/** Поля необязательные: отсутствие означает текущую константу, а не ноль. Зум и размеры сцены не входят — они не ручки раскладки. */
export interface GraphPhysics {
	layoutScale?: number
	linkDistance?: number
	linkStrength?: number
	chargeStrength?: number
	velocityDecay?: number
	updateAlpha?: number
	dragAlphaTarget?: number
}

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

/** Симуляция мутирует узлы и связи, поэтому ей отдаются копии данных. */
export function prepareGraph(data: GraphData): { nodes: GraphNode[]; links: GraphLink[] } {
	return {
		nodes: data.nodes.map((node) => ({ ...node })),
		links: data.links.map((link) => ({ ...link })),
	}
}

/** Сила связи отдельно от симуляции: при обновлении её нужно переключить на новый список, не пересобирая остальные силы. */
export function createLinkForce(links: GraphLink[], physics: GraphPhysics = {}): ForceLink<GraphNode, GraphLink> {
	return forceLink<GraphNode, GraphLink>(links)
		.id((node) => node.id)
		.distance(physics.linkDistance ?? LINK_DISTANCE)
		.strength(physics.linkStrength ?? LINK_STRENGTH)
}

/** Позиционирующие силы вместо центрирующей: у графа много несвязных компонент, и `forceCenter` разносит их за пределы сцены. */
export function createSimulation(
	nodes: GraphNode[],
	links: GraphLink[],
	physics: GraphPhysics = {},
): Simulation<GraphNode, GraphLink> {
	const link = createLinkForce(links, physics)
	const charge = physics.chargeStrength ?? CHARGE_STRENGTH
	const scale = physics.layoutScale ?? LAYOUT_SCALE

	return forceSimulation(nodes)
		.force('link', link)
		.force('charge', forceManyBody().strength(charge * scale ** 2))
		.force('x', forceX())
		.force('y', forceY())
		.velocityDecay(physics.velocityDecay ?? VELOCITY_DECAY)
}

/** forceLink подменяет концы связей узлами во время выполнения, поэтому типам нужна подсказка. */
export function asDrawnLinks(links: GraphLink[]): DrawnLink[] {
	return links as unknown as DrawnLink[]
}

/** Оттенки в порядке первого появления типа, поэтому легенда не нужна; тип, приехавший с обновлением, держит свой оттенок. */
export function createTypeColors(nodes: GraphNode[]): (type: GraphNodeType) => string {
	const byType = new Map<GraphNodeType, string>()

	const allocate = (type: GraphNodeType): string => {
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
