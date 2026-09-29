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

	const graphRef = useRef<ForceGraphHandle | null>(null)
	const mountedData = useRef<GraphData | null>(null)
	// `useMemo` отдаёт новый объект только когда поменялось хотя бы одно значение, поэтому пропуск
	// ниже не мешает доставке правок
	const mountedPhysics = useRef<GraphPhysics | null>(null)
	const [layoutLoading, setLayoutLoading] = useState(false)
	const layoutDataRef = useRef<GraphData | null>(null)
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
		const previousData = mountedData.current
		const nodeDelta = previousData && data ? Math.abs(data.nodes.length - previousData.nodes.length) : 0
		const largeChange = Boolean(previousData && data && nodeDelta / Math.max(previousData.nodes.length, 1) >= 0.15)
		if (container && data && (!graph || largeChange)) {
			const zoomTransform = graph?.getZoomTransform()
			layoutDataRef.current = data
			setLayoutLoading(true)
			let active = true
			const layout = calculateInitialLayout(data, physics)
			layout.promise
				.then((positions) => {
					if (!active) return
					const next = createForceGraph(applyInitialLayout(data, positions), {
						...physics,
						initiallySettled: true,
						onNodeClick: handleNodeClick,
					})
					graph?.destroy()
					graphRef.current = next
					mountedData.current = data
					mountedPhysics.current = physics
					layoutDataRef.current = data
					container.replaceChildren(next.svg, next.zoomIndicator, next.zoomControls)
					if (zoomTransform) next.setZoomTransform(zoomTransform)
					setLayoutLoading(false)
				})
				.catch(() => {
					if (!active) return
					const next = createForceGraph(data, { ...physics, onNodeClick: handleNodeClick })
					graph?.destroy()
					graphRef.current = next
					mountedData.current = data
					mountedPhysics.current = physics
					layoutDataRef.current = data
					container.replaceChildren(next.svg, next.zoomIndicator, next.zoomControls)
					if (zoomTransform) next.setZoomTransform(zoomTransform)
					setLayoutLoading(false)
				})
			cancelLayout = () => {
				active = false
				layout.cancel()
			}
		} else if (container && data && graph) {
			if (data !== mountedData.current) {
				graph.update(data, true)
				mountedData.current = data
			}
			// без пропуска `setPhysics` всякий раз поднимал бы `alpha`: остывшая карта дёргалась бы
			// на каждое изменение данных, даже когда физика не менялась
			if (physics !== mountedPhysics.current) {
				graph.setPhysics(physics)
				mountedPhysics.current = physics
			}
		}
		return () => cancelLayout()
	}, [data, physics, handleNodeClick])

	useEffect(() => {
		graphRef.current?.setSelectedNode(selectedNodeId)
	}, [selectedNodeId])

	// в StrictMode этот cleanup запускается между двумя прогонами эффектов, и создание выше
	// отрабатывает заново — на экране остаётся живой svg
	useEffect(
		() => () => {
			graphRef.current?.destroy()
			graphRef.current = null
			mountedData.current = null
			mountedPhysics.current = null
			layoutDataRef.current = null
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
