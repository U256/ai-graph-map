import type { GraphData, GraphLinkInput, GraphNodeInput, GraphNodeType } from '../../types/graph';

/**
 * Операции над данными графа, которые вызывает панель. Модуль чистый — без React и DOM, — поэтому
 * проверяется в Node. Ни одна функция ничего не сохраняет: правки живут только в стейте родителя.
 */

/** Поля узла, доступные форме. `id` и `type` правкой не меняются. */
export interface NodeDraft {
    title: string;
    description: string;
    hasWarning: boolean;
}

export interface NodeCreateDraft extends NodeDraft {
    type: GraphNodeType;
}

/** Опция соседнего селекта: `value` — id узла, `label` — подпись, по которой идёт поиск. */
export interface NeighborOption {
    value: string;
    label: string;
}

export const NODE_TYPE_OPTIONS: { value: GraphNodeType; label: string }[] = [
    { value: 'node', label: 'Работа' },
    { value: 'subNode', label: 'Патент' },
];

/** В исходных данных таких id нет, пересечения с ними не бывает. */
const CUSTOM_ID_PREFIX = 'custom-';

/**
 * Между правками счётчик не откатывается (удаление средней ноды не освобождает её номер), но id самого
 * старшего узла после его удаления высвобождается — к этому моменту слой и `forceLink` о нём уже не
 * помнят, поэтому повтор не ломает ни ключи элементов, ни концы связей.
 */
export function nextFreeCustomId(data: GraphData): string {
    let taken = 0;
    data.nodes.forEach((node) => {
        if (!node.id.startsWith(CUSTOM_ID_PREFIX)) return;
        const index = Number(node.id.slice(CUSTOM_ID_PREFIX.length));
        if (Number.isInteger(index) && index > taken) taken = index;
    });
    return `${CUSTOM_ID_PREFIX}${taken + 1}`;
}

/** Отсекает повторные связи между одними и теми же концами. */
function linkKey(source: string, target: string): string {
    return `${source}>${target}`;
}

/** Пустое описание превращается в отсутствующее, а не в `description: ''`. */
function nodeFields(draft: NodeDraft): Pick<GraphNodeInput, 'title' | 'hasWarning' | 'description'> {
    return {
        title: draft.title,
        hasWarning: draft.hasWarning,
        description: draft.description || undefined,
    };
}

/** Смена ссылки на `GraphData` нужна, чтобы React увидел правку. */
export function updateNodeInData(data: GraphData, id: string, draft: NodeDraft): GraphData {
    return {
        nodes: data.nodes.map((node) => (node.id === id ? { ...node, ...nodeFields(draft) } : node)),
        links: data.links,
    };
}

/** Связь с несуществующим концом `forceLink.links()` не разрешает, и симуляция на ней падает. */
export function deleteNodeFromData(data: GraphData, id: string): GraphData {
    return {
        nodes: data.nodes.filter((node) => node.id !== id),
        links: data.links.filter((link) => link.source !== id && link.target !== id),
    };
}

/** Направление связи по типу: работа — источник, патент — цель. */
export function createNodeInData(data: GraphData, draft: NodeCreateDraft, neighbors: string[]): GraphData {
    const id = nextFreeCustomId(data);
    const node: GraphNodeInput = { id, type: draft.type, ...nodeFields(draft) };
    const known = new Set(data.nodes.map((item) => item.id));
    const taken = new Set(data.links.map((link) => linkKey(link.source, link.target)));
    const links: GraphLinkInput[] = [];

    // TODO: это должен делать бекенд?
    neighbors.forEach((neighborId) => {
        if (!known.has(neighborId)) return;
        const link: GraphLinkInput =
            draft.type === 'node' ? { source: id, target: neighborId } : { source: neighborId, target: id };
        const key = linkKey(link.source, link.target);
        // пополняется и новыми связями: один и тот же сосед, выбранный в двух селектах, даёт ровно одну связь
        if (taken.has(key)) return;
        taken.add(key);
        links.push(link);
    });

    return { nodes: [...data.nodes, node], links: [...data.links, ...links] };
}

/** Новой работе предлагают только патенты, новому патенту — и работы, и патенты (патент на патент в данных тоже встречается). */
export function neighborOptions(data: GraphData, type: GraphNodeType): NeighborOption[] {
    const allowed: GraphNodeType[] = type === 'node' ? ['subNode'] : ['node', 'subNode'];
    return data.nodes
        .filter((node) => allowed.includes(node.type))
        .map((node) => ({ value: node.id, label: `${node.title} · ${node.id}` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function nodeCaption(node: GraphNodeInput): string {
    return `${node.title} · ${node.id}`;
}
