import type { GraphData, GraphNodeInput } from '../types/graph';
import { calculateSimulation } from './localSimulation';

const API_URL = import.meta.env.VITE_GRAPH_API_URL ?? 'http://127.0.0.1:5197';

async function post<T>(path: string, body: object): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? `Сервер раскладки вернул ${response.status}`);
    }
    return response.json() as Promise<T>;
}

function flatNode(node: GraphNodeInput): GraphNodeInput {
    const fields = { ...node };
    delete fields.children;
    delete fields.childrenLoading;
    return fields;
}

function flatGraph(data: GraphData): GraphData {
    return { nodes: data.nodes.map(flatNode), links: data.links };
}

function restoreLoadedChildren(source: GraphData, positioned: GraphData): GraphData {
    const originals = new Map(source.nodes.map((node) => [node.id, node]));
    return {
        ...positioned,
        nodes: positioned.nodes.map((node) => {
            const original = originals.get(node.id);
            return original?.children ? { ...node, children: original.children } : node;
        }),
    };
}

/** Рассчитывает только текущий уровень; вложенный граф передаётся отдельно тем же маршрутом. */
export async function makeCoordinates(
    data: GraphData,
    ignoreCurrentCoordinates = false,
    _scale = 1,
): Promise<GraphData> {
    const scale = !Number.isNaN(Number(_scale)) ? Number(_scale) : 1;
    const positioned = {
        nodes: calculateSimulation(data, ignoreCurrentCoordinates === true, scale),
        links: data?.links || [],
    };
    return restoreLoadedChildren(data, positioned);
}

/** Добавляет узел на сервере и возвращает граф с координатами нового узла. */
export function addNode(data: GraphData, node: GraphNodeInput, links: GraphData['links']): Promise<GraphData> {
    return post<GraphData>('/add', { graph: flatGraph(data), node: flatNode(node), links }).then((positioned) =>
        restoreLoadedChildren({ ...data, nodes: [...data.nodes, node] }, positioned),
    );
}

/** Удаляет узел на сервере; остальные координаты сохраняются без раздвигания. */
export function removeNode(data: GraphData, nodeId: string): Promise<GraphData> {
    return post<GraphData>('/remove', { graph: flatGraph(data), nodeId }).then((positioned) =>
        restoreLoadedChildren(data, positioned),
    );
}
