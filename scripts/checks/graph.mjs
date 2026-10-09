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
import { createServer } from 'vite';

let failures = 0;

function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ok   ${name}`);
        return;
    }
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Значения свипа можно задавать извне: таблицу надо сравнивать, а не читать глазами. */
function parseArgs(argv) {
    const read = (name, fallback) => {
        const hit = argv.find((arg) => arg.startsWith(`--${name}=`));

        return hit
            ? hit
                  .slice(name.length + 3)
                  .split(',')
                  .map(Number)
            : fallback;
    };

    return { seeds: read('seed', [null, 24, 120, 170, 240]), alphas: read('alpha', [0.3, 0.05, 0.005]) };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = (nodes) => new Map(nodes.map((node) => [node.id, node]));
const sum = (values) => values.reduce((acc, value) => acc + value, 0);

/** Грубая мерка из AGENTS.md — та же, что в остальных Node-проверках раскладки. */
const measure = (text, size) => text.length * size * 0.55;

/**
 * Довести симуляцию до покоя. `equilibrium` — держать альфу на уровне `alphaMin`, пока скорость не
 * погаснет: остывание по `alphaMin` (дефолт d3) останавливает stepper, но не раскладку — силы
 * пропорциональны альфе, и при живой альфе они всё ещё тянут узлы.
 */
function cool(simulation, equilibrium = false) {
    simulation.stop();

    if (!equilibrium) {
        let guard = 0;

        while (simulation.alpha() > simulation.alphaMin() && guard < 600) {
            simulation.tick();
            guard += 1;
        }

        return;
    }

    const nodes = simulation.nodes();

    simulation.alphaTarget(simulation.alphaMin());
    for (let guard = 0; guard < 200000; guard++) {
        simulation.tick();
        const step = nodes.reduce((max, node) => Math.max(max, Math.hypot(node.vx, node.vy)), 0);

        if (step < 0.01) break;
    }
    simulation.alphaTarget(0);
}

/** Медианный просвет связанной пары — геометрия покоя: по ней видно, что карта не схлопнулась. */
function medianLinkGap(nodes, links) {
    const index = byId(nodes);
    const gaps = links
        .map(({ source, target }) => {
            const a = typeof source === 'object' ? source : index.get(source);
            const b = typeof target === 'object' ? target : index.get(target);

            return a && b ? distance(a, b) : null;
        })
        .filter((gap) => gap !== null)
        .sort((x, y) => x - y);

    return gaps[Math.floor(gaps.length / 2)] ?? 0;
}

/**
 * Число наездов тел друг на друга. Тела — прямоугольники облаков: облако заметно шире, чем выше,
 * и круговая оценка пропустила бы наезд по вертикали.
 */
function bodyOverlaps(nodes, layouts) {
    const bodies = nodes.map((node) => {
        const layout = layouts.get(node);

        return { x: node.x ?? 0, y: node.y ?? 0, w: layout.width, h: layout.height };
    });
    let hits = 0;

    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i];
            const b = bodies[j];

            if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) hits += 1;
        }
    }

    return hits;
}

/** Число переходов от нового узла по связям: «далёкие» — это не меньше трёх переходов. */
function hopsFrom(startId, links) {
    const adjacency = new Map();
    const add = (from, to) => {
        if (!adjacency.has(from)) adjacency.set(from, new Set());
        adjacency.get(from).add(to);
    };

    links.forEach(({ source, target }) => {
        const from = typeof source === 'object' ? source.id : source;
        const to = typeof target === 'object' ? target.id : target;

        add(from, to);
        add(to, from);
    });

    const hops = new Map([[startId, 0]]);
    let frontier = [startId];

    while (frontier.length > 0) {
        const next = [];

        frontier.forEach((id) => {
            (adjacency.get(id) ?? new Set()).forEach((neighbor) => {
                if (hops.has(neighbor)) return;
                hops.set(neighbor, hops.get(id) + 1);
                next.push(neighbor);
            });
        });
        frontier = next;
    }

    return hops;
}

const root = process.cwd();
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' });

const colorUtils = await server.ssrLoadModule('/src/graph/nodeColors.ts');
const cloud = await server.ssrLoadModule('/src/graph/nodeGeometry.ts');
const nodeForm = await server.ssrLoadModule('/src/components/SettingsPanel/nodeForm.ts');
const linksLogic = await server.ssrLoadModule('/src/graph/resolveLinks.ts');
const nestedLinks = await server.ssrLoadModule('/src/graph/nestedLinks.ts');
const motion = await server.ssrLoadModule('/src/components/ForceGraph/localMotion.ts');
const visibility = await server.ssrLoadModule('/src/graph/visibleGroups.ts');
const source = await server.ssrLoadModule('/src/data/graph.ts');

const { createTypeColors } = colorUtils;
const { resolveLinks } = linksLogic;
const { nestedGroupLinkChildren } = nestedLinks;
const { boundaryRadius, localRadius, nearbyNodes } = motion;
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
    nestedGraphBounds,
    truncateToWidth,
} = cloud;
const { createNodeInData, deleteNodeFromData, neighborOptions, updateNodeInData } = nodeForm;

const base = source.graphData;
const positioned = {
    nodes: base.nodes.map((node, index) => ({ ...node, x: (index % 10) * 100, y: Math.floor(index / 10) * 100 })),
    links: base.links,
};
const NEW_ID = 'probe-new';

const componentFixture = {
    nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, title: id, type: 'node', hasWarning: false })),
    links: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'd', target: 'e' },
        { source: 'a', target: 'b' },
        { source: 'missing', target: 'f' },
    ],
};

console.log('\n== полный расчёт раскладки ==');

check(
    'отсутствующий конец связи отбрасывается',
    resolveLinks(positioned.nodes, [{ source: 'missing', target: base.nodes[0].id }]).length === 0,
);
const types = [...new Set(base.nodes.map((node) => node.type))];
const colors = createTypeColors(base.nodes);
check(
    'цвета типов стабильны',
    types.every((type) => colors(type) === createTypeColors(base.nodes)(type)),
);
const motionGroup = { id: 'motion-group', type: 'group', x: 0, y: 0 };
const motionNeighbor = { id: 'motion-neighbor', type: 'node', x: 100, y: 0 };
const motionFar = { id: 'motion-far', type: 'node', x: 500, y: 0 };
check('радиус локального движения включает размер группы', localRadius(100, 1) === 380);
check(
    'в локальное движение попадают узлы в радиусе группы',
    nearbyNodes([motionGroup, motionNeighbor, motionFar], motionGroup, localRadius(100, 1)).length === 2,
);
const nested = {
    nodes: [
        { id: 'nested-wide', type: 'node', title: 'Широкая вложенная нода', hasWarning: false, x: 300, y: 0 },
        {
            id: 'nested-group',
            type: 'group',
            title: 'Вложенная группа',
            hasWarning: false,
            x: -300,
            y: 0,
            children: {
                nodes: [{ id: 'deep', type: 'node', title: 'Глубокая', hasWarning: false, x: 200, y: 0 }],
                links: [],
            },
        },
    ],
    links: [],
};
const nestedBounds = nestedGraphBounds(nested, measure);
check(
    'пустой вложенный граф использует размер загрузки',
    nestedGraphBounds({ nodes: [], links: [] }, measure).radius === GROUP_FOCUS_SIZE / 2,
);
check('границы учитывают широкую ноду', nestedBounds.radius > 300 * 0.2);
check('границы рекурсивно учитывают вложенный масштаб', nestedBounds.radius > 300 * 0.2);
console.log('\n== правки данных (nodeForm) ==');

const work = { id: 'w-1', type: 'node', title: 'Работа', hasWarning: false };
const patent = { id: 'p-1', type: 'subNode', title: 'Патент', hasWarning: false };
const fixture = { nodes: [work, patent], links: [{ source: 'w-1', target: 'p-1' }] };

const renamed = updateNodeInData(fixture, 'w-1', {
    title: 'Новое название',
    description: '',
    hasWarning: true,
});

check(
    'правка данных не трогает исходный объект',
    fixture.nodes[0].title === 'Работа' && renamed.nodes[0] !== fixture.nodes[0],
);
check('пустое описание не заводится пустой строкой', renamed.nodes[0].description === undefined);
check('ссылка на список связей сохраняется', renamed.links === fixture.links);

const created = createNodeInData(
    fixture,
    { type: 'subNode', title: 'Новый патент', description: 'описание', hasWarning: false },
    ['w-1', 'w-1', 'нет-такого'],
);

check('новый узел получает id custom-N', created.nodes.at(-1).id === 'custom-1');
check('неизвестный сосед отброшен, дубликат схлопнут', created.links.length === 2, `связей ${created.links.length}`);
check(
    'направление связи задаётся типом',
    created.links[1].source === 'w-1' && created.links[1].target === 'custom-1',
    JSON.stringify(created.links[1]),
);

const removedWork = deleteNodeFromData(created, 'w-1');

check(
    'при удалении узла уходят и его связи',
    removedWork.nodes.length === 2 && removedWork.links.length === 0,
    `узлов ${removedWork.nodes.length}, связей ${removedWork.links.length}`,
);
check(
    'варианты соседей зависят от типа',
    neighborOptions(fixture, 'node').every((option) => option.value === 'p-1') &&
        neighborOptions(fixture, 'subNode').length === 2,
);

console.log('\n== раскладка облаков и обрезка подписей ==');

const longTitle = 'Очень длинное название работы, которое гарантированно не влезает в потолок ширины облака';
const shortTitle = 'Короткая работа';
const cut = truncateToWidth(longTitle, TITLE_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure);

check(
    'короткая строка не трогается',
    truncateToWidth(shortTitle, TITLE_FONT_SIZE, CLOUD_MAX_TEXT_WIDTH, measure) === shortTitle,
);
check('обрезанная кончается одним «…»', cut.endsWith('…') && !cut.slice(0, -1).includes('…'), cut);
check('хвостовой пробел перед «…» срезан', !/\s…$/.test(cut), JSON.stringify(cut.slice(-4)));
check(
    'обрезанная влезает в потолок, а исходная не влезала',
    measure(cut, TITLE_FONT_SIZE) <= CLOUD_MAX_TEXT_WIDTH && measure(longTitle, TITLE_FONT_SIZE) > CLOUD_MAX_TEXT_WIDTH,
    `${measure(cut, TITLE_FONT_SIZE).toFixed(0)} при потолке ${CLOUD_MAX_TEXT_WIDTH}`,
);

const cloudWork = {
    id: 'c-1',
    type: 'node',
    title: shortTitle,
    description: 'пояснение',
    hasWarning: false,
    x: 0,
    y: 0,
};
const warned = { ...cloudWork, id: 'c-2', hasWarning: true };
const bare = { ...cloudWork, id: 'c-3', description: undefined };
const icon = { id: 'c-4', type: 'subNode', title: 'Патент', hasWarning: false, x: 0, y: 0 };
const layouts = createCloudLayouts([cloudWork, warned, bare, icon], measure);
const plain = layouts.get(cloudWork);

check('запись есть на каждый узел', layouts.size === 4, `записей ${layouts.size}`);
check('облако с описанием выше, чем то же без него', plain.height > layouts.get(bare).height);
check('описание стоит под заголовком', plain.descriptionY > plain.titleY);
check(
    'левый край текста — на паддинге от края тела',
    Math.abs(plain.textX - (-plain.width / 2 + CLOUD_PADDING_X)) < 1e-9,
    `textX ${plain.textX}`,
);
check('без предупреждения точки нет', plain.warning === undefined && layouts.get(warned).warning !== undefined);
check(
    'колонка предупреждения расширяет тело и уводит текст правее точки',
    layouts.get(warned).width === plain.width + WARNING_GUTTER &&
        layouts.get(warned).textX > layouts.get(warned).warning.x,
    `ширина ${layouts.get(warned).width} против ${plain.width}`,
);
check(
    'иконка саб-ноды — квадрат без подписей',
    layouts.get(icon).width === SUB_NODE_SIZE &&
        layouts.get(icon).height === SUB_NODE_SIZE &&
        layouts.get(icon).title === '' &&
        layouts.get(icon).description === '',
);

const smallGroup = {
    ...cloudWork,
    id: 'group-15',
    type: 'group',
    children: {
        nodes: Array.from({ length: 15 }, (_, index) => ({
            id: `small-${index}`,
            title: 'Элемент',
            type: 'node',
            hasWarning: false,
        })),
        links: [],
    },
};
const largeGroup = {
    ...smallGroup,
    id: 'group-40',
    children: {
        nodes: Array.from({ length: 40 }, (_, index) => ({
            id: `large-${index}`,
            title: 'Элемент',
            type: 'node',
            hasWarning: false,
        })),
        links: [],
    },
};
const focusedSmall = createFocusedGroupLayout(createCloudLayouts([smallGroup], measure).get(smallGroup));
const focusedLarge = createFocusedGroupLayout(createCloudLayouts([largeGroup], measure).get(largeGroup));

check('круг группы рассчитан по количеству: 15 элементов — 200', groupFocusSize(15) === GROUP_FOCUS_SIZE);
check('круг группы рассчитан по количеству: 40 элементов — 370', groupFocusSize(40) === GROUP_FOCUS_SIZE_AT_40);
check(
    'большая группа растёт нелинейно без верхнего ограничения',
    groupFocusSize(270) > groupFocusSize(40) && groupFocusSize(270) < 370 + (270 - 40) * 6.8,
);
check(
    'приближённый layout сохраняет вычисленный диаметр круга',
    focusedSmall.focusedSize === 200 && focusedLarge.focusedSize === 370,
);
check(
    'при раскрытии тело группы уменьшается в масштабе вложенного графа и остаётся по центру',
    focusedSmall.width === plain.width * 0.2 &&
        focusedSmall.height === plain.height * 0.2 &&
        focusedSmall.titleY === plain.titleY * 0.2,
);
check(
    'к группе подключаются не более пяти первых вложенных узлов',
    nestedGroupLinkChildren(Array.from({ length: 8 }, (_, index) => ({ id: `${index}` }))).length === 5,
);

console.log('\n== видимые группы ==');
const nestedGroup = { ...smallGroup, id: 'nested', x: 1100, y: 0, children: { nodes: [], links: [] } };
const nearGroup = { ...smallGroup, id: 'near', x: 0, y: 0, children: { nodes: [nestedGroup], links: [] } };
const farGroup = { ...largeGroup, id: 'far', x: 1100, y: 0 };
const snapshots = visibility.snapshotGroups([nearGroup, farGroup, { ...bare, x: 0, y: 0 }]);
const nearViewport = { left: -150, right: 150, top: -150, bottom: 150 };
check(
    'снимок включает только группы и сохраняет вложенность',
    snapshots.length === 2 && snapshots[0].children[0].id === 'nested',
);
check(
    'радиус снимка совпадает с увеличенным кругом группы',
    snapshots[0].radius === nestedGraphBounds(nearGroup.children, measure).radius &&
        snapshots[1].radius === nestedGraphBounds(farGroup.children, measure).radius,
);
check(
    'группа на границе viewport видима',
    visibility.visibleGroupIds(snapshots, { ...nearViewport, left: 100 }).includes('near'),
);
check(
    'далёкая группа и вложенная группа вне viewport скрыты',
    visibility.visibleGroupIds(snapshots, nearViewport).join(',') === 'near',
);
check(
    'вложенная группа учитывает масштаб родителя',
    visibility.visibleGroupIds(snapshots, { left: 200, right: 300, top: -50, bottom: 50 }).includes('nested'),
);
check(
    'перемещение viewport меняет список',
    visibility.visibleGroupIds(snapshots, { left: 950, right: 1250, top: -150, bottom: 150 }).join(',') === 'far',
);

await server.close();

if (failures > 0) {
    console.error(`\nFAILURES: ${failures}`);
    process.exit(1);
}

console.log('\nPASS');
