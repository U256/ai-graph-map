import baseConfig from './.prettierrc.mjs'

const precommitConfig = {
	...baseConfig,
	plugins: [...(baseConfig.plugins || []), 'prettier-plugin-organize-imports'],
}

export default precommitConfig
