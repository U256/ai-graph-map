import type { GraphNode } from '../../types/graph'
import { GROUP_DETAIL_SCALE } from './forceGraphCloud'
import { snapshotGroups, type VisibilityViewport } from './visibleGroups'
import type { VisibilityRequest, VisibilityResponse } from './visibleGroupsProtocol'

const VISIBILITY_INTERVAL = 1000

/** Проверяет изменённую сцену в worker-е и публикует только последний актуальный снимок. */
export function createGroupVisibility(
	getState: () => { nodes: GraphNode[]; viewport: VisibilityViewport | null; scale: number },
	onChange?: (ids: string[]) => void,
): { markDirty: () => void; destroy: () => void } {
	if (!onChange) return { markDirty: () => {}, destroy: () => {} }

	const worker = new Worker(new URL('./visibleGroups.worker.ts', import.meta.url), { type: 'module' })
	let revision = 0
	let dirty = true
	let pending = false
	let lastIds: string | null = null

	function markDirty(): void {
		revision += 1
		dirty = true
	}

	worker.onmessage = ({ data }: MessageEvent<VisibilityResponse>) => {
		pending = false
		if (data.revision !== revision || getState().scale < GROUP_DETAIL_SCALE) return
		const key = JSON.stringify(data.ids)
		if (key === lastIds) return
		lastIds = key
		onChange(data.ids)
	}
	worker.onerror = (event) => {
		pending = false
		dirty = true
		// eslint-disable-next-line no-console
		console.error('Не удалось рассчитать видимые группы', event.error ?? event.message)
	}

	const timer = setInterval(() => {
		if (!dirty) return
		const { nodes, viewport, scale } = getState()
		if (scale < GROUP_DETAIL_SCALE) {
			dirty = false
			if (lastIds !== null) {
				lastIds = null
				onChange([])
			}
			return
		}
		if (pending) return
		if (!viewport) return
		dirty = false
		pending = true
		const request: VisibilityRequest = { revision, groups: snapshotGroups(nodes), viewport }
		worker.postMessage(request)
	}, VISIBILITY_INTERVAL)

	return {
		markDirty,
		destroy: () => {
			clearInterval(timer)
			worker.terminate()
		},
	}
}
