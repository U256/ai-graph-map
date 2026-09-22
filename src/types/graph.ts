import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'

/**
 * Типы данных графа, общие для слоя данных, чистой логики и отрисовки. Здесь только описания
 * структур: константы сцены и работа с симуляцией живут в `components/ForceGraph/forceGraph.ts`.
 */

/** Тип узла: обычный узел графа и подчинённый ему узел детализации. По типу раскрашиваются узлы. */
export type GraphNodeType = 'node' | 'subNode'

/** Узел в исходных данных. */
export interface GraphNodeInput {
	/** Стабильный ключ: по нему forceLink сопоставляет концы связей. */
	id: string
	/** Подпись для человека: название работы или номер патента. */
	title: string
	/** Короткое описание узла — выводится во всплывающей подсказке. */
	description: string
	/** Признак «нужно предупредить». Данные для будущей подсветки, отрисовка его пока не читает. */
	hasWarning: boolean
	/** Тип узла — вместе с ним приходит и цвет. */
	type: GraphNodeType
}

/** Связь в исходных данных: концы заданы идентификаторами узлов. */
export interface GraphLinkInput {
	source: string
	target: string
	/**
	 * Вес связи: толщина линии = √value, как в ноутбуке (там value у всех связей равно 2).
	 * Необязателен: если его нет, рисуется толщина по умолчанию (LINK_VALUE_DEFAULT).
	 */
	value?: number
}

/** Данные графа целиком. */
export interface GraphData {
	nodes: GraphNodeInput[]
	links: GraphLinkInput[]
}

/** Узел внутри симуляции: d3-force дописывает сюда x, y, vx, vy и index. */
export type GraphNode = SimulationNodeDatum & GraphNodeInput

/** Связь внутри симуляции: forceLink заменяет строковые концы на сами узлы. */
export type GraphLink = SimulationLinkDatum<GraphNode> & { value?: number }

/** Связь после инициализации: у обоих концов можно читать координаты. */
export interface DrawnLink {
	source: GraphNode
	target: GraphNode
	value?: number
}
