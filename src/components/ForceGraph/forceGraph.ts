import {
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'

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

/** Радиус узла в пикселях сцены — как в ноутбуке (поле radius в данных он не использует). */
export const NODE_RADIUS = 5

/** Узел в исходных данных: в graph.json есть ещё radius и citing_patents_count. */
export interface GraphNodeInput {
	/** Подпись узла: у статей — название работы, у патентов — номер. */
	id: string
	/** Группа для раскраски: «Cited Works» или «Citing Patents». */
	group: string
}

/** Связь в исходных данных: концы заданы идентификаторами узлов. */
export interface GraphLinkInput {
	source: string
	target: string
	value: number
}

export interface GraphData {
	nodes: GraphNodeInput[]
	links: GraphLinkInput[]
}

/** Узел внутри симуляции: d3-force дописывает сюда x, y, vx, vy и index. */
export type GraphNode = SimulationNodeDatum & GraphNodeInput

/** Связь внутри симуляции: forceLink заменяет строковые концы на сами узлы. */
export type GraphLink = SimulationLinkDatum<GraphNode> & { value: number }

/** Связь после инициализации: у обоих концов можно читать координаты. */
export interface DrawnLink {
	source: GraphNode
	target: GraphNode
	value: number
}

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
 * Цвет группы — аналог d3.scaleOrdinal(schemeCategory10) из ноутбука: оттенки выдаются
 * в порядке первого появления группы в данных, поэтому легенда не нужна.
 */
export function createGroupColors(nodes: GraphNode[]): (group: string) => string {
	const byGroup = new Map<string, string>()
	nodes.forEach((node) => {
		if (!byGroup.has(node.group)) byGroup.set(node.group, schemeCategory10[byGroup.size % schemeCategory10.length])
	})
	return (group) => byGroup.get(group) ?? schemeCategory10[0]
}
