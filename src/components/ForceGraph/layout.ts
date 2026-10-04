import type { GraphData, GraphNode, GraphNodeInput } from '../../types/graph'
import { placeClusterCircles } from './clusterLayout'
import { createSimulation, groupNeighborChargeMultiplier } from './forceGraph'
import { MAX_GROUP_SIZE, splitGraphIntoComponents, type GraphComponent, type LayoutCluster } from './graphComponents'

export type LayoutPosition = { id: string; x: number; y: number }

/** Координаты узла саб-графа; `groupId` связывает их с внешней группой. */
export type NestedLayoutPosition = LayoutPosition & { groupId: string }

export type GraphLayout = {
	revision: number
	positions: LayoutPosition[]
	nestedPositions: NestedLayoutPosition[]
}

type Position = LayoutPosition
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

const COMPONENT_GAP = 40
const LAYOUT_ROW_WIDTH = 1600

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

function calculateSimulation(data: GraphData): LayoutPosition[] {
	const nodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const links = data.links.map((link) => ({ ...link }))
	const simulation = createSimulation(nodes, links).stop()
	simulation.alphaTarget(0.2)
	for (let tick = 0; tick < 500; tick += 1) simulation.tick()
	simulation.alphaTarget(0)
	while (simulation.alpha() > simulation.alphaMin()) simulation.tick()
	return nodes.map(({ id, x, y }) => ({ id, x: x ?? 0, y: y ?? 0 }))
}

/** Вложенные графы считают тем же `createSimulation`; усиленный заряд получает только внешний узел группы. */
function nestedPositions(data: GraphData): NestedLayoutPosition[] {
	return data.nodes.flatMap((node) => {
		if (!node.children) return []
		const positions = calculateSimulation(withGroupCharge(node.children)).map((position) => ({
			...position,
			groupId: node.id,
		}))
		return [...positions, ...nestedPositions(node.children)]
	})
}

function getBounds(positions: Position[]): Bounds {
	return positions.reduce(
		(bounds, position) => ({
			minX: Math.min(bounds.minX, position.x),
			maxX: Math.max(bounds.maxX, position.x),
			minY: Math.min(bounds.minY, position.y),
			maxY: Math.max(bounds.maxY, position.y),
		}),
		{ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
	)
}

function placeCluster(components: GraphComponent[]): Position[] {
	let cursorX = 0
	let cursorY = 0
	let rowHeight = 0
	const result: Position[] = []
	components.forEach((component) => {
		const positions = calculateSimulation({ nodes: component.nodes, links: component.links })
		const bounds = getBounds(positions)
		const width = bounds.maxX - bounds.minX
		const height = bounds.maxY - bounds.minY
		if (cursorX > 0 && cursorX + width > LAYOUT_ROW_WIDTH) {
			cursorX = 0
			cursorY += rowHeight + COMPONENT_GAP
			rowHeight = 0
		}
		result.push(
			...positions.map((position) => ({
				...position,
				x: position.x - bounds.minX + cursorX,
				y: position.y - bounds.minY + cursorY,
			})),
		)
		cursorX += width + COMPONENT_GAP
		rowHeight = Math.max(rowHeight, height)
	})
	return result
}

/** Раскладывает визуальные кластеры отдельно, не создавая между их компонентами фиктивных связей. */
function placeClusters(clusters: LayoutCluster[]): Position[] {
	return placeClusterCircles(
		clusters.map((cluster) => ({
			positions: placeCluster(cluster),
			nodeCount: cluster.reduce((count, component) => count + component.nodes.length, 0),
		})),
	)
}

/** Чистый расчёт раскладки, общий для worker и основного потока. */
export function calculateGraphLayout(data: GraphData, revision = 0): GraphLayout {
	const positions =
		data.nodes.length < MAX_GROUP_SIZE
			? calculateSimulation(data)
			: placeClusters(splitGraphIntoComponents(data).map((component) => [component]))
	const byId = new Map(positions.map((position) => [position.id, position]))
	return {
		revision,
		positions: data.nodes.flatMap(({ id }) => (byId.has(id) ? [byId.get(id)!] : [])),
		nestedPositions: nestedPositions(data),
	}
}

/** Один worker на запрос, чтобы cleanup мог остановить устаревший расчёт. */
export function calculateLayout(
	data: GraphData,
	revision = 0,
	useWorker = true,
): {
	promise: Promise<GraphLayout>
	cancel: () => void
} {
	if (!useWorker) return { promise: Promise.resolve(calculateGraphLayout(data, revision)), cancel: () => {} }
	const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
	const promise = new Promise<GraphLayout>((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<GraphLayout>) => {
			worker.terminate()
			resolve(event.data)
		}
		worker.onerror = (event) => {
			worker.terminate()
			reject(event.error ?? new Error(event.message))
		}
		worker.postMessage({ data, revision })
	})
	return { promise, cancel: () => worker.terminate() }
}

/** Копирует входные данные: d3 получит стартовые координаты, не мутируя React-данные. */
export function applyLayout(data: GraphData, layout: GraphLayout): GraphData {
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
