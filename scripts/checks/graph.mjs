/**
 * Проверка чистой логики графа в Node — без браузера и без тестового фреймворка (см. AGENTS.md).
 * Модули исходников загружаются через Vite в SSR-режиме, поэтому TypeScript ему доступен.
 *
 * Разделы прогона: полный layout с revision, конечные координаты, связи и цвета.
 *
 * Правки данных (`nodeForm`): неиспорченный исходник, id `custom-N`, направление связи по типу,
 * отсев несуществующего соседа и дубликатов, уход связей при удалении, набор вариантов соседей.
 *
 * Облака (`forceGraphCloud`) на грубой мерке: обрезка с одним «…», влезание в потолок, колонка
 * `WARNING_GUTTER`, иконка `subNode` без подписей.
 *
 * Стабильность раскладки. Требование владельца: «добавил один узел — положение не должно меняться
 * почти». Меряется смещение непричастных узлов (чьих данных изменение не коснулось) и их доля в
 * суммарном смещении всех узлов вместе с новым. Доля безразмерна и потому переживает подгонку шкалы
 * раскладки; абсолютные единицы сцены сами по себе ни о чём не говорят.
 *
 *   npm run check:logic
 *   node scripts/checks/graph.mjs --seed=24,170 --alpha=0.3,0.005
 */
import { createServer } from 'vite'

let failures = 0

function check(name, condition, detail = '') {
	if (condition) {
		console.log(`  ok   ${name}`)
		return
	}
	failures += 1
	console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Значения свипа можно задавать извне: таблицу надо сравнивать, а не читать глазами. */
function parseArgs(argv) {
	const read = (name, fallback) => {
		const hit = argv.find((arg) => arg.startsWith(`--${name}=`))

		return hit
			? hit
					.slice(name.length + 3)
					.split(',')
					.map(Number)
			: fallback
	}

	return { seeds: read('seed', [null, 24, 120, 170, 240]), alphas: read('alpha', [0.3, 0.05, 0.005]) }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const byId = (nodes) => new Map(nodes.map((node) => [node.id, node]))
const sum = (values) => values.reduce((acc, value) => acc + value, 0)

/** Грубая мерка из AGENTS.md — та же, что в остальных Node-проверках раскладки. */
const measure = (text, size) => text.length * size * 0.55

/**
 * Довести симуляцию до покоя. `equilibrium` — держать альфу на уровне `alphaMin`, пока скорость не
 * погаснет: остывание по `alphaMin` (дефолт d3) останавливает stepper, но не раскладку — силы
 * пропорциональны альфе, и при живой альфе они всё ещё тянут узлы.
 */
function cool(simulation, equilibrium = false) {
	simulation.stop()

	if (!equilibrium) {
		let guard = 0

		while (simulation.alpha() > simulation.alphaMin() && guard < 600) {
			simulation.tick()
			guard += 1
		}

		return
	}

	const nodes = simulation.nodes()

	simulation.alphaTarget(simulation.alphaMin())
	for (let guard = 0; guard < 200000; guard++) {
		simulation.tick()
		const step = nodes.reduce((max, node) => Math.max(max, Math.hypot(node.vx, node.vy)), 0)

		if (step < 0.01) break
	}
	simulation.alphaTarget(0)
}

/** Медианный просвет связанной пары — геометрия покоя: по ней видно, что карта не схлопнулась. */
function medianLinkGap(nodes, links) {
	const index = byId(nodes)
	const gaps = links
		.map(({ source, target }) => {
			const a = typeof source === 'object' ? source : index.get(source)
			const b = typeof target === 'object' ? target : index.get(target)

			return a && b ? distance(a, b) : null
		})
		.filter((gap) => gap !== null)
		.sort((x, y) => x - y)

	return gaps[Math.floor(gaps.length / 2)] ?? 0
}

/**
 * Число наездов тел друг на друга. Тела — прямоугольники облаков: облако заметно шире, чем выше,
 * и круговая оценка пропустила бы наезд по вертикали.
 */
function bodyOverlaps(nodes, layouts) {
	const bodies = nodes.map((node) => {
		const layout = layouts.get(node)

		return { x: node.x ?? 0, y: node.y ?? 0, w: layout.width, h: layout.height }
	})
	let hits = 0

	for (let i = 0; i < bodies.length; i++) {
		for (let j = i + 1; j < bodies.length; j++) {
			const a = bodies[i]
			const b = bodies[j]

			if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) hits += 1
		}
	}

	return hits
}

/** Число переходов от нового узла по связям: «далёкие» — это не меньше трёх переходов. */
function hopsFrom(startId, links) {
	const adjacency = new Map()
	const add = (from, to) => {
		if (!adjacency.has(from)) adjacency.set(from, new Set())
		adjacency.get(from).add(to)
	}

	links.forEach(({ source, target }) => {
		const from = typeof source === 'object' ? source.id : source
		const to = typeof target === 'object' ? target.id : target

		add(from, to)
		add(to, from)
	})

	const hops = new Map([[startId, 0]])
	let frontier = [startId]

	while (frontier.length > 0) {
		const next = []

		frontier.forEach((id) => {
			;(adjacency.get(id) ?? new Set()).forEach((neighbor) => {
				if (hops.has(neighbor)) return
				hops.set(neighbor, hops.get(id) + 1)
				next.push(neighbor)
			})
		})
		frontier = next
	}

	return hops
}

const root = process.cwd()
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })

