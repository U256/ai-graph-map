import type { GraphSettings } from '../../types/settings'

/**
 * Настройки карты без DOM и React. Разбор строки из хранилища (`parseGraphSettings`) — чистая функция,
 * поэтому проверяется в Node; работу с самим хранилищем делают `loadGraphSettings`/`saveGraphSettings`.
 */

export const NODE_CLONES_OPTIONS = [
	{ value: 1, label: 'Большой граф' },
	{ value: 2, label: 'Большой граф Х2' },
	{ value: 3, label: 'Большой граф Х3' },
	{ value: 5, label: 'Большой граф Х5' },
	{ value: 10, label: 'Большой граф Х10' },
	{ value: 'mini1', label: 'Мини-граф на 15 нод' },
	{ value: 'mini2', label: 'Мини-граф на 40 нод' },
	{ value: 'mini3', label: 'Мини-граф на 90 нод' },
] as const

/** С них форма стартует и к ним же возвращает кнопка «Сбросить». */
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
 * Чужой или устаревший объект отбрасывается целиком, а не по полям: частичный разбор дал бы смешанные
 * настройки, где одно поле из старой версии, а другое — из сохранённых.
 */
function isGraphSettings(value: unknown): value is GraphSettings {
	if (typeof value !== 'object' || value === null) return false
	const settings = value as Partial<Record<keyof GraphSettings, unknown>>
	const clonesMatch = NODE_CLONES_OPTIONS.some((option) => option.value === settings.nodeClones)
	if (!clonesMatch) return false
	return typeof settings.showFullSubNodes === 'boolean' && typeof settings.hideSubNodes === 'boolean'
}

/** Битый JSON, `null` и чужие значения дают настройки по умолчанию. */
export function parseGraphSettings(raw: string | null): GraphSettings {
	if (!raw) return createDefaultSettings()
	try {
		const parsed: unknown = JSON.parse(raw)
		return isGraphSettings(parsed)
			? {
					nodeClones: parsed.nodeClones,
					showFullSubNodes: parsed.showFullSubNodes,
					hideSubNodes: parsed.hideSubNodes,
				}
			: createDefaultSettings()
	} catch {
		return createDefaultSettings()
	}
}

/** Пустое или недоступное хранилище — значения по умолчанию. */
export function loadGraphSettings(): GraphSettings {
	try {
		return parseGraphSettings(window.localStorage.getItem(GRAPH_SETTINGS_STORAGE_KEY))
	} catch {
		// приватный режим или политики браузера могут запретить доступ к хранилищу целиком
		return createDefaultSettings()
	}
}

/** Неудачная запись страницу не ломает. */
export function saveGraphSettings(settings: GraphSettings): void {
	try {
		window.localStorage.setItem(GRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
	} catch {
		// квота или запрет записи: настройки просто не переживут перезагрузку страницы
	}
}
