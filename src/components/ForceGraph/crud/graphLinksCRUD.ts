import type { GraphLink, GraphLinkInput, GraphNode } from '../../../types/graph'
import type { SeedPoint } from '../forceGraph'

/** CRUD связей графа. Как и модуль узлов — чистый, без DOM. */

export interface NextLink {
	key: string
	link: GraphLink
	added: boolean
}

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
 * Ключ направленный: `a→b` и `b→a` — две разные связи. Поэтому переназначение конца — это exit старой
 * связи и enter новой, а не правка: линия привязана к конкретным объектам узлов.
 */
export function linkKey(source: string, target: string): string {
	return `l:${source}>${target}`
}

/** Концы могли быть уже подменены узлами, поэтому id берём у объекта. */
export function linkKeyOf(link: GraphLink): string {
	return linkKey(endpointId(link.source), endpointId(link.target))
}

export function inputLinkKeyOf(link: GraphLinkInput): string {
	return linkKey(link.source, link.target)
}

export function buildLink(link: GraphLinkInput): GraphLink {
	const next: GraphLink = { source: link.source, target: link.target }
	// пустое поле остаётся пустым: значение по умолчанию подставляет отрисовка, а не данные
	if (link.force !== undefined) next.force = link.force
	return next
}

/**
 * Сравниваются исходные `GraphLinkInput`, а не объекты симуляции: только так видно, что конец связи
 * переназначен, — в объекте связи концы уже подменены узлами, и ключ прежней связи не восстановить.
 * Связь с несуществующим концом отбрасывается, дубликат схлопывается в первую: иначе ломается
 * `forceLink.links()` или слой.
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
 * Центр масс уже известных соседей. Считается по прежним связям и прежним координатам: новых узлов ещё
 * нет, а прежние ещё стоят там, где их оставила раскладка.
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

/** Считает высадку по новым связям, сохраняя координаты уже существующих концов. */
export function collectInputSeeds(links: GraphLinkInput[], nodes: Map<string, GraphNode>): Map<string, SeedPoint> {
	const sums = new Map<string, { sumX: number; sumY: number; count: number }>()

	links.forEach((link) => {
		const source = nodes.get(link.source)
		const target = nodes.get(link.target)
		if (source && !target) {
			const sum = sums.get(link.target) ?? { sumX: 0, sumY: 0, count: 0 }
			sum.sumX += source.x ?? 0
			sum.sumY += source.y ?? 0
			sum.count += 1
			sums.set(link.target, sum)
		}
		if (target && !source) {
			const sum = sums.get(link.source) ?? { sumX: 0, sumY: 0, count: 0 }
			sum.sumX += target.x ?? 0
			sum.sumY += target.y ?? 0
			sum.count += 1
			sums.set(link.source, sum)
		}
	})

	return new Map([...sums.entries()].map(([id, sum]) => [id, { x: sum.sumX / sum.count, y: sum.sumY / sum.count }]))
}
