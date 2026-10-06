/**
 * Типы данных графа, общие для слоя данных, чистой логики и отрисовки.
 */

export type GraphNodeType = 'node' | 'subNode' | 'group'

export interface GraphNodeInput {
	/** Уникальный идентификатор узла. */
	id: string
	/** У работы — сокращённое название, у патента — номер. */
	title: string
	/** Полное название работы; у патента описания нет. */
	description?: string
	/** Отрисовка не читает: по этому признаку появится красная точка сбоку. */
	hasWarning: boolean
	/** Вместе с типом приходит и цвет. */
	type: GraphNodeType
	/** Только для групп */
	children?: GraphData
	/** Состояние эмуляции загрузки содержимого группы. */
	childrenLoading?: boolean
	/** Размер группы для плоского запроса раскладки без передачи children. */
	childrenCount?: number
}

/** Концы связи заданы идентификаторами узлов. */
export interface GraphLinkInput {
	source: string
	target: string
	/** Физика её пока не читает, поле на будущее; толщина линии = √force, при отсутствии — `LINK_FORCE_DEFAULT`. */
	force?: number
}

export interface GraphData {
	nodes: GraphNode[]
	links: GraphLinkInput[]
}

/** Узел с координатами, рассчитанными сервером. */
export type GraphNode = GraphNodeInput & {
	x?: number
	y?: number
	fx?: number | null
	fy?: number | null
	/** Вычисленное поле ответа сервера: есть только у узлов с `childrenCount`. */
	chargeMultiplier?: number
}

/** Связь после инициализации: у обоих концов можно читать координаты. */
export interface DrawnLink {
	source: GraphNode
	target: GraphNode
	force?: number
}
