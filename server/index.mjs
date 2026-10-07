import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { addNode, calculateSimulation, checkIfDataValid, removeNode } from './processData.mjs'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 5197

/** @typedef {ReturnType<typeof checkIfDataValid>} GraphData Плоский граф сервера. */

/**
 * Отправляет JSON-ответ с общими CORS-заголовками сервиса.
 * @param {import('node:http').ServerResponse} response HTTP-ответ.
 * @param {number} status HTTP-статус.
 * @param {unknown} value Значение JSON-ответа.
 * @returns {void}
 */
function toJsonResponse(response, status, value) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'access-control-allow-origin': '*',
		'access-control-allow-headers': 'content-type',
		'access-control-allow-methods': 'POST, OPTIONS',
	})
	response.end(JSON.stringify(value))
}

/**
 * Читает и разбирает JSON-тело HTTP-запроса.
 * @param {import('node:http').IncomingMessage} request HTTP-запрос.
 * @returns {Promise<Record<string, any>>} Разобранное тело запроса.
 */
async function readBody(request) {
	let body = ''
	for await (const chunk of request) body += chunk
	return body ? JSON.parse(body) : {}
}

/**
 * Обрабатывает один HTTP-запрос API раскладки.
 * @param {import('node:http').IncomingMessage} request HTTP-запрос.
 * @param {import('node:http').ServerResponse} response HTTP-ответ.
 * @returns {Promise<void>} Завершённая обработка запроса.
 */
async function handle(request, response) {
	if (request.method === 'OPTIONS') return toJsonResponse(response, 204, null)
	if (request.method !== 'POST') return toJsonResponse(response, 405, { error: 'Используйте POST' })

	try {
		const body = await readBody(request)
		const route = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname

		/**
		 * POST /makeCoordinates — рассчитывает координаты узлов текущего уровня графа.
		 * Ответ 200: GraphData с новыми координатами nodes и исходными строковыми links.
		 * @typedef {Object} CoordinatesRequest
		 * @property {GraphData} graph Граф для раскладки; допустимы пустые массивы.
		 * @property {boolean} [ignoreCurrentCoordinates] Игнорировать имеющиеся x и y.
		 * @property {number} [scale] Масштаб уровня графа; по умолчанию 1.
		 */
		if (route === '/makeCoordinates') {
			const payload = /** @type {CoordinatesRequest} */ (body)
			const graph = checkIfDataValid(payload?.graph)
			const scale = 'scale' in payload && !Number.isNaN(Number(payload.scale)) ? Number(payload.scale) : 1
			return toJsonResponse(response, 200, {
				nodes: calculateSimulation(graph, payload.ignoreCurrentCoordinates === true, scale),
				links: graph.links,
			})
		}

		/**
		 * POST /add — добавляет узел без пересчёта координат остальных узлов.
		 * Новый узел ставится в центр существующих соседей либо в свободную точку.
		 * Ответ 200: GraphData с новым узлом и его связями.
		 * @typedef {Object} AddRequest
		 * @property {GraphData} graph Исходный плоский граф.
		 * @property {GraphData['nodes'][number]} node Добавляемый узел с уникальным id.
		 * @property {GraphData['links']} [links] Новые связи; по умолчанию пустой массив.
		 */
		if (route === '/add') {
			const payload = /** @type {AddRequest} */ (body)
			const graph = checkIfDataValid(payload?.graph)
			return toJsonResponse(response, 200, addNode(graph, payload.node, payload.links ?? []))
		}

		/**
		 * POST /remove — удаляет узел и все его входящие и исходящие связи.
		 * Координаты остальных узлов не пересчитываются.
		 * Ответ 200: GraphData без удалённого узла;.
		 * @typedef {Object} RemoveRequest
		 * @property {GraphData} graph Исходный плоский граф.
		 * @property {string} nodeId Идентификатор удаляемого узла.
		 */
		if (route === '/remove') {
			const payload = /** @type {RemoveRequest} */ (body)
			const graph = checkIfDataValid(payload?.graph)
			return toJsonResponse(response, 200, removeNode(graph, payload.nodeId))
		}
		return toJsonResponse(response, 404, { error: 'Маршрут не найден' })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Некорректный запрос'
		return toJsonResponse(response, 400, { error: message })
	}
}

/**
 * Запускает HTTP-сервер раскладки на указанном адресе.
 *
 * @param {{ host?: string, port?: number }} [options] Параметры сетевого слушателя.
 * @returns {import('node:http').Server} Сервер, который можно остановить через `close()`.
 */
export function startServer({ host = DEFAULT_HOST, port = Number(process.env.PORT ?? DEFAULT_PORT) } = {}) {
	const server = createServer(handle)
	server.listen(port, host, () => {
		console.log(`Graph layout server: http://${host}:${port}`)
	})
	return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer()