const physics = await server.ssrLoadModule('/src/components/ForceGraph/forceGraph.ts')
const cloud = await server.ssrLoadModule('/src/components/ForceGraph/forceGraphCloud.ts')
const groupMetrics = await server.ssrLoadModule('/src/components/ForceGraph/groupMetrics.ts')
const nodeForm = await server.ssrLoadModule('/src/components/SettingsPanel/nodeForm.ts')
const graphComponents = await server.ssrLoadModule('/src/components/ForceGraph/graphComponents.ts')
const layout = await server.ssrLoadModule('/src/components/ForceGraph/layout.ts')
const linksLogic = await server.ssrLoadModule('/src/components/ForceGraph/resolveLinks.ts')
const source = await server.ssrLoadModule('/src/data/graph.ts')

const {
	prepareGraph,
	createSimulation,
	groupNeighborChargeMultiplier,
	GROUP_LINK_STRENGTH,
	createTypeColors,
	LINK_DISTANCE,
} = physics
const { calculateGraphLayout, applyLayout } = layout
const { resolveLinks } = linksLogic
const { MAX_GROUP_SIZE, splitGraphIntoComponents } = graphComponents
const {
	CLOUD_MAX_TEXT_WIDTH,
	CLOUD_PADDING_X,
	GROUP_FOCUS_SIZE,
	GROUP_FOCUS_SIZE_AT_40,
	SUB_NODE_SIZE,
	TITLE_FONT_SIZE,
	WARNING_GUTTER,
	createCloudLayouts,
	createFocusedGroupLayout,
	groupFocusSize,
	truncateToWidth,
} = cloud
const { groupChargeMultiplier } = groupMetrics
const { createNodeInData, deleteNodeFromData, neighborOptions, updateNodeInData } = nodeForm

const base = source.graphData
const NEW_ID = 'probe-new'

