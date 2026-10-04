import { visibleGroupIds } from './visibleGroups'
import type { VisibilityRequest, VisibilityResponse } from './visibleGroupsProtocol'

const workerScope = globalThis as typeof globalThis & {
	onmessage: (event: MessageEvent<VisibilityRequest>) => void
	postMessage: (message: VisibilityResponse) => void
}

workerScope.onmessage = ({ data }: MessageEvent<VisibilityRequest>) => {
	const response: VisibilityResponse = { revision: data.revision, ids: visibleGroupIds(data.groups, data.viewport) }
	workerScope.postMessage(response)
}
