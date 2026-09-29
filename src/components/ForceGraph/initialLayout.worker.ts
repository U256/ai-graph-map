import type { GraphData, GraphNode } from '../../types/graph'
import { createSimulation, groupNeighborChargeMultiplier, type GraphPhysics } from './forceGraph'
import type { InitialLayout, InitialPosition, NestedInitialPosition } from './initialLayout'

type LayoutRequest = {
	data: GraphData
	physics: GraphPhysics
}

function withGroupCharge(data: GraphData): GraphData {
	return {
		nodes: data.nodes.map((node) => ({
			...node,
			chargeMultiplier:
				node.type === 'group'
					? groupNeighborChargeMultiplier(node.children?.nodes.length ?? 0)
					: node.chargeMultiplier,
		})),
		links: data.links.map((link) => ({ ...link })),
	}
}

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<LayoutRequest>) => void
	postMessage: (message: InitialLayout) => void
}

function calculate(data: GraphData, physics: GraphPhysics): InitialPosition[] {
	const nodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const links = data.links.map((link) => ({ ...link }))
	const simulation = createSimulation(nodes, links, physics).stop()
	simulation.alphaTarget(0.05)
	for (let tick = 0; tick < 2000; tick += 1) simulation.tick()
	simulation.alphaTarget(0)
	while (simulation.alpha() > simulation.alphaMin()) simulation.tick()
	return nodes.map(({ id, x, y }) => ({ id, x: x ?? 0, y: y ?? 0 }))
}

/** Вложенные графы считают тем же `createSimulation`; усиленный заряд получает только внешний узел группы. */
function nestedPositions(data: GraphData, physics: GraphPhysics): NestedInitialPosition[] {
	return data.nodes.flatMap((node) => {
		if (!node.children) return []
		const positionedChildren = withGroupCharge(node.children)
		const positions = calculate(positionedChildren, physics).map((position) => ({ ...position, groupId: node.id }))
		return [...positions, ...nestedPositions(node.children, physics)]
	})
}

workerScope.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { data, physics } = event.data
	workerScope.postMessage({
		positions: calculate(withGroupCharge(data), physics),
		nestedPositions: nestedPositions(data, physics),
	})
}