const componentFixture = {
	nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, title: id, type: 'node', hasWarning: false })),
	links: [
		{ source: 'a', target: 'b' },
		{ source: 'b', target: 'c' },
		{ source: 'd', target: 'e' },
		{ source: 'a', target: 'b' },
		{ source: 'missing', target: 'f' },
	],
}
const components = splitGraphIntoComponents(componentFixture)
check('компоненты связности упаковываются в одну группу', components.length === 1)
check(
	'изолированная нода остаётся отдельной компонентой',
	components[0].nodes.some(({ id }) => id === 'f'),
)
check(
	'дубликаты рёбер сохраняются, отсутствующие концы отбрасываются',
	components.flatMap(({ links }) => links).length === 4,
)
check(
	'направление исходных рёбер не меняется',
	components.flatMap(({ links }) => links).some(({ source, target }) => source === 'a' && target === 'b'),
)
const groupedNodes = splitGraphIntoComponents({
	nodes: Array.from({ length: 401 }, (_, index) => ({
		id: `isolated-${index}`,
		title: String(index),
		type: 'node',
		hasWarning: false,
	})),
	links: [],
})
check(
	'группы не превышают лимит размера',
	groupedNodes.every(({ nodes }) => nodes.length <= MAX_GROUP_SIZE) &&
		groupedNodes.flatMap(({ nodes }) => nodes).length === 401 &&
		groupedNodes.length === Math.ceil(401 / MAX_GROUP_SIZE),
)
check('пустой граф даёт пустой список компонент', splitGraphIntoComponents({ nodes: [], links: [] }).length === 0)

console.log('\n== полный расчёт раскладки ==')
const initial = calculateGraphLayout(base, 7)
const positioned = applyLayout(base, initial)
const located = byId(positioned.nodes)
const resolved = resolveLinks(positioned.nodes, positioned.links)
check(
	'worker возвращает revision и позицию каждой ноды',
	initial.revision === 7 && initial.positions.length === base.nodes.length,
)
check(
	'раскладка не мутирует исходные данные',
	base.nodes.every((node) => node.x === undefined),
)
check(
	'координаты конечны, связи разрешены',
	positioned.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)) &&
		resolved.every(({ source, target }) => located.get(source.id) === source && located.get(target.id) === target),
)
const changedData = {
	nodes: [...base.nodes, { id: 'probe-new', title: 'Новая', type: 'node', hasWarning: false }],
	links: [...base.links, { source: 'probe-new', target: base.nodes[1].id }],
}
const changedLayout = calculateGraphLayout(changedData, 8)
check(
	'полный перерасчёт включает новую ноду и связь',
	changedLayout.revision === 8 &&
		changedLayout.positions.length === changedData.nodes.length &&
		resolveLinks(applyLayout(changedData, changedLayout).nodes, applyLayout(changedData, changedLayout).links)
			.length === changedData.links.length,
)
check(
	'отсутствующий конец связи отбрасывается',
	resolveLinks(positioned.nodes, [{ source: 'missing', target: base.nodes[0].id }]).length === 0,
)
const types = [...new Set(base.nodes.map((node) => node.type))]
const colors = createTypeColors(base.nodes)
check(
	'цвета типов стабильны',
	types.every((type) => colors(type) === createTypeColors(base.nodes)(type)),
)
check(
	'множитель заряда группы считается по площади',
	[15, 40, 90, 270].every(
		(count) => Math.abs(groupNeighborChargeMultiplier(count) - groupChargeMultiplier(count)) < 0.001,
	),
)
const groupNode = { id: 'group', type: 'group', title: 'Группа', hasWarning: false, children: { nodes: [], links: [] } }
const outsideNode = { id: 'outside', type: 'node', title: 'Снаружи', hasWarning: false }
const groupLinkSimulation = createSimulation([groupNode, outsideNode], [{ source: 'group', target: 'outside' }])
check(
	'связь группы ослаблена',
	groupLinkSimulation.force('link').strength()({ source: groupNode, target: outsideNode }) === GROUP_LINK_STRENGTH,
)
groupLinkSimulation.stop()

console.log('\n== правки данных (nodeForm) ==')

const work = { id: 'w-1', type: 'node', title: 'Работа', hasWarning: false }
const patent = { id: 'p-1', type: 'subNode', title: 'Патент', hasWarning: false }
const fixture = { nodes: [work, patent], links: [{ source: 'w-1', target: 'p-1' }] }

const renamed = updateNodeInData(fixture, 'w-1', {
	title: 'Новое название',
	description: '',
	hasWarning: true,
})

