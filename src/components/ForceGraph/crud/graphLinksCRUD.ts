import type { GraphLink, GraphLinkInput, GraphNode } from '../../../types/graph'
import type { SeedPoint } from '../forceGraph'

/**
 * CRUD связей графа: направленный ключ связи, разбор новых связей относительно прежних и сборка
 * объектов связи для симуляции. Как и модуль узлов — чистый, без DOM.
 */

/** Связь новых данных вместе с ключом и флагом «такой связи раньше не было». */
export interface NextLink {
	key: string
	link: GraphLink
	added: boolean
}

/** Итог разбора связей: полный список нового состояния и те, чего раньше не было. */
export interface LinksDiff {
	all: NextLink[]
	added: NextLink[]
}

/** Концы связи в терминах симуляции: до инициализации — id, после — сами узлы. */
type LinkEndpoint = string | number | GraphNode

function endpointId(endpoint: LinkEndpoint): string {
	return typeof endpoint === 'object' ? endpoint.id : String(endpoint)
}

function isNode(endpoint: LinkEndpoint): endpoint is GraphNode {
	return typeof endpoint === 'object'
}

/**
 * Ключ связи. Направленный: `a→b` и `b→a` — две разные связи, и для физики это два разных объекта.
 * Поэтому переназначение конца связи — это удаление старой связи и добавление новой, а не правка:
 * линия привязана к конкретным объектам узлов, и «перетынуть» её дешевле не делать.
 */
export function linkKey(source: string, target: string): string {
	return `l:${source}>${target}`
}

/** Ключ связи симуляции: концы могли быть уже подменены узлами, поэтому id берём у объекта. */
export function linkKeyOf(link: GraphLink): string {
	return linkKey(endpointId(link.source), endpointId(link.target))
}

/** Ключ связи исходных данных, где концы всегда заданы идентификаторами. */
export function inputLinkKeyOf(link: GraphLinkInput): string {
	return linkKey(link.source, link.target)
}

/**
 * Объект связи для симуляции. Связи всегда собираются новыми: `forceLink.links()` заново разрешает
 * строковые концы по id, а слой связей перерисовывает толщину по данным, так что переиспользование
 * прежнего объекта ничего бы не сэкономило.
 */
export function buildLink(link: GraphLinkInput): GraphLink {
	const next: GraphLink = { source: link.source, target: link.target }
	// пустое поле остаётся пустым: значение по умолчанию подставляет отрисовка, а не данные
	if (link.force !== undefined) next.force = link.force
	return next
}

/**
 * Разбор связей новых данных относительно прежних. Сравниваются исходные `GraphLinkInput`, а не
 * объекты симуляции: только так видно, что конец связи переназначен, — в объекте связи концы уже
 * подменены узлами, и ключ прежней связи не восстановить. Флаг `added` ставится там, где такой связи
 * раньше не было: именно она тянет за собой узел, которому ещё не на что опереться при посеве.
 *
 * Связь с несуществующим концом отбрасывается, дубликат схлопывается в первую: и то и другое иначе
 * ломает `forceLink.links()` (неразрешённый конец) или слой (два элемента на один ключ).
 */
export function diffLinks(previousKeys: Iterable<string>, nextLinks: GraphLinkInput[], nodes: Set<string>): LinksDiff {
	const previous = new Set(previousKeys)
	const seen = new Set<string>()
	const all: NextLink[] = []

	nextLinks.forEach((link) => {
		if (!nodes.has(link.source) || !nodes.has(link.target)) return
		const key = inputLinkKeyOf(link)
		if (seen.has(key)) return
		seen.add(key)
		all.push({ key, link: buildLink(link), added: !previous.has(key) })
	})

	return { all, added: all.filter(({ added }) => added) }
}

/**
 * Точки, вокруг которых высаживаются новые узлы: центр масс уже известных соседей по связям.
 * Считается по прежним связям и прежним координатам — новых узлов ещё нет, а прежние ещё стоят там,
 * где их оставила раскладка. Узлов без соседей здесь просто нет: им точка высадки не нужна.
 */
export function collectSeeds(links: GraphLink[]): Map<string, SeedPoint> {
	const sums = new Map<string, { sumX: number; sumY: number; count: number }>()

	const add = (at: GraphNode, toward: GraphNode) => {
		const sum = sums.get(at.id) ?? { sumX: 0, sumY: 0, count: 0 }
		sum.sumX += toward.x ?? 0
		sum.sumY += toward.y ?? 0
		sum.count += 1
		sums.set(at.id, sum)
	}

	// разлёт считается для обоих концов: связь вытягивает новый узел к старому и наоборот
	links.forEach((link) => {
		if (!isNode(link.source) || !isNode(link.target)) return
		add(link.source, link.target)
		add(link.target, link.source)
	})

	const seeds = new Map<string, SeedPoint>()
	sums.forEach((sum, id) => seeds.set(id, { x: sum.sumX / sum.count, y: sum.sumY / sum.count }))
	return seeds
}
