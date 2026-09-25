import { useForm } from 'react-hook-form'
import type { GraphSettings } from '../../types/settings'
import './SettingsPanel.css'
import { DEFAULT_GRAPH_SETTINGS, NODE_CLONES_OPTIONS, NUMBER_FIELDS, saveGraphSettings } from './settingsPanel'

type SettingsPanelProps = {
	initialSettings: GraphSettings
	onApply: (settings: GraphSettings) => void
}

export function SettingsPanel({ initialSettings, onApply }: SettingsPanelProps) {
	const { register, handleSubmit, reset, watch } = useForm<GraphSettings>({ defaultValues: initialSettings })
	// цифра у подписи берётся из формы (`watch`), а не из применённых настроек: иначе она отставала бы
	// от бегунка до нажатия «Применить», и крутить физику вслепую было бы нельзя
	const liveSettings = watch()

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
			<label className="settings-panel__field" htmlFor="node-clones">
				<span className="settings-panel__label">Клонировать ноды</span>
				<select
					className="settings-panel__select"
					id="node-clones"
					title="Во сколько раз клонировать граф: каждая копия — полная копия всех узлов и связей."
					{...register('nodeClones', { valueAsNumber: true })}
				>
					{NODE_CLONES_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>
			{/* поля физики: range с текущим значением рядом, чтобы было видно, куда крутишь */}
			{NUMBER_FIELDS.map(({ key, min, max, step, label, hint }) => (
				<label className="settings-panel__field" htmlFor={key} key={key}>
					<span className="settings-panel__label">
						{label}
						<output className="settings-panel__value" htmlFor={key}>
							{liveSettings[key]}
						</output>
					</span>
					<input
						className="settings-panel__range"
						id={key}
						type="range"
						title={hint}
						min={min}
						max={max}
						step={step}
						{...register(key, { valueAsNumber: true })}
					/>
				</label>
			))}
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
