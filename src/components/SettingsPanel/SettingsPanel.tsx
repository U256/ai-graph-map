import { useForm } from 'react-hook-form'
import type { GraphSettings } from '../../types/settings'
import './SettingsPanel.css'
import { DEFAULT_GRAPH_SETTINGS, NODE_MULTIPLIER_OPTIONS, saveGraphSettings } from './settingsPanel'

type SettingsPanelProps = {
	initialSettings: GraphSettings
	onApply: (settings: GraphSettings) => void
}

export function SettingsPanel({ initialSettings, onApply }: SettingsPanelProps) {
	const { register, handleSubmit, reset } = useForm<GraphSettings>({ defaultValues: initialSettings })

	function applySettings(settings: GraphSettings) {
		saveGraphSettings(settings)
		onApply(settings)
	}

	function resetSettings() {
		reset(DEFAULT_GRAPH_SETTINGS)
	}

	return (
		<form className="settings-panel" onSubmit={handleSubmit(applySettings)}>
			<h2 className="settings-panel__title">Настройки</h2>
			<label className="settings-panel__field" htmlFor="node-multiplier">
				<span className="settings-panel__label">Мультипликатор нод</span>
				<select
					className="settings-panel__select"
					id="node-multiplier"
					{...register('nodeMultiplier', { valueAsNumber: true })}
				>
					{NODE_MULTIPLIER_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>
			<label className="settings-panel__option">
				<input className="settings-panel__input" type="checkbox" {...register('showFullSubNodes')} />
				<span className="settings-panel__toggle" aria-hidden="true" />
				<span className="settings-panel__label">Полный вид саб нод</span>
			</label>
			<label className="settings-panel__option">
				<input className="settings-panel__input" type="checkbox" {...register('hideSubNodes')} />
				<span className="settings-panel__checkbox" aria-hidden="true" />
				<span className="settings-panel__label">Скрыть саб ноды</span>
			</label>
			<div className="settings-panel__actions">
				<button className="settings-panel__button" type="submit">
					Применить
				</button>
				<button
					className="settings-panel__button settings-panel__button--ghost"
					type="button"
					onClick={resetSettings}
				>
					Сбросить
				</button>
			</div>
		</form>
	)
}
