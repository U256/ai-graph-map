# ai-graph-map

React + TypeScript + Vite.

Контекст для агентов (структура, конвенции, порядок проверки и известные грабли) — в
[`AGENTS.md`](./AGENTS.md).

## Стек

- Vite 8 + React 19 + TypeScript (`strict`, три `tsconfig`: `app`, `node` и solution-файл в корне).
- CSS: `normalize.css` подключается первым через `@import` в `src/index.css`.
- Визуализация: `d3-force` + `d3-selection`/`d3-drag`/`d3-zoom` — граф в `src/components/ForceGraph`
  (порт ноутбука [@d3/disjoint-force-directed-graph/2](https://observablehq.com/@d3/disjoint-force-directed-graph/2),
  его и рендерит `App`).
- Данные графа: `src/data/graph.ts` — типизированный модуль (336 узлов, 275 связей), импортируется
  напрямую, без запроса; состояние «Загрузка графа…» эмулируется `setTimeout`. Типы данных —
  в `src/types/graph.ts`.
- Ноутбук перенесён 1:1: `forceLink` + `forceManyBody` + `forceX`/`forceY` (позиционирующие силы
  вместо `forceCenter`, иначе несвязные подграфы разлетаются), радиус узла 5,
  `stroke-width: √(value ?? LINK_VALUE_DEFAULT)`, цвета как `scaleOrdinal(schemeCategory10)` — но
  уже по `type` узла (`node`/`subNode`), drag узла через `alphaTarget(0.3)` + `fx`/`fy`.
  Добавлено сверх ноутбука и опционально (`options` в `createForceGraph`): сетка на фоне (`grid`)
  и панорама/зум (`panZoom`, пределы 0.5–8).
- Линтеры: ESLint (`airbnb` + `airbnb-typescript` + `prettier`) и Prettier.

## Команды

- `npm run dev` — дев-сервер Vite.
- `npm run build` — проверка типов (`tsc -b`) и продакшн-сборка в `dist`.
- `npm run preview` — локальный просмотр собранного `dist`.
- `npm run check-types` — только проверка типов.
- `npm run lint` — prettier + eslint с автофиксом по всем `js/jsx/ts/tsx` (используется пре-коммит хуком).
- `npm run lint-all` — то же самое (алиас `npm run lint-es`).

## Git-хук

Хуки лежат в `.git-hooks`. Путь включается скриптом `prepare` при `npm install`
(`git config --local core.hooksPath .git-hooks`), поэтому после клонирования достаточно
выполнить `npm install`. Хук `pre-commit` запускает `npm run lint` и отменяет коммит,
если линтер вернул ошибку.

## Стиль кода

- Prettier: табы (ширина 3), без точек с запятой, одинарные кавычки, ширина строки 120, LF.
- ESLint: лимиты `max-lines` 150 и `max-lines-per-function` 50. Для данных графа
  (`src/data/**`) лимит строк отключён: это большой сгенерированный массив, а не код.
