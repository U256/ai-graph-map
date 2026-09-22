import { forceCollide, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force'

/**
 * Перенос демо «Collision Detection» со страницы d3-force:
 * https://d3js.org/d3-force/collide (ноутбук observablehq.com/@d3/collision-detection/2).
 *
 * Физика и коэффициенты сил взяты из оригинала без изменений, отличается только отрисовка:
 * координаты считаются в «мировых» единицах (квадрат WORLD_SIZE), а канва масштабирует их
 * под свой реальный размер, поэтому круг одинаково выглядит на любом экране.
 */

/** Сколько кружков в симуляции — как в оригинальном демо. */
export const BUBBLE_COUNT = 1000

/** Радиус кружка в мировых единицах: Math.random() даёт равномерное число от RADIUS_MIN до RADIUS_MAX. */
export const RADIUS_MIN = 4
export const RADIUS_MAX = 18

/**
 * Сторона квадрата в мировых единицах. Замеры симуляции: 1000 кружков сходятся в круг
 * внешним радиусом 429..445 ед., то есть половина мира (500) даёт запас и ничего не режет по краю.
 */
export const WORLD_SIZE = 1000

/** Цвета заливки и обводки кружков — из оригинала. */
const FILL_STYLE = '#ddd'
const STROKE_STYLE = '#333'

export interface Bubble extends SimulationNodeDatum {
	/** Радиус кружка, участвует в forceCollide. */
	r: number
}

export interface CanvasView {
	/** Сторона квадратной канвы в CSS-пикселях. */
	size: number
	/** Плотность пикселей экрана. */
	dpr: number
}

export function createBubbles(count: number = BUBBLE_COUNT): Bubble[] {
	return Array.from({ length: count }, () => ({ r: RADIUS_MIN + Math.random() * (RADIUS_MAX - RADIUS_MIN) }))
}

/**
 * Симуляция из демо: кружки слабо притягиваются к центру (forceX/forceY),
 * но не могут пересечься (forceCollide), из-за чего собираются в плотный круг.
 */
export function createSimulation(bubbles: Bubble[]): Simulation<Bubble, undefined> {
	return forceSimulation(bubbles)
		.velocityDecay(0.2)
		.force('x', forceX<Bubble>().strength(0.002))
		.force('y', forceY<Bubble>().strength(0.002))
		.force(
			'collide',
			forceCollide<Bubble>()
				.radius((bubble) => bubble.r + 0.5)
				.iterations(2),
		)
}

/**
 * Рисует кадр симуляции: мировые координаты переводятся в пиксели канвы,
 * начало координат — в её центр (x/y кружков центрированы вокруг нуля).
 */
export function drawBubbles(ctx: CanvasRenderingContext2D, bubbles: Bubble[], view: CanvasView): void {
	const scale = (view.size / WORLD_SIZE) * view.dpr
	const center = (view.size * view.dpr) / 2

	ctx.setTransform(scale, 0, 0, scale, center, center)
	ctx.clearRect(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE)

	ctx.beginPath()
	bubbles.forEach((bubble) => {
		const x = bubble.x ?? 0
		const y = bubble.y ?? 0
		ctx.moveTo(x + bubble.r, y)
		ctx.arc(x, y, bubble.r, 0, 2 * Math.PI)
	})
	ctx.fillStyle = FILL_STYLE
	ctx.fill()
	ctx.strokeStyle = STROKE_STYLE
	ctx.stroke()
}
