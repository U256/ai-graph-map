import './App.css'
import ForceGraph from './components/ForceGraph/ForceGraph'

/**
 * Каркас страницы: хедер с заголовком, слева aside под панель, справа main с картой графа,
 * снизу пустой футер. Ширину и высоту колонок задаёт `App.css`, карта занимает остаток main.
 */
function App() {
	return (
		<div className="app">
			<header className="app__header">
				<h1 className="app__title">Карта</h1>
			</header>
			<div className="app__body">
				<aside className="app__aside" />
				<main className="app__main">
					<ForceGraph />
				</main>
			</div>
			<footer className="app__footer" />
		</div>
	)
}

export default App
