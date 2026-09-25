import type { GraphLink, GraphLinkInput, GraphNode, GraphNodeInput } from '../../types/graph'
import type { NodeRenderData, SeedPoint } from './forceGraph'
import { NEW_NODE_SEED_FALLBACK, NEW_NODE_SEED_RADIUS } from './forceGraph'

/**
 * Сравнение двух состояний графа и подготовка следующего: какие узлы и связи добавить, какие
 * удалить, какие обновить и где встать новым. Модуль чистый (без DOM и без симуляции), поэтому
 * разбор данных проверяется в Node — там ловятся `NaN` в координатах и несуществующие концы связей,
 * которые в браузере выглядят просто как «граф разлетелся в точку».
 */

/** Узел новых данных вместе с ключом и выводом «изменились ли данные» относительно прежнего узла. */
export interface NextNode {
	key: string
	node: GraphNodeInput
	changed: boolean
}

/** Связь новых данных вместе с ключом и флагом «такой связи раньше не было». */
export interface NextLink {
	key: string
	link: GraphLink
	added: boolean
}

/**
 * Прежние узлы и связи, по которым собирается следующее состояние. Узлы хранятся под id, связи —
 * под направленным ключом; снимок значений узла нужен, чтобы сравнение не зависело от мутации
 * данных на месте.
 */
export interface PreviousGraph {
	nodes: Map<string, GraphNode>
	snapshots: Map<string, NodeRenderData>
	links: Map<string, GraphLink>
	linkKeys: string[]
}

/** Сравнение двух наборов по ключам: `kept`/`added` — элементы новых данных, `removed` — ключи. */
export interface EntityDiff<T> {
	added: T[]
	removed: string[]
	kept: T[]
}

/** Сущности, у которых изменились данные: им пересчитывается раскладка и цвет. */
export interface ChangedGraph {
	nodes: GraphNode[]
	links: GraphLink[]
}

/** Итог разбора: весь новый список (порядок — как в данных) плюс сведение изменений. */
export interface GraphUpdate {
	nodes: NextNode[]
	links: NextLink[]
	removedNodeKeys: string[]
	removedLinkKeys: string[]
	changed: ChangedGraph
}

/** Концы связи в терминах симуляции: до инициализации — id, после — сами узлы. */
type LinkEndpoint = string | number | GraphNode

function endpointId(endpoint: LinkEndpoint): string {
	return typeof endpoint === 'object' ? endpoint.id : String(endpoint)
}

function isNode(endpoint: LinkEndpoint): endpoint is GraphNode {
	return typeof endpoint === 'object'
}

/** Ключ узла. Префикс нужен, чтобы ключи узлов и связей не пересеклись в одном множестве. */
export function nodeKey(id: string): string {
	return `n:${id}`
}

/**
 * Ключ связи. Направленный: `a→b` и `b→a` — две разные связи, и для физики это два разных объекта.
 * Поэтому переназначение конца связи — это удаление старой связи и добавление новой, а не правка:
 * линия привязана к конкретным объектам узлов, и «перетынуть» её дешевле не делать.
 */
export function linkKey(source: string, target: string): string {
	return `l:${source}>${target}`
}

export function nodeKeyOf(node: GraphNodeInput): string {
	return nodeKey(node.id)
}

/** Ключ связи симуляции: концы могли быть уже подменены узлами, поэтому id берём у объекта. */
export function linkKeyOf(link: GraphLink): string {
	return linkKey(endpointId(link.source), endpointId(link.target))
}

/** Ключ связи исходных данных, где концы всегда заданы идентификаторами. */
export function inputLinkKeyOf(link: GraphLinkInput): string {
	return linkKey(link.source, link.target)
}

/** Смена `type` меняет цвет узла, а значит и вид его тела, подписей и связей. */
export function isNodeTypeChanged(previous: GraphNodeInput, next: GraphNodeInput): boolean {
	return previous.type !== next.type
}

/**
 * Сравнение двух наборов по ключам: `kept`/`added` — элементы новых данных, `removed` — ключи старых.
 * Удалённая сущность возвращается ключом: в новых данных её объекта уже нет.
 */
export function diffEntities<T>(previousKeys: Iterable<string>, next: T[], keyOf: (item: T) => string): EntityDiff<T> {
	const previous = new Set(previousKeys)
	const added: T[] = []
	const kept: T[] = []

	next.forEach((item) => {
		if (previous.has(keyOf(item))) kept.push(item)
		else added.push(item)
	})

	const nextKeys = new Set(next.map(keyOf))
	const removed = [...previous].filter((key) => !nextKeys.has(key))

	return { added, removed, kept }
}

