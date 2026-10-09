import { FONT_FAMILY, type MeasureText } from './nodeGeometry';

/** Нет контекста канвы (тестовое окружение, старый браузер) — грубая оценка по числу символов. */
const FALLBACK_CHAR_WIDTH = 0.55;

/**
 * Ширину строки считает сам браузер, той же гарнитурой, которой текст потом рисуется. Единственное
 * место, где ширина строки берётся у браузера: `nodeGeometry.ts` получает мерку аргументом и
 * остаётся проверяемым в Node.
 */
export function createTextMeasurer(): MeasureText {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return (text, fontSize) => text.length * fontSize * FALLBACK_CHAR_WIDTH;

    let currentFontSize = 0;
    return (text, fontSize) => {
        if (currentFontSize !== fontSize) {
            context.font = `${fontSize}px ${FONT_FAMILY}`;
            currentFontSize = fontSize;
        }
        return context.measureText(text).width;
    };
}
