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
	const { nodeClones } = settings

	const containerRef = useRef<HTMLDivElement | null>(null)
	const [originalData, setData] = useState<GraphData | null>(null)

	// копия графа целиком: копии несут те же подписи, различить их на карте можно только по подсказке
	const data = useMemo(() => {
		if (!originalData || nodeClones <= 1) {
			return originalData
		}
		const cloned = { ...originalData }
		// eslint-disable-next-line no-plusplus
		for (let i = 1; i < nodeClones; i++) {
			cloned.nodes = [...cloned.nodes, ...cloned.nodes.map((node) => ({ ...node, id: `${i}-${node.id}` }))]
			cloned.links = [
				...cloned.links,
				...cloned.links.map((link) => ({
					...link,
					source: `${i}-${link.source}`,
					target: `${i}-${link.target}`,
				})),
			]
		}
		return cloned
	}, [originalData, nodeClones])

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
