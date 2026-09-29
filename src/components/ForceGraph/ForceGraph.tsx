import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphData } from '../../types/graph'
import type { GraphSettings } from '../../types/settings'
import { multiplyWithClones } from '../../utils/graphUtlis'
import './ForceGraph.css'
import type { GraphPhysics } from './forceGraph'
import { createForceGraph, type ForceGraphHandle } from './forceGraphView'
import { applyInitialLayout, calculateInitialLayout } from './initialLayout'

type ForceGraphProps = {
	data: GraphData | null
	settings: GraphSettings
	selectedNodeId?: string | null
	onNodeClick?: (id: string) => void
}

export function ForceGraph({ data: originalData, settings, selectedNodeId = null, onNodeClick }: ForceGraphProps) {
	const {
		nodeClones,
		layoutScale,
		linkDistance,
		linkStrength,
		chargeStrength,
		velocityDecay,
		dragAlphaTarget,
		updateAlpha,
	} = settings

	// useMemo нужен, чтобы эффект ниже не срабатывал на каждый рендер
	const physics = useMemo<GraphPhysics>(
		() => ({ layoutScale, linkDistance, linkStrength, chargeStrength, velocityDecay, dragAlphaTarget, updateAlpha }),
		[layoutScale, linkDistance, linkStrength, chargeStrength, velocityDecay, dragAlphaTarget, updateAlpha],
	)

	const containerRef = useRef<HTMLDivElement | null>(null)

	// клоны снимаются с исходных данных, а не с уже расширенного массива: иначе клонировались бы
	// клоны и граф рос геометрически, а не в `nodeClones` раз
	const data = useMemo(() => {
		if (!originalData || typeof nodeClones === 'string' || nodeClones <= 1) {
			return originalData
		}
		return multiplyWithClones(originalData, nodeClones)
	}, [originalData, nodeClones])
	// Зависимость по значениям нужна для правок, которые могли изменить данные на месте: одна ссылка на
	// GraphData тогда не меняется, а множитель заряда всё равно обязан перезапустить расчёт worker.
	const dataRevision = data
		? JSON.stringify({
				nodes: data.nodes,
				links: data.links,
			})
		: ''

	const graphRef = useRef<ForceGraphHandle | null>(null)
	const [layoutLoading, setLayoutLoading] = useState(false)
	// сцена создаётся один раз, а колбэк клика пересоздаётся с родителем: наружу уходит обёртка,
	// читающая актуальное замыкание из ref
	const nodeClickRef = useRef(onNodeClick)
	nodeClickRef.current = onNodeClick
	const handleNodeClick = useCallback((id: string) => nodeClickRef.current?.(id), [])

	// React владеет только контейнером, svg императивный. Разрушение сцены — отдельный эффект ниже:
	// в cleanup этого она пересобирала бы svg на каждую смену зависимости
	useEffect(() => {
		const container = containerRef.current
		let cancelLayout = () => {}
		const graph = graphRef.current
		if (container && data) {
			const zoomTransform = graph?.getZoomTransform()
			setLayoutLoading(true)
			const measureStart = performance.now()
			let active = true
			const layout = calculateInitialLayout(data, physics)
			layout.promise
				.then((positions) => {
					if (!active) return
					// eslint-disable-next-line no-console
					console.log(
						`Узлов: ${data.nodes.length}, рёбер: ${data.links.length}, время: ${(performance.now() - measureStart).toFixed(2)} ms`,
					)
					const next = createForceGraph(applyInitialLayout(data, positions), {
						onNodeClick: handleNodeClick,
					})
					graph?.destroy()
					graphRef.current = next
					container.replaceChildren(next.svg, next.zoomIndicator, next.zoomControls)
					if (zoomTransform) next.setZoomTransform(zoomTransform)
					setLayoutLoading(false)
				})
				.catch(() => {
					if (!active) return
					const next = createForceGraph(data, { onNodeClick: handleNodeClick })
					graph?.destroy()
					graphRef.current = next
					container.replaceChildren(next.svg, next.zoomIndicator, next.zoomControls)
					if (zoomTransform) next.setZoomTransform(zoomTransform)
					setLayoutLoading(false)
				})
			cancelLayout = () => {
				active = false
				layout.cancel()
			}
		}
		return () => cancelLayout()
	}, [data, dataRevision, physics, handleNodeClick])

	useEffect(() => {
		graphRef.current?.setSelectedNode(selectedNodeId)
	}, [selectedNodeId])

	// в StrictMode этот cleanup запускается между двумя прогонами эффектов, и создание выше
	// отрабатывает заново — на экране остаётся живой svg
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
