import type { DrawnLink, GraphLink, GraphNode } from '../../types/graph'
import { createSimulation, type GraphPhysics } from './forceGraph'

const INCREMENTAL_TICKS = 180
const NEIGHBOR_MAX_SHIFT = 24
const DISCONNECTED_SEED_GAP = 180

/** Превращает строковые концы входных связей в узлы, как раньше это делал `forceLink`. */
export function resolveLinks(nodes: GraphNode[], links: GraphLink[]): DrawnLink[] {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	return links.flatMap((link) => {
		const source = typeof link.source === 'object' ? link.source : byId.get(String(link.source))
		const target = typeof link.target === 'object' ? link.target : byId.get(String(link.target))
		return source && target ? [{ ...link, source, target }] : []
	})
}

/**
 * В статичной сцене доводит новые узлы и их соседей; остальные старые узлы закреплены и не меняют координаты.
 */
export function settleAddedNodes(
	nodes: GraphNode[],
	links: DrawnLink[],
	addedIds: Set<string>,
	physics: GraphPhysics,
): void {
	if (addedIds.size === 0) return
	const neighbors = new Set<string>()
	links.forEach(({ source, target }) => {
		if (addedIds.has(source.id) && !addedIds.has(target.id)) neighbors.add(target.id)
		if (addedIds.has(target.id) && !addedIds.has(source.id)) neighbors.add(source.id)
	})
	const oldPositions = new Map(
		nodes.filter((node) => neighbors.has(node.id)).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
	)
	const maxX = Math.max(0, ...nodes.filter((node) => !addedIds.has(node.id)).map((node) => node.x ?? 0))
	let disconnected = 0
	const linkedNew = new Set(
		links.flatMap(({ source, target }) => {
			if (addedIds.has(source.id) && !addedIds.has(target.id)) return [source.id]
			if (addedIds.has(target.id) && !addedIds.has(source.id)) return [target.id]
			return []
		}),
	)
	nodes.forEach((node) => {
		if (addedIds.has(node.id)) {
			if (!linkedNew.has(node.id)) {
				// Новая компонента не должна начинать расчёт поверх уже разложенной карты.
				Object.assign(node, {
					x: maxX + DISCONNECTED_SEED_GAP + disconnected * DISCONNECTED_SEED_GAP,
					y: 0,
				})
				disconnected += 1
			}
		} else if (!neighbors.has(node.id)) {
			Object.assign(node, { fx: node.x, fy: node.y })
		}
	})
	const simulation = createSimulation(nodes, links, physics).stop()

	for (let tick = 0; tick < INCREMENTAL_TICKS; tick += 1) simulation.tick()

	nodes.forEach((node) => {
		if (!addedIds.has(node.id) && !neighbors.has(node.id)) {
			Object.assign(node, { fx: null, fy: null })
		}
		const before = oldPositions.get(node.id)
		if (before) {
			const dx = (node.x ?? 0) - before.x
			const dy = (node.y ?? 0) - before.y
			const distance = Math.hypot(dx, dy)
			if (distance > NEIGHBOR_MAX_SHIFT) {
				Object.assign(node, {
					x: before.x + (dx / distance) * NEIGHBOR_MAX_SHIFT,
					y: before.y + (dy / distance) * NEIGHBOR_MAX_SHIFT,
				})
			}
		}
		Object.assign(node, { vx: 0, vy: 0 })
	})
}
