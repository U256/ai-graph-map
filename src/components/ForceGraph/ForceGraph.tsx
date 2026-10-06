import { useCallback, useEffect, useRef } from 'react'
import type { GraphData } from '../../types/graph'
import type { GraphSettings } from '../../types/settings'
import './ForceGraph.css'
import { createForceGraph, type ForceGraphHandle } from './forceGraphView'

type ForceGraphProps = {
	data: GraphData | null
	settings: GraphSettings
	selectedNodeId?: string | null
	onNodeClick?: (id: string) => void
}

export function ForceGraph({ data, settings, selectedNodeId = null, onNodeClick }: ForceGraphProps) {
	// @ts-ignore Временно не используется, нужно для дальнейших доработок визуала
	const { showFullSubNodes } = settings

	const containerRef = useRef<HTMLDivElement | null>(null)
	const graphRef = useRef<ForceGraphHandle | null>(null)
	// сцена создаётся один раз, а колбэк клика пересоздаётся с родителем: наружу уходит обёртка,
	// читающая актуальное замыкание из ref
	const nodeClickRef = useRef(onNodeClick)
	nodeClickRef.current = onNodeClick
	const handleNodeClick = useCallback((id: string) => nodeClickRef.current?.(id), [])

	// React владеет только контейнером, Canvas императивный. Разрушение сцены — отдельный эффект ниже:
	// в cleanup этого она пересобирала бы Canvas на каждую смену зависимости
	useEffect(() => {
		const container = containerRef.current
		if (!container || !data) {
			return
		}

		if (graphRef.current) {
			graphRef.current.updateData(data)
		} else {
			const next = createForceGraph(data, {
				onNodeClick: handleNodeClick,
			})
			graphRef.current = next
			container.replaceChildren(next.canvas, next.zoomIndicator, next.zoomControls)
		}
	}, [data, handleNodeClick])

	useEffect(() => {
		graphRef.current?.setSelectedNode(selectedNodeId)
	}, [selectedNodeId])

	// в StrictMode этот cleanup запускается между двумя прогонами эффектов, и создание выше
	// отрабатывает заново — на экране остаётся живой Canvas
	useEffect(
		() => () => {
			graphRef.current?.destroy()
			graphRef.current = null
			containerRef.current?.replaceChildren()
		},
		[],
	)

	return (
		<figure className="force-graph">
			<div className="force-graph__canvas" ref={containerRef} />
			{data && (
				<p className="force-graph__counter">
					Нод: {data.nodes.length}, рёбер: {data.links.length}
				</p>
			)}
			{!data && <p className="force-graph__status">Загрузка графа…</p>}
		</figure>
	)
}
