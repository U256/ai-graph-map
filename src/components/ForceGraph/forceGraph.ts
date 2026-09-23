import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'
import type { DrawnLink, GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'

/**
 * Перенос демо «Disjoint force-directed graph»:
 * https://observablehq.com/@d3/disjoint-force-directed-graph/2
 *
 * Силы, размеры сцены и цвета взяты из ноутбука; отличия: расстояния раскладки растянуты на
 * `LAYOUT_SCALE` (тела узлов теперь облака, а не кружки) и цвета раскладываются по `type` узла.
 * Ключевая мысль оригинала: для несвязного графа нужны позиционирующие силы (forceX/forceY),
 * а не центрирующая (forceCenter) — иначе отдельные подграфы разлетаются за пределы сцены.
 */

/** Размеры сцены из ноутбука; viewBox строится вокруг нуля, потому что все силы целятся в ноль. */
export const GRAPH_WIDTH = 928
export const GRAPH_HEIGHT = 680

/**
 * Масштаб раскладки: узлы-облака в разы крупнее кружков ноутбука, поэтому расстояния между ними
 * растянуты. Силы ноутбука накладываются так: дистанция связи — линейно, заряд — как площадь
 * (равновесие одинокого узла r = √(strength / 0.1) от forceX/forceY с силой 0.1), а сами
 * позиционирующие силы не трогаются: они линейны, целятся в ноль и масштабируются заодно.
 */
export const LAYOUT_SCALE = 6

/** Дистанция покоя связи: значение d3-force по умолчанию, оно же было в ноутбуке. */
export const LINK_DISTANCE = 30

/** Сила заряда (отталкивания): значение d3-force по умолчанию, оно же было в ноутбуке. */
export const CHARGE_STRENGTH = -30

/** Сила связи по умолчанию, если её нет в данных: в ноутбуке у всех связей было 2. */
export const LINK_FORCE_DEFAULT = 2

/** Симуляция мутирует узлы и связи, поэтому ей отдаются копии данных — как в ноутбуке. */
export function prepareGraph(data: GraphData): { nodes: GraphNode[]; links: GraphLink[] } {
	return {
		nodes: data.nodes.map((node) => ({ ...node })),
		links: data.links.map((link) => ({ ...link })),
	}
}

/**
 * Силы ноутбука, растянутые на `LAYOUT_SCALE`: пружины связей, отталкивание зарядов и притяжение
 * к центру координат. Притяжение к нулю остаётся как было — оно сдерживает 83 несвязных компоненты,
 * и именно оно задаёт масштаб сцены, который теперь вырос вместе с размером облаков.
 */
export function createSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
	const link = forceLink<GraphNode, GraphLink>(links)
		.id((node) => node.id)
		.distance(LINK_DISTANCE * LAYOUT_SCALE)

	return forceSimulation(nodes)
		.force('link', link)
		.force('charge', forceManyBody().strength(CHARGE_STRENGTH * LAYOUT_SCALE ** 2))
		.force('x', forceX())
		.force('y', forceY())
}

/** forceLink подменяет концы связей узлами во время выполнения, поэтому типам нужна подсказка. */
export function asDrawnLinks(links: GraphLink[]): DrawnLink[] {
	return links as unknown as DrawnLink[]
}

/**
 * Цвет типа узла — аналог d3.scaleOrdinal(schemeCategory10) из ноутбука: оттенки выдаются
 * в порядке первого появления типа в данных, поэтому легенда не нужна.
 */
export function createTypeColors(nodes: GraphNode[]): (type: GraphNodeType) => string {
	const byType = new Map<GraphNodeType, string>()
	nodes.forEach((node) => {
		if (!byType.has(node.type)) byType.set(node.type, schemeCategory10[byType.size % schemeCategory10.length])
	})
	return (type) => byType.get(type) ?? schemeCategory10[0]
}
