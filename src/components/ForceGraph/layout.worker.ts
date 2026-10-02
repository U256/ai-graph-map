import type { GraphData } from '../../types/graph'
import type { GraphPhysics } from './forceGraph'
import { calculateGraphLayout, type GraphLayout } from './layout'

type LayoutRequest = {
	data: GraphData
	physics: GraphPhysics
}

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<LayoutRequest>) => void
	postMessage: (message: GraphLayout) => void
}

workerScope.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { data, physics } = event.data
	workerScope.postMessage(calculateGraphLayout(data, physics))
}
