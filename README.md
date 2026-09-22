# ai-graph-map

React + TypeScript + Vite.

## Стек

- Vite 8 + React 19 + TypeScript (`strict`, три `tsconfig`: `app`, `node` и solution-файл в корне).
- CSS: `normalize.css` подключается первым через `@import` в `src/index.css`.
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
- ESLint: лимиты `max-lines` 150 и `max-lines-per-function` 50.
