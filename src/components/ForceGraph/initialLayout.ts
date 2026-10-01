import type { GraphData, GraphNodeInput } from '../../types/graph'
import type { GraphPhysics } from './forceGraph'

export type InitialPosition = { id: string; x: number; y: number }

/** Координаты узла саб-графа; `groupId` связывает их с внешней группой. */
export type NestedInitialPosition = InitialPosition & { groupId: string }

export type InitialLayout = {
	positions: InitialPosition[]
	nestedPositions: NestedInitialPosition[]
}

/** Один worker на запрос, чтобы cleanup мог остановить устаревший расчёт. */
export function calculateInitialLayout(
	data: GraphData,
	physics: GraphPhysics,
): {
	promise: Promise<InitialLayout>
	cancel: () => void
} {
	const worker = new Worker(new URL('./initialLayout.worker.ts', import.meta.url), { type: 'module' })
	const promise = new Promise<InitialLayout>((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<InitialLayout>) => {
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
export function applyInitialLayout(data: GraphData, layout: InitialLayout): GraphData {
	const byId = new Map(layout.positions.map(({ id, x, y }) => [id, { x, y }]))
	const nestedByGroup = new Map<string, Map<string, { x: number; y: number }>>()
	layout.nestedPositions.forEach(({ groupId, id, x, y }) => {
		const positions = nestedByGroup.get(groupId) ?? new Map<string, { x: number; y: number }>()
		positions.set(id, { x, y })
		nestedByGroup.set(groupId, positions)
	})
	const applyChildren = (node: GraphNodeInput): GraphNodeInput => {
		if (!node.children) return node
		const positions = nestedByGroup.get(node.id)
		return {
			...node,
			children: {
				nodes: node.children.nodes.map((child) => {
					const position = positions?.get(child.id)
					return applyChildren(position ? { ...child, ...position } : child)
				}),
				links: node.children.links.map((link) => ({ ...link })),
			},
		}
	}
	return {
		nodes: data.nodes.map((node): GraphNodeInput & { x?: number; y?: number; vx?: number; vy?: number } => {
			const position = byId.get(node.id)
			const positioned = position ? { ...node, ...position, vx: 0, vy: 0 } : { ...node }
			return applyChildren(positioned) as GraphNodeInput & { x?: number; y?: number; vx?: number; vy?: number }
		}),
		links: data.links.map((link) => ({ ...link })),
	}
}
