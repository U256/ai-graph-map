import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { ForceGraph } from './components/ForceGraph/ForceGraph';
import { NESTED_GRAPH_SCALE } from './components/ForceGraph/forceGraphCloud';
import { addNode, makeCoordinates, removeNode } from './components/ForceGraph/graphApi';
import { OpenLayerGraph } from './components/OpenLayerGraph/OpenLayerGraph';
import { NodeForm } from './components/SettingsPanel/NodeForm';
import {
    type NodeCreateDraft,
    type NodeDraft,
    createNodeInData,
    updateNodeInData,
} from './components/SettingsPanel/nodeForm';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel';
import { loadGraphSettings } from './components/SettingsPanel/settingsPanel';
import { graphData } from './data/graph';
import { graphData as graphMini1 } from './data/graphMini1';
import { graphData as graphMini2 } from './data/graphMini2';
import { graphData as graphMini3 } from './data/graphMini3';
import { type GraphData } from './types/graph';
import type { GraphSettings } from './types/settings';
import { useUrlQuery } from './useUrlQuery';
import { multiplyWithClones } from './utils/graphUtlis';

/** Данные подключены модулем, поэтому загрузка только эмулируется. */
const LOAD_DELAY_MS = 400;

type PanelView = { kind: 'settings' } | { kind: 'create' } | { kind: 'edit'; id: string };

/** Форма новой ноды может открыться до загрузки данных, а варианты соседей ей нужны. */
const EMPTY_DATA: GraphData = { nodes: [], links: [] };

const NESTED_GRAPH_SOURCES: Record<string, GraphData> = {
    'work-5': graphMini1,
    'work-44': graphMini3,
    'work-81g': multiplyWithClones(graphMini3, 3),
    'work-91': graphMini2,
};

function nestedSource(id: string): GraphData | undefined {
    return NESTED_GRAPH_SOURCES[id.replace(/^(?:\d+-)+/, '')];
}

function updateNestedGroup(
    data: GraphData,
    id: string,
    change: (node: GraphData['nodes'][number]) => GraphData['nodes'][number],
): GraphData {
    let changed = false;
    const nodes = data.nodes.map((node) => {
        if (node.id === id) return change(node);
        if (!node.children) return node;
        const children = updateNestedGroup(node.children, id, change);
        if (children !== node.children) changed = true;
        return children === node.children ? node : { ...node, children };
    });
    if (nodes.some((node, index) => node !== data.nodes[index])) changed = true;
    return changed ? { ...data, nodes } : data;
}

function sourceGraph(nodeClones: GraphSettings['nodeClones']): GraphData {
    if (nodeClones === 'mini1') return graphMini1;
    if (nodeClones === 'mini2') return graphMini2;
    if (nodeClones === 'mini3') return graphMini3;
    return graphData;
}

