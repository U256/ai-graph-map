import { forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { calculateClusterLayout, createClusterConfig } from './clusterLayout.mjs';

export const DEFAULT_PLACING_CONFIG = {
    layoutScale: 8,
    linkDistance: 120,
    linkStrength: 0.5,
    chargeStrength: -30,
    velocityDecay: 0.6,
    addRadius: 100,
};

/** Отклоняет нечисловые настройки до запуска d3 и разбиения на пачки. */
export function resolvePlacingConfig(placingConfig = {}) {
    if (placingConfig === null || typeof placingConfig !== 'object' || Array.isArray(placingConfig)) {
        throw new Error('placingConfig должен быть объектом');
    }
    const defaults = { ...DEFAULT_PLACING_CONFIG, ...createClusterConfig() };
    for (const [key, value] of Object.entries(placingConfig)) {
        if (!(key in defaults) || typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`Некорректный параметр placingConfig: ${key}`);
        }
    }
    const result = { ...defaults, ...placingConfig };
    if (
        result.layoutScale <= 0 ||
        result.linkDistance < 0 ||
        result.linkStrength < 0 ||
        result.velocityDecay < 0 ||
        result.velocityDecay > 1 ||
        result.addRadius <= 0 ||
        !Number.isInteger(result.clusterFineGroupSize) ||
        result.clusterFineGroupSize <= 0 ||
        !Number.isInteger(result.clusterMaxGroupSize) ||
        result.clusterMaxGroupSize <= 0
    ) {
        throw new Error('Недопустимое значение placingConfig');
    }
    return result;
}

/** @typedef {Object} GraphNode Узел плоского графа с необязательными координатами. */
/** @property {string} id Уникальный идентификатор узла. */
/** @property {number} [x] Координата по горизонтали. */
/** @property {number} [y] Координата по вертикали. */
/** @property {number} [vx] Скорость по горизонтали во время симуляции. */
/** @property {number} [vy] Скорость по вертикали во время симуляции. */

/** @typedef {Object} GraphLink Связь между узлами графа. */
/** @property {string} source Исходный конец связи. */
/** @property {string} target Конечный конец связи. */

/** @typedef {Object} GraphData Плоский граф с узлами и связями. */
/** @property {GraphNode[]} nodes Узлы графа. */
/** @property {GraphLink[]} links Связи графа. */

/**
 * Проверяет, что значение является обычным JSON-объектом.
 * @param {unknown} value Проверяемое значение.
 * @returns {value is Record<string, any>} Признак обычного объекта.
 */
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Проверяет, что key объекта data имеет typeof data[key] === type
 * @param {unknown} data Проверяемое значение.
 * @param {string} key Проверяемое значение.
 * @param {'string'|'number'} type Проверяемое значение.
 *  @returns {boolean} Признак поля нужного типа.
 */
function isKeyHasType(data, key, type) {
    return isObject(data) && key in data && typeof data[key] === type;
}
/**
 * Проверяет минимальные данные в графе.
 * @param {Record<string, any>} graph Тело HTTP-запроса.
 * @returns {GraphData} Проверенная копия графа.
 */
export function checkIfDataValid(graph) {
    if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
        throw new Error('Ожидался граф с массивами nodes и links');
    }
    if (graph.nodes.length > 0 && !graph.nodes.every((node) => isKeyHasType(node, 'id', 'string'))) {
        throw new Error('Ожидался граф с массивом nodes, содержащими id');
    }
    if (
        graph.links.length > 0 &&
        !graph.links.every((link) => isKeyHasType(link, 'source', 'string') && isKeyHasType(link, 'target', 'string'))
    ) {
        throw new Error('Ожидался граф с массивом links, содержащими строковые значения source, target');
    }
    return graph;
}

/**
 * Проверяет, можно ли использовать координаты узла как начальное положение.
 * @param {GraphNode} node Проверяемый узел.
 * @returns {boolean} Признак валидных координат.
 */
function validPosition(node) {
    return Number.isFinite(node.x) && Number.isFinite(node.y);
}

function calculateSingleSimulation(graph, ignoreCurrentCoordinates, placingConfig) {
    const nodes = graph.nodes.map((node) => {
        if (ignoreCurrentCoordinates || !validPosition(node)) {
            delete node.x;
            delete node.y;
            delete node.vx;
            delete node.vy;
        }
        return node;
    });
    const links = structuredClone(graph.links);
    const simulation = forceSimulation(/** @type {Array<GraphNode & import('d3-force').SimulationNodeDatum>} */ (nodes))
        .force(
            'link',
            forceLink(links)
                .id((node) => /** @type {GraphNode} */ (node).id)
                .distance(placingConfig.linkDistance)
                .strength(placingConfig.linkStrength),
        )
        .force(
            'charge',
            forceManyBody().strength(() => placingConfig.chargeStrength * placingConfig.layoutScale ** 2),
        )
        .force('x', forceX())
        .force('y', forceY())
        .velocityDecay(placingConfig.velocityDecay)
        .stop();

    simulation.alphaTarget(1);
    for (let tick = 0; tick < 500; tick += 1) simulation.tick();
    simulation.alphaTarget(0);
    while (simulation.alpha() > simulation.alphaMin()) simulation.tick();

    return nodes.map(({ vx: _vx, vy: _vy, index: _index, ...node }) => node);
}

