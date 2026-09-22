import { useEffect, useId, useRef, useState } from 'react'
import type { GraphData } from './forceGraph'
import './ForceGraph.css'
import { createForceGraph } from './forceGraphView'

/** Данные лежат в public — как FileAttachment в ноутбуке, поэтому грузятся отдельным запросом. */
const DATA_URL = `${import.meta.env.BASE_URL}graph.json`

/** Граф из ноутбука @d3/disjoint-force-directed-graph/2: статьи и патологи со связями между ними. */
function ForceGraph() {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [data, setData] = useState<GraphData | null>(null)
	const [failed, setFailed] = useState(false)
	// id узора должен быть валидным селектором и уникальным для каждого экземпляра графа
	const gridId = `force-graph-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

	useEffect(() => {
		const controller = new AbortController()
		fetch(DATA_URL, { signal: controller.signal })
			.then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
			.then((json: GraphData) => setData(json))
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true)
			})
		return () => controller.abort()
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
			{!data && !failed && <p className="force-graph__status">Загрузка графа…</p>}
			{failed && <p className="force-graph__status">Не удалось загрузить graph.json</p>}
			<figcaption className="force-graph__hint">
				Тащите узлы мышью — сетка связей натягивается за ними. Пустое место — панорама, колесо — масштаб.
			</figcaption>
		</figure>
	)
}

export default ForceGraph
