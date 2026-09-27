/**
 * Проверка чистой логики графа в Node — без браузера и без тестового фреймворка (см. AGENTS.md).
 * Модули исходников загружаются через Vite в SSR-режиме, поэтому TypeScript ему доступен.
 *
 * Разделы прогона: инварианты разбора (`forceGraphUpdate`, `crud/*`) — пустой план на идентичных
 * данных, правка заголовка трогает только этот узел и сохраняет его координаты, две правки подряд
 * одного узла замечаются обе, координаты нового узла конечны и не нулевые, связи разрешены в объекты,
 * `NaN` нет, связь с недостающим концом отбрасывается, цвет типа стабилен.
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
const logic = await server.ssrLoadModule('/src/components/ForceGraph/forceGraphUpdate.ts')
const cloud = await server.ssrLoadModule('/src/components/ForceGraph/forceGraphCloud.ts')
const nodeForm = await server.ssrLoadModule('/src/components/SettingsPanel/nodeForm.ts')
const nodesCrud = await server.ssrLoadModule('/src/components/ForceGraph/crud/graphNodesCRUD.ts')
const source = await server.ssrLoadModule('/src/data/graph.ts')

const {
	prepareGraph,
	createSimulation,
	createTypeColors,
	UPDATE_ALPHA,
	NEW_NODE_SEED_RADIUS,
	NEW_NODE_SEED_FALLBACK,
	LINK_DISTANCE,
} = physics
const { applyGraphUpdate, planGraphUpdate, readGraphState } = logic
const { seedPosition } = nodesCrud
const {
	CLOUD_MAX_TEXT_WIDTH,
	CLOUD_PADDING_X,
	SUB_NODE_SIZE,
	TITLE_FONT_SIZE,
	WARNING_GUTTER,
	createCloudLayouts,
	truncateToWidth,
} = cloud
const { createNodeInData, deleteNodeFromData, neighborOptions, updateNodeInData } = nodeForm

const base = source.graphData
const NEW_ID = 'probe-new'

/**
 * Прогон «добавили один узел» — та же последовательность, что в `forceGraphView.update`, только без
 * DOM. Возвращает смещение непричастных узлов: тех, что после разбора остались теми же объектами.
 */
function runAdd({ alpha, settle, seed, hops, equilibrium = false, pin = false }) {
	const start = prepareGraph(base)
	const simulation = createSimulation(start.nodes, start.links)
	const linkForce = simulation.force('link')

	cool(simulation, equilibrium)
	start.nodes.forEach((node) => {
		node.vx = 0
		node.vy = 0
	})

	// снимок координат, а не ссылки на узлы: узлы непричастных сохраняются теми же объектами,
	// и сравнение объекта с самим собой дало бы ноль вместо смещения
	const geometry = new Map([...simulation.nodes()].map((node) => [node.id, { x: node.x, y: node.y }]))
	const previous = readGraphState(simulation.nodes(), linkForce.links())
	const partner = base.nodes[1].id
	const nextData = {
		nodes: [...base.nodes, { id: NEW_ID, type: 'node', title: 'Новая работа', description: 'Проверка' }],
		links: [...base.links, { source: NEW_ID, target: partner, force: 2 }],
	}
	const applied = applyGraphUpdate(previous, planGraphUpdate(previous, nextData))

	// `plan.seeds` считается по прежним связям, в которых нового узла ещё нет, поэтому плечо свипа
	// берётся вокруг соседа, с которым узел связали: иначе свип мерил бы высадку из центра сцены
	if (seed !== null) {
		const node = byId(applied.nodes).get(NEW_ID)
		const center = byId(applied.nodes).get(partner)
		const placed = seedPosition(center, applied.nodes.length - 1)

		// то же направление, что у приложения, но плечо из аргумента свипа
		const scale = seed / NEW_NODE_SEED_RADIUS

		node.x = center.x + (placed.x - center.x) * scale
		node.y = center.y + (placed.y - center.y) * scale
	}

	// путь нового узла считается от точки высадки: без него доля непричастных была бы льстивой
	const landed = byId(applied.nodes).get(NEW_ID)

	geometry.set(NEW_ID, { x: landed.x, y: landed.y, start: true })

	if (settle) {
		applied.nodes.forEach((node) => {
			if (previous.nodes.get(node.id) === node) {
				node.vx = 0
				node.vy = 0
			}
		})
	}

	// закрепление непричастных узлов — единственный способ не сдвинуть их вовсе: равновесие d3 с
	// глобальными силами нелокально, так что alpha решает лишь то, успеем мы туда доехать
	if (pin) {
		applied.nodes.forEach((node) => {
			if (previous.nodes.get(node.id) === node) {
				node.fx = node.x
				node.fy = node.y
			}
		})
	}

	simulation.nodes(applied.nodes)
	linkForce.links(applied.links)
	simulation.alpha(alpha)
	cool(simulation, equilibrium)

	if (pin) {
		applied.nodes.forEach((node) => {
			node.fx = null
			node.fy = null
		})
	}

	const after = byId(simulation.nodes())
	const hopOf = hopsFrom(NEW_ID, applied.links)
	const moved = [...geometry.keys()].map((id) => ({ id, value: distance(after.get(id), geometry.get(id)) }))
	const kept = moved.filter(({ id }) => id !== NEW_ID)
	const far = kept.filter(({ id }) => (hopOf.get(id) ?? 9) >= hops)
	const total = sum(moved.map(({ value }) => value))
	const keptSum = sum(kept.map(({ value }) => value))

	return {
		kept: keptSum,
		perNode: kept.length > 0 ? keptSum / kept.length : 0,
		far: sum(far.map(({ value }) => value)),
		max: Math.max(...kept.map(({ value }) => value), 0),
		share: total > 0 ? keptSum / total : 0,
		gap: medianLinkGap(simulation.nodes(), linkForce.links()),
		overlaps: bodyOverlaps(simulation.nodes(), createCloudLayouts(simulation.nodes(), measure)),
		// судьба нового узла: встал ли он к тому, с кем его связали, и не лёг ли чужим телом
		newLink: distance(after.get(NEW_ID), after.get(partner)),
		newOverlaps: overlapsOf(simulation.nodes(), createCloudLayouts(simulation.nodes(), measure), NEW_ID),
	}
}

