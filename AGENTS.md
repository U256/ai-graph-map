# AGENTS.md

Файл для агентов и для людей, которые подхватывают работу в этом репозитории. Держим его
единственным источником «состояния проекта»: если меняется архитектура, порядок проверки или
известные ограничения — правится в первую очередь этот файл, потом `README.md`.

## Что это за проект

Учебная визуализация графа: React 19 + TypeScript + Vite, физика и работа с DOM — на d3
(`d3-force`, `d3-selection`, `d3-drag`, `d3-zoom`, `d3-scale-chromatic`).

`src/App.tsx` рендерит ровно один компонент — `ForceGraph`: порт ноутбука
[@d3/disjoint-force-directed-graph/2](https://observablehq.com/@d3/disjoint-force-directed-graph/2)
(336 узлов, 275 связей: статьи и цитирующие патенты).

## Команды

- `npm run dev` — дев-сервер Vite (`npm run dev -- --port 5199 --strictPort` фиксирует порт).
- `npm run build` — `tsc -b` + продакшн-сборка в `dist`.
- `npm run preview` — просмотр собранного `dist` (`--port 5198 --strictPort` при проверках).
- `npm run check-types` — только типы (`tsc -b`, инкрементально через `.tsbuildinfo`).
- `npm run lint` — prettier `--write` по всему проекту + eslint `--fix`.
- `npm run lint-all` — то же, что `lint-es` (алиас).
- Пре-коммит хук `.git-hooks/pre-commit` запускает `npm run lint` и отменяет коммит при ошибке;
  путь подключается скриптом `prepare` при `npm install`.

## Структура

- `src/components/ForceGraph/forceGraph.ts` — чистая логика без DOM: константы сцены
  (`GRAPH_WIDTH` 928, `GRAPH_HEIGHT` 680, `NODE_RADIUS` 5), `prepareGraph`, `createSimulation`,
  `asDrawnLinks`, `createGroupColors`.
- `src/components/ForceGraph/forceGraphView.ts` — сборка svg через d3-selection: связи, узлы
  с `<title>`, drag, панорама/зум. Единственный модуль, который знает про DOM.
- `src/components/ForceGraph/forceGraphGrid.ts` — узор сетки и подложка (добавка к ноутбуку).
- `src/components/ForceGraph/ForceGraph.tsx` — React-обёртка: запрос данных, монтирование svg
  в контейнер, состояния загрузки/ошибки. React владеет только контейнером, svg императивный.
- `src/components/ForceGraph/ForceGraph.css` — раскладка фигуры и сцены (классы `force-graph__*`).
- `src/components/ForceBubbles/` — более раннее демо [Collision Detection](https://d3js.org/d3-force/collide).
  Компонент рабочий, но **сейчас на страницу не выводится**.
- `public/graph.json` — данные графа; `public/` отдан Vite как статика.

## Конвенции кода

Зафиксированы `.prettierrc.mjs`, `.eslintrc.cjs` и текущим кодом — не менять по вкусу:

- Табы (ширина 3), без точек с запятой, одинарные кавычки, ширина строки 120, LF.
- Комментарии, JSDoc и тексты интерфейса — по-русски. JSDoc на каждом экспорте.
- `import type` для типов (`verbatimModuleSyntax`), порядок импортов поддерживает
  `prettier-plugin-organize-imports` на пре-коммите.
- Объявлять функции до использования: базовый `no-use-before-define` отключён, но
  `@typescript-eslint/no-use-before-define` из airbnb — ошибка.
- Не мутировать параметры обработчиков (`no-param-reassign`): в drag-хендлерах предмет жеста
  берётся в локальную переменную (`const { subject } = event`).
- Лимиты: файл — 150 строк, функция — 50 (комментарии и пустые строки не считаются). При
  упоре лимита делить модуль по ответственности, а не ужимать код.
- Логика отделяется от отрисовки: физику и данные тестируем в Node (без DOM), svg собирается
  только в `forceGraphView.ts`/`forceGraphGrid.ts`.
- Типам d3 нужны явные дженерики, иначе получаются union-типы: `selectAll<SVGLineElement, DrawnLink>('line')`,
  `drag<SVGCircleElement, GraphNode, GraphNode>()` (третий параметр — subject).

## Правила работы с графом

- Силы ровно как в ноутбуке: `forceLink` + `forceManyBody` + `forceX`/`forceY`. Позиционирующие
  силы здесь принципиальны: у графа 83 несвязных компоненты, и `forceCenter` разносит их за
  пределы сцены.
- Drag узла: `alphaTarget(0.3).restart()` на старте, `fx`/`fy` в точке узла, сброс в `null` и
  `alphaTarget(0)` на отпускании.
- `link.value` в данных всегда `2`, поэтому толщина (`√value`) у всех связей одинаковая; `radius`
  и `citing_patents_count` ноутбук не использует — не используются и здесь.
- Цвет группы — аналог `scaleOrdinal(schemeCategory10)`: оттенки в порядке первого появления
  группы. Сейчас две группы: `Cited Works` (#1f77b4), `Citing Patents` (#ff7f0e).
- Сверх ноутбука добавлены сетка и панорама/зум, обе опциональны:
  `createForceGraph(data, { grid, panZoom, gridId })`. У панорамы пределы 0.5–8, сетка живёт в
  экранных координатах и сдвигается через `patternTransform`, узлы жест не перехватывают
  (d3-drag глушит всплытие).
- В `tsconfig` нет `resolveJsonModule`, поэтому данные грузятся `fetch` из `public/` — это
  соответствует `FileAttachment` в ноутбуке, а не случайность.

## Как проверять изменения

Перед коммитом обязательно: `npm run lint` и `npm run check-types` — оба должны дать exit 0.
Вывод `tsc` цветной, при разборе через grep его надо чистить: `| sed -e 's/\x1b\[[0-9;]*m//g'`,
иначе ошибки «не находятся».

Логика без браузера (быстро, ловит NaN, нерезолвленные связи, утечку мутаций):

1. Написать скрипт и обязательно положить его **внутрь проекта** — из `/tmp` не резолвится `vite`.
2. Поднять Vite в SSR-режиме и загрузить модуль напрямую:

   ```js
   const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'custom' })
   const mod = await server.ssrLoadModule('/src/components/ForceGraph/forceGraph.ts')
   ```

3. Проверить инварианты: 336 узлов / 275 связей; `link.source`/`link.target` после
   `createSimulation` — объекты-узлы, а не id; `prepareGraph` не портит исходный JSON; после
   `tick(300)` `alpha()` равно `alphaMin` (0.001), нет нечисловых/`null` координат, узлы внутри
   `[-464, 464] × [-340, 340]`; две группы дают два разных цвета.
4. Удалить временный скрипт (он не должен попадать в коммит).

Проверка интерфейса — headless Chromium через Playwright без правок репозитория:

- Playwright лежит вне проекта (`/tmp/pw`), браузер — `chromium_headless_shell`, для запуска нужен
  `LD_LIBRARY_PATH=/tmp/pwlibs/root/usr/lib/x86_64-linux-gnu`. Сам скрипт и библиотеки в репозиторий
  не входят и живут только на этой машине: если `/tmp/pw` уже нет, игра не стоит свеч — проверяйте
  через Node-пробник и `vite preview` в браузере вручную.
- Дев на `http://127.0.0.1:5199/`, превью на `http://127.0.0.1:5198/`; проверять стоит на обоих.
- Данные d3 удобно читать из DOM: `el.__data__` на кружке/линии.
- Панораму и зум начинать внутри `svg`, но вне узлов, иначе жест перехватит drag узла (второй
  параметр `tick`-проверок: `transform` группы должен стать `translate(...) scale(...)` при нуле
  подвешенных узлов).
- Осторожно с привязкой к `null`: d3 оставляет `fx`/`fy` в `undefined`, сравнение с `null`
  строгим равенством даёт ложное «не сбросилось»; использовать `!= null`.

## Грабли, которые уже стоили времени

- Dev-режим с `StrictMode` выполняет эффект дважды, первый `fetch` `graph.json` аборчится — в
  консоли видно «запрос упал». Это не ошибка, в продакшене такого нет.
- `npm run lint` запускает prettier по всему проекту, поэтому новый файл в корне будет
  переформатирован; `.prettierignore` исключает `public`, `dist`, `.vscode`, логи и lock-файл.
- Данные ноутбука раздаются gzip-ом: при первой загрузке `curl` без `--compressed` вернёт мусор.
- Порядок объявлений в модуле важен для линтера (см. конвенции), а разбивка по файлам — для
  лимита в 150 строк: при добавлении кода в `forceGraphView.ts` сначала искать, что вынести.

## Состояние и следующий шаг

- Порт графа завершён: коммит `1327728` (данные, компонент, README, зависимости).
- Открытый вопрос: `ForceBubbles` оставлен в репозитории, но не рендерится. Варианты — удалить или
  вернуть на страницу переключателем вместе с `ForceGraph`.
- Панорама и зум доступны только мышью/трекпадом (клавиатурных обработчиков нет), подсказки узлов —
  нативные `<title>`. Так и в оригинальном ноутбуке; если потребуется доступность — начинать отсюда.
