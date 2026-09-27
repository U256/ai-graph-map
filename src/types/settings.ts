/**
 * Настройки карты, которые собирает панель слева. Значения физики доезжают до `ForceGraph` и
 * применяются к уже собранной сцене без её пересборки.
 */
export type GraphSettings = {
	/** Каждая копия — полная копия всех узлов и связей. */
	nodeClones: number
	showFullSubNodes: boolean
	hideSubNodes: boolean
	layoutScale: number
	linkDistance: number
	/** Плоская для всех связей. */
	linkStrength: number
	chargeStrength: number
	velocityDecay: number
	dragAlphaTarget: number
	updateAlpha: number
}
