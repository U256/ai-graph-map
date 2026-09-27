# ai-graph-map

Учебная визуализация графа: React 19 + TypeScript + Vite, физика и DOM на d3, формы на
`react-hook-form`. Узлы — научные работы (`node`) и цитирующие их патенты (`subNode`). Данные —
типизированный модуль `src/data/graph.ts`, запроса к серверу нет, загрузка эмулируется.

Структура, конвенции, порядок проверки и известные грабли — в [`AGENTS.md`](./AGENTS.md).

## Команды

- `npm run dev` / `npm run build` / `npm run preview` — дев-сервер, сборка (`tsc -b` + Vite), просмотр `dist`.
- `npm run check-types` — только типы; `npm run lint` — prettier + eslint с автофиксом.
- Хуки в `.git-hooks`, путь подключается скриптом `prepare`; `pre-commit` запускает `npm run lint`.

## Стиль

Prettier (табы, без `;`, одинарные кавычки, 120) и ESLint (airbnb + airbnb-typescript) — значения в
`.prettierrc.mjs` и `.eslintrc.cjs`. Для `src/data/**` лимит `max-lines` отключён: там сгенерированные
данные, а не логика.
