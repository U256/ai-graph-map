/**
 * Карта репозитория: файл → строк → экспорты → кто импортирует. Генерируется по требованию и в
 * коммит не попадает — иначе устаревает на первой же правке (см. AGENTS.md).
 *
 *   node scripts/map.mjs              # в терминал
 *   node scripts/map.mjs --md         # markdown-таблицей
 *   node scripts/map.mjs --only=ForceGraph
 *
 * Ищется по исходникам, а не по `tsgo`-графу: задача — быстро ответить на «куда смотреть», а не
 * проверить типы. Каталог `src/data` исключён: он генерированный и на тысячи строк.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const SOURCE_DIR = 'src'
/** Генерированные данные только забивают вывод: их читают по имени, а не по карте. */
const EXCLUDED = ['src/data']

const args = process.argv.slice(2)
const asMarkdown = args.includes('--md')
const only = (args.find((arg) => arg.startsWith('--only=')) ?? '').slice('--only='.length)

function sourceFiles(dir, found = []) {
	readdirSync(dir).forEach((name) => {
		const path = join(dir, name)

		if (statSync(path).isDirectory()) {
			if (!EXCLUDED.includes(relative(ROOT, path))) sourceFiles(path, found)
			return
		}
		if (/\.tsx?$/.test(name)) found.push(relative(ROOT, path).split('\\').join('/'))
	})

	return found.sort()
}

/** Экспорты вытаскиваются регуляркой, а не парсером: важны имена, а не их точная форма. */
function exportsOf(code) {
	const names = new Set()
	const patterns = [
		/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
		/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
		/export\s+(?:default\s+)?(?:abstract\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
		/export\s*\{([^}]*)\}/g,
	]

	patterns.forEach((pattern) => {
		code.matchAll(pattern).forEach((match) => {
			match[1]
				.split(',')
				.map((part) =>
					part
						.trim()
						.split(/\s+as\s+/)
						.pop(),
				)
				.filter((part) => part && part !== 'default')
				.forEach((part) => names.add(part))
		})
	})

	return [...names].sort()
}

/** Относительный импорт приводится к пути в репозитории — так же, как его видит сборщик. */
function resolveImport(fromFile, specifier) {
	if (!specifier.startsWith('.')) return null
	const base = resolve(fromFile, '..', specifier).replace(/\.tsx?$/, '')

	return (
		['.ts', '.tsx', '/index.ts', '/index.tsx']
			.map((suffix) =>
				relative(ROOT, base + suffix)
					.split('\\')
					.join('/'),
			)
			.find((candidate) => sourceFilesList.includes(candidate)) ?? null
	)
}

const sourceFilesList = sourceFiles(join(ROOT, SOURCE_DIR))
const files = sourceFilesList.map((path) => {
	const code = readFileSync(join(ROOT, path), 'utf8')
	const specifiers = [...code.matchAll(/from\s+'(\.[^']*)'/g)].map((match) => match[1])

	return {
		path,
		lines: code.split('\n').length,
		exports: exportsOf(code),
		imports: specifiers.map((specifier) => resolveImport(path, specifier)).filter(Boolean),
	}
})

files.forEach((file) => {
	file.importedBy = files.filter((other) => other.imports.includes(file.path)).map((other) => other.path)
})

const visible = only ? files.filter((file) => file.path.includes(only)) : files
/** Путь остаётся таким, каким его набирают в редакторе: сокращения удобны, но сбивают с пути. */
const shorten = (path) => path.replace(/^src\//, '')

if (asMarkdown) {
	console.log('| файл | стр | экспорты | кто импортирует |')
	console.log('| --- | --: | --- | --- |')
	visible.forEach((file) => {
		console.log(
			`| \`${shorten(file.path)}\` | ${file.lines} | ${file.exports.map((name) => `\`${name}\``).join(' ') || '—'} | ${
				file.importedBy.map((path) => shorten(path)).join(', ') || '—'
			} |`,
		)
	})
} else {
	visible.forEach((file) => {
		console.log(`${shorten(file.path)}  —  ${file.lines} стр.`)
		if (file.exports.length > 0) console.log(`  экспорты: ${file.exports.join(', ')}`)
		console.log(`  импортируют: ${file.importedBy.map((path) => shorten(path)).join(', ') || '—'}`)
	})
	console.log(`\n${visible.length} файлов, ${visible.reduce((sum, file) => sum + file.lines, 0)} строк`)
}
