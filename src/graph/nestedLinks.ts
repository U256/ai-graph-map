import type { GraphNode } from '../types/graph';

const NESTED_GROUP_LINK_LIMIT = 5;

/** Возвращает небольшой стабильный набор детей для визуальных связей с родительской группой. */
export function nestedGroupLinkChildren(nodes: GraphNode[]): GraphNode[] {
    return nodes.slice(0, NESTED_GROUP_LINK_LIMIT);
}
