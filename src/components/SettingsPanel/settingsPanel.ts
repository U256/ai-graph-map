import type { GraphSettings } from '../../types/settings'
import {
	CHARGE_STRENGTH,
	DRAG_ALPHA_TARGET,
	LAYOUT_SCALE,
	LINK_DISTANCE,
	LINK_STRENGTH,
	UPDATE_ALPHA,
	VELOCITY_DECAY,
} from '../ForceGraph/forceGraph'

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
	{ value: 30, label: 'Большой граф Х30' },
	{ value: 50, label: 'Большой граф Х50' },
	{ value: 'mini1', label: 'Мини-граф на 15 нод' },
	{ value: 'mini2', label: 'Мини-граф на 40 нод' },
	{ value: 'mini3', label: 'Мини-граф на 90 нод' },
] as const

/** Пределы и шаг range-а; дефолты берутся у констант сцены, чтобы панель не разъезжалась с кодом. */
export interface NumberFieldSpec {
	key: keyof Pick<
		GraphSettings,
		| 'layoutScale'
		| 'linkDistance'
		| 'linkStrength'
		| 'chargeStrength'
		| 'velocityDecay'
		| 'dragAlphaTarget'
		| 'updateAlpha'
	>
	min: number
	max: number
	step: number
	label: string
	/** Короткое пояснение — в `title` контрола. */
	hint: string
}

export const NUMBER_FIELDS: NumberFieldSpec[] = [
	{
		key: 'layoutScale',
		min: 1,
		max: 20,
		step: 1,
		label: 'Растяжка раскладки',
		hint: 'Простор между несвязанными узлами: он растёт как квадрат этого числа.',
	},
	{
		key: 'linkDistance',
		min: 20,
		max: 400,
		step: 10,
		label: 'Дистанция связи',
		hint: 'Плотность связок внутри кластера: короче — связанные узлы стоят ближе.',
	},
	{
		key: 'linkStrength',
		min: 0,
		max: 1,
		step: 0.05,
		label: 'Крепость связи',
		hint: 'Как крепко концы держатся друг за друга; плоская для всех связей.',
	},
	{
		key: 'chargeStrength',
		min: -80,
		max: -5,
		step: 5,
		label: 'Сила заряда',
		hint: 'Отталкивание узлов: сильнее по модулю — больше простор между ними.',
	},
	{
		key: 'velocityDecay',
		min: 0.1,
		max: 0.95,
		step: 0.05,
		label: 'Демпфирование',
		hint: 'Доля скорости, теряемая за тик: выше — карта останавливается быстрее.',
	},
	{
		key: 'dragAlphaTarget',
		min: 0,
		max: 0.3,
		step: 0.01,
		label: 'Разогрев drag’а',
		hint: 'Насколько сильно карта едет, пока тащишь один узел.',
	},
	{
		key: 'updateAlpha',
		min: 0,
		max: 1,
		step: 0.05,
		label: 'Разогрев обновления',
		hint: 'Насколько заметно перекладывается карта после изменения данных.',
	},
]

/** С них форма стартует и к ним же возвращает кнопка «Сбросить». */
export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
	nodeClones: 1,
	showFullSubNodes: false,
	hideSubNodes: false,
	layoutScale: LAYOUT_SCALE,
	linkDistance: LINK_DISTANCE,
	linkStrength: LINK_STRENGTH,
	chargeStrength: CHARGE_STRENGTH,
	velocityDecay: VELOCITY_DECAY,
	dragAlphaTarget: DRAG_ALPHA_TARGET,
	updateAlpha: UPDATE_ALPHA,
}

/** Ключ localStorage, под которым лежат применённые настройки. */
export const GRAPH_SETTINGS_STORAGE_KEY = 'ai-graph-map:graph-settings'

/** Копия значений по умолчанию: форма работает с объектом настроек, а константу мутировать нельзя. */
function createDefaultSettings(): GraphSettings {
	return { ...DEFAULT_GRAPH_SETTINGS }
}

/**
 * Чужой или устаревший объект отбрасывается целиком, а не по полям: частичный разбор дал бы смешанные
 * настройки, где одно поле из старой версии, а другое — из сохранённых. Пределы берутся у
 * `NUMBER_FIELDS`, чтобы не поддерживать их в двух местах.
 */
function isGraphSettings(value: unknown): value is GraphSettings {
	if (typeof value !== 'object' || value === null) return false
	const settings = value as Partial<Record<keyof GraphSettings, unknown>>
	const clonesMatch = NODE_CLONES_OPTIONS.some((option) => option.value === settings.nodeClones)
	if (!clonesMatch) return false
	if (typeof settings.showFullSubNodes !== 'boolean' || typeof settings.hideSubNodes !== 'boolean') return false

	return NUMBER_FIELDS.every(({ key, min, max }) => {
		const field = settings[key]
		return typeof field === 'number' && Number.isFinite(field) && field >= min && field <= max
	})
}

/** Битый JSON, `null` и чужие значения дают настройки по умолчанию. */
export function parseGraphSettings(raw: string | null): GraphSettings {
	if (!raw) return createDefaultSettings()
	try {
		const parsed: unknown = JSON.parse(raw)
		return isGraphSettings(parsed) ? parsed : createDefaultSettings()
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
