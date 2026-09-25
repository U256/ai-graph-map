/**
 * Базовый слой svg: набор однотипных элементов, у каждого — свой ключ. Слой хранит соответствие
 * ключ → элемент и на каждом `sync` проходит по предыдущему состоянию: добавляет новые элементы,
 * обновляет нужные и убирает те, чьих данных больше нет. Так граф перерисовывается инкрементально,
 * а не собирается заново на каждое изменение данных.
 */

/** Ключ элемента в слое — строка из `forceGraphUpdate` (`nodeKey` / `linkKey`). */
export type LayerKey = string

export interface LayerEntry<T> {
	element: Element
	datum: T
}

export interface SyncResult {
	added: number
	updated: number
	removed: number
}

/** Слой рисует элемент по данным и умеет обновлять уже нарисованный. */
export interface LayerRenderer<T> {
	/** Создать элемент для новых данных и вернуть его корневой узел. */
	create(datum: T, index: number): Element
	/**
	 * Допписать данные в уже нарисованный элемент. Вызывается на каждый `sync`, поэтому тяжёлое
	 * (раскладку, мерку текста) сам элемент должен уметь пропускать, когда его данные не менялись.
	 */
	update(entry: LayerEntry<T>): void
}

/**
 * Снять элемент с DOM и с себя. `__data__` удаляем обязательно: иначе снятый узел продолжает
 * держать объект симуляции, а тот через концы связей — весь прежний граф.
 */
function forgetElement(element: Element): void {
	// eslint-disable-next-line no-param-reassign
	delete (element as unknown as { __data__?: unknown }).__data__
	element.remove()
}

export class GraphLayer<T> {
	private entries = new Map<LayerKey, LayerEntry<T>>()

	private readonly layer: SVGGElement

	private readonly keyOf: (datum: T) => LayerKey

	private readonly renderer: LayerRenderer<T>

	constructor(layer: SVGGElement, keyOf: (datum: T) => LayerKey, renderer: LayerRenderer<T>) {
		this.layer = layer
		this.keyOf = keyOf
		this.renderer = renderer
	}

	get size(): number {
		return this.entries.size
	}

	/**
	 * Привести слой к новым данным. `data` — полный список сущностей: прежние элементы остаются как
	 * есть (им только дописываются атрибуты), новые добавляются в конец, лишние удаляются.
	 */
	sync(data: T[]): SyncResult {
		const wanted = new Map<LayerKey, T>()

		data.forEach((datum) => wanted.set(this.keyOf(datum), datum))

		let added = 0
		let updated = 0

		wanted.forEach((datum, key) => {
			const entry = this.entries.get(key)

			if (entry) {
				entry.datum = datum
				this.renderer.update(entry)
				updated += 1
				return
			}

			const element = this.renderer.create(datum, added)
			// данные вешаем на элемент: по ним d3-drag и подсказка находят свою сущность
			;(element as unknown as { __data__: T }).__data__ = datum
			this.entries.set(key, { element, datum })
			added += 1
		})

		const removed = this.removeStale(wanted)

		// append-ится только то, чего ещё нет: существующие дети остаются на своих местах
		this.entries.forEach(({ element }) => {
			if (element.parentNode !== this.layer) this.layer.appendChild(element)
		})

		return { added, updated, removed }
	}

	/** Вызывается на каждый тик: элемент получает координаты из своих данных. */
	draw(tick: (entry: LayerEntry<T>) => void): void {
		this.entries.forEach((entry) => tick(entry))
	}

	/** Убрать все элементы слоя (используется при удалении сцены целиком). */
	clear(): void {
		this.entries.forEach(({ element }) => forgetElement(element))
		this.entries.clear()
	}

	private removeStale(wanted: Map<LayerKey, unknown>): number {
		let removed = 0

		this.entries.forEach((entry, key) => {
			if (wanted.has(key)) return
			forgetElement(entry.element)
			this.entries.delete(key)
			removed += 1
		})

		return removed
	}
}
