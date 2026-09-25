import type { GraphNode, GraphNodeInput } from '../../../types/graph'
import type { NodeRenderData, SeedPoint } from '../forceGraph'
import { NEW_NODE_SEED_FALLBACK, NEW_NODE_SEED_RADIUS } from '../forceGraph'

/**
 * CRUD узлов графа: ключ узла, сравнение его отрисовываемых значений и сборка объекта симуляции.
 * Модуль чистый — ни DOM, ни симуляции, — поэтому весь разбор проверяется в Node.
 */

/** Узел новых данных вместе с ключом и выводом «изменились ли данные» относительно прежнего узла. */
export interface NextNode {
	key: string
	node: GraphNodeInput
	changed: boolean
}

/** Ключ узла. Префикс нужен, чтобы ключи узлов и связей не пересеклись в одном множестве. */
export function nodeKey(id: string): string {
	return `n:${id}`
}

export function nodeKeyOf(node: GraphNodeInput): string {
	return nodeKey(node.id)
}

/** Смена `type` меняет цвет узла, а значит и вид его тела, подписей и связей. */
export function isNodeTypeChanged(previous: GraphNodeInput, next: GraphNodeInput): boolean {
	return previous.type !== next.type
}

/** Зависимые от вида значения узла: только те поля, что влияют на раскладку облака и на цвет. */
export function nodeRenderData(node: GraphNodeInput): NodeRenderData {
	return { title: node.title, description: node.description, hasWarning: node.hasWarning, type: node.type }
}

/** Признак изменившегося узла: сравнение по значениям, а не по идентичности объекта (вариант A). */
export function isNodeRenderDataChanged(previous: NodeRenderData, next: GraphNodeInput): boolean {
	const current = nodeRenderData(next)
	return (
		previous.title !== current.title ||
		previous.description !== current.description ||
		previous.hasWarning !== current.hasWarning ||
		previous.type !== current.type
	)
}

/**
 * Точка высадки нового узла: вокруг центра масс его соседей, по кругу. Порядковый индекс вместо
 * случайного угла — чтобы прогон оставался детерминированным и повторяемым в Node. У узла без
 * соседей точка — центр сцены, и смещение другое: совпавшие координаты двух тел дают в силах
 * нулевое расстояние и деление на него.
 */
export function seedPosition(seed: SeedPoint | undefined, index: number): SeedPoint {
	const center = seed ?? { x: 0, y: 0 }
	const radius = seed ? NEW_NODE_SEED_RADIUS : NEW_NODE_SEED_FALLBACK
	return { x: center.x + Math.cos(index) * radius, y: center.y + Math.sin(index) * radius }
}

/**
 * Объект узла для симуляции. Вызывается только для изменённого или нового узла — неизменённый
 * остаётся прежним объектом и сюда не попадает (см. `applyGraphUpdate`). Новый объект обязателен:
 * правка полей прежнего обнулила бы сравнение значений, и следующая же правка того же узла
 * перестала бы замечаться (снимок снялся бы с уже исправленного объекта).
 *
 * Координаты берутся у прежнего узла: правка подписи не должна уносить узел в другое место карты.
 * Новому узлу прежних координат взять неоткуда, и точка высадки даётся снаружи — иначе d3 разводит
 * такой узел спиралью от нуля, то есть он «прилетел бы из центра карты».
 */
export function buildNode(input: GraphNodeInput, before: GraphNode | undefined, seed?: SeedPoint): GraphNode {
	const position = before ?? seed ?? { x: 0, y: 0 }

	return {
		...input,
		x: position.x,
		y: position.y,
		vx: 0,
		vy: 0,
		// фиксация из drag не переживает смену данных: узел снова свободен
		fx: null,
		fy: null,
	}
}
