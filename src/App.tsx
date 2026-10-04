import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { ForceGraph } from './components/ForceGraph/ForceGraph'
import { NodeForm } from './components/SettingsPanel/NodeForm'
import {
	type NodeCreateDraft,
	type NodeDraft,
	createNodeInData,
	deleteNodeFromData,
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

/** Данные подключены модулем, поэтому загрузка только эмулируется. */
const LOAD_DELAY_MS = 400

type PanelView = { kind: 'settings' } | { kind: 'create' } | { kind: 'edit'; id: string }

/** Форма новой ноды может открыться до загрузки данных, а варианты соседей ей нужны. */
const EMPTY_DATA: GraphData = { nodes: [], links: [] }

export function App() {
	// ленивая инициализация: localStorage читается один раз при монтировании
	const [settings, setSettings] = useState<GraphSettings>(loadGraphSettings)

	const [data, setData] = useState<GraphData | null>(null)
	useEffect(() => {
		const timer = setTimeout(() => {
			if (settings.nodeClones === 'mini1') setData(graphMini1)
			else if (settings.nodeClones === 'mini2') setData(graphMini2)
			else if (settings.nodeClones === 'mini3') setData(graphMini3)
			else setData(graphData)
		}, LOAD_DELAY_MS)
		return () => clearTimeout(timer)
	}, [settings.nodeClones])

	const [panel, setPanel] = useState<PanelView>({ kind: 'settings' })
	const selected = panel.kind === 'edit' ? data?.nodes.find((node) => node.id === panel.id) : undefined
	// выбранного узла больше нет в данных — его удалили из этой же формы: панель возвращается к настройкам
	const view: PanelView = panel.kind === 'edit' && !selected ? { kind: 'settings' } : panel

	// клик по копии (`2-…`) ничего не открывает: правка клона смысла не имеет, а id у копии генерный
	const handleNodeClick = useCallback(
		(id: string) => {
			if (!data?.nodes.some((node) => node.id === id)) return
			setPanel({ kind: 'edit', id })
		},
		[data],
	)

	const handleVisibleGroupsChange = useCallback((ids: string[]) => {
		// eslint-disable-next-line no-console
		console.log('Видимые группы:', ids)
	}, [])

	const handleCreate = useCallback((draft: NodeCreateDraft, neighbors: string[]) => {
		setData((current) => (current ? createNodeInData(current, draft, neighbors) : current))
		setPanel({ kind: 'settings' })
	}, [])

	// после сохранения панель остаётся открытой: форма показывает те же значения, что ушли в данные
	const handleUpdate = useCallback((id: string, draft: NodeDraft) => {
		setData((current) => (current ? updateNodeInData(current, id, draft) : current))
	}, [])

	const handleDelete = useCallback((id: string) => {
		setData((current) => (current ? deleteNodeFromData(current, id) : current))
		setPanel({ kind: 'settings' })
	}, [])

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
