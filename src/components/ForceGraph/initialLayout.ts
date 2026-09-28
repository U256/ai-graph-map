import type { GraphData, GraphNodeInput } from '../../types/graph'
import type { GraphPhysics } from './forceGraph'

export type InitialPosition = { id: string; x: number; y: number }

/** Один worker на запрос, чтобы cleanup мог остановить устаревший расчёт. */
export function calculateInitialLayout(
	data: GraphData,
	physics: GraphPhysics,
): {
	promise: Promise<InitialPosition[]>
	cancel: () => void
} {
	const worker = new Worker(new URL('./initialLayout.worker.ts', import.meta.url), { type: 'module' })
	const promise = new Promise<InitialPosition[]>((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<InitialPosition[]>) => {
			worker.terminate()
			resolve(event.data)
		}
		worker.onerror = (event) => {
			worker.terminate()
			reject(event.error ?? new Error(event.message))
		}
		worker.postMessage({ data, physics })
	})
	return { promise, cancel: () => worker.terminate() }
}

/** Копирует входные данные: d3 получит стартовые координаты, не мутируя React-данные. */
export function applyInitialLayout(data: GraphData, positions: InitialPosition[]): GraphData {
	const byId = new Map(positions.map(({ id, x, y }) => [id, { x, y }]))
	return {
		nodes: data.nodes.map((node): GraphNodeInput & { x?: number; y?: number; vx?: number; vy?: number } => {
			const position = byId.get(node.id)
			return position ? { ...node, ...position, vx: 0, vy: 0 } : { ...node }
		}),
		links: data.links.map((link) => ({ ...link })),
	}
}
