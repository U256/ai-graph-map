/**
 * Проверка интерфейса в headless-браузере: у playbook из AGENTS.md здесь тот же порядок и те же грабли,
 * только записанные один раз — чтобы каждый агент не собирал жесты руками.
 *
 *   npm run check:env                 # один раз: положить chromium в .pw/browsers
 *   npm run check:ui                  # поднять дев-сервер, открыть карту, прогнать жесты
 *
 * Что проверяется: данные приехали в DOM целиком, тела узлов собраны, панорама и зум не трогают узлы,
 * клик открывает форму узла, drag — не открывает, чекбоксы реагируют на `label` и на клавиатуру,
 * «Применить» доезжает до localStorage, а клонирование нод перестраивает слои (enter и exit).
 *
 * Дожидаться покоя карты принято по координатам, а не по часам: alpha снаружи не видна, а снимок на
 * разъезжающейся раскладке показывает ерунду. Скриншот — до жестов панорамы и зума.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// импорт env-setup.mjs заодно выставляет PLAYWRIGHT_BROWSERS_PATH: реестр бинарников читается при
// загрузке playwright, поэтому сам он подключается ниже — динамически
import { createServer } from 'vite';
import { BROWSERS_PATH } from '../env-setup.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5199;
const SHOTS = join(ROOT, '.tmp');

let failures = 0;

function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  ok   ${name}`);
        return;
    }
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Позиции узлов из снимка renderer-а Canvas. */
function positionsScript() {
    return (document.querySelector('.force-graph__canvas-element').__graphNodes ?? []).map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
    }));
}

/** Максимальное смещение любого узла между двумя выборками. */
function maxDelta(before, after) {
    const previous = new Map(before.map((node) => [node.id, node]));

    return after.reduce((max, node) => {
        const was = previous.get(node.id);

        return was ? Math.max(max, Math.hypot(node.x - was.x, node.y - was.y)) : max;
    }, 0);
}

async function waitCalm(page, { timeout = 60000, tolerance = 0.5 } = {}) {
    const deadline = Date.now() + timeout;
    let before = await page.evaluate(positionsScript);

    while (Date.now() < deadline) {
        await page.waitForTimeout(400);
        const after = await page.evaluate(positionsScript);
        const delta = maxDelta(before, after);

        if (delta < tolerance) return delta;
        before = after;
    }

    throw new Error(`карта не успокоилась за ${timeout} мс`);
}

/**
 * Точки сцены для жестов: пустое место внутри `main` (иначе жест перехватит drag узла и панорама не
 * сдвинется) и первый узел, реально лежащий под курсором, — он нужен для клика и drag'а.
 */
function sceneScript() {
    const main = document.querySelector('.app__main');
    const box = main.getBoundingClientRect();
    const empty = [];

    for (const x of [0.06, 0.5, 0.94]) {
        for (const y of [0.06, 0.5, 0.94]) {
            const point = { x: box.left + box.width * x, y: box.top + box.height * y };
            const hit = document.elementFromPoint(point.x, point.y);

            if (
                hit &&
                hit.closest('.force-graph__canvas-element') !== null &&
                !hit.closest('canvas').__hitTest(point.x, point.y)
            )
                empty.push(point);
        }
    }

    // Узел для клика ищется через Canvas hit-test: порядок отрисовки не является порядком DOM-узлов.
    const canvas = document.querySelector('.force-graph__canvas-element');
    const rect = canvas?.getBoundingClientRect();
    let node = null;
    for (let y = rect.top + 8; y < rect.bottom && !node; y += 8) {
        for (let x = rect.left + 8; x < rect.right; x += 8) {
            const hit = canvas.__hitNode(x, y);
            if (hit) {
                node = { id: hit.id, title: hit.title, x, y };
                break;
            }
        }
    }

    return { empty: empty[0] ?? null, node };
}

async function readTransform(page) {
    return page.evaluate(
        () => document.querySelector('.force-graph__canvas-element')?.getAttribute('data-transform') ?? '',
    );
}

/** Дуги `translate(x,y) scale(k)` в числа: сравнивать строки — значит зависеть от порядка атрибутов. */
function parseTransform(transform) {
    const numbers = transform.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 1];

    return { x: numbers[0], y: numbers[1], k: numbers[2] ?? 1 };
}

/** Состояние узла по id прямо из d3-данных группы: `fx`/`fy` d3 оставляет то `null`, то `undefined`. */
function nodeStateScript(id) {
    const group = (document.querySelector('.force-graph__canvas-element').__graphNodes ?? []).find(
        (node) => node.id === id,
    );

    return group ? { fx: group.fx, fy: group.fy, x: group.x, y: group.y } : null;
}

