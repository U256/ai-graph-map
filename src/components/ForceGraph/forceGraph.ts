import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'
import type { DrawnLink, GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'

/**
 * Перенос демо «Disjoint force-directed graph»:
 * https://observablehq.com/@d3/disjoint-force-directed-graph/2
 *
 * Силы, размеры и цвета взяты из ноутбука без изменений. Ключевая мысль оригинала: для
 * несвязного графа нужны позиционирующие силы (forceX/forceY), а не центрирующая
 * (forceCenter) — иначе отдельные подграфы разлетаются за пределы сцены.
 */

/** Размеры сцены из ноутбука; viewBox строится вокруг нуля, потому что все силы целятся в ноль. */
export const GRAPH_WIDTH = 928
export const GRAPH_HEIGHT = 680

/** Радиус узла в пикселях сцены — как в ноутбуке (поля radius и citing_patents_count он не использует). */
export const NODE_RADIUS = 5

/** Сила связи по умолчанию, если её нет в данных: в ноутбуке у всех связей было 2. */
export const LINK_FORCE_DEFAULT = 2

/** Симуляция мутирует узлы и связи, поэтому ей отдаются копии данных — как в ноутбуке. */
export function prepareGraph(data: GraphData): { nodes: GraphNode[]; links: GraphLink[] } {
	return {
		nodes: data.nodes.map((node) => ({ ...node })),
		links: data.links.map((link) => ({ ...link })),
	}
}

/** Силы ноутбука: пружины связей, отталкивание зарядов и притяжение к центру координат. */
export function createSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
	return forceSimulation(nodes)
		.force(
			'link',
			forceLink<GraphNode, GraphLink>(links).id((node) => node.id),
		)
		.force('charge', forceManyBody())
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
