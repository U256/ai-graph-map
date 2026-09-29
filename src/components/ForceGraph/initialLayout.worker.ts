import type { GraphData, GraphNode } from '../../types/graph'
import { createSimulation, type GraphPhysics } from './forceGraph'
import {
	groupComponentsForLayout,
	orderComponentsForLayout,
	splitGraphIntoComponents,
	type GraphComponent,
	type LayoutCluster,
} from './graphComponents'

const COMPONENT_GAP = 40
const CLUSTER_GAP = 240
const LAYOUT_ROW_WIDTH = 1600

type Position = { id: string; x: number; y: number }

type Bounds = {
	minX: number
	maxX: number
	minY: number
	maxY: number
}

type LayoutRequest = {
	data: GraphData
	physics: GraphPhysics
}

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<LayoutRequest>) => void
	postMessage: (message: unknown) => void
}

function layoutComponent(component: GraphComponent, physics: GraphPhysics): Position[] {
	const nodes: GraphNode[] = component.nodes.map((node) => ({ ...node }))
	const links = component.links.map((link) => ({ ...link }))
	const simulation = createSimulation(nodes, links, physics).stop()

	// Обычный alphaDecay останавливает stepper раньше, чем гасятся скорости. Короткий прогрев на низкой
	// целевой альфе помогает силам довести раскладку, не превращая подготовку клона в долгий расчёт покоя.
	simulation.alphaTarget(0.05)
	for (let tick = 0; tick < 2000; tick += 1) simulation.tick()
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
	let cursorX = 0
	let cursorY = 0
	let rowHeight = 0
	const result: Position[] = []

	clusters.forEach((cluster) => {
		const positions = placeCluster(cluster, physics)
		const bounds = getBounds(positions)
		const width = bounds.maxX - bounds.minX
		const height = bounds.maxY - bounds.minY

		if (cursorX > 0 && cursorX + width > LAYOUT_ROW_WIDTH) {
			cursorX = 0
			cursorY += rowHeight + CLUSTER_GAP
			rowHeight = 0
		}

		result.push(...translate(positions, cursorX - bounds.minX, cursorY - bounds.minY))
		cursorX += width + CLUSTER_GAP
		rowHeight = Math.max(rowHeight, height)
	})

	return result
}

workerScope.onmessage = (event: MessageEvent<LayoutRequest>) => {
	const { data, physics } = event.data
	const components = orderComponentsForLayout(splitGraphIntoComponents(data))
	const clusters = groupComponentsForLayout(components)
	const positions = new Map(placeClusters(clusters, physics).map(({ id, x, y }) => [id, { id, x, y }]))
	workerScope.postMessage(data.nodes.flatMap(({ id }) => (positions.has(id) ? [positions.get(id)] : [])))
}
