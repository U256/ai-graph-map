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
	/** Короткая подпись узла для сцены: у работы — сокращённое название, у патента — номер. */
	title: string
	/** Полное название работы или другое пояснение к ней; у патента описания нет и оно необязательно. */
	description?: string
	/** Признак «нужно предупредить»: у узла-облака появится красная точка сбоку. Данные, отрисовка не читает. */
	hasWarning: boolean
	/** Тип узла — вместе с ним приходит и цвет. */
	type: GraphNodeType
}

/** Связь в исходных данных: концы заданы идентификаторами узлов. */
export interface GraphLinkInput {
	source: string
	target: string
	/**
	 * Сила связи — как крепко её концы держатся друг за друга. Физика её пока не читает: поле
	 * хранится на будущее. Толщина линии = √force, как в ноутбуке (там у всех связей 2).
	 * Необязательна: если её нет, берётся значение по умолчанию (LINK_FORCE_DEFAULT).
	 */
	force?: number
}

/** Данные графа целиком. */
export interface GraphData {
	nodes: GraphNodeInput[]
	links: GraphLinkInput[]
}

/** Узел внутри симуляции: d3-force дописывает сюда x, y, vx, vy и index. */
export type GraphNode = SimulationNodeDatum & GraphNodeInput

/** Связь внутри симуляции: forceLink заменяет строковые концы на сами узлы. */
export type GraphLink = SimulationLinkDatum<GraphNode> & { force?: number }

/** Связь после инициализации: у обоих концов можно читать координаты. */
export interface DrawnLink {
	source: GraphNode
	target: GraphNode
	force?: number
}