/** Сколько чужих тел накрыло тело узла с таким id. */
function overlapsOf(nodes, layouts, id) {
	const self = nodes.find((node) => node.id === id)
	const a = { x: self.x, y: self.y, w: layouts.get(self).width, h: layouts.get(self).height }

	return nodes
		.filter((node) => node.id !== id)
		.filter((node) => {
			const b = { x: node.x, y: node.y, w: layouts.get(node).width, h: layouts.get(node).height }

			return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
		}).length
}

const args = parseArgs(process.argv.slice(2))

console.log('\n== инварианты разбора ==')

const settled = prepareGraph(base)
const settledSimulation = createSimulation(settled.nodes, settled.links)
const settledLinkForce = settledSimulation.force('link')

cool(settledSimulation)

const restPositions = byId(settled.nodes)
const restGap = medianLinkGap(settled.nodes, settledLinkForce.links())
const restOverlaps = bodyOverlaps(settled.nodes, createCloudLayouts(settled.nodes, measure))
const partner = base.nodes[0].id
let state = readGraphState(settled.nodes, settledLinkForce.links())

const same = planGraphUpdate(state, base)

check(
	'пустой план на идентичных данных',
	same.removedNodeKeys.length === 0 &&
		same.removedLinkKeys.length === 0 &&
		same.addedNodes.length === 0 &&
		same.addedLinks.length === 0 &&
		same.changed.nodes.length === 0,
)

const edited = {
	nodes: base.nodes.map((node) => (node.id === partner ? { ...node, title: 'Правка заголовка' } : node)),
	links: base.links,
}
const editPlan = planGraphUpdate(state, edited)
const editResult = applyGraphUpdate(state, editPlan)
const editNodes = byId(editResult.nodes)

check(
	'правка заголовка помечает только этот узел',
	editPlan.changed.nodes.length === 1 && editPlan.changed.nodes[0].node.id === partner,
	`помечено ${editPlan.changed.nodes.length}`,
)
check('слоям отдан ровно один изменённый узел', editResult.changedNodeKeys.size === 1)
check('правка заголовка сохраняет позицию', distance(editNodes.get(partner), restPositions.get(partner)) < 1e-9)
check('изменённый узел — новый объект', editNodes.get(partner) !== restPositions.get(partner))
check(
	'неизменённый узел остаётся тем же объектом',
	editNodes.get(base.nodes[1].id) === restPositions.get(base.nodes[1].id),
)

// состояние перечитывается из результата применения: снимок значений обязан пережить applyGraphUpdate,
// иначе вторая правка того же узла станет невидимой (регрессия с мутированным «прежним» снимком)
state = readGraphState(editResult.nodes, editResult.links)

const twice = planGraphUpdate(state, {
	nodes: edited.nodes.map((node) => (node.id === partner ? { ...node, title: 'Вторая правка' } : node)),
	links: base.links,
})

check(
	'вторая правка того же узла замечена',
	twice.changed.nodes.length === 1 && twice.changed.nodes[0].node.id === partner,
	`помечено ${twice.changed.nodes.length}`,
)

