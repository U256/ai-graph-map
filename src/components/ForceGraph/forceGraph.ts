import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'
import type { DrawnLink, GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'

/** Размер окна сцены в единицах раскладки; viewBox строится вокруг нуля, потому что все силы целятся в ноль. */
export const GRAPH_WIDTH = 928
export const GRAPH_HEIGHT = 680

/**
 * Масштаб раскладки: узлы-облака в разы крупнее кружков, поэтому отталкивание зарядов
 * растянуто по площади (`LAYOUT_SCALE ** 2`) — это и есть простор между несвязанными узлами.
 * Вместе с зарядом растёт равновесие одинокого узла (r = √(strength / 0.1) — против притяжения
 * к центру с силой 0.1). Притяжение к нулю при этом трогать не нужно: оно линейно, целится в ноль
 * и масштабируется заодно.
 */
export const LAYOUT_SCALE = 8

/**
 * Дистанция покоя связи в единицах раскладки — 100 при масштабе сцены 8, то есть заметно короче
 * общей растяжки. Задаётся отдельно от неё: облака крупные, а связанные узлы должны стоять плотнее
 * просто отталкивающихся, иначе карта читается как разреженная.
 *
 * Вместе с `LAYOUT_SCALE` это две независимые ручки: здесь — плотность связок внутри кластера,
 * там — простор между несвязанными узлами. Подгоняются по картинке: короткая связь при прежнем
 * заряде стягивает кластеры в читаемые сгустки, а место между ними остаётся.
 */
export const LINK_DISTANCE = 100

/**
 * Сила связи — плоская для всех связей, вместо правила d3 (`1 / min(степеней концов)`), которое
 * перегружало листовые связи: лист степени 1 держал своего партнёра крепче всех, и за потащенный
 * узел тянулся весь кластер. Значение не зависит от степени намеренно — тянуться должно ровно,
 * а плотность связок держит дистанция (`LINK_DISTANCE`).
 *
 * Замер по раскладке в покое и по прокату карты за жест: 0.5 оставляет медианный просвет связанной
 * пары как был (и даже приподнимает его — тела перестают залезать друг на друга), а слабее 0.35
 * связки расползаются и «желе» возвращается: далёкая от равновесия раскладка качается сильнее.
 */
export const LINK_STRENGTH = 0.5

/** Сила заряда (отталкивания): значение d3-force по умолчанию. */
export const CHARGE_STRENGTH = -30

/** Сила связи по умолчанию, если её нет в данных. */
export const LINK_FORCE_DEFAULT = 2

/**
 * Демпфирование скорости: доля скорости, которую узел теряет за тик (дефолт d3-force — 0.4).
 * Здесь выше, чтобы узлы останавливались почти сразу после сдвига и карта не «плыла» как желе.
 */
export const VELOCITY_DECAY = 0.6

/**
 * Разогрев симуляции на время перетаскивания узла (`alphaTarget`). Чем меньше значение, тем меньше
 * едет вся карта, пока тащат один узел: соседи подтягиваются, остальные почти стоят.
 *
 * Главная ручка «желе», и она же предел: замер на жесте в 320 единиц сцены даёт при 0.1 суммарный
 * прокат остальных узлов 1788 единиц с пиком 2.8 за тик, при 0.05 — 879 и 1.5, то есть вдвое меньше.
 * Ниже 0.05 соседи за курсором уже не поспевают (медианный сдвиг падает до единиц), поэтому дальше
 * снижать не стоит; ослабление связки на тот же порядок даёт обратный эффект.
 */
export const DRAG_ALPHA_TARGET = 0.1

/**
 * Доля белого в заливке тела узла: заливка выходит светлой, как фоны панелей страницы, но
 * с оттенком типа узла. Тело не прозрачное — под подписями не должны просвечивать связи.
 */
export const BODY_FILL_WHITE = 0.85

/** Симуляция мутирует узлы и связи, поэтому ей отдаются копии данных, а не сами данные. */
export function prepareGraph(data: GraphData): { nodes: GraphNode[]; links: GraphLink[] } {
	return {
		nodes: data.nodes.map((node) => ({ ...node })),
		links: data.links.map((link) => ({ ...link })),
	}
}

/**
 * Позиционирующие силы вместо центрирующей: пружины связей, отталкивание зарядов и притяжение
 * к центру координат. Притяжение к нулю остаётся как было — оно сдерживает несвязные компоненты,
 * а его равновесие с зарядом задаёт масштаб сцены.
 */
export function createSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
	const link = forceLink<GraphNode, GraphLink>(links)
		.id((node) => node.id)
		.distance(LINK_DISTANCE)
		.strength(LINK_STRENGTH)

	return forceSimulation(nodes)
		.force('link', link)
		.force('charge', forceManyBody().strength(CHARGE_STRENGTH * LAYOUT_SCALE ** 2))
		.force('x', forceX())
		.force('y', forceY())
		.velocityDecay(VELOCITY_DECAY)
}

/** forceLink подменяет концы связей узлами во время выполнения, поэтому типам нужна подсказка. */
export function asDrawnLinks(links: GraphLink[]): DrawnLink[] {
	return links as unknown as DrawnLink[]
}

/**
 * Цвет типа узла — через `d3.scaleOrdinal(schemeCategory10)`: оттенки выдаются
 * в порядке первого появления типа в данных, поэтому легенда не нужна.
 */
export function createTypeColors(nodes: GraphNode[]): (type: GraphNodeType) => string {
	const byType = new Map<GraphNodeType, string>()
	nodes.forEach((node) => {
		if (!byType.has(node.type)) byType.set(node.type, schemeCategory10[byType.size % schemeCategory10.length])
	})
	return (type) => byType.get(type) ?? schemeCategory10[0]
}

/**
 * Замешивает цвет в белый: заливка тела узла получается почти фоновой, но со своим оттенком,
 * а обводка остаётся в полную силу. Цвет в hex (`#rrggbb`) — как отдаёт `schemeCategory10`.
 */
export function tintToWhite(hex: string, ratio: number = BODY_FILL_WHITE): string {
	const value = Number.parseInt(hex.slice(1), 16)
	const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
	const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * ratio))
	return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
