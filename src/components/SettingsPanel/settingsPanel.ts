import type { GraphSettings } from '../../types/settings'

/**
 * Настройки карты без DOM и React: значения по умолчанию, допустимые опции и хранение в
 * localStorage. Разбор строки из хранилища (`parseGraphSettings`) — чистая функция, поэтому
 * проверяется в Node без браузера; работу с самим хранилищем делают `loadGraphSettings` и
 * `saveGraphSettings`.
 */

/** Опции селекта «Клонировать ноды»: во сколько раз клонировать граф. */
export const NODE_CLONES_OPTIONS = [1, 2, 3, 5, 10] as const

/** Значения по умолчанию: с них форма стартует и к ним же возвращает кнопка «Сбросить». */
export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
	nodeClones: 1,
	showFullSubNodes: false,
	hideSubNodes: false,
}

/** Ключ localStorage, под которым лежат применённые настройки. */
export const GRAPH_SETTINGS_STORAGE_KEY = 'ai-graph-map:graph-settings'

/** Копия значений по умолчанию: форма работает с объектом настроек, а константу мутировать нельзя. */
function createDefaultSettings(): GraphSettings {
	return { ...DEFAULT_GRAPH_SETTINGS }
}

/**
 * Проверка, что из хранилища пришли именно настройки: число клонов должно быть одной из опций, а оба
 * флага — булевыми. Чужой или устаревший объект отбрасывается целиком, а не по полям: частичный
 * разбор дал бы смешанные настройки, где одно поле из старой версии, а другое — из сохранённых.
 */
function isGraphSettings(value: unknown): value is GraphSettings {
	if (typeof value !== 'object' || value === null) return false
	const settings = value as Partial<Record<keyof GraphSettings, unknown>>
	const clonesMatch = NODE_CLONES_OPTIONS.some((option) => option === settings.nodeClones)
	return clonesMatch && typeof settings.showFullSubNodes === 'boolean' && typeof settings.hideSubNodes === 'boolean'
}

/**
 * Разбор строки из хранилища (чистая функция, без обращения к браузеру): битый JSON, `null` и чужие
 * значения дают настройки по умолчанию.
 */
export function parseGraphSettings(raw: string | null): GraphSettings {
	if (!raw) return createDefaultSettings()
	try {
		const parsed: unknown = JSON.parse(raw)
		return isGraphSettings(parsed) ? parsed : createDefaultSettings()
	} catch {
		// в хранилище лежит не JSON: это не повод ломать панель, просто берём значения по умолчанию
		return createDefaultSettings()
	}
}

/** Читает применённые настройки из localStorage; пустое или недоступное хранилище — значения по умолчанию. */
export function loadGraphSettings(): GraphSettings {
	try {
		return parseGraphSettings(window.localStorage.getItem(GRAPH_SETTINGS_STORAGE_KEY))
	} catch {
		// приватный режим или политики браузера могут запретить доступ к хранилищу целиком
		return createDefaultSettings()
	}
}

/** Сохраняет применённые настройки в localStorage; неудачная запись страницу не ломает. */
export function saveGraphSettings(settings: GraphSettings): void {
	try {
		window.localStorage.setItem(GRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
	} catch {
		// квота или запрет записи: настройки просто не переживут перезагрузку страницы
	}
}
