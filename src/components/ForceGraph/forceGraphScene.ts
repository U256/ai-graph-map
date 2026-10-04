import type { DrawnLink, GraphLink, GraphNode } from '../../types/graph'
import { createSimulation, type GraphPhysics } from './forceGraph'

const INCREMENTAL_TICKS = 180
const TEMPORARY_OLD_CHARGE = 0.15
const OLD_POSITION_BLEND = 0.24
const DISCONNECTED_SEED_RADIUS = 180
const DISCONNECTED_SEED_STEP = 26

/** Превращает строковые концы входных связей в узлы, как раньше это делал `forceLink`. */
export function resolveLinks(nodes: GraphNode[], links: GraphLink[]): DrawnLink[] {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	return links.flatMap((link) => {
		const source = typeof link.source === 'string' ? byId.get(link.source) : link.source
		const target = typeof link.target === 'string' ? byId.get(link.target) : link.target
		return source && target ? [{ ...link, source, target } as DrawnLink] : []
	})
}

/**
 * Коротко доводит только новые узлы: старые закреплены на прежних координатах, поэтому добавление компоненты
 * не перетряхивает уже разложенную карту. Для полностью новой компоненты стартовые точки разводятся заранее,
 * иначе одинаковый запасной seed оставляет все её узлы в центре до первого тика.
 */
export function settleAddedNodes(
	nodes: GraphNode[],
	links: GraphLink[],
	addedIds: Set<string>,
	physics: GraphPhysics,
): void {
	if (addedIds.size === 0) return
	const existingIds = new Set(nodes.filter((node) => !addedIds.has(node.id)).map((node) => node.id))
	const oldPositions = new Map(nodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
	const simulationNodes = nodes.map((node, index) => {
		const added = addedIds.has(node.id)
		const hasExistingNeighbor = links.some((link) => {
			const source = String(link.source)
			const target = String(link.target)
			return (
				added &&
				((source === node.id && existingIds.has(target)) || (target === node.id && existingIds.has(source)))
			)
		})
		const angle = index * 2.399963
		const radius = DISCONNECTED_SEED_RADIUS + index * DISCONNECTED_SEED_STEP
		return {
			...node,
			x: hasExistingNeighbor ? node.x : (node.x ?? 0) + Math.cos(angle) * radius,
			y: hasExistingNeighbor ? node.y : (node.y ?? 0) + Math.sin(angle) * radius,
			vx: 0,
			vy: 0,
			fx: null,
			fy: null,
			chargeMultiplier: added ? node.chargeMultiplier : TEMPORARY_OLD_CHARGE,
			index,
		}
	})
	const simulationLinks = links.map((link) => ({ ...link }))
	const simulation = createSimulation(simulationNodes, simulationLinks, physics).stop()

	for (let tick = 0; tick < INCREMENTAL_TICKS; tick += 1) simulation.tick()

	const positions = new Map(simulationNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
	nodes.forEach((node) => {
		const position = positions.get(node.id)
		if (position) {
			const oldPosition = oldPositions.get(node.id)
			if (oldPosition && !addedIds.has(node.id)) {
				position.x = oldPosition.x + (position.x - oldPosition.x) * OLD_POSITION_BLEND
				position.y = oldPosition.y + (position.y - oldPosition.y) * OLD_POSITION_BLEND
			}
			// eslint-disable-next-line no-param-reassign
			node.x = position.x
			// eslint-disable-next-line no-param-reassign
			node.y = position.y
		}
	})
}
