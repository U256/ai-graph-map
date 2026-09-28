import type { GraphData, GraphNode } from '../../types/graph'
import { createSimulation, type GraphPhysics } from './forceGraph'

type LayoutRequest = {
	data: GraphData
	physics: GraphPhysics
}

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<LayoutRequest>) => void
	postMessage: (message: unknown) => void
}

workerScope.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { data, physics } = event.data
	const nodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const links = data.links.map((link) => ({ ...link }))
	const simulation = createSimulation(nodes, links, physics).stop()

	while (simulation.alpha() > simulation.alphaMin()) simulation.tick()

	workerScope.postMessage(nodes.map(({ id, x, y }) => ({ id, x, y })))
}
