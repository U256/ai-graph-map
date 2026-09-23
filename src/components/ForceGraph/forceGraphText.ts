import { FONT_FAMILY, type MeasureText } from './forceGraphCloud'

/** Если контекста канвы нет (тестовое окружение, старый браузер) — грубая оценка по числу символов. */
const FALLBACK_CHAR_WIDTH = 0.55

/**
 * Мерка текста через offscreen-канву: ширину строки в пикселях сцены считает сам браузер, той же
 * гарнитурой, которой текст потом рисуется. Канва и контекст создаются один раз на вызов, шрифт
 * переставляется только при смене кегля, поэтому измерение всех узлов графа стоит дёшево.
 * Модуль ничего не рисует: svg собирает `forceGraphView.ts`, а сама мерка передаётся туда
 * зависимостью — так `forceGraphCloud.ts` остаётся чистым и проверяемым в Node.
 */
export function createTextMeasurer(): MeasureText {
	const context = document.createElement('canvas').getContext('2d')
	if (!context) return (text, fontSize) => text.length * fontSize * FALLBACK_CHAR_WIDTH

	let currentFontSize = 0
	return (text, fontSize) => {
		if (currentFontSize !== fontSize) {
			context.font = `${fontSize}px ${FONT_FAMILY}`
			currentFontSize = fontSize
		}
		return context.measureText(text).width
	}
}
