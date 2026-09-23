const tsRules = {
	'no-unused-vars': 0,
	'@typescript-eslint/indent': 0,
	'@typescript-eslint/naming-convention': 'warn',
	'@typescript-eslint/no-unused-vars': 0,
}

// общая часть конфига для всех ts/tsx файлов
const tsConfig = {
	parser: '@typescript-eslint/parser',
	extends: ['airbnb-typescript', 'plugin:import/typescript', 'plugin:@typescript-eslint/recommended', 'prettier'],
	plugins: ['@typescript-eslint'],
	rules: tsRules,
}

module.exports = {
	env: {
		browser: true,
		node: true,
		es2020: true,
		'shared-node-browser': true,
	},
	root: true,
	ignorePatterns: ['dist', 'coverage'],
	extends: [
		'eslint:recommended',
		'airbnb',
		'plugin:react/recommended',
		'plugin:react-hooks/recommended',
		'plugin:import/recommended',
		'prettier',
	],
	plugins: ['prettier', 'jsx-a11y'],
	settings: {
		react: {
			version: 'detect',
		},
		'import/parsers': {
			'@typescript-eslint/parser': ['.ts', '.tsx'],
		},
		'import/resolver': {
			typescript: {
				alwaysTryTypes: true,
				// у проекта два tsconfig (app и node), предупреждение резолвера тут не нужно
				project: ['./tsconfig.app.json', './tsconfig.node.json'],
				noWarnOnMultipleProjects: true,
			},
			node: {
				extensions: ['.js', '.jsx', '.ts', '.tsx'],
			},
		},
	},
	rules: {
		'arrow-body-style': 0,
		'no-unused-vars': 1,
		'object-curly-newline': 0,
		'max-len': 0,
		'import/extensions': 0, // laggy
		'linebreak-style': ['error', 'unix'],
		'no-underscore-dangle': 0,
		'no-use-before-define': 0,
		'max-lines-per-function': ['error', { max: 120, skipComments: true, IIFEs: true, skipBlankLines: true }],
		'max-lines': ['error', { max: 300, skipComments: true, skipBlankLines: true }],
		'import/prefer-default-export': 0,
		'prettier/prettier': ['warn'],

		'jsx-a11y/label-has-associated-control': 0,

		'react/destructuring-assignment': 1,
		'react/jsx-filename-extension': [2, { extensions: ['.tsx', '.jsx'] }],
		'react/require-default-props': 0,
		'react/jsx-props-no-spreading': 0,
	},
	overrides: [
		{
			files: ['*.jsx', '*.tsx'],
			rules: {
				'max-lines-per-function': 0,
				'react/react-in-jsx-scope': 0,
				'react/function-component-definition': 0,
				'react/jsx-indent-props': [2, 'tab'],
				'react/jsx-indent': 0,
				'react/jsx-key': 'error',
			},
		},
		{
			// исходники приложения разбираются по tsconfig.app.json
			files: ['*.ts', '*.tsx'],
			excludedFiles: ['*.config.{js,mjs,cjs,ts,mts,cts}'],
			...tsConfig,
			parserOptions: {
				project: ['./tsconfig.app.json'],
				tsconfigRootDir: __dirname,
				sourceType: 'module',
			},
		},
		{
			// конфиги сборки и линтеров относятся к node-части проекта (tsconfig.node.json)
			files: ['*.config.{ts,mts,cts}', 'vite.config.ts'],
			...tsConfig,
			parserOptions: {
				project: ['./tsconfig.node.json'],
				tsconfigRootDir: __dirname,
				sourceType: 'module',
			},
			rules: {
				...tsRules,
				'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
			},
		},
		{
			// данные графа — сгенерированный массив на тысячи строк, поэтому лимит строк к ним не применяется
			files: ['src/data/**/*.ts'],
			rules: {
				'max-lines': 0,
			},
		},
	],
}
