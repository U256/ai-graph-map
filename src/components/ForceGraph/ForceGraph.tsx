import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { GraphData } from '../../types/graph'
import type { GraphSettings } from '../../types/settings'
import './ForceGraph.css'
import type { GraphPhysics } from './forceGraph'
import { createForceGraph, type ForceGraphHandle } from './forceGraphView'

type ForceGraphProps = {
	data: GraphData | null
	settings: GraphSettings
	onNodeClick?: (id: string) => void
}

export function ForceGraph({ data: originalData, settings, onNodeClick }: ForceGraphProps) {
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
		if (!originalData || nodeClones <= 1) {
			return originalData
		}
		const cloned: GraphData = { nodes: [...originalData.nodes], links: [...originalData.links] }
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

	const graphRef = useRef<ForceGraphHandle | null>(null)
	const mountedData = useRef<GraphData | null>(null)
	// `useMemo` отдаёт новый объект только когда поменялось хотя бы одно значение, поэтому пропуск
	// ниже не мешает доставке правок
	const mountedPhysics = useRef<GraphPhysics | null>(null)
	// сцена создаётся один раз, а колбэк клика пересоздаётся с родителем: наружу уходит обёртка,
	// читающая актуальное замыкание из ref
	const nodeClickRef = useRef(onNodeClick)
	nodeClickRef.current = onNodeClick
	const handleNodeClick = useCallback((id: string) => nodeClickRef.current?.(id), [])

	// React владеет только контейнером, svg императивный. Разрушение сцены — отдельный эффект ниже:
	// в cleanup этого она пересобирала бы svg на каждую смену зависимости
	useEffect(() => {
		const container = containerRef.current
		if (!container || !data) return
		const graph = graphRef.current
		if (!graph) {
			const next = createForceGraph(data, { ...physics, onNodeClick: handleNodeClick })
			graphRef.current = next
			mountedData.current = data
			mountedPhysics.current = physics
			container.replaceChildren(next.svg)
			return
		}
		if (data !== mountedData.current) {
			graph.update(data)
			mountedData.current = data
		}
		// без пропуска `setPhysics` всякий раз поднимал бы `alpha`: остывшая карта дёргалась бы
		// на каждое изменение данных, даже когда физика не менялась
		if (physics !== mountedPhysics.current) {
			graph.setPhysics(physics)
			mountedPhysics.current = physics
		}
	}, [data, physics, handleNodeClick])

	// в StrictMode этот cleanup запускается между двумя прогонами эффектов, и создание выше
	// отрабатывает заново — на экране остаётся живой svg
	useEffect(
		() => () => {
			graphRef.current?.destroy()
			graphRef.current = null
			mountedData.current = null
			mountedPhysics.current = null
			containerRef.current?.replaceChildren()
		},
		[],
	)

	return (
		<figure className="force-graph">
			<div className="force-graph__canvas" ref={containerRef} />
			{!data && <p className="force-graph__status">Загрузка графа…</p>}
		</figure>
	)
}
