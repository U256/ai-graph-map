import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';

export const FINE_GROUP_SIZE = 140;
export const MAX_GROUP_SIZE = 250;
const CLUSTER_WIDTH_FACTOR = 135;
const CLUSTER_WIDTH_POWER = 0.63;
const CLUSTER_GAP = 0;
const CLUSTER_START_RADIUS = 320;
const CLUSTER_START_ANGLE = Math.PI * (3 - Math.sqrt(5));
const CLUSTER_CENTER_STRENGTH = 0.08;
const CLUSTER_COLLIDE_ITERATIONS = 8;
const CLUSTER_LAYOUT_TICKS = 600;

/** @typedef {Object} GraphData Плоский граф с узлами и связями. */
/** @property {Array<Object>} nodes Узлы графа. */
/** @property {Array<Object>} links Связи графа. */

/**
 * Собирает связанные компоненты и упаковывает их в пачки ограниченного размера.
 * @param {GraphData} graph Граф для разбиения.
 * @returns {GraphData[]} Графы пачек с исходными объектами узлов и связей.
 */
function splitIntoLayoutGroups(graph) {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const neighbors = new Map(graph.nodes.map((node) => [node.id, new Set()]));
    const linksByNodeId = new Map(graph.nodes.map((node) => [node.id, []]));

    graph.links.forEach((link, index) => {
        const sourceNeighbors = neighbors.get(link.source);
        const targetNeighbors = neighbors.get(link.target);
        if (!sourceNeighbors || !targetNeighbors) return;
        sourceNeighbors.add(link.target);
        targetNeighbors.add(link.source);
        linksByNodeId.get(link.source).push(index);
        linksByNodeId.get(link.target).push(index);
    });

    const visited = new Set();
    /** @type {GraphData[]} */
    const components = [];
    nodesById.forEach((_, startId) => {
        if (visited.has(startId)) return;
        const queue = [startId];
        const nodeIds = [];
        visited.add(startId);

        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const id = queue[cursor];
            nodeIds.push(id);
            neighbors.get(id).forEach((neighborId) => {
                if (visited.has(neighborId) || queue.length >= MAX_GROUP_SIZE) return;
                visited.add(neighborId);
                queue.push(neighborId);
            });
        }

        const nodeIdSet = new Set(nodeIds);
        const linkIndexes = new Set();
        nodeIds.forEach((id) => {
            linksByNodeId.get(id).forEach((index) => {
                const link = graph.links[index];
                if (nodeIdSet.has(link.source) && nodeIdSet.has(link.target)) linkIndexes.add(index);
            });
        });
        components.push({
            nodes: nodeIds.map((id) => nodesById.get(id)),
            links: [...linkIndexes].map((index) => graph.links[index]),
        });
    });

    /** @type {GraphData[]} */
    const groups = [];
    /** @type {GraphData} */
    let current = { nodes: [], links: [] };
    components.forEach((component) => {
        if (current.nodes.length > 0 && current.nodes.length + component.nodes.length > FINE_GROUP_SIZE) {
            groups.push(current);
            current = { nodes: [], links: [] };
        }
        current.nodes.push(...component.nodes);
        current.links.push(...component.links);
    });
    if (current.nodes.length > 0) groups.push(current);
    return groups;
}

function clusterDiameter(nodeCount) {
    return CLUSTER_WIDTH_FACTOR * Math.max(nodeCount, 1) ** CLUSTER_WIDTH_POWER;
}

function bounds(nodes) {
    return nodes.reduce(
        (result, node) => ({
            minX: Math.min(result.minX, node.x),
            maxX: Math.max(result.maxX, node.x),
            minY: Math.min(result.minY, node.y),
            maxY: Math.max(result.maxY, node.y),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
}

function placeLayoutGroups(groups) {
    const bodies = groups.map(({ nodes }, index) => {
        const angle = index * CLUSTER_START_ANGLE;
        const distance = CLUSTER_START_RADIUS * Math.sqrt(index + 1);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        return { radius: clusterDiameter(nodes.length) / 2, x, y };
    });
    const simulation = forceSimulation(bodies)
        .force('x', forceX(0).strength(CLUSTER_CENTER_STRENGTH))
        .force('y', forceY(0).strength(CLUSTER_CENTER_STRENGTH))
        .force(
            'collide',
            forceCollide()
                .radius((body) => /** @type {{radius: number}} */ (body).radius + CLUSTER_GAP)
                .iterations(CLUSTER_COLLIDE_ITERATIONS),
        )
        .stop();

    for (let tick = 0; tick < CLUSTER_LAYOUT_TICKS; tick += 1) simulation.tick();

    return groups.flatMap(({ nodes }, index) => {
        const groupBounds = bounds(nodes);
        const centerX = (groupBounds.minX + groupBounds.maxX) / 2;
        const centerY = (groupBounds.minY + groupBounds.maxY) / 2;
        return nodes.map((node) => ({
            ...node,
            x: node.x - centerX + bodies[index].x,
            y: node.y - centerY + bodies[index].y,
        }));
    });
}

/** Раскладывает пачки раздельно и возвращает узлы в исходном порядке. */
export function calculateClusterLayout(graph, calculateGroup) {
    const positionedGroups = splitIntoLayoutGroups(graph).map((group) => ({
        ...group,
        nodes: calculateGroup(group),
    }));
    const positionedById = new Map(placeLayoutGroups(positionedGroups).map((node) => [node.id, node]));
    return graph.nodes.map((node) => positionedById.get(node.id));
}
