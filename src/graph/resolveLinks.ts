import type { DrawnLink, GraphLinkInput, GraphNode } from '../types/graph';

/** Отбрасывает связи с отсутствующими концами до передачи их адаптеру сцены. */
export function resolveLinks(nodes: GraphNode[], links: GraphLinkInput[]): DrawnLink[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return links.flatMap(({ source, target, force }) => {
        const from = byId.get(source);
        const to = byId.get(target);
        return from && to ? [{ source: from, target: to, force }] : [];
    });
}
