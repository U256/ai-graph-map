import { forceCollide, forceSimulation } from 'd3-force'

const CLUSTER_WIDTH_FACTOR = 135
const CLUSTER_WIDTH_POWER = 0.63
const CLUSTER_GAP = 0
const GRID_COLUMNS = 4
const GRID_STEP_FACTOR = 0.7
const COLLIDE_ITERATIONS = 8
const LAYOUT_TICKS = 600

export type ClusterPosition = { id: string; x: number; y: number }

export type ClusterLayoutInput = {
	positions: ClusterPosition[]
	nodeCount: number
}

type ClusterBody = {
	radius: number
	x: number
	y: number
}

/** Диаметр круга кластера: грубая оценка зависит только от количества его узлов. */
export function clusterDiameter(nodeCount: number): number {
	return CLUSTER_WIDTH_FACTOR * Math.max(nodeCount, 1) ** CLUSTER_WIDTH_POWER
}

/** Раскладывает круги forceCollide и переносит содержимое в центры найденных кругов. */
export function placeClusterCircles(clusters: ClusterLayoutInput[]): ClusterPosition[] {
	if (clusters.length === 0) return []

	const maxDiameter = Math.max(...clusters.map(({ nodeCount }) => clusterDiameter(nodeCount)))
	const columns = Math.min(GRID_COLUMNS, clusters.length)
	const bodies: ClusterBody[] = clusters.map(({ nodeCount }, index) => {
		const column = index % columns
		const row = Math.floor(index / columns)
		const radius = clusterDiameter(nodeCount) / 2
		return {
			radius,
			x: column * maxDiameter * GRID_STEP_FACTOR,
			y: row * maxDiameter * GRID_STEP_FACTOR,
		}
	})

	const simulation = forceSimulation(bodies)
		.force(
			'collide',
			forceCollide<ClusterBody>()
				.radius(({ radius }) => radius + CLUSTER_GAP)
				.iterations(COLLIDE_ITERATIONS),
		)
		.stop()

	for (let tick = 0; tick < LAYOUT_TICKS; tick += 1) simulation.tick()

	return clusters.flatMap(({ positions }, index) => {
		const body = bodies[index]
		const bounds = positions.reduce(
			(result, position) => ({
				minX: Math.min(result.minX, position.x),
				maxX: Math.max(result.maxX, position.x),
				minY: Math.min(result.minY, position.y),
				maxY: Math.max(result.maxY, position.y),
			}),
			{ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
		)
		const centerX = (bounds.minX + bounds.maxX) / 2
		const centerY = (bounds.minY + bounds.maxY) / 2
		return positions.map((position) => ({
			...position,
			x: position.x - centerX + body.x,
			y: position.y - centerY + body.y,
		}))
	})
}
