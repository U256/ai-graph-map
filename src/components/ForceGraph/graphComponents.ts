import type { GraphData, GraphNodeInput } from '../../types/graph'

export const MAX_GROUP_SIZE = 140

export type GraphComponent = GraphData
export type LayoutCluster = GraphComponent[]

type GraphIndexes = {
	nodesById: Map<string, GraphNodeInput>
	connectedNodeIds: Map<string, Set<string>>
	linkIndexesByNodeId: Map<string, number[]>
}

function createGraphIndexes(data: GraphData): GraphIndexes {
	const nodesById = new Map<string, GraphNodeInput>()
	const connectedNodeIds = new Map<string, Set<string>>()
	const linkIndexesByNodeId = new Map<string, number[]>()

	data.nodes.forEach((node) => {
		if (nodesById.has(node.id)) return
		nodesById.set(node.id, node)
		connectedNodeIds.set(node.id, new Set())
		linkIndexesByNodeId.set(node.id, [])
	})

	data.links.forEach(({ source, target }, index) => {
		const sourceNeighbors = connectedNodeIds.get(source)
		const targetNeighbors = connectedNodeIds.get(target)
		const sourceLinks = linkIndexesByNodeId.get(source)
		const targetLinks = linkIndexesByNodeId.get(target)
		if (!sourceNeighbors || !targetNeighbors || !sourceLinks || !targetLinks) return

		sourceNeighbors.add(target)
		targetNeighbors.add(source)
		sourceLinks.push(index)
		targetLinks.push(index)
	})

	return { nodesById, connectedNodeIds, linkIndexesByNodeId }
}

function collectCandidate(
	startId: string,
	data: GraphData,
	indexes: GraphIndexes,
	visitedNodeIds: Set<string>,
): GraphComponent {
	const candidate: GraphComponent = { nodes: [], links: [] }
	const candidateLinkIndexes = new Set<number>()
	const queue = [startId]
	visitedNodeIds.add(startId)

	for (let cursor = 0; cursor < queue.length; cursor += 1) {
		const nodeId = queue[cursor]
		candidate.nodes.push(indexes.nodesById.get(nodeId) as GraphNodeInput)
		indexes.linkIndexesByNodeId.get(nodeId)?.forEach((linkIndex) => {
			if (candidateLinkIndexes.has(linkIndex)) return
			candidateLinkIndexes.add(linkIndex)
			candidate.links.push(data.links[linkIndex])
		})

		indexes.connectedNodeIds.get(nodeId)?.forEach((connectedNodeId) => {
			if (visitedNodeIds.has(connectedNodeId)) return
			visitedNodeIds.add(connectedNodeId)
			queue.push(connectedNodeId)
		})
	}

	return candidate
}

/** Ищет компоненты по связности и сразу упаковывает их в группы. */
export function splitGraphIntoComponents(data: GraphData): GraphComponent[] {
	const indexes = createGraphIndexes(data)
	const visitedNodeIds = new Set<string>()
	const components: GraphComponent[] = []
	let currentGroup: GraphComponent = { nodes: [], links: [] }

	indexes.nodesById.forEach((_, startId) => {
		if (visitedNodeIds.has(startId)) return
		const candidate = collectCandidate(startId, data, indexes, visitedNodeIds)

		if (currentGroup.nodes.length > 0 && currentGroup.nodes.length + candidate.nodes.length > MAX_GROUP_SIZE) {
			components.push(currentGroup)
			currentGroup = { nodes: [], links: [] }
		}

		currentGroup.nodes.push(...candidate.nodes)
		currentGroup.links.push(...candidate.links)
	})

	if (currentGroup.nodes.length > 0) components.push(currentGroup)

	return components
}
