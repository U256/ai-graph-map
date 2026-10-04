import type { GraphData } from '../../types/graph'
import { calculateGraphLayout, type GraphLayout } from './layout'

type LayoutRequest = {
	data: GraphData
	revision: number
}

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<LayoutRequest>) => void
	postMessage: (message: GraphLayout) => void
}

workerScope.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { data, revision } = event.data
	workerScope.postMessage(calculateGraphLayout(data, revision))
}