/**
 * Зависимые от вида значения узла: только те поля, что влияют на раскладку облака и на цвет.
 */
export function nodeRenderData(node: GraphNodeInput): NodeRenderData {
	return { title: node.title, description: node.description, hasWarning: node.hasWarning, type: node.type }
}

/** Признак изменившегося узла: сравнение по значениям, а не по идентичности объекта (вариант A). */
export function isNodeRenderDataChanged(previous: NodeRenderData, next: GraphNodeInput): boolean {
	return (
		previous.title !== next.title ||
		previous.description !== next.description ||
		previous.hasWarning !== next.hasWarning ||
		previous.type !== next.type
	)
}

/** Снимки значений прежних узлов — то, с чем сравниваются новые данные. */
export function snapshotNodes(nodes: GraphNode[]): Map<string, NodeRenderData> {
	const snapshots = new Map<string, NodeRenderData>()
	nodes.forEach((node) => snapshots.set(node.id, nodeRenderData(node)))
	return snapshots
}

/** Прежнее состояние графа целиком: по нему собирается следующее и из него же берутся координаты. */
export function createPreviousGraph(nodes: GraphNode[], links: GraphLink[]): PreviousGraph {
	return {
		nodes: new Map(nodes.map((node) => [node.id, node])),
		snapshots: snapshotNodes(nodes),
		links: new Map(links.map((link) => [linkKeyOf(link), link])),
		linkKeys: links.map(linkKeyOf),
	}
}

/**
 * Сравнение узлов: `changed` у оставшихся узлов — это правка данных, а у добавленных узел новый,
 * и его облако всё равно считается заново, поэтому флаг там всегда `true`.
 */
export function diffNodes(previous: PreviousGraph, nextNodes: GraphNodeInput[]): EntityDiff<NextNode> {
	const wrap = (node: GraphNodeInput): NextNode => {
		const snapshot = previous.snapshots.get(node.id)
		return { key: nodeKeyOf(node), node, changed: !snapshot || isNodeRenderDataChanged(snapshot, node) }
	}

	const diff = diffEntities([...previous.nodes.keys()].map(nodeKey), nextNodes, nodeKeyOf)

	return { added: diff.added.map(wrap), kept: diff.kept.map(wrap), removed: diff.removed }
}

/**
 * Сравнение связей по исходным данным, а не по объектам симуляции: только так видно, что конец связи
 * переназначен, — в объекте связи концы уже подменены узлами, и ключ прежней связи не восстановить.
 * Сами связи не переиспользуются: `forceLink.links()` заново разрешает строковые концы, а слой
 * связей перерисовывает толщину по данным, так что новый объект связи стоит прежнего.
 */
export function diffLinks(previous: PreviousGraph, nextLinks: GraphLinkInput[]): EntityDiff<NextLink> {
	const wrap = (link: GraphLinkInput): NextLink => ({
		key: inputLinkKeyOf(link),
		link: { ...link } as GraphLink,
		added: false,
	})

	const diff = diffEntities(previous.linkKeys, nextLinks, inputLinkKeyOf)
	const added = new Set(diff.added.map(inputLinkKeyOf))

	return {
		added: diff.added.map(wrap),
		kept: diff.kept.map((link) => ({ ...wrap(link), added: added.has(inputLinkKeyOf(link)) })),
		removed: diff.removed,
	}
}

/**
 * Точки, вокруг которых высаживаются новые узлы: центр масс уже известных соседей по связям.
 * Считается по прежним связям и прежним координатам — новых узлов ещё нет, а прежние ещё стоят там,
 * где их оставила раскладка.
 */
