import { tintToWhite } from '../../graph/nodeColors';
import {
    CLOUD_RADIUS,
    DESCRIPTION_FONT_SIZE,
    FONT_FAMILY,
    SUB_NODE_CORNER,
    TITLE_FONT_SIZE,
    WARNING_COLOR,
    WARNING_DOT_RADIUS,
    type CloudLayout,
} from '../../graph/nodeGeometry';
import type { GraphNode, GraphNodeType } from '../../types/graph';
import { drawSubNodeIcon } from './openLayerSubNodeIcon';

const TITLE_COLOR = '#1a1a1a';
const DESCRIPTION_COLOR = '#555';
const SELECTED_COLOR = '#e4572e';
const BODY_STROKE_WIDTH = 1.5;

export interface OpenLayerNodeEntry {
    node: GraphNode;
    layout: CloudLayout;
    x: number;
    y: number;
    selected: boolean;
    loading?: boolean;
}

/** Временная отрисовка узлов OL без зависимости от Canvas-адаптера. */
export function drawOpenLayerNode(
    context: CanvasRenderingContext2D,
    entry: OpenLayerNodeEntry,
    colorOf: (type: GraphNodeType) => string,
): void {
    const { node, layout, x, y, selected } = entry;
    const baseColor = selected ? SELECTED_COLOR : colorOf(node.type);
    const isCloud = node.type !== 'subNode';
    const left = x - layout.width / 2;
    const top = y - layout.height / 2;
    const radius = Math.min(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER, layout.width / 2, layout.height / 2);

    context.fillStyle = tintToWhite(baseColor);
    context.strokeStyle = baseColor;
    context.lineWidth = BODY_STROKE_WIDTH;
    context.beginPath();
    context.roundRect(left, top, layout.width, layout.height, radius);
    context.fill();
    context.stroke();
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.font = `${TITLE_FONT_SIZE}px ${FONT_FAMILY}`;
    context.fillStyle = TITLE_COLOR;
    context.fillText(layout.title, x + layout.textX, y + layout.titleY);
    context.font = `${DESCRIPTION_FONT_SIZE}px ${FONT_FAMILY}`;
    context.fillStyle = DESCRIPTION_COLOR;
    context.fillText(layout.description, x + layout.textX, y + layout.descriptionY);
    if (layout.warning) {
        context.beginPath();
        context.arc(x + layout.warning.x, y + layout.warning.y, WARNING_DOT_RADIUS, 0, Math.PI * 2);
        context.fillStyle = WARNING_COLOR;
        context.fill();
    }
    if (!isCloud) {
        drawSubNodeIcon(context, x, y, baseColor);
    }
    if (entry.loading) {
        context.fillStyle = baseColor;
        for (let index = 0; index < 3; index += 1) {
            context.beginPath();
            context.arc(x + (index - 1) * 6, y, 2, 0, Math.PI * 2);
            context.fill();
        }
    }
}
