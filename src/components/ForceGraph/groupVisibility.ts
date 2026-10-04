import type { GraphNode } from '../../types/graph'
import { snapshotGroups, type VisibilityViewport } from './visibleGroups'
import type { VisibilityRequest, VisibilityResponse } from './visibleGroups.worker'

const VISIBILITY_INTERVAL = 2000

/** Проверяет только изменённую сцену; устаревшие ответы воркера не попадают наружу. */
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
	let enabledBefore = false
	function markDirty(): void {
		revision += 1
		dirty = true
	}
	worker.onmessage = ({ data }: MessageEvent<VisibilityResponse>) => {
		pending = false
		if (data.revision !== revision || !enabledBefore || getState().scale < 1) return
		const key = JSON.stringify(data.ids)
		if (key !== lastIds) {
			lastIds = key
			onChange?.(data.ids)
		}
	}
	const timer = setInterval(() => {
		if (!dirty) return
		const { nodes, viewport, scale } = getState()
		if (scale < 1 || !viewport) {
			dirty = false
			if (enabledBefore) {
				lastIds = null
				onChange?.([])
			}
			enabledBefore = false
			return
		}
		if (pending) return
		dirty = false
		pending = true
		enabledBefore = true
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
