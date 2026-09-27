import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'

/**
 * Типы данных графа, общие для слоя данных, чистой логики и отрисовки.
 */

export type GraphNodeType = 'node' | 'subNode'

export interface GraphNodeInput {
	/** По нему forceLink сопоставляет концы связей. */
	id: string
	/** У работы — сокращённое название, у патента — номер. */
	title: string
	/** Полное название работы; у патента описания нет. */
	description?: string
	/** Отрисовка не читает: по этому признаку появится красная точка сбоку. */
	hasWarning: boolean
	/** Вместе с типом приходит и цвет. */
	type: GraphNodeType
	/** Множитель индивидуального отталкивания; отсутствие сохраняет общую силу. */
	chargeMultiplier?: number
}

/** Концы связи заданы идентификаторами узлов. */
export interface GraphLinkInput {
	source: string
	target: string
	/** Физика её пока не читает, поле на будущее; толщина линии = √force, при отсутствии — `LINK_FORCE_DEFAULT`. */
	force?: number
}

export interface GraphData {
	nodes: GraphNodeInput[]
	links: GraphLinkInput[]
}

/** d3-force дописывает сюда x, y, vx, vy и index. */
export type GraphNode = SimulationNodeDatum & GraphNodeInput

/** forceLink заменяет строковые концы на сами узлы. */
export type GraphLink = SimulationLinkDatum<GraphNode> & { force?: number }

/** Связь после инициализации: у обоих концов можно читать координаты. */
export interface DrawnLink {
	source: GraphNode
	target: GraphNode
	force?: number
}
