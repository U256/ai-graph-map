/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-param-reassign */
import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'

const LAYOUT_SCALE = 7
const LINK_DISTANCE = 100
const LINK_STRENGTH = 0.5
const CHARGE_STRENGTH = -30
const VELOCITY_DECAY = 0.6

function validPosition(node: any) {
	return Number.isFinite(node.x) && Number.isFinite(node.y)
}

/**
 * Код является копипейстом серверной логики, нужно для презентации
 */
export function calculateSimulation(graph: any, ignoreCurrentCoordinates = false, scale = 1) {
	if (!Number.isFinite(scale) || scale <= 0) throw new Error('scale должен быть положительным числом')
	const nodes = graph.nodes.map((node: any) => {
		if (ignoreCurrentCoordinates || !validPosition(node)) {
			delete node.x
			delete node.y
			delete node.vx
			delete node.vy
		}
		return node
	})
	const links = structuredClone(graph.links)
	const simulation = forceSimulation(/** @type {Array<GraphNode & import('d3-force').SimulationNodeDatum>} */ nodes)
		.force(
			'link',
			forceLink(links)
				.id((node) => /** @type {GraphNode} */ (node as any).id)
				.distance(LINK_DISTANCE)
				.strength(LINK_STRENGTH),
		)
		.force(
			'charge',
			forceManyBody().strength(() => CHARGE_STRENGTH * LAYOUT_SCALE ** 2),
		)
		.force('x', forceX())
		.force('y', forceY())
		.velocityDecay(VELOCITY_DECAY)
		.stop()

	// двигаем симуляцию, чтобы привести ближе к "покою" и сделать равномернее распределение
	simulation.alphaTarget(1)
	for (let tick = 0; tick < 500; tick += 1) simulation.tick()
	simulation.alphaTarget(0)

	while (simulation.alpha() > simulation.alphaMin()) simulation.tick()

	return nodes.map(({ vx: _vx, vy: _vy, index: _index, ...node }: any) => node)
}