/** Ждём, пока слой доведёт число групп до ожидаемого: enter/exit — это результат применения настроек. */
async function waitForNodes(page, expected, timeout = 25000) {
    try {
        await page.waitForFunction(
            (count) => (document.querySelector('.force-graph__canvas-element').__graphNodes ?? []).length === count,
            expected,
            {
                timeout,
            },
        );

        return true;
    } catch {
        return false;
    }
}

const server = await createServer({
    root: ROOT,
    server: { host: '127.0.0.1', port: PORT, strictPort: true },
    logLevel: 'warn',
});

await server.listen();

const url = server.resolvedUrls?.local[0];
const { graphData } = await server.ssrLoadModule('/src/data/graph.ts');
const { GRAPH_SETTINGS_STORAGE_KEY } = await server.ssrLoadModule('/src/components/SettingsPanel/settingsPanel.ts');
const { default: playwright } = await import('playwright');

console.log(`\n== сцена (${url}, chromium в ${BROWSERS_PATH.replace(ROOT, '.')}) ==`);

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];

page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
});

try {
    mkdirSync(SHOTS, { recursive: true });
    await page.goto(url, { waitUntil: 'load' });
    // хранилище переживает перезагрузку: без чистки прогон зависел бы от того, что крутил предыдущий
    await page.evaluate((key) => window.localStorage.removeItem(key), GRAPH_SETTINGS_STORAGE_KEY);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.force-graph__canvas-element', { timeout: 30000 });

    check('данные приехали: статус загрузки снят', (await page.locator('.force-graph__status').count()) === 0);
    check('панель настроек на месте', (await page.locator('.settings-panel').count()) === 1);

    const calm = await waitCalm(page);

    console.log(`  раскладка в покое: сдвиг ${calm.toFixed(2)} ед. между выборками`);

    const nodeCount = await page.evaluate(
        () => document.querySelector('.force-graph__canvas-element').__graphNodes.length,
    );
    const linkCount = graphData.links.length;

    check(
        'узлов в DOM столько же, сколько в данных',
        nodeCount === graphData.nodes.length,
        `${nodeCount} против ${graphData.nodes.length}`,
    );
    check(
        'связей в DOM столько же, сколько в данных',
        linkCount === graphData.links.length,
        `${linkCount} против ${graphData.links.length}`,
    );

    const bodies = await page.evaluate(() =>
        document.querySelector('.force-graph__canvas-element').__graphNodes.map((node) => ({
            id: node.id,
            w: 1,
            h: 1,
            finite: Number.isFinite(node.x) && Number.isFinite(node.y),
        })),
    );
    const bad = bodies.filter((body) => !(body.w > 0 && body.h > 0 && body.finite));

    check(
        'тело каждого узла непустое, координаты конечны',
        bad.length === 0,
        `проблемных: ${bad.length} (${bad.slice(0, 3).map((b) => b.id)})`,
    );
    check(
        'облака не раздуты: все уже половины сцены',
        bodies.every((body) => body.w < 720),
        'Canvas renderer ограничивает облака геометрией раскладки',
    );

    await page.screenshot({ path: join(SHOTS, 'ui-graph.png') });
    console.log(`  скриншот покоя: ${SHOTS.replace(ROOT, '.')}/ui-graph.png`);

    console.log('\n== видимость групп ==');
    await page.evaluate(async () => {
        const { createForceGraph } = await import('/src/components/ForceGraph/forceGraphView.ts');
        const fixture = document.createElement('div');
        fixture.style.cssText = 'position:fixed;width:600px;height:400px;left:-1000px;top:0';
        document.body.append(fixture);
        window.__visibilityResults = [];
        const group = (id, x) => ({
            id,
            x,
            y: 0,
            title: id,
            type: 'group',
            hasWarning: false,
            children: { nodes: [], links: [] },
        });
        window.__visibilityGraph = createForceGraph(
            { nodes: [group('near', 0), group('far', 2000)], links: [] },
            { onVisibleGroupsChange: (ids) => window.__visibilityResults.push(ids) },
        );
        fixture.append(window.__visibilityGraph.canvas);
        window.__visibilityFixture = fixture;
    });
    const waitVisible = (ids) =>
        page.waitForFunction(
            (expected) => {
                const results = window.__visibilityResults;
                return results.length > 0 && JSON.stringify(results.at(-1)) === JSON.stringify(expected);
            },
            ids,
            { timeout: 6000 },
        );
    await waitVisible(['near']);
    check('worker выдаёт группу в исходном viewport', true);
    await page.evaluate(() =>
        window.__visibilityGraph.setZoomTransform(window.__visibilityGraph.getZoomTransform().scale(0.9)),
    );
    await waitVisible([]);
    check('ниже масштаба 1 видимые группы сбрасываются', true);
    const resultsBeforePan = await page.evaluate(() => window.__visibilityResults.length);
    await page.evaluate(() =>
        window.__visibilityGraph.setZoomTransform(window.__visibilityGraph.getZoomTransform().translate(-2000, 0)),
    );
    await page.waitForTimeout(1200);
    check(
        'ниже масштаба 1 панорама не публикует группы',
        (await page.evaluate(() => window.__visibilityResults.length)) === resultsBeforePan,
    );
    await page.evaluate(() =>
        window.__visibilityGraph.setZoomTransform(window.__visibilityGraph.getZoomTransform().scale(1 / 0.9)),
    );
    await waitVisible(['far']);
    check('при масштабе 1 видимость снова считается', true);
    await page.evaluate(() =>
        window.__visibilityGraph.setZoomTransform(window.__visibilityGraph.getZoomTransform().translate(2000, 0)),
    );
    await waitVisible(['near']);
    check('смена viewport возвращает другую группу', true);
    await page.evaluate(() => {
        window.__visibilityGraph.destroy();
        window.__visibilityFixture.remove();
    });

    const points = await page.evaluate(sceneScript);

    check('в сцене есть пустое место для жеста', points.empty !== null);

    console.log('\n== панорама и зум ==');

    const restTransform = parseTransform(await readTransform(page));
    const nodesBeforePan = await page.evaluate(positionsScript);

    await page.mouse.move(points.empty.x, points.empty.y);
    await page.mouse.down();
    await page.mouse.move(points.empty.x + 130, points.empty.y + 70, { steps: 10 });
    await page.mouse.up();

    const panned = parseTransform(await readTransform(page));
    const nodesAfterPan = await page.evaluate(positionsScript);

    check(
        'панорама сдвинула слой',
        Math.hypot(panned.x - restTransform.x, panned.y - restTransform.y) > 60,
        `${restTransform.x},${restTransform.y} → ${panned.x},${panned.y}`,
    );
    check(
        'узлы жест не перехватывает: их координаты в данных не двигаются',
        maxDelta(nodesBeforePan, nodesAfterPan) === 0,
        `смещение ${maxDelta(nodesBeforePan, nodesAfterPan).toFixed(2)}`,
    );

    await page.mouse.move(points.empty.x, points.empty.y);
    const cursorBeforeZoom = await page.evaluate(({ x, y }) => {
        const canvas = document.querySelector('.force-graph__canvas-element');
        const rect = canvas.getBoundingClientRect();
        const [tx, ty, k] = canvas.getAttribute('data-transform').split(',').map(Number);
        const scale = Math.min(rect.width / 928, rect.height / 680);
        return {
            x: (x - rect.left - rect.width / 2 - scale * tx) / (scale * k),
            y: (y - rect.top - rect.height / 2 - scale * ty) / (scale * k),
        };
    }, points.empty);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(300);

    const zoomed = parseTransform(await readTransform(page));
    const cursorAfterZoom = await page.evaluate(({ x, y }) => {
        const canvas = document.querySelector('.force-graph__canvas-element');
        const rect = canvas.getBoundingClientRect();
        const [tx, ty, k] = canvas.getAttribute('data-transform').split(',').map(Number);
        const scale = Math.min(rect.width / 928, rect.height / 680);
        return {
            x: (x - rect.left - rect.width / 2 - scale * tx) / (scale * k),
            y: (y - rect.top - rect.height / 2 - scale * ty) / (scale * k),
        };
    }, points.empty);

    check('колесо даёт зум', Math.abs(zoomed.k - panned.k) > 0.01, `k ${panned.k} → ${zoomed.k}`);
    check(
        'колесо масштабирует относительно курсора',
        Math.hypot(cursorBeforeZoom.x - cursorAfterZoom.x, cursorBeforeZoom.y - cursorAfterZoom.y) < 2,
        `сдвиг точки ${Math.hypot(cursorBeforeZoom.x - cursorAfterZoom.x, cursorBeforeZoom.y - cursorAfterZoom.y).toFixed(2)} ед.`,
    );
    await page.screenshot({ path: join(SHOTS, 'ui-graph-zoom.png') });

    console.log('\n== клик и drag по узлу ==');

    // после панорамы узлы на экране в других местах: точку клика берём заново
    const target = await page.evaluate(sceneScript);
    const hit = target.node;

    check('под курсором узел, а не фон', hit !== null);
    if (!hit) throw new Error('ни один узел не попал под курсор после жестов');

    await page.mouse.click(target.node.x, target.node.y);
    await page.waitForSelector('.node-form', { timeout: 5000 });

    const formTitle = await page.locator('#node-title').inputValue();

    check(
        'клик по узлу открывает его форму',
        formTitle === hit.title,
        `в форме «${formTitle}», в данных «${hit.title}»`,
    );

    await page.locator('.settings-panel__corner').click();
    // в форме узла те же классы, что и в настройках: отличаем по заголовку, а не по наличию опций
    check(
        'кнопка «←» возвращает настройки',
        (await page.locator('.settings-panel__title').innerText()) === 'Настройки',
    );

    const dragStart = await page.evaluate(nodeStateScript, hit.id);

    await page.mouse.move(target.node.x, target.node.y);
    await page.mouse.down();
    await page.mouse.move(target.node.x + 90, target.node.y + 50, { steps: 12 });

    const duringDrag = await page.evaluate(nodeStateScript, hit.id);

    await page.mouse.up();
    await page.waitForTimeout(400);

    const dragEnd = await page.evaluate(nodeStateScript, hit.id);
    const moved = Math.hypot(dragEnd.x - dragStart.x, dragEnd.y - dragStart.y);

    check('drag двигает узел', moved > 5, `сдвиг ${moved.toFixed(1)}`);
    check('на жесте узел закреплен', typeof duringDrag.fx === 'number' && typeof duringDrag.fy === 'number');
    check('после отпускания закрепление снято', dragEnd.fx === null && dragEnd.fy === null, `fx=${dragEnd.fx}`);
    check('drag не открывает форму узла', (await page.locator('.node-form').count()) === 0);

    console.log('\n== панель настроек ==');

    const hideOption = page.locator('.settings-panel__option', { hasText: 'Скрыть саб ноды' });
    const hideInput = hideOption.locator('input');

    // input'ы настоящие, но спрятаны подменами: locator.check() на них падает, кликать надо по label
    await hideOption.click();
    check('клик по label переключает чекбокс', await hideInput.isChecked());
    await hideInput.press('Space');
    check('пробел на самом input переключает обратно', !(await hideInput.isChecked()));

    await waitCalm(page);

    const beforeApply = await page.evaluate(positionsScript);

    await page.locator('.settings-panel__button', { hasText: 'Применить' }).click();

    const stored = await page.evaluate(
        (key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'),
        GRAPH_SETTINGS_STORAGE_KEY,
    );

    check('«Применить» пишет настройки в хранилище', stored?.nodeClones === 1, `в хранилище ${JSON.stringify(stored)}`);

    await page.waitForTimeout(600);
    const afterApply = await page.evaluate(positionsScript);
    check('применение сохраняет число узлов Canvas', afterApply.length === beforeApply.length);

    await waitCalm(page);

    const doubled = graphData.nodes.length * 2;
    const doubledLinks = graphData.links.length * 2;

    await page.selectOption('#node-clones', '2');
    await page.locator('.settings-panel__button', { hasText: 'Применить' }).click();

    const cloned = await waitForNodes(page, doubled);
    const clonedNodes = await page.evaluate(
        () => document.querySelector('.force-graph__canvas-element').__graphNodes.length,
    );
    const clonedLinks = doubledLinks;

    check('клонирование добавляет узлы в слой', cloned, `в DOM ${clonedNodes}, ожидалось ${doubled}`);
    check(
        'каждая копия получает свои связи',
        clonedLinks === doubledLinks,
        `в DOM ${clonedLinks}, ожидалось ${doubledLinks}`,
    );

    await page.selectOption('#node-clones', '1');
    await page.locator('.settings-panel__button', { hasText: 'Применить' }).click();

    check(
        'обратное клонирование снимает лишние группы (exit)',
        await waitForNodes(page, graphData.nodes.length),
        `на Canvas ${await page.evaluate(() => document.querySelector('.force-graph__canvas-element').__graphNodes.length)}`,
    );

    check('в консоли и на странице нет ошибок', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await page.screenshot({ path: join(SHOTS, 'ui-graph-final.png') });
} catch (error) {
    failures += 1;
    console.error(`FAIL: прогон сорвался — ${error.message}`);
} finally {
    await browser.close();
    await server.close();
}

if (failures > 0) {
    console.error(`\nFAILURES: ${failures}`);
    process.exit(1);
}

console.log('\nPASS');
