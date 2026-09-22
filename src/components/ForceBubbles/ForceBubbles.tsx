import type { Simulation } from 'd3-force'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bubble, CanvasView } from './forceBubbles'
import { BUBBLE_COUNT, WORLD_SIZE, createBubbles, createSimulation, drawBubbles } from './forceBubbles'
import './ForceBubbles.css'

export interface ForceBubblesProps {
	/** Сколько кружков запускать в симуляции. */
	count?: number
}

/** Круг из кружков с физикой d3-force: притяжение к центру и столкновения. */
function ForceBubbles({ count = BUBBLE_COUNT }: ForceBubblesProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const simulationRef = useRef<Simulation<Bubble, undefined> | null>(null)
	const viewRef = useRef<CanvasView>({ size: WORLD_SIZE, dpr: 1 })
	const [run, setRun] = useState(0)

	// читает актуальные позиции кружков и размер канвы из ссылок, поэтому не зависит от рендера
	const draw = useCallback(() => {
		const context = canvasRef.current?.getContext('2d')
		const bubbles = simulationRef.current?.nodes()
		if (context && bubbles) drawBubbles(context, bubbles, viewRef.current)
	}, [])

	// канва квадратная: буфер подгоняется под контейнер и плотность пикселей экрана
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return undefined
		const resize = () => {
			const size = canvas.clientWidth
			if (size === 0) return
			const dpr = window.devicePixelRatio || 1
			canvas.width = Math.round(size * dpr)
			canvas.height = Math.round(size * dpr)
			viewRef.current = { size, dpr }
			draw()
		}
		const observer = new ResizeObserver(resize)
		observer.observe(canvas)
		resize()
		return () => observer.disconnect()
	}, [draw])

	// сама симуляция: «Replay» (run) пересоздаёт кружки с их начальной раскладкой
	useEffect(() => {
		const simulation = createSimulation(createBubbles(count)).on('tick', draw)
		simulationRef.current = simulation
		draw()
		return () => {
			simulation.stop()
			simulationRef.current = null
		}
	}, [count, run, draw])

	return (
		<div className="force-bubbles">
			<canvas className="force-bubbles__canvas" ref={canvasRef} />
			<button className="force-bubbles__replay" type="button" onClick={() => setRun((value) => value + 1)}>
				Replay
			</button>
		</div>
	)
}

export default ForceBubbles
