import { visibleGroupIds, type VisibilityGroup, type VisibilityViewport } from './visibleGroups'

export type VisibilityRequest = { revision: number; groups: VisibilityGroup[]; viewport: VisibilityViewport }
export type VisibilityResponse = { revision: number; ids: string[] }

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<VisibilityRequest>) => void
	postMessage: (message: VisibilityResponse) => void
}

workerScope.onmessage = ({ data }) => {
	workerScope.postMessage({ revision: data.revision, ids: visibleGroupIds(data.groups, data.viewport) })
}