const broken = {
	nodes: [...base.nodes, { id: NEW_ID, type: 'node', title: 'Новая работа', description: 'Проверка' }],
	links: [
		...base.links,
		{ source: NEW_ID, target: partner, force: 2 },
		{ source: NEW_ID, target: 'нет-такого', force: 2 },
	],
}
const brokenPlan = planGraphUpdate(state, broken)

check(
	'связь с недостающим концом отсеяна',
	brokenPlan.addedLinks.length === 1 &&
		brokenPlan.keptLinks.length + brokenPlan.addedLinks.length === base.links.length + 1,
	`добавлено ${brokenPlan.addedLinks.length} связок из двух новых`,
)

const newResult = applyGraphUpdate(state, brokenPlan)
const nextNodes = byId(newResult.nodes)
const newcomer = nextNodes.get(NEW_ID)

check('новый узел добавлен ровно один раз', newResult.nodes.filter((node) => node.id === NEW_ID).length === 1)
check('новый узел помечен добавленным', newResult.addedNodeKeys.has(`n:${NEW_ID}`))
check(
	'координаты нового узла конечны и не нулевые',
	Number.isFinite(newcomer.x) && Number.isFinite(newcomer.y) && (newcomer.x !== 0 || newcomer.y !== 0),
	`${newcomer.x},${newcomer.y}`,
)

const landedNear = distance(newcomer, nextNodes.get(partner))

// `plan.seeds` считается по прежним связям, в которых нового узла ещё нет: он всегда едет из запасной
// точки у начала координат, а соседей его доводит до нужного места связь на разогреве
console.log(
	`  высадка нового узла: ${landedNear.toFixed(0)} ед. до соседа при плече посева ${NEW_NODE_SEED_RADIUS} и запасном ${NEW_NODE_SEED_FALLBACK}`,
)

const newSimulation = createSimulation(newResult.nodes, newResult.links)

newSimulation.force('link').links(newResult.links)
newSimulation.stop()
newSimulation.tick()

check(
	'после links() концы связей — объекты узлов',
	newResult.links.every((link) => typeof link.source === 'object' && typeof link.target === 'object'),
)
check(
	'NaN в координатах нет',
	newResult.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)),
)

const dropPlan = planGraphUpdate(readGraphState(settled.nodes, settledLinkForce.links()), {
	nodes: base.nodes.slice(1),
	links: base.links,
})

check(
	'при удалении узла уходят и его связи',
	dropPlan.removedNodeKeys.length === 1 && dropPlan.removedLinkKeys.length > 0,
	`узлов ${dropPlan.removedNodeKeys.length}, связей ${dropPlan.removedLinkKeys.length}`,
)

const types = [...new Set(base.nodes.map((node) => node.type))]
const colors = createTypeColors(base.nodes)

check('разным типам — разные цвета', new Set(types.map((type) => colors(type))).size === types.length)
check(
	'цвет типа стабилен между сборками палитры',
	types.every((type) => colors(type) === createTypeColors(base.nodes)(type)),
)

const chargeNodes = [
	{ id: 'charge-default', type: 'node', title: 'Обычный', hasWarning: false },
	{ id: 'charge-strong', type: 'node', title: 'Сильный', hasWarning: false, chargeMultiplier: 2 },
]
const chargeSimulation = createSimulation(chargeNodes, [])
const chargeForce = chargeSimulation.force('charge')

check(
	'индивидуальный множитель меняет только силу конкретной ноды',
	chargeForce.strength()(chargeNodes[1]) === chargeForce.strength()(chargeNodes[0]) * 2,
)
chargeSimulation.stop()

console.log('\n== правки данных (nodeForm) ==')

const work = { id: 'w-1', type: 'node', title: 'Работа', hasWarning: false }
const patent = { id: 'p-1', type: 'subNode', title: 'Патент', hasWarning: false }
const fixture = { nodes: [work, patent], links: [{ source: 'w-1', target: 'p-1' }] }

const renamed = updateNodeInData(fixture, 'w-1', {
	title: 'Новое название',
	description: '',
	hasWarning: true,
	chargeMultiplier: 2,
})

check(
	'правка данных не трогает исходный объект',
	fixture.nodes[0].title === 'Работа' && renamed.nodes[0] !== fixture.nodes[0],
)
check('пустое описание не заводится пустой строкой', renamed.nodes[0].description === undefined)
check('правка узла сохраняет множитель отталкивания', renamed.nodes[0].chargeMultiplier === 2)
check('ссылка на список связей сохраняется', renamed.links === fixture.links)

