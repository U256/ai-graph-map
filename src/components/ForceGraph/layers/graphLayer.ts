/**
 * Базовый слой svg: набор однотипных элементов с ключом. `sync` проходит по предыдущему состоянию —
 * так граф перерисовывается инкрементально, а не собирается заново на каждое изменение данных.
 */

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

export interface LayerRenderer<T, E extends LayerEntry<T> = LayerEntry<T>> {
	/**
	 * Слой сохраняет возвращённую запись целиком, поэтому `update` видит те же поля, что и `create`.
	 * Строил бы запись сам слой из возвращённого элемента — расширенная запись (`NodeEntry.parts`)
	 * терялась бы, и перерисовка существующего элемента падала на отсутствии поля.
	 */
	create(datum: T, index: number): E
	/** Вызывается только для элементов из `dirtyKeys`, чтобы тяжёлое (раскладку, мерку текста) слой не трогал на каждый `sync`. */
	update(entry: E): void
}

/** `__data__` удаляем обязательно: иначе снятый узел держит объект симуляции, а тот — весь прежний граф. */
function forgetElement(element: Element): void {
	// eslint-disable-next-line no-param-reassign
	delete (element as unknown as { __data__?: unknown }).__data__
	element.remove()
}

export class GraphLayer<T, E extends LayerEntry<T> = LayerEntry<T>> {
	private entries = new Map<LayerKey, E>()

	private readonly layer: SVGGElement

	private readonly keyOf: (datum: T) => LayerKey

	private readonly renderer: LayerRenderer<T, E>

	constructor(layer: SVGGElement, keyOf: (datum: T) => LayerKey, renderer: LayerRenderer<T, E>) {
		this.layer = layer
		this.keyOf = keyOf
		this.renderer = renderer
	}

	get size(): number {
		return this.entries.size
	}

	/**
	 * `data` — полный список сущностей: прежние элементы остаются как есть, новые добавляются, лишние
	 * удаляются. Перерисовка дописывается только элементам из `dirtyKeys`.
	 */
	sync(data: T[], dirtyKeys: Set<LayerKey> = new Set()): SyncResult {
		const wanted = new Map<LayerKey, T>()

		data.forEach((datum) => wanted.set(this.keyOf(datum), datum))

		let added = 0
		let updated = 0

		wanted.forEach((datum, key) => {
			const entry = this.entries.get(key)

			if (entry) {
				entry.datum = datum
				if (dirtyKeys.has(key)) {
					this.renderer.update(entry)
					updated += 1
				}
				return
			}

			const fresh = this.renderer.create(datum, added)
			// данные вешаем на элемент: по ним d3-drag и подсказка находят свою сущность
			;(fresh.element as unknown as { __data__: T }).__data__ = datum
			this.entries.set(key, fresh)
			added += 1
		})

		const removed = this.removeStale(wanted)

		// append-ится только то, чего ещё нет: существующие дети остаются на своих местах
		this.entries.forEach(({ element }) => {
			if (element.parentNode !== this.layer) this.layer.appendChild(element)
		})

		return { added, updated, removed }
	}

	draw(tick: (entry: LayerEntry<T>) => void): void {
		this.entries.forEach((entry) => tick(entry))
	}

	forEachEntry(callback: (entry: E) => void): void {
		this.entries.forEach(callback)
	}

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
