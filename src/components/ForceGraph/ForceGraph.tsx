import { useEffect, useId, useRef, useState } from 'react'
import { graphData } from '../../data/graph'
import type { GraphData } from '../../types/graph'
import './ForceGraph.css'
import { createForceGraph } from './forceGraphView'

/** Данные подключены модулем, поэтому загрузка только эмулируется — чтобы состояние было заметно. */
const LOAD_DELAY_MS = 400

/** Граф из ноутбука @d3/disjoint-force-directed-graph/2: научные работы и цитирующие их патенты. */
function ForceGraph() {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [data, setData] = useState<GraphData | null>(null)
	// id узора должен быть валидным селектором и уникальным для каждого экземпляра графа
	const gridId = `force-graph-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

	useEffect(() => {
		const timer = setTimeout(() => setData(graphData), LOAD_DELAY_MS)
		return () => clearTimeout(timer)
	}, [])

	// граф собирается императивно (d3-selection): React владеет только контейнером
	useEffect(() => {
		const container = containerRef.current
		if (!container || !data) return undefined
		const graph = createForceGraph(data, { gridId })
		container.replaceChildren(graph.svg)
		return () => graph.destroy()
	}, [data, gridId])

	return (
		<figure className="force-graph">
			<div className="force-graph__canvas" ref={containerRef} />
			{!data && <p className="force-graph__status">Загрузка графа…</p>}
			<figcaption className="force-graph__hint">
				Тащите узлы мышью — сетка связей натягивается за ними. Пустое место — панорама, колесо — масштаб.
			</figcaption>
		</figure>
	)
}

export default ForceGraph
