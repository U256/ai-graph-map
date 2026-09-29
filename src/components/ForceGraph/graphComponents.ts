import type { GraphData, GraphLinkInput, GraphNodeInput } from '../../types/graph'

export type GraphComponent = GraphData
export type LayoutCluster = GraphComponent[]

/** Ищет компоненты по связности, трактуя направление ребра как несущественное только для обхода. */
export function splitGraphIntoComponents(data: GraphData): GraphComponent[] {
	const nodesById = new Map<string, GraphNodeInput>()
	data.nodes.forEach((node) => {
		if (!nodesById.has(node.id)) nodesById.set(node.id, node)
	})

	const adjacency = new Map<string, Set<string>>([...nodesById.keys()].map((id) => [id, new Set()]))
	data.links.forEach(({ source, target }) => {
		if (!nodesById.has(source) || !nodesById.has(target)) return
		adjacency.get(source)?.add(target)
		adjacency.get(target)?.add(source)
	})

	const visited = new Set<string>()
	const components: GraphComponent[] = []
	const componentById = new Map<string, number>()

	nodesById.forEach((_, startId) => {
		if (visited.has(startId)) return
		const nodeIds: string[] = []
		const queue = [startId]
		visited.add(startId)

		for (let cursor = 0; cursor < queue.length; cursor += 1) {
			const id = queue[cursor]
			nodeIds.push(id)
			adjacency.get(id)?.forEach((neighbor) => {
				if (visited.has(neighbor)) return
				visited.add(neighbor)
				queue.push(neighbor)
			})
		}

		const index = components.length
		components.push({
			nodes: nodeIds.map((id) => nodesById.get(id) as GraphNodeInput),
			links: [],
		})
		nodeIds.forEach((id) => componentById.set(id, index))
	})

	data.links.forEach((link: GraphLinkInput) => {
		const index = componentById.get(link.source)
		if (index === undefined || componentById.get(link.target) !== index) return
		components[index].links.push({ ...link })
	})

	return components
}

/** Объединяет малые компоненты в компактные ряды placement-очереди, не объединяя сами графы. */
export function orderComponentsForLayout(components: GraphComponent[]): GraphComponent[] {
	const large = components.filter(({ nodes }) => nodes.length > 3)
	const small = components.filter(({ nodes }) => nodes.length <= 3)
	return [...large, ...small]
}

/** Группирует компоненты в визуальные кластеры примерно по 150 узлов, не разрывая связные компоненты. */
export function groupComponentsForLayout(components: GraphComponent[], targetSize = 150): LayoutCluster[] {
	const clusters: LayoutCluster[] = []
	let cluster: LayoutCluster = []
	let size = 0

	components.forEach((component) => {
		if (cluster.length > 0 && size + component.nodes.length > targetSize) {
			clusters.push(cluster)
			cluster = []
			size = 0
		}
		cluster.push(component)
		size += component.nodes.length
	})

	if (cluster.length > 0) clusters.push(cluster)
	return clusters
}
