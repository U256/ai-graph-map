/**
 * Настройки карты, которые собирает панель слева. Значения физики доезжают до `ForceGraph` и
 * применяются к уже собранной сцене без её пересборки.
 */
export type GraphSettings = {
	/** Вариант набора нод: большой граф с множителем или один из мини-графов. */
	nodeClones: number | 'mini1' | 'mini2' | 'mini3'
	dynamicGraph: boolean
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
