/** Диаметр группы на пороге раскрытия. */
export const GROUP_FOCUS_SIZE = 200

/** Контрольный диаметр группы из 40 элементов. */
export const GROUP_FOCUS_SIZE_AT_40 = 370

/** Степень роста диаметра группы по числу непосредственных элементов. */
export const GROUP_FOCUS_SIZE_EXPONENT = 0.7

/** Диаметр группы при приближении; одна формула используется физикой и Canvas. */
export function groupFocusSize(elementCount: number): number {
	const progress = Math.max(0, (elementCount - 15) / (40 - 15))
	return GROUP_FOCUS_SIZE + (GROUP_FOCUS_SIZE_AT_40 - GROUP_FOCUS_SIZE) * progress ** GROUP_FOCUS_SIZE_EXPONENT
}

/** Множитель заряда пропорционален площади группы, а не её диаметру. */
export function groupChargeMultiplier(elementCount: number): number {
	const radius = groupFocusSize(elementCount) / 2
	const baseRadius = GROUP_FOCUS_SIZE / 2
	return Math.max(1, (radius / baseRadius) ** 2)
}