function GraphPage({ renderer }: { renderer: 'canvas' | 'ol' }) {
    // ленивая инициализация: localStorage читается один раз при монтировании
    const [settings, setSettings] = useState<GraphSettings>(loadGraphSettings);

    const [data, setData] = useState<GraphData | null>(null);
    const requestedGroups = useRef(new Set<string>());
    const generation = useRef(0);
    useEffect(() => {
        let active = true;
        generation.current += 1;
        requestedGroups.current.clear();
        const timer = setTimeout(() => {
            const source = sourceGraph(settings.nodeClones);
            const prepared =
                typeof settings.nodeClones === 'number' ? multiplyWithClones(source, settings.nodeClones) : source;
            makeCoordinates(prepared, true, 1).then((positioned) => {
                if (active) setData(positioned);
            });
        }, LOAD_DELAY_MS);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [settings.nodeClones]);

    const [panel, setPanel] = useState<PanelView>({ kind: 'settings' });
    const selected = panel.kind === 'edit' ? data?.nodes.find((node) => node.id === panel.id) : undefined;
    // выбранного узла больше нет в данных — его удалили из этой же формы: панель возвращается к настройкам
    const view: PanelView = panel.kind === 'edit' && !selected ? { kind: 'settings' } : panel;

    const handleNodeClick = useCallback(
        (id: string) => {
            // клик по копии (`2-…`) ничего не открывает: правка клона смысла не имеет
            if (!data?.nodes.some((node) => node.id === id)) return;
            setPanel({ kind: 'edit', id });
        },
        [data],
    );

    const handleVisibleGroupsChange = useCallback((ids: string[]) => {
        ids.forEach((id) => {
            if (requestedGroups.current.has(id)) return;
            const source = nestedSource(id);
            if (!source) return;
            const requestGeneration = generation.current;
            requestedGroups.current.add(id);
            setData((current) =>
                current && generation.current === requestGeneration
                    ? updateNestedGroup(current, id, (node) => ({ ...node, childrenLoading: true }))
                    : current,
            );
            setTimeout(() => {
                if (generation.current !== requestGeneration) return;
                makeCoordinates(source, true, NESTED_GRAPH_SCALE)
                    .then((positioned) => {
                        setData((current) =>
                            current && generation.current === requestGeneration
                                ? updateNestedGroup(current, id, (node) => ({
                                      ...node,
                                      children: positioned,
                                      childrenLoading: false,
                                  }))
                                : current,
                        );
                    })
                    .catch(() => {
                        if (generation.current !== requestGeneration) return;
                        requestedGroups.current.delete(id);
                        setData((current) =>
                            current
                                ? updateNestedGroup(current, id, (node) => ({ ...node, childrenLoading: false }))
                                : current,
                        );
                    });
            }, LOAD_DELAY_MS);
        });
    }, []);

    const handleCreate = useCallback(
        async (draft: NodeCreateDraft, neighbors: string[]) => {
            if (!data) return;
            const next = createNodeInData(data, draft, neighbors);
            const node = next.nodes[next.nodes.length - 1];
            const links = next.links.slice(data.links.length);
            setData(await addNode(data, node, links));
            setPanel({ kind: 'settings' });
        },
        [data],
    );

    // после сохранения панель остаётся открытой: форма показывает те же значения, что ушли в данные
    const handleUpdate = useCallback(
        async (id: string, draft: NodeDraft) => {
            if (!data) return;
            setData(await makeCoordinates(updateNodeInData(data, id, draft)));
        },
        [data],
    );

    const handleDelete = useCallback(
        async (id: string) => {
            if (!data) return;
            setData(await removeNode(data, id));
            setPanel({ kind: 'settings' });
        },
        [data],
    );

    const startCreate = useCallback(() => setPanel({ kind: 'create' }), []);
    const backToSettings = useCallback(() => setPanel({ kind: 'settings' }), []);

    return (
        <>
            <aside className="app__aside">
                {view.kind === 'settings' ? (
                    <SettingsPanel initialSettings={settings} onApply={setSettings} onStartCreate={startCreate} />
                ) : (
                    // значения узла форма читает при монтировании: без перемонтирования переход к другой ноде показал бы поля прежней
                    <NodeForm
                        key={view.kind === 'edit' ? view.id : 'create'}
                        node={selected ?? null}
                        data={data ?? EMPTY_DATA}
                        onCreate={handleCreate}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onCancel={backToSettings}
                    />
                )}
            </aside>
            <main className="app__main">
                {renderer === 'canvas' ? (
                    <ForceGraph
                        settings={settings}
                        data={data}
                        selectedNodeId={view.kind === 'edit' ? view.id : null}
                        onNodeClick={handleNodeClick}
                        onVisibleGroupsChange={handleVisibleGroupsChange}
                    />
                ) : (
                    <OpenLayerGraph
                        data={data}
                        selectedNodeId={view.kind === 'edit' ? view.id : null}
                        onNodeClick={handleNodeClick}
                        onVisibleGroupsChange={handleVisibleGroupsChange}
                    />
                )}
            </main>
        </>
    );
}

/** Обе вкладки используют одни данные и панель, но разные сцены. */
export function App() {
    const [renderer, setRenderer] = useUrlQuery('renderer');
    const isOpenLayer = renderer === 'ol';

    return (
        <div className="app">
            <header className="app__header">
                <nav className="app__tabs" aria-label="Страницы">
                    <button
                        type="button"
                        className="app__tab"
                        onClick={() => setRenderer('canvas')}
                        aria-current={isOpenLayer ? undefined : 'page'}
                    >
                        Canvas
                    </button>
                    <button
                        type="button"
                        className="app__tab"
                        onClick={() => setRenderer('ol')}
                        aria-current={isOpenLayer ? 'page' : undefined}
                    >
                        OpenLayer
                    </button>
                </nav>
            </header>
            <div className="app__body">
                <GraphPage renderer={isOpenLayer ? 'ol' : 'canvas'} />
            </div>
            <footer className="app__footer" />
        </div>
    );
}
