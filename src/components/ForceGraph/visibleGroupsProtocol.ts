import type { VisibilityGroup, VisibilityViewport } from './visibleGroups'

/** Сообщение с чистым снимком сцены для расчёта видимых групп в worker-е. */
export interface VisibilityRequest {
	revision: number
	groups: VisibilityGroup[]
	viewport: VisibilityViewport
}

/** Ответ worker-а; revision не даёт опубликовать устаревший снимок. */
export interface VisibilityResponse {
	revision: number
	ids: string[]
}
