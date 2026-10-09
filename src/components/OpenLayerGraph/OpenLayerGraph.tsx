import { useEffect, useRef } from 'react';
import type { GraphData } from '../../types/graph';
import './OpenLayerGraph.css';
import { createOpenLayerView } from './openLayerView';

type Props = {
    data: GraphData | null;
    selectedNodeId: string | null;
    onNodeClick: (id: string) => void;
    onVisibleGroupsChange: (ids: string[]) => void;
};

/** React владеет контейнером; OpenLayers-карту создаём только при монтировании. */
export function OpenLayerGraph({ data, selectedNodeId, onNodeClick, onVisibleGroupsChange }: Props) {
    const target = useRef<HTMLDivElement>(null);
    const scene = useRef<ReturnType<typeof createOpenLayerView> | null>(null);
    const click = useRef(onNodeClick);
    click.current = onNodeClick;
    const visibleGroupsChange = useRef(onVisibleGroupsChange);
    visibleGroupsChange.current = onVisibleGroupsChange;

    useEffect(() => {
        if (!target.current) return undefined;
        const view = createOpenLayerView(
            target.current,
            (id) => click.current(id),
            (ids) => visibleGroupsChange.current(ids),
        );
        scene.current = view;
        return () => {
            view.destroy();
            scene.current = null;
        };
    }, []);

    useEffect(() => {
        if (data) scene.current?.update(data, selectedNodeId);
    }, [data, selectedNodeId]);

    return (
        <figure className="open-layer-graph">
            <div className="open-layer-graph__map" ref={target} role="img" aria-label="Граф связей на OpenLayers" />
            <div className="force-graph__zoom-controls">
                <button type="button" title="Отцентровать карту" onClick={() => scene.current?.reset()}>
                    □
                </button>
                <button type="button" title="Приблизить карту" onClick={() => scene.current?.zoomBy(1.3)}>
                    +
                </button>
                <button type="button" title="Отдалить карту" onClick={() => scene.current?.zoomBy(1 / 1.3)}>
                    −
                </button>
            </div>
            {data ? (
                <p className="force-graph__counter">
                    Нод: {data.nodes.length}, рёбер: {data.links.length}
                </p>
            ) : (
                <p className="force-graph__status">Загрузка графа…</p>
            )}
        </figure>
    );
}
