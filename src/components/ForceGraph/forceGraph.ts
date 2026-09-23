import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force'
import { schemeCategory10 } from 'd3-scale-chromatic'
import type { DrawnLink, GraphData, GraphLink, GraphNode, GraphNodeType } from '../../types/graph'

/**
 * Перенос демо «Disjoint force-directed graph»:
 * https://observablehq.com/@d3/disjoint-force-directed-graph/2
 *
 * Силы, размеры сцены и цвета взяты из ноутбука; отличия: расстояния раскладки подобраны под
 * облака вместо кружков (см. `LAYOUT_SCALE` и `LINK_DISTANCE`), сила связи задана плоской и слабой
 * вместо ноутбучной формулы d3 (см. `LINK_STRENGTH`), цвета раскладываются по `type`
 * узла, а движение узлов демпфировано сильнее ноутбучного (см. `VELOCITY_DECAY`).
 * Ключевая мысль оригинала: для несвязного графа нужны позиционирующие силы (forceX/forceY),
 * а не центрирующая (forceCenter) — иначе отдельные подграфы разлетаются за пределы сцены.
 */

/** Размеры сцены из ноутбука; viewBox строится вокруг нуля, потому что все силы целятся в ноль. */
export const GRAPH_WIDTH = 928
export const GRAPH_HEIGHT = 680

/**
 * Масштаб раскладки: узлы-облака в разы крупнее кружков ноутбука, поэтому отталкивание зарядов
 * растянуто по площади (`LAYOUT_SCALE ** 2`) — это и есть простор между несвязанными узлами.
 * Вместе с зарядом растёт равновесие одинокого узла (r = √(strength / 0.1) — против притяжения
 * к центру с силой 0.1). Притяжение к нулю при этом трогать не нужно: оно линейно, целится в ноль
 * и масштабируется заодно.
 */
export const LAYOUT_SCALE = 8

/**
 * Дистанция покоя связи в единицах сцены: в ноутбуке было 30 (значение d3-force по умолчанию) при
 * масштабе раскладки 1. Задаётся отдельно и короче общей растяжки: облака крупные, а связанные узлы
 * должны стоять плотнее просто отталкивающихся, иначе карта читается как разреженная.
 *
 * Вместе с `LAYOUT_SCALE` это две независимые ручки: здесь — плотность связок внутри кластера,
 * там — простор между несвязанными узлами. Подгоняются по картинке: короткая связь при прежнем
 * заряде стягивает кластеры в читаемые сгустки, а место между ними остаётся. Число задано по
 * замеру: 15% от прежнего расстояния ушло бы в 127.5, но заряд раздвигает и связанные пары,
 * поэтому до −15% на картинке пружину приходится укорачивать сильнее.
 */
export const LINK_DISTANCE = 100

/**
 * Сила связи — плоская для всех связей, вместо ноутбучного правила d3 (`1 / min(степеней концов)`,
 * у нас это 0.5 у пар и 1 у листьев). Перегрузка была именно на листьях: лист степени 1 держал своего
 * партнёра крепче всех, и за потащенный узел тянулся весь кластер. Значение не зависит от степени
 * намеренно — тянуться должно ровно, а плотность связок держит дистанция (`LINK_DISTANCE`).
 *
 * Замер по раскладке в покое и по прокату карты за жест: 0.5 оставляет медианный просвет связанной
 * пары как был (и даже приподнимает его — тела перестают залезать друг на друга), а слабее 0.35
 * связки расползаются (просвет растёт на порядок) и «желе» возвращается: далёкая от равновесия
 * раскладка качается от разогрева сильнее.
 */
export const LINK_STRENGTH = 0.5

/** Сила заряда (отталкивания): значение d3-force по умолчанию, оно же было в ноутбуке. */
export const CHARGE_STRENGTH = -30

/** Сила связи по умолчанию, если её нет в данных: в ноутбуке у всех связей было 2. */
export const LINK_FORCE_DEFAULT = 2

/**
 * Демпфирование скорости: доля скорости, которую узел теряет за тик (дефолт d3-force — 0.4).
 * Здесь выше, чтобы узлы останавливались почти сразу после сдвига и карта не «плыла» как желе.
 */
export const VELOCITY_DECAY = 0.6

/**
 * Разогрев симуляции на время перетаскивания узла (`alphaTarget`, в ноутбуке было 0.3). Чем
 * меньше значение, тем меньше едет вся карта, пока тащат один узел: соседи подтягиваются,
 * остальные почти стоят.
 *
 * Замер на жесте в 320 единиц сцены: при 0.1 суммарный прокат остальных узлов был 1788 единиц с
 * пиком 2.8 за тик, при 0.05 — 879 и 1.5, то есть вдвое меньше. Ниже 0.05 соседи за курсором уже
 * не поспевают (медианный сдвиг падает до единиц), поэтому взята половина ноутбучного значения.
 */
export const DRAG_ALPHA_TARGET = 0.05

/**
 * Доля белого в заливке тела узла: заливка выходит светлой, как фоны панелей страницы, но
 * с оттенком типа узла. Тело не прозрачное — под подписями не должны просвечивать связи.
 */
export const BODY_FILL_WHITE = 0.85

/** Симуляция мутирует узлы и связи, поэтому ей отдаются копии данных — как в ноутбуке. */
export function prepareGraph(data: GraphData): { nodes: GraphNode[]; links: GraphLink[] } {
	return {
		nodes: data.nodes.map((node) => ({ ...node })),
		links: data.links.map((link) => ({ ...link })),
	}
}

/**
 * Силы ноутбука, подогнанные под крупные облака: пружины связей, отталкивание зарядов и притяжение
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
 * Цвет типа узла — аналог d3.scaleOrdinal(schemeCategory10) из ноутбука: оттенки выдаются
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
