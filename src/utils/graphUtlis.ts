import { type GraphData } from '../types/graph'

export const multiplyWithClones = (data: GraphData, multiply: number) => {
	if (!data || multiply <= 1) {
		return data
	}
	const cloned: GraphData = { nodes: [...data.nodes], links: [...data.links] }
	// eslint-disable-next-line no-plusplus
	for (let i = 1; i < multiply; i++) {
		cloned.nodes = [...cloned.nodes, ...data.nodes.map((node) => ({ ...node, id: `${i}-${node.id}` }))]
		cloned.links = [
			...cloned.links,
			...data.links.map((link) => ({
				...link,
				source: `${i}-${link.source}`,
				target: `${i}-${link.target}`,
			})),
		]
	}
	return cloned
}
