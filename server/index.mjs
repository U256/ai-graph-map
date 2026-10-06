import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { createServer } from 'node:http'

const HOST = '127.0.0.1'
const PORT = Number(process.env.PORT ?? 5197)
const LAYOUT_SCALE = 7
const LINK_DISTANCE = 100
const LINK_STRENGTH = 0.5
const CHARGE_STRENGTH = -30
const MAX_CHARGE_FACTOR = 10
const VELOCITY_DECAY = 0.6
const ADD_RADIUS = 100

function json(response, status, value) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'access-control-allow-origin': '*',
		'access-control-allow-headers': 'content-type',
		'access-control-allow-methods': 'POST, OPTIONS',
	})
	response.end(JSON.stringify(value))
}

function isObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readGraph(body) {
	const graph = isObject(body.graph) ? body.graph : body
	if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
		throw new Error('Ожидался граф с массивами nodes и links')
	}
	return {
		nodes: graph.nodes.map((node) => {
			const { children: _children, ...flatNode } = node
			return flatNode
		}),
		links: graph.links.map((link) => ({ ...link })),
	}
}

function nodeId(value) {
	return typeof value === 'string' ? value : value?.id
}

function validPosition(node) {
	return Number.isFinite(node.x) && Number.isFinite(node.y)
}

function chargeFactor(elementCount) {
	const count = Math.max(0, elementCount)
	const progress = Math.max(0, (count - 15) / 75)
	return Math.min(MAX_CHARGE_FACTOR, Math.max(1, 1 + 4 * progress ** 0.8))
}

function withChargeMultiplier(node) {
	if (node.childrenCount === undefined) {
		const { chargeMultiplier: _chargeMultiplier, ...plainNode } = node
		return plainNode
	}
	if (!Number.isInteger(node.childrenCount) || node.childrenCount < 0) {
		throw new Error('childrenCount должен быть неотрицательным целым числом')
	}
	return { ...node, chargeMultiplier: chargeFactor(node.childrenCount) }
}

function calculateSimulation(graph, ignoreCurrentCoordinates = false, scale = 1) {
	if (!Number.isFinite(scale) || scale <= 0) throw new Error('scale должен быть положительным числом')
	const nodes = graph.nodes.map((node) => {
		const copy = withChargeMultiplier(node)
		if (ignoreCurrentCoordinates || !validPosition(copy)) {
			delete copy.x
			delete copy.y
			delete copy.vx
			delete copy.vy
		}
		return copy
	})
	const links = graph.links.map((link) => ({ ...link }))
	const simulation = forceSimulation(nodes)
		.force(
			'link',
			forceLink(links)
				.id((node) => node.id)
				.distance(LINK_DISTANCE)
				.strength(LINK_STRENGTH),
		)
		.force(
			'charge',
			forceManyBody().strength((node) => CHARGE_STRENGTH * LAYOUT_SCALE ** 2 * (node.chargeMultiplier ?? 1)),
		)
		.force('x', forceX())
		.force('y', forceY())
		.velocityDecay(VELOCITY_DECAY)
		.stop()

	// двигаем симуляцию, чтобы привести ближе к "покою" и сделать равномернее распределение
	simulation.alphaTarget(1)
	for (let tick = 0; tick < 500; tick += 1) simulation.tick()
	simulation.alphaTarget(0)
	while (simulation.alpha() > simulation.alphaMin()) simulation.tick()

	return nodes.map(({ vx: _vx, vy: _vy, index: _index, ...node }) => node)
}

function normalizeChargeMultipliers(graph) {
	return {
		nodes: graph.nodes.map(withChargeMultiplier),
		links: graph.links.map((link) => ({ ...link })),
	}
}

function linkedNodeIds(graph, id) {
	return graph.links.flatMap((link) => {
		const source = nodeId(link.source)
		const target = nodeId(link.target)
		if (source === id && target) return [target]
		if (target === id && source) return [source]
		return []
	})
}

function freeRingPosition(nodes) {
	const positioned = nodes.filter(validPosition)
	if (positioned.length === 0) return { x: 0, y: 0 }
	const center = positioned.reduce((result, node) => ({ x: result.x + node.x, y: result.y + node.y }), { x: 0, y: 0 })
	center.x /= positioned.length
	center.y /= positioned.length

	const radius = Math.max(ADD_RADIUS, Math.sqrt(positioned.length) * ADD_RADIUS)
	for (let index = 0; index < positioned.length * 2; index += 1) {
		const angle = (index / Math.max(1, positioned.length * 2)) * Math.PI * 2
		const candidate = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
		if (positioned.every((node) => Math.hypot(node.x - candidate.x, node.y - candidate.y) >= ADD_RADIUS)) {
			return candidate
		}
	}
	return { x: center.x + radius, y: center.y }
}

function addNode(graph, node, additionalLinks = []) {
	if (!isObject(node) || typeof node.id !== 'string') throw new Error('Для add нужен node с id')
	if (graph.nodes.some((item) => item.id === node.id)) throw new Error(`Узел уже существует: ${node.id}`)

	const links = [...graph.links, ...additionalLinks.map((link) => ({ ...link }))]
	const neighbors = linkedNodeIds({ ...graph, links }, node.id)
	const neighborPositions = graph.nodes.filter((item) => neighbors.includes(item.id) && validPosition(item))
	const position = neighborPositions.length
		? neighborPositions.reduce(
				(result, item) => ({
					x: result.x + item.x / neighborPositions.length,
					y: result.y + item.y / neighborPositions.length,
				}),
				{ x: 0, y: 0 },
			)
		: freeRingPosition(graph.nodes)

	const { children: _children, ...flatNode } = node
	return {
		nodes: [...graph.nodes, { ...flatNode, ...position }],
		links,
	}
}

function removeNode(graph, id) {
	if (typeof id !== 'string') throw new Error('Для remove нужен nodeId')
	return {
		nodes: graph.nodes.filter((node) => node.id !== id),
		links: graph.links.filter((link) => nodeId(link.source) !== id && nodeId(link.target) !== id),
	}
}

async function readBody(request) {
	let body = ''
	for await (const chunk of request) body += chunk
	return body ? JSON.parse(body) : {}
}

async function handle(request, response) {
	if (request.method === 'OPTIONS') return json(response, 204, null)
	if (request.method !== 'POST') return json(response, 405, { error: 'Используйте POST' })

	try {
		const body = await readBody(request)
		const route = new URL(request.url, `http://${request.headers.host}`).pathname
		if (route === '/makeCoordinates') {
			const graph = readGraph(body)
			return json(response, 200, {
				nodes: calculateSimulation(graph, body.ignoreCurrentCoordinates === true, body.scale ?? 1),
				links: graph.links,
			})
		}
		if (route === '/add')
			return json(response, 200, normalizeChargeMultipliers(addNode(readGraph(body), body.node, body.links ?? [])))
		if (route === '/remove')
			return json(response, 200, normalizeChargeMultipliers(removeNode(readGraph(body), body.nodeId)))
		return json(response, 404, { error: 'Маршрут не найден' })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Некорректный запрос'
		return json(response, 400, { error: message })
	}
}

createServer(handle).listen(PORT, HOST, () => {
	console.log(`Graph layout server: http://${HOST}:${PORT}`)
})
