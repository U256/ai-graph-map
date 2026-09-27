/**
 * Одноразовая подготовка окружения проверки: headless-браузер Playwright кладётся **в каталог
 * проекта** (`.pw/browsers`), а не в `~/.cache/ms-playwright`. Причина две: кеш в `~/.cache`
 * переживает обновление пакета Playwright и теряет его ревизию (несовместимый бинарник молча не
 * запускается), а `/tmp` в WSL вычищается при перезапуске — каждый раз приходилось ставить заново.
 *
 * Скрипт идемпотентен и не требует root: если бинарник на месте и запускается — он выходит за секунды.
 * Ревизия браузера нигде не фиксируется: «нужно ставить» определяется неуспешным запуском, а не
 * сравнением имени каталога, иначе проверка сгнила бы при первом же обновлении пакета.
 *
 *   node scripts/env-setup.mjs          # поставить браузер и проверить, что он стартует
 *   npm run check:env                   # то же
 */
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const BROWSERS_PATH = join(ROOT, '.pw', 'browsers')

// реестр бинарников читается при загрузке модуля playwright — поэтому переменная ставится до import
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH

/** Переменные для дочерних процессов: установщика браузера и дев-сервера. */
export const browserEnv = () => ({ ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH })

function installBrowsers() {
	console.log(':: playwright install chromium →', BROWSERS_PATH)
	execFileSync('npx', ['playwright', 'install', 'chromium'], { cwd: ROOT, env: browserEnv(), stdio: 'inherit' })
}

/** Пробный запуск: ok означает не «файл есть», а «браузер реально стартовал в этом окружении». */
async function selfTest() {
	try {
		const { default: playwright } = await import('playwright')
		const browser = await playwright.chromium.launch()
		const version = browser.version()
		await browser.close()
		return { ok: true, message: `chromium ${version}` }
	} catch (error) {
		return { ok: false, message: error.message.split('\n')[0] }
	}
}

/** Скрипт можно импортировать ради `BROWSERS_PATH` (это делает ui-проверка) — сам запуск тогда не трогается. */
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
	let result = await selfTest()

	if (!result.ok) {
		console.log(':: браузер недоступен:', result.message)
		installBrowsers()
		result = await selfTest()
	}

	if (!result.ok) {
		console.error(`FAIL: ${result.message}`)
		console.error('если не хватает системных .so, их список отдаёт ldd на бинарнике в .pw/browsers')
		process.exit(1)
	}

	console.log(`OK: ${result.message}`)
	console.log(`проверки с браузером: PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_PATH} node ...`)
}
