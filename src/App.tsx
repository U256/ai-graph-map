import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { ForceGraph } from './components/ForceGraph/ForceGraph'
import { addNode, makeCoordinates, removeNode } from './components/ForceGraph/graphApi'
import { NodeForm } from './components/SettingsPanel/NodeForm'
import {
	type NodeCreateDraft,
	type NodeDraft,
	createNodeInData,
	updateNodeInData,
} from './components/SettingsPanel/nodeForm'
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel'
import { loadGraphSettings } from './components/SettingsPanel/settingsPanel'
import { graphData } from './data/graph'
import { graphData as graphMini1 } from './data/graphMini1'
import { graphData as graphMini2 } from './data/graphMini2'
import { graphData as graphMini3 } from './data/graphMini3'
import { type GraphData } from './types/graph'
import type { GraphSettings } from './types/settings'
import { multiplyWithClones } from './utils/graphUtlis'

/** Данные подключены модулем, поэтому загрузка только эмулируется. */
const LOAD_DELAY_MS = 400

type PanelView = { kind: 'settings' } | { kind: 'create' } | { kind: 'edit'; id: string }

/** Форма новой ноды может открыться до загрузки данных, а варианты соседей ей нужны. */
const EMPTY_DATA: GraphData = { nodes: [], links: [] }

function sourceGraph(nodeClones: GraphSettings['nodeClones']): GraphData {
	if (nodeClones === 'mini1') return graphMini1
	if (nodeClones === 'mini2') return graphMini2
	if (nodeClones === 'mini3') return graphMini3
	return graphData
}

export function App() {
	// ленивая инициализация: localStorage читается один раз при монтировании
	const [settings, setSettings] = useState<GraphSettings>(loadGraphSettings)

	const [data, setData] = useState<GraphData | null>(null)
	useEffect(() => {
		let active = true
		const timer = setTimeout(() => {
			const source = sourceGraph(settings.nodeClones)
			const prepared =
				typeof settings.nodeClones === 'number' ? multiplyWithClones(source, settings.nodeClones) : source
			makeCoordinates(prepared, true).then((positioned) => {
				if (active) setData(positioned)
			})
		}, LOAD_DELAY_MS)
		return () => {
			active = false
			clearTimeout(timer)
		}
	}, [settings.nodeClones])

	const [panel, setPanel] = useState<PanelView>({ kind: 'settings' })
	const selected = panel.kind === 'edit' ? data?.nodes.find((node) => node.id === panel.id) : undefined
	// выбранного узла больше нет в данных — его удалили из этой же формы: панель возвращается к настройкам
	const view: PanelView = panel.kind === 'edit' && !selected ? { kind: 'settings' } : panel

	const handleNodeClick = useCallback(
		(id: string) => {
			// клик по копии (`2-…`) ничего не открывает: правка клона смысла не имеет
			if (!data?.nodes.some((node) => node.id === id)) return
			setPanel({ kind: 'edit', id })
		},
		[data],
	)

	const handleVisibleGroupsChange = useCallback((ids: string[]) => {
		// Временный вывод нужен для проверки передачи видимых групп до App.
		// eslint-disable-next-line no-console
		console.log('Видимые группы:', ids)
	}, [])

	const handleCreate = useCallback(
		async (draft: NodeCreateDraft, neighbors: string[]) => {
			if (!data) return
			const next = createNodeInData(data, draft, neighbors)
			const node = next.nodes[next.nodes.length - 1]
			const links = next.links.slice(data.links.length)
			setData(await addNode(data, node, links))
			setPanel({ kind: 'settings' })
		},
		[data],
	)

	// после сохранения панель остаётся открытой: форма показывает те же значения, что ушли в данные
	const handleUpdate = useCallback(
		async (id: string, draft: NodeDraft) => {
			if (!data) return
			setData(await makeCoordinates(updateNodeInData(data, id, draft)))
		},
		[data],
	)

	const handleDelete = useCallback(
		async (id: string) => {
			if (!data) return
			setData(await removeNode(data, id))
			setPanel({ kind: 'settings' })
		},
		[data],
	)

	const startCreate = useCallback(() => setPanel({ kind: 'create' }), [])
	const backToSettings = useCallback(() => setPanel({ kind: 'settings' }), [])

	return (
		<div className="app">
			<header className="app__header">
				<h1 className="app__title">Карта</h1>
			</header>
			<div className="app__body">
				<aside className="app__aside">
					{view.kind === 'settings' ? (
						<SettingsPanel initialSettings={settings} onApply={setSettings} onStartCreate={startCreate} />
					) : (
						// значения узла форма читает при монтировании: без перемонтирования переход к другой ноде показал бы поля прежней
						<NodeForm
							key={view.kind === 'edit' ? view.id : 'create'}
							node={selected ?? null}
							data={data ?? EMPTY_DATA}
							onCreate={handleCreate}
							onUpdate={handleUpdate}
							onDelete={handleDelete}
							onCancel={backToSettings}
						/>
					)}
				</aside>
				<main className="app__main">
					<ForceGraph
						settings={settings}
						data={data}
						selectedNodeId={view.kind === 'edit' ? view.id : null}
						onNodeClick={handleNodeClick}
						onVisibleGroupsChange={handleVisibleGroupsChange}
					/>
				</main>
			</div>
			<footer className="app__footer" />
		</div>
	)
}