const created = createNodeInData(
	fixture,
	{ type: 'subNode', title: 'Новый патент', description: 'описание', hasWarning: false, chargeMultiplier: 0.5 },
	['w-1', 'w-1', 'нет-такого'],
)

check('новый узел получает id custom-N', created.nodes.at(-1).id === 'custom-1')
check('новый узел получает множитель отталкивания', created.nodes.at(-1).chargeMultiplier === 0.5)
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

console.log('\n== геометрия покоя ==')
console.log(`  узлов ${base.nodes.length}, связей ${base.links.length}`)
console.log(`  медианный просвет связанной пары: ${restGap.toFixed(1)}`)
console.log(`  наездов тел друг на друга: ${restOverlaps}`)

console.log('\n== смещение непричастных узлов при добавлении одного узла ==')

/**
 * Стартовое усидание — «остывание», как в браузере: d3 гасит stepper на alphaMin и считает раскладку
 * готовой. Две ручки: alpha (насколько далеко успеем уехать за остаток остывания) и pin (временно
 * закрепить непричастные узлы).
 */
const rowsTable = []

console.log('  режим        | посев | alpha | ед/узел | всего | дальние | нового до связи | наездов нового')

for (const pin of [false, true]) {
	for (const seed of [null, 24]) {
		for (const alpha of args.alphas) {
			const result = runAdd({ alpha, settle: true, seed, hops: 3, pin })

			rowsTable.push({ pin, seed, alpha, ...result })
			console.log(
				`  ${pin ? 'закрепление' : 'разогрев'.padEnd(12)} | ${String(seed ?? 'конст').padStart(5)} | ${alpha.toFixed(
					3,
				)} | ${result.perNode.toFixed(2).padStart(8)} | ${result.kept.toFixed(0).padStart(6)} | ${result.far
					.toFixed(0)
					.padStart(7)} | ${result.newLink.toFixed(0).padStart(8)} | ${String(result.newOverlaps).padStart(9)}`,
			)
		}
	}
}

const find = (pin, seed, alpha) =>
	rowsTable.find((item) => item.pin === pin && item.seed === seed && item.alpha === alpha)
const low = Math.min(...args.alphas)
const current = find(false, null, UPDATE_ALPHA)
const quiet = find(false, null, low)
const pinned = find(true, null, UPDATE_ALPHA)

console.log('\n== сводка ==')
;[
	[`разогрев ${UPDATE_ALPHA} (как сейчас)`, current],
	[`разогрев ${low}`, quiet],
	['закрепление (узлы заморожены)', pinned],
].forEach(([name, item]) => {
	console.log(
		`  ${name.padEnd(30)} → ${item.perNode.toFixed(2)} ед/узел, до связи ${item.newLink.toFixed(0)}, наездов нового ${
			item.newOverlaps
		}, просвет ${item.gap.toFixed(1)}`,
	)
})

check(
	'низкий разогрев оставляет непричастные узлы на месте',
	quiet.perNode < 2,
	`alpha ${low}: ${quiet.perNode.toFixed(2)} ед/узел против ${current.perNode.toFixed(2)} при ${UPDATE_ALPHA}`,
)
// посадка меряется при том разогреве, с которым узел приезжает в сцену на самом деле (UPDATE_ALPHA):
// при alpha 0.005 силы не успевают ни дотянуть новое тело до соседа, ни развести его с чужими
check(
	'новый узел встаёт к своему соседу',
	current.newLink > LINK_DISTANCE * 0.4 && current.newLink < LINK_DISTANCE * 3,
	`${current.newLink.toFixed(0)} единиц при дистанции связи ${LINK_DISTANCE}`,
)
check('новое тело не ложится на соседние', current.newOverlaps === 0, `наездов: ${current.newOverlaps}`)
check(
	'закрепление даёт нулевой сдвиг вовсе',
	pinned.perNode < 0.01,
	`${pinned.perNode.toFixed(4)} ед/узел (ожидание — ноль)`,
)

/**
 * Нелокальность равновесия — свойство сил, а не недоработка разогрева: тот же прогон, доведённый
 * до равновесия с обеих сторон, даёт сдвиг, от alpha не зависящий.
 */
const hotRows = [0.3, 0.005].map((alpha) => runAdd({ alpha, settle: true, seed: null, hops: 3, equilibrium: true }))

console.log(
	`  равновесие с обеих сторон: alpha 0.300 → ${hotRows[0].perNode.toFixed(2)}, alpha 0.005 → ${hotRows[1].perNode.toFixed(2)} ед/узел`,
)

await server.close()

if (failures > 0) {
	console.error(`\nFAILURES: ${failures}`)
	process.exit(1)
}

console.log('\nPASS')
