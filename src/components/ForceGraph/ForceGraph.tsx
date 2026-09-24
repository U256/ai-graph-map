import { useEffect, useMemo, useRef, useState } from 'react'
import { graphData } from '../../data/graph'
import type { GraphData } from '../../types/graph'
import type { GraphSettings } from '../../types/settings'
import './ForceGraph.css'
import { createForceGraph } from './forceGraphView'

/** Данные подключены модулем, поэтому загрузка только эмулируется — чтобы состояние было заметно. */
const LOAD_DELAY_MS = 400

type ForceGraphProps = {
	settings: GraphSettings
}

export function ForceGraph({ settings }: ForceGraphProps) {
	const { nodeMultiplier } = settings

	const containerRef = useRef<HTMLDivElement | null>(null)
	const [originalData, setData] = useState<GraphData | null>(null)

	const data = useMemo(() => {
		if (!originalData || !nodeMultiplier || nodeMultiplier === 1) {
			return originalData
		}
		const multiplied = { ...originalData }
		// eslint-disable-next-line no-plusplus
		for (let i = 1; i < nodeMultiplier; i++) {
			multiplied.nodes = [
				...multiplied.nodes,
				...multiplied.nodes.map((node) => ({ ...node, id: `${i}-${node.id}` })),
			]
			multiplied.links = [
				...multiplied.links,
				...multiplied.links.map((link) => ({
					...link,
					source: `${i}-${link.source}`,
					target: `${i}-${link.target}`,
				})),
			]
		}
		return multiplied
	}, [originalData, nodeMultiplier])

	useEffect(() => {
		const timer = setTimeout(() => setData(graphData), LOAD_DELAY_MS)
		return () => clearTimeout(timer)
	}, [])

	// граф собирается императивно (d3-selection): React владеет только контейнером
	useEffect(() => {
		const container = containerRef.current
		if (!container || !data) return undefined
		const graph = createForceGraph(data)
		container.replaceChildren(graph.svg)
		return () => graph.destroy()
	}, [data])

	return (
		<figure className="force-graph">
			<div className="force-graph__canvas" ref={containerRef} />
			{!data && <p className="force-graph__status">Загрузка графа…</p>}
		</figure>
	)
}
