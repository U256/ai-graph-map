import { useEffect, useMemo, useRef, useState } from 'react'
import { graphData } from '../../data/graph'
import type { GraphData } from '../../types/graph'
import type { GraphSettings } from '../../types/settings'
import './ForceGraph.css'
import type { GraphPhysics } from './forceGraph'
import { createForceGraph, type ForceGraphHandle } from './forceGraphView'

/** Данные подключены модулем, поэтому загрузка только эмулируется — чтобы состояние было заметно. */
const LOAD_DELAY_MS = 400

type ForceGraphProps = {
	settings: GraphSettings
}

export function ForceGraph({ settings }: ForceGraphProps) {
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

	// значения физики одним объектом: карта принимает их опциональными пропами и подставляет свои
	// константы там, где поля нет; useMemo нужен, чтобы эффект ниже не срабатывал на каждый рендер
	const physics = useMemo<GraphPhysics>(
		() => ({ layoutScale, linkDistance, linkStrength, chargeStrength, velocityDecay, dragAlphaTarget, updateAlpha }),
		[layoutScale, linkDistance, linkStrength, chargeStrength, velocityDecay, dragAlphaTarget, updateAlpha],
	)

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

	const graphRef = useRef<ForceGraphHandle | null>(null)
	const mountedData = useRef<GraphData | null>(null)
	// объекты физики сравниваются по идентичности: `useMemo` отдаёт новый объект только когда
	// поменялось хотя бы одно значение, поэтому пропуск ниже не мешает доставке правок
	const mountedPhysics = useRef<GraphPhysics | null>(null)

	// граф собирается императивно (d3-selection): React владеет только контейнером. Сцена создаётся,
	// как только приходят первые данные, и дальше правится на месте: `update` — на смену данных
	// (в том числе на клонирование нод), `setPhysics` — на смену значений физики. Разрушается сцена
	// только при размонтировании (эффект ниже): если разрушение лежит в cleanup этого же эффекта,
	// смена любой зависимости пересобирала бы svg, и инкрементальное обновление теряло бы смысл
	useEffect(() => {
		const container = containerRef.current
		if (!container || !data) return
		const graph = graphRef.current
		if (!graph) {
			const next = createForceGraph(data, physics)
			graphRef.current = next
			mountedData.current = data
			mountedPhysics.current = physics
			container.replaceChildren(next.svg)
			return
		}
		// пустой граф (`{ nodes: [], links: [] }`) — тоже загруженные данные: сцена обязана остаться
		if (data !== mountedData.current) {
			graph.update(data)
			mountedData.current = data
		}
		// без пропуска ниже `setPhysics` всякий раз поднимал бы `alpha`: остывшая карта дёргалась бы
		// на каждое изменение данных, даже когда значения физики не менялись
		if (physics !== mountedPhysics.current) {
			graph.setPhysics(physics)
			mountedPhysics.current = physics
		}
	}, [data, physics])

	// единственное место, где сцена уничтожается; в StrictMode этот cleanup запускается между двумя
	// прогонами эффектов, и создание выше отрабатывает заново — на экране остаётся живой svg
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
