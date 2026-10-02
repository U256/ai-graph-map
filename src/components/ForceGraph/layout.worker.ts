import type { GraphData, GraphNode } from '../../types/graph'
import { placeClusterCircles } from './clusterLayout'
import { createSimulation, groupNeighborChargeMultiplier, type GraphPhysics } from './forceGraph'
import { MAX_GROUP_SIZE, splitGraphIntoComponents, type GraphComponent, type LayoutCluster } from './graphComponents'
import type { GraphLayout, LayoutPosition, NestedLayoutPosition } from './layout'

type Position = { id: string; x: number; y: number }

type Bounds = {
	minX: number
	maxX: number
	minY: number
	maxY: number
}

const COMPONENT_GAP = 40
const LAYOUT_ROW_WIDTH = 1600

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
	postMessage: (message: GraphLayout) => void
}

function calculate(data: GraphData, physics: GraphPhysics): LayoutPosition[] {
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
function nestedPositions(data: GraphData, physics: GraphPhysics): NestedLayoutPosition[] {
	return data.nodes.flatMap((node) => {
		if (!node.children) return []
		const positionedChildren = withGroupCharge(node.children)
		const positions = calculate(positionedChildren, physics).map((position) => ({ ...position, groupId: node.id }))
		return [...positions, ...nestedPositions(node.children, physics)]
	})
}

function layoutComponent(component: GraphComponent, physics: GraphPhysics): Position[] {
	const nodes: GraphNode[] = component.nodes.map((node) => ({ ...node }))
	const links = component.links.map((link) => ({ ...link }))
	const simulation = createSimulation(nodes, links, physics).stop()

	// Обычный alphaDecay останавливает stepper раньше, чем гасятся скорости. Короткий прогрев на низкой
	// целевой альфе помогает силам довести раскладку, не превращая подготовку клона в долгий расчёт покоя.
	simulation.alphaTarget(0.2)
	for (let tick = 0; tick < 1000; tick += 1) simulation.tick()
	simulation.alphaTarget(0)
	while (simulation.alpha() > simulation.alphaMin()) simulation.tick()

	return nodes.map(({ id, x, y }) => ({ id, x: x ?? 0, y: y ?? 0 }))
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

function translate(positions: Position[], dx: number, dy: number): Position[] {
	return positions.map((position) => ({ ...position, x: position.x + dx, y: position.y + dy }))
}

/** Раскладывает компоненты плотными рядами внутри визуального кластера. */
function placeCluster(components: GraphComponent[], physics: GraphPhysics): Position[] {
	let cursorX = 0
	let cursorY = 0
	let rowHeight = 0
	const result: Position[] = []

	components.forEach((component) => {
		const positions = layoutComponent(component, physics)
		const bounds = getBounds(positions)
		const width = bounds.maxX - bounds.minX
		const height = bounds.maxY - bounds.minY

		if (cursorX > 0 && cursorX + width > LAYOUT_ROW_WIDTH) {
			cursorX = 0
			cursorY += rowHeight + COMPONENT_GAP
			rowHeight = 0
		}

		const placed = translate(positions, cursorX - bounds.minX, cursorY - bounds.minY)
		result.push(...placed)
		cursorX += width + COMPONENT_GAP
		rowHeight = Math.max(rowHeight, height)
	})

	return result
}

/** Раскладывает визуальные кластеры отдельно, не создавая между их компонентами фиктивных связей. */
function placeClusters(clusters: LayoutCluster[], physics: GraphPhysics): Position[] {
	return placeClusterCircles(
		clusters.map((cluster) => {
			const positions = placeCluster(cluster, physics)
			return {
				positions,
				nodeCount: cluster.reduce((count, component) => count + component.nodes.length, 0),
			}
		}),
	)
}

workerScope.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { data, physics } = event.data
	const positions = new Map(
		(data.nodes.length < MAX_GROUP_SIZE
			? calculate(data, physics)
			: placeClusters(
					splitGraphIntoComponents(data).map((component) => [component]),
					physics,
				)
		).map(({ id, x, y }) => [id, { id, x, y }]),
	)
	workerScope.postMessage({
		positions: data.nodes.flatMap(({ id }) => (positions.has(id) ? [positions.get(id)] : [])),
		nestedPositions: nestedPositions(data, physics),
	})
}
