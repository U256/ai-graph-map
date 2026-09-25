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
		const cloned: GraphData = { nodes: [...originalData.nodes], links: [...originalData.links] }
		// клоны снимаются с исходных данных, а не с уже расширенного массива: иначе на каждой
		// итерации клонировались бы клоны и граф рос геометрически, а не в `nodeClones` раз
		// eslint-disable-next-line no-plusplus
		for (let i = 1; i < nodeClones; i++) {
			cloned.nodes = [...cloned.nodes, ...originalData.nodes.map((node) => ({ ...node, id: `${i}-${node.id}` }))]
			cloned.links = [
				...cloned.links,
				...originalData.links.map((link) => ({
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

	// граф собирается императивно (d3-selection): React владеет только контейнером. Сцена создаётся
	// один раз — при первых данных; дальше изменения доставляются через update(), чтобы раскладка,
	// вид панорамы и симуляция не сбрасывались. Создание и первая отрисовка — в одном эффекте:
	// в StrictMode эффекты выполняются дважды, и разнесённые по двум эффектам создание с guard'ом
	// и обновление оставили бы на экране уже уничтоженный svg.
	useEffect(() => {
		const container = containerRef.current
		if (!container || !data) return undefined
		const graph = createForceGraph(data)
		container.replaceChildren(graph.svg)
		return () => {
			graph.destroy()
			container.replaceChildren()
		}
	}, [data])

	return (
		<figure className="force-graph">
			<div className="force-graph__canvas" ref={containerRef} />
			{!data && <p className="force-graph__status">Загрузка графа…</p>}
		</figure>
	)
}
