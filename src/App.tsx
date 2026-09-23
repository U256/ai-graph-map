import { useState } from 'react'
import './App.css'
import ForceGraph from './components/ForceGraph/ForceGraph'
import SettingsPanel from './components/SettingsPanel/SettingsPanel'
import { loadGraphSettings } from './components/SettingsPanel/settingsPanel'
import type { GraphSettings } from './types/settings'

/**
 * Каркас страницы: хедер с заголовком, слева `aside` с панелью настроек, справа `main` с картой
 * графа, снизу пустой футер. Ширину и высоту колонок задаёт `App.css`, карта занимает остаток main.
 * Настройки живут в стейте: панель их меняет, карта получает их пропом.
 */
function App() {
	// стартовые значения — из localStorage (ленивая инициализация: читаем один раз при монтировании)
	const [settings, setSettings] = useState<GraphSettings>(loadGraphSettings)

	return (
		<div className="app">
			<header className="app__header">
				<h1 className="app__title">Карта</h1>
			</header>
			<div className="app__body">
				<aside className="app__aside">
					<SettingsPanel initialSettings={settings} onApply={setSettings} />
				</aside>
				<main className="app__main">
					<ForceGraph settings={settings} />
				</main>
			</div>
			<footer className="app__footer" />
		</div>
	)
}

export default App
