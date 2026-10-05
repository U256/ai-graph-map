import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphData } from '../../types/graph'
import type { GraphSettings } from '../../types/settings'
import { multiplyWithClones } from '../../utils/graphUtlis'
import './ForceGraph.css'
import { createForceGraph, type ForceGraphHandle } from './forceGraphView'
import { makeCoordinates } from './graphApi'

type ForceGraphProps = {
	data: GraphData | null
	settings: GraphSettings
	selectedNodeId?: string | null
	onNodeClick?: (id: string) => void
}

export function ForceGraph({ data: originalData, settings, selectedNodeId = null, onNodeClick }: ForceGraphProps) {
	const { nodeClones } = settings

	const containerRef = useRef<HTMLDivElement | null>(null)
	// клоны снимаются с исходных данных, а не с уже расширенного массива: иначе клонировались бы
	// клоны и граф рос геометрически, а не в `nodeClones` раз
	const data = useMemo(() => {
		if (!originalData || typeof nodeClones === 'string' || nodeClones <= 1) {
			return originalData
		}
		return multiplyWithClones(originalData, nodeClones)
	}, [originalData, nodeClones])
	const graphRef = useRef<ForceGraphHandle | null>(null)
	const [layoutLoading, setLayoutLoading] = useState(false)
	// сцена создаётся один раз, а колбэк клика пересоздаётся с родителем: наружу уходит обёртка,
	// читающая актуальное замыкание из ref
	const nodeClickRef = useRef(onNodeClick)
	nodeClickRef.current = onNodeClick
	const handleNodeClick = useCallback((id: string) => nodeClickRef.current?.(id), [])

	// React владеет только контейнером, Canvas императивный. Разрушение сцены — отдельный эффект ниже:
	// в cleanup этого она пересобирала бы Canvas на каждую смену зависимости
	useEffect(() => {
		const container = containerRef.current
		let active = true
		if (container && data) {
			const needsCoordinates = typeof nodeClones === 'number' && nodeClones > 1
			if (needsCoordinates) setLayoutLoading(true)
			const positionedData = needsCoordinates ? makeCoordinates(data, true) : Promise.resolve(data)
			positionedData
				.then((positioned) => {
					if (!active) return
					if (graphRef.current) {
						graphRef.current.updateData(positioned)
						setLayoutLoading(false)
						return
					}
					const next = createForceGraph(positioned, {
						onNodeClick: handleNodeClick,
					})
					graphRef.current = next
					container.replaceChildren(next.canvas, next.zoomIndicator, next.zoomControls)
					setLayoutLoading(false)
				})
				.catch((error: unknown) => {
					if (!active) return
					// eslint-disable-next-line no-console
					console.error('Не удалось получить раскладку графа', error)
					setLayoutLoading(false)
				})
			return () => {
				active = false
			}
		}
		return () => {
			active = false
		}
	}, [data, handleNodeClick, nodeClones])

	useEffect(() => {
		graphRef.current?.setSelectedNode(selectedNodeId)
	}, [selectedNodeId])

	// в StrictMode этот cleanup запускается между двумя прогонами эффектов, и создание выше
	// отрабатывает заново — на экране остаётся живой Canvas
	useEffect(
		() => () => {
			graphRef.current?.destroy()
			graphRef.current = null
			setLayoutLoading(false)
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
			{data && layoutLoading && <p className="force-graph__loading">Расчёт раскладки…</p>}
		</figure>
	)
}