check(
	'правка данных не трогает исходный объект',
	fixture.nodes[0].title === 'Работа' && renamed.nodes[0] !== fixture.nodes[0],
)
check('пустое описание не заводится пустой строкой', renamed.nodes[0].description === undefined)
check('ссылка на список связей сохраняется', renamed.links === fixture.links)

const created = createNodeInData(
	fixture,
	{ type: 'subNode', title: 'Новый патент', description: 'описание', hasWarning: false },
	['w-1', 'w-1', 'нет-такого'],
)

check('новый узел получает id custom-N', created.nodes.at(-1).id === 'custom-1')
check('неизвестный сосед отброшен, дубликат схлопнут', created.links.length === 2, `связей ${created.links.length}`)
check(
	'направление связи задаётся типом',
	created.links[1].source === 'w-1' && created.links[1].target === 'custom-1',
	JSON.stringify(created.links[1]),
)

const removedWork = deleteNodeFromData(created, 'w-1')

check(
	'при удалении узла уходят и его связи',
	removedWork.nodes.length === 2 && removedWork.links.length === 0,
	`узлов ${removedWork.nodes.length}, связей ${removedWork.links.length}`,
)
check(
	'варианты соседей зависят от типа',
	neighborOptions(fixture, 'node').every((option) => option.value === 'p-1') &&
		neighborOptions(fixture, 'subNode').length === 2,
)

console.log('\n== раскладка облаков и обрезка подписей ==')

const longTitle = 'Очень длинное название работы, которое гарантированно не влезает в потолок ширины облака'
const shortTitle = 'Короткая работа'
const cut = truncateToWidth(longTitle, TITLE_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure)

check(
	'короткая строка не трогается',
	truncateToWidth(shortTitle, TITLE_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure) === shortTitle,
)
check('обрезанная кончается одним «…»', cut.endsWith('…') && !cut.slice(0, -1).includes('…'), cut)
check('хвостовой пробел перед «…» срезан', !/\s…$/.test(cut), JSON.stringify(cut.slice(-4)))
check(
	'обрезанная влезает в потолок, а исходная не влезала',
	measure(cut, TITLE_FONT_SIZE) <= CLOUD_MAX_TEXT_WIDTH && measure(longTitle, TITLE_FONT_SIZE) > CLOUD_MAX_TEXT_WIDTH,
	`${measure(cut, TITLE_FONT_SIZE).toFixed(0)} при потолке ${CLOUD_MAX_TEXT_WIDTH}`,
)

const cloudWork = {
	id: 'c-1',
	type: 'node',
	title: shortTitle,
	description: 'пояснение',
	hasWarning: false,
	x: 0,
	y: 0,
}
const warned = { ...cloudWork, id: 'c-2', hasWarning: true }
const bare = { ...cloudWork, id: 'c-3', description: undefined }
const icon = { id: 'c-4', type: 'subNode', title: 'Патент', hasWarning: false, x: 0, y: 0 }
const layouts = createCloudLayouts([cloudWork, warned, bare, icon], measure)
const plain = layouts.get(cloudWork)

check('запись есть на каждый узел', layouts.size === 4, `записей ${layouts.size}`)
check('облако с описанием выше, чем то же без него', plain.height > layouts.get(bare).height)
check('описание стоит под заголовком', plain.descriptionY > plain.titleY)
check(
	'левый край текста — на паддинге от края тела',
	Math.abs(plain.textX - (-plain.width / 2 + CLOUD_PADDING_X)) < 1e-9,
	`textX ${plain.textX}`,
)
check('без предупреждения точки нет', plain.warning === undefined && layouts.get(warned).warning !== undefined)
check(
	'колонка предупреждения расширяет тело и уводит текст правее точки',
	layouts.get(warned).width === plain.width + WARNING_GUTTER &&
		layouts.get(warned).textX > layouts.get(warned).warning.x,
	`ширина ${layouts.get(warned).width} против ${plain.width}`,
)
check(
	'иконка саб-ноды — квадрат без подписей',
	layouts.get(icon).width === SUB_NODE_SIZE &&
		layouts.get(icon).height === SUB_NODE_SIZE &&
		layouts.get(icon).title === '' &&
		layouts.get(icon).description === '',
)

