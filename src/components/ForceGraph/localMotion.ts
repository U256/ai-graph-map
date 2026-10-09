import { forceManyBody, forceRadial, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import { GROUP_FOCUS_SIZE } from '../../graph/groupMetrics';
import { GROUP_OFFSET_FOR_NODE } from '../../graph/nodeGeometry';
import type { GraphNode } from '../../types/graph';

/** Радиус воздействия задан в экранных пикселях, поэтому при зуме пересчитывается в единицы сцены. */
export const LOCAL_RADIUS_PX = 280;
const LOCAL_CHARGE = -1300;
const ANCHOR_STRENGTH = 0.12;
const ZOOM_ALPHA = 0.14;

/** Радиус границы группы, включая половину максимальной ширины внешней ноды. */
export function boundaryRadius(groupRadius: number): number {
    return groupRadius + GROUP_OFFSET_FOR_NODE;
}

/** Радиус воздействия включает размер круга группы и экранный запас вокруг него. */
export function localRadius(groupRadius: number, pixelsPerWorldUnit: number): number {
    return groupRadius + LOCAL_RADIUS_PX / pixelsPerWorldUnit;
}

export type GroupRadius = (group: GraphNode) => number;

/** В локальную симуляцию не попадают далёкие узлы и узлы без координат. */
export function nearbyNodes(nodes: GraphNode[], focus: GraphNode, radius: number): GraphNode[] {
    return nodes.filter(
        (node) =>
            node === focus ||
            (Number.isFinite(node.x) &&
                Number.isFinite(node.y) &&
                Math.hypot((node.x ?? 0) - (focus.x ?? 0), (node.y ?? 0) - (focus.y ?? 0)) <= radius),
    );
}

/** Заряд плавно сходит на нет к границе круга. */
export function localCharge(node: GraphNode, focus: GraphNode, radius: number): number {
    const distance = Math.hypot((node.x ?? 0) - (focus.x ?? 0), (node.y ?? 0) - (focus.y ?? 0));
    const weight = Math.max(0, 1 - distance / radius);
    return LOCAL_CHARGE * weight ** 2;
}

/** Временная симуляция работает с теми же объектами, что Canvas, но никогда не получает всю карту. */
export function createLocalMotion(
    nodes: GraphNode[],
    render: () => void,
    radiusOf: GroupRadius = () => GROUP_FOCUS_SIZE / 2,
) {
    let simulation: Simulation<GraphNode, undefined> | null = null;
    let focus: GraphNode | null = null;
    let anchors = new Map<GraphNode, { x: number; y: number }>();
    let radius = 1;
    let groupRadius = GROUP_FOCUS_SIZE / 2;
    let pixelsPerWorldUnit = 1;

    function stop(restoreAnchors = true): void {
        simulation?.stop();
        anchors.forEach((position, node) => {
            const movingNode = node;
            if (restoreAnchors) {
                movingNode.x = position.x;
                movingNode.y = position.y;
            }
            movingNode.fx = null;
            movingNode.fy = null;
        });
        if (restoreAnchors && anchors.size > 0) {
            render();
        }
        simulation = null;
        focus = null;
        anchors.clear();
    }

    function start(node: GraphNode, nextPixelsPerWorldUnit: number, restart = false): void {
        if (!Number.isFinite(nextPixelsPerWorldUnit) || nextPixelsPerWorldUnit <= 0) return;
        if (focus === node && !restart) return;
        if (focus) stop();
        pixelsPerWorldUnit = nextPixelsPerWorldUnit;
        groupRadius = radiusOf(node);
        radius = localRadius(groupRadius, pixelsPerWorldUnit);
        const selected = nearbyNodes(nodes, node, radius);
        if (selected.length < 2) {
            stop();
            return;
        }
        focus = node;
        anchors = new Map(selected.map((entry) => [entry, { x: entry.x ?? 0, y: entry.y ?? 0 }]));
        simulation = forceSimulation<GraphNode>(selected)
            .force(
                'boundary',
                forceRadial<GraphNode>(boundaryRadius(groupRadius), node.x ?? 0, node.y ?? 0).strength((entry) => {
                    if (entry === node) return 0;
                    return Math.hypot((entry.x ?? 0) - (node.x ?? 0), (entry.y ?? 0) - (node.y ?? 0)) <
                        boundaryRadius(groupRadius)
                        ? 0.2
                        : 0;
                }),
            )
            .force(
                'charge',
                forceManyBody<GraphNode>().strength((entry) => localCharge(entry, node, radius)),
            )
            .force('x', forceX<GraphNode>((entry) => anchors.get(entry)!.x).strength(ANCHOR_STRENGTH))
            .force('y', forceY<GraphNode>((entry) => anchors.get(entry)!.y).strength(ANCHOR_STRENGTH))
            .velocityDecay(0.6)
            .on('tick', render)
            .on('end', () => {
                const completedFocus = focus;
                if (completedFocus) {
                    completedFocus.fx = null;
                    completedFocus.fy = null;
                }
                simulation = null;
                render();
            });
        const selectedFocus = focus;
        if (selectedFocus) {
            selectedFocus.fx = selectedFocus.x;
            selectedFocus.fy = selectedFocus.y;
        }
        simulation.alpha(ZOOM_ALPHA).restart();
    }

    function refresh(): void {
        if (focus) start(focus, pixelsPerWorldUnit, true);
    }

    return { start: (node: GraphNode, scale: number) => start(node, scale), stop, refresh };
}