/**
 * Рассчитывает координаты графа остановленной d3-симуляцией.
 * @example
 * {
 * 	"graph": {
 * 		"nodes": [{ "id": "id1", }, { "id": "id2", }],
 * 		"links": [{ "source": "id1", "target": "id2" }]
 * 	},
 * 	"ignoreCurrentCoordinates": false,
 * 	"scale": 1
 * }
 *
 * @param {GraphData} graph Плоский граф для раскладки.
 * @param {boolean} [ignoreCurrentCoordinates=false] Нужно ли игнорировать начальные координаты.
 * @param {number} [scale=1] Масштаб уровня графа.
 * @param {Record<string, number>} [placingConfig] Настройки поверх значений по умолчанию.
 * @returns {GraphNode[]} Узлы с рассчитанными координатами.
 */
export function calculateSimulation(graph, ignoreCurrentCoordinates = false, scale = 1, placingConfig = {}) {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('scale должен быть положительным числом');
    const resolvedConfig = resolvePlacingConfig(placingConfig);
    if (graph.nodes.length >= resolvedConfig.clusterFineGroupSize) {
        return calculateClusterLayout(
            graph,
            (group) => calculateSingleSimulation(group, ignoreCurrentCoordinates, resolvedConfig),
            resolvedConfig,
        );
    }
    return calculateSingleSimulation(graph, ignoreCurrentCoordinates, resolvedConfig);
}

/**
 * Находит непосредственных соседей узла без учёта направления связей.
 * @param {GraphLink[]} links Граф для поиска.
 * @param {string} id Идентификатор узла.
 * @returns {string[]} Идентификаторы соседних узлов.
 */
function linkedNodeIds(links, id) {
    return links.flatMap((link) => {
        if (link.source === id) return [link.target];
        if (link.target === id) return [link.source];
        return [];
    });
}

/**
 * Выбирает детерминированную свободную точку рядом с уже расположенными узлами.
 * @param {GraphNode[]} nodes Узлы с координатами.
 * @returns {{x: number, y: number}} Свободная точка.
 */
function freeRingPosition(nodes, addRadius) {
    const positioned = nodes.filter(validPosition);
    if (positioned.length === 0) return { x: 0, y: 0 };
    const center = positioned.reduce((result, node) => ({ x: result.x + node.x, y: result.y + node.y }), {
        x: 0,
        y: 0,
    });
    center.x /= positioned.length;
    center.y /= positioned.length;

    const radius = Math.max(addRadius, Math.sqrt(positioned.length) * addRadius);
    for (let index = 0; index < positioned.length * 2; index += 1) {
        const angle = (index / Math.max(1, positioned.length * 2)) * Math.PI * 2;
        const candidate = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
        if (positioned.every((node) => Math.hypot(node.x - candidate.x, node.y - candidate.y) >= addRadius)) {
            return candidate;
        }
    }
    return { x: center.x + radius, y: center.y };
}

/**
 * Добавляет узел и ставит его в центр координат существующих соседей.
 * @param {GraphData} graph Исходный граф.
 * @param {GraphNode} node Добавляемый узел.
 * @param {GraphLink[]} [additionalLinks=[]] Связи с добавляемым узлом.
 * @param {Record<string, number>} [placingConfig] Настройки поверх значений по умолчанию.
 * @returns {GraphData} Граф с новым узлом и связями.
 */
export function addNode(graph, node, additionalLinks = [], placingConfig = {}) {
    if (!isObject(node) || typeof node.id !== 'string') throw new Error('Для add нужен node с id');
    if (graph.nodes.some((item) => item.id === node.id)) throw new Error(`Узел уже существует: ${node.id}`);

    const links = [...graph.links, ...additionalLinks];
    const neighbors = linkedNodeIds(links, node.id);
    const neighborPositions = graph.nodes.filter((item) => neighbors.includes(item.id) && validPosition(item));
    const resolvedConfig = resolvePlacingConfig(placingConfig);
    const position = neighborPositions.length
        ? neighborPositions.reduce(
              (result, item) => ({
                  x: result.x + item.x / neighborPositions.length,
                  y: result.y + item.y / neighborPositions.length,
              }),
              { x: 0, y: 0 },
          )
        : freeRingPosition(graph.nodes, resolvedConfig.addRadius);

    return {
        nodes: [...graph.nodes, { ...node, ...position }],
        links,
    };
}

/**
 * Удаляет узел вместе со всеми входящими и исходящими связями.
 * @param {GraphData} graph Исходный граф.
 * @param {string} id Идентификатор удаляемого узла.
 * @returns {GraphData} Граф без узла и его связей.
 */
export function removeNode(graph, id) {
    if (typeof id !== 'string') throw new Error('Для remove нужен nodeId');
    if (!Array.isArray(graph?.nodes)) throw new Error('Поле nodes должно являться массивом');
    if (!Array.isArray(graph?.links)) throw new Error('Поле links должно являться массивом');

    return {
        nodes: graph.nodes.filter((node) => node.id !== id),
        links: graph.links.filter((link) => link.source !== id && link.target !== id),
    };
}