const smallGroup = {
	...cloudWork,
	id: 'group-15',
	type: 'group',
	children: { nodes: Array.from({ length: 15 }, (_, index) => ({ id: `small-${index}` })), links: [] },
}
const largeGroup = {
	...smallGroup,
	id: 'group-40',
	children: { nodes: Array.from({ length: 40 }, (_, index) => ({ id: `large-${index}` })), links: [] },
}
const focusedSmall = createFocusedGroupLayout(createCloudLayouts([smallGroup], measure).get(smallGroup))
const focusedLarge = createFocusedGroupLayout(createCloudLayouts([largeGroup], measure).get(largeGroup))

check('круг группы рассчитан по количеству: 15 элементов — 200', groupFocusSize(15) === GROUP_FOCUS_SIZE)
check('круг группы рассчитан по количеству: 40 элементов — 370', groupFocusSize(40) === GROUP_FOCUS_SIZE_AT_40)
check(
	'большая группа растёт нелинейно без верхнего ограничения',
	groupFocusSize(270) > groupFocusSize(40) && groupFocusSize(270) < 370 + (270 - 40) * 6.8,
)
check(
	'приближённый layout сохраняет вычисленный диаметр круга',
	focusedSmall.focusedSize === 200 && focusedLarge.focusedSize === 370,
)

console.log('\n== видимые группы ==')
const nestedGroup = { ...smallGroup, id: 'nested', x: 1100, y: 0, children: { nodes: [], links: [] } }
const nearGroup = { ...smallGroup, id: 'near', x: 0, y: 0, children: { nodes: [nestedGroup], links: [] } }
const farGroup = { ...largeGroup, id: 'far', x: 1100, y: 0 }
const snapshots = visibility.snapshotGroups([nearGroup, farGroup, { ...bare, x: 0, y: 0 }])
const nearViewport = { left: -150, right: 150, top: -150, bottom: 150 }
check(
	'снимок включает только группы и сохраняет вложенность',
	snapshots.length === 2 && snapshots[0].children[0].id === 'nested',
)
check(
	'радиус снимка совпадает с увеличенным кругом группы',
	snapshots[0].radius === focusedSmall.focusedSize / 2 && snapshots[1].radius === focusedLarge.focusedSize / 2,
)
check(
	'группа на границе viewport видима',
	visibility.visibleGroupIds(snapshots, { ...nearViewport, left: 100 }).includes('near'),
)
check(
	'далёкая группа и вложенная группа вне viewport скрыты',
	visibility.visibleGroupIds(snapshots, nearViewport).join(',') === 'near',
)
check(
	'вложенная группа учитывает масштаб родителя',
	visibility.visibleGroupIds(snapshots, { left: 200, right: 300, top: -50, bottom: 50 }).join(',') === 'nested',
)
check(
	'перемещение viewport меняет список',
	visibility.visibleGroupIds(snapshots, { left: 950, right: 1250, top: -150, bottom: 150 }).join(',') === 'far',
)

console.log('\n== геометрия полной раскладки ==')
const restGap = medianLinkGap(positioned.nodes, positioned.links)
const restOverlaps = bodyOverlaps(positioned.nodes, createCloudLayouts(positioned.nodes, measure))
check('связанные узлы не совпадают', restGap > LINK_DISTANCE * 0.3, `просвет ${restGap}`)
check('тела не схлопнулись', restOverlaps < base.nodes.length / 2, `наездов ${restOverlaps}`)

await server.close()

if (failures > 0) {
	console.error(`\nFAILURES: ${failures}`)
	process.exit(1)
}

console.log('\nPASS')