export function collectSeeds(previous: PreviousGraph): Map<string, SeedPoint> {
	const sums = new Map<string, { sumX: number; sumY: number; count: number }>()

	previous.links.forEach((link) => {
		if (!isNode(link.source) || !isNode(link.target)) return
		const pairs: [GraphNode, GraphNode][] = [
			[link.source, link.target],
			[link.target, link.source],
		]
		pairs.forEach(([endpoint, counterpart]) => {
			const sum = sums.get(endpoint.id) ?? { sumX: 0, sumY: 0, count: 0 }
			sum.sumX += counterpart.x ?? 0
			sum.sumY += counterpart.y ?? 0
			sum.count += 1
			sums.set(endpoint.id, sum)
		})
	})

	const seeds = new Map<string, SeedPoint>()
	sums.forEach((sum, id) => seeds.set(id, { x: sum.sumX / sum.count, y: sum.sumY / sum.count }))
	return seeds
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

/** Узлы и связи, у которых правились данные: смена типа узла меняет и вид его связей. */
function collectChanged(
	previous: PreviousGraph,
	nodes: EntityDiff<NextNode>,
	links: EntityDiff<NextLink>,
): ChangedGraph {
	const changedNodes: GraphNode[] = []
	const typeChanged = new Set<string>()

	nodes.kept.forEach(({ node }) => {
		const before = previous.nodes.get(node.id)
		if (!before) return
		if (isNodeTypeChanged(before, node)) typeChanged.add(node.id)
		if (isNodeRenderDataChanged(previous.snapshots.get(node.id) as NodeRenderData, node)) changedNodes.push(before)
	})

	const changedLinks = links.kept
		.filter(({ link }) => typeChanged.has(endpointId(link.source)) || typeChanged.has(endpointId(link.target)))
		.map(({ link }) => link)

	return { nodes: changedNodes, links: changedLinks }
}

/** Собрать единый список новых данных в их исходном порядке: `kept` и `added` перемешиваются diff'ом. */
function mergeByOrder<T extends { key: string }>(orderedKeys: string[], diff: EntityDiff<T>): T[] {
	const byKey = new Map<string, T>()
	diff.kept.forEach((item) => byKey.set(item.key, item))
	diff.added.forEach((item) => byKey.set(item.key, item))

	return orderedKeys.map((key) => byKey.get(key) as T).filter(Boolean)
}

/**
 * Разбор новых данных относительно прежнего состояния: что добавить, что удалить, что обновить и где
 * встать новым. Чистая функция — не трогает ни данные, ни симуляцию, поэтому весь разбор проверяется
 * в Node.
 */
export function planGraphUpdate(
	previous: PreviousGraph,
	data: { nodes: GraphNodeInput[]; links: GraphLinkInput[] },
): GraphUpdate {
	const nodes = diffNodes(previous, data.nodes)
	const links = diffLinks(previous, data.links)

	return {
		// порядок — как в новых данных: он задаёт и порядок узлов в симуляции, и порядок групп в svg
		nodes: mergeByOrder(data.nodes.map(nodeKeyOf), nodes),

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		links: mergeByOrder(data.links.map(inputLinkKeyOf), links),
		removedNodeKeys: nodes.removed,
		removedLinkKeys: links.removed,
		changed: collectChanged(previous, nodes, links),
	}
}

/**
 * Следующее состояние графа: узлы и связи, готовые и для симуляции, и для отрисовки.
 *
 * Неизменённый узел остаётся прежним объектом: на нём держатся предмет drag'а (`d3-drag`
 * запоминает subject на время жеста) и позиция раскладки, а новый объект заставил бы переписывать
 * `__data__` у всех затронутых связей. Изменённый узел — наоборот, обязательно новый объект:
 * правка полей прежнего обнулила бы сравнение данных, и следующая же правка того же узла
 * перестала бы замечаться (снимок значений снялся бы с уже исправленного объекта).
 *
 * Координаты сохраняются в обоих случаях: правка подписи не должна уносить узел в другое место
 * карты. Новому узлу без прежних координат точка высадки даётся рядом с его соседями по связям —
 * d3 разводит такие узлы спиралью от нуля, то есть узел прилетел бы из центра карты.
 */
export function buildGraphState(
	previous: PreviousGraph,
	update: GraphUpdate,
	seeds: Map<string, SeedPoint>,
): { nodes: GraphNode[]; links: GraphLink[] } {
	const changedIds = new Set(update.changed.nodes.map((node) => node.id))

	const nodes = update.nodes.map(({ node }, index) => {
		const before = previous.nodes.get(node.id)
		const position = before ?? seedPosition(seeds.get(node.id), index)

		if (before && !changedIds.has(node.id)) return before

		const nextNode: GraphNode = {
			...node,
			x: position.x,
			y: position.y,
			vx: 0,
			vy: 0,
			// фиксация из drag не переживает смену данных: узел снова свободен
			fx: null,
			fy: null,
		}

		return nextNode
	})

	return { nodes, links: update.links.map(({ link }) => link) }
}

/** Состояние, построенное из новых данных, — его сравнивает следующий разбор. */
export function graphStateToPrevious(state: { nodes: GraphNode[]; links: GraphLink[] }): PreviousGraph {
	return createPreviousGraph(state.nodes, state.links)
}
