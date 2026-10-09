/** Рисует знак облака в центре иконки патента без загрузки внешнего изображения. */
export function drawSubNodeIcon(context: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    context.beginPath();
    context.moveTo(x - 9, y + 9);
    context.bezierCurveTo(x - 15, y + 9, x - 15, y - 2, x - 9, y - 3);
    context.bezierCurveTo(x - 8, y - 9, x - 1, y - 11, x + 3, y - 7);
    context.bezierCurveTo(x + 9, y - 9, x + 13, y - 4, x + 12, y + 1);
    context.bezierCurveTo(x + 17, y + 6, x + 12, y + 9, x + 8, y + 9);
    context.closePath();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
}
