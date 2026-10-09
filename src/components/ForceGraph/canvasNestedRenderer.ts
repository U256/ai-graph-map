import { tintToWhite } from '../../graph/nodeColors';
import {
    CLOUD_RADIUS,
    DESCRIPTION_FONT_SIZE,
    FONT_FAMILY,
    GROUP_FOCUS_SIZE,
    NESTED_GRAPH_SCALE,
    SUB_NODE_CORNER,
    TITLE_FONT_SIZE,
    WARNING_COLOR,
    WARNING_DOT_RADIUS,
    type CloudLayout,
} from '../../graph/nodeGeometry';
import type { GraphData, GraphNode, GraphNodeType } from '../../types/graph';
import { drawSubNodeIcon } from './canvasSubNodeIcon';

const LINK_COLOR = '#999';
const TITLE_COLOR = '#1a1a1a';
const DESCRIPTION_COLOR = '#555';
const BODY_STROKE_WIDTH = 1.5;

interface NestedEntry {
    node: GraphNode;
    layout: CloudLayout;
    x: number;
    y: number;
}

function drawNode(
    context: CanvasRenderingContext2D,
    entry: NestedEntry,
    colorOf: (type: GraphNodeType) => string,
): void {
    const { node, layout, x, y } = entry;
    const color = colorOf(node.type);
    const isCloud = node.type !== 'subNode';
    const offsetY = layout.focusedGroup ? -(layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2 : 0;
    const left = x - layout.width / 2;
    const top = y - layout.height / 2 + offsetY;
    const radius = Math.min(isCloud ? CLOUD_RADIUS : SUB_NODE_CORNER, layout.width / 2, layout.height / 2);

    context.fillStyle = tintToWhite(color);
    context.strokeStyle = color;
    context.lineWidth = BODY_STROKE_WIDTH;
    context.beginPath();
    context.moveTo(left + radius, top);
    context.arcTo(left + layout.width, top, left + layout.width, top + layout.height, radius);
    context.arcTo(left + layout.width, top + layout.height, left, top + layout.height, radius);
    context.arcTo(left, top + layout.height, left, top, radius);
    context.arcTo(left, top, left + layout.width, top, radius);
    context.closePath();
    context.fill();
    context.stroke();

    if (layout.focusedGroup) {
        context.beginPath();
        context.arc(x, y, (layout.focusedSize ?? GROUP_FOCUS_SIZE) / 2, 0, Math.PI * 2);
        context.lineWidth = 2;
        context.stroke();
    }
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
        drawSubNodeIcon(context, x, y, color);
    }
}

/** Рисует вложенные узлы локально; они не входят в раскладку внешнего графа. */
export function drawNestedGraph(
    context: CanvasRenderingContext2D,
    data: GraphData,
    colorOf: (type: GraphNodeType) => string,
    layoutOf: (node: GraphNode) => CloudLayout,
): void {
    const children: GraphNode[] = data.nodes;
    const byId = new Map(children.map((child) => [child.id, child]));
    context.save();
    context.scale(NESTED_GRAPH_SCALE, NESTED_GRAPH_SCALE);
    context.globalAlpha = 0.6;
    context.strokeStyle = LINK_COLOR;
    context.lineWidth = 5;
    data.links.forEach((link) => {
        const source = byId.get(link.source);
        const target = byId.get(link.target);
        if (!source || !target) return;
        context.beginPath();
        context.moveTo(source.x ?? 0, source.y ?? 0);
        context.lineTo(target.x ?? 0, target.y ?? 0);
        context.stroke();
    });
    context.globalAlpha = 1;
    children.forEach((node) => {
        drawNode(context, { node, layout: layoutOf(node), x: node.x ?? 0, y: node.y ?? 0 }, colorOf);
        if (node.children) {
            context.save();
            context.translate(node.x ?? 0, node.y ?? 0);
            drawNestedGraph(context, node.children, colorOf, layoutOf);
            context.restore();
        }
    });
    context.restore();
}
