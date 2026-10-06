import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom'

/** Создаёт pan/zoom Canvas; фильтрация жеста над узлом остаётся у renderer-а. */
export function attachCanvasPanZoom(
	canvas: HTMLCanvasElement,
	zoomIndicator: HTMLDivElement,
	onTransform: (transform: ZoomTransform) => void,
	onScale: (scale: number) => void,
	isNodeAt: (x: number, y: number) => boolean,
) {
	let current = zoomIdentity
	const indicator = zoomIndicator
	const zoomExtent: [number, number] = [0.1, 8]
	const viewCenter: [number, number] = [0, 0]
	const pointerPosition = (event: MouseEvent | WheelEvent): [number, number] => {
		const rect = canvas.getBoundingClientRect()
		const scale = Math.min(rect.width / 928, rect.height / 680)
		return [
			(event.clientX - rect.left - rect.width / 2) / scale,
			(event.clientY - rect.top - rect.height / 2) / scale,
		]
	}
	const behavior = zoom<HTMLCanvasElement, unknown>()
		.scaleExtent(zoomExtent)
		.filter((event) => event.type === 'wheel' || !isNodeAt(event.clientX, event.clientY))
		.on('zoom', (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
			current = event.transform
			onTransform(current)
			onScale(current.k)
			indicator.textContent = `Зум: ${current.k.toFixed(1)}`
		})
	select(canvas)
		.call(behavior)
		.on('wheel.zoom', (event) => {
			const wheel = event as WheelEvent
			const delta = -wheel.deltaY * (wheel.deltaMode === 1 ? 0.05 : 0.002)
			select(canvas).call(behavior.scaleBy, 2 ** delta, pointerPosition(wheel))
			wheel.preventDefault()
		})
	const setTransform = (transform: ZoomTransform) => select(canvas).call(behavior.transform, transform)
	const controls = {
		resetZoom: () => setTransform(zoomIdentity),
		zoomIn: () => {
			const { k } = current
			const step = k > 0.7 ? 0.3 : 0.1
			return select(canvas).call(behavior.scaleBy, Math.min(zoomExtent[1], k + step) / k, viewCenter)
		},
		zoomOut: () => {
			const { k } = current
			const step = k > 1.3 ? 0.3 : 0.1
			return select(canvas).call(behavior.scaleBy, Math.max(zoomExtent[0], k - step) / k, viewCenter)
		},
	}
	return {
		controls,
		getTransform: () => current,
		setTransform,
		destroy: () => {
			select(canvas).on('.zoom', null)
		},
	}
}
