import { useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { StylesConfig } from 'react-select'
import Select from 'react-select'
import type { GraphData, GraphNodeInput, GraphNodeType } from '../../types/graph'
import './NodeForm.css'
import './SettingsPanel.css'
import {
	type NeighborOption,
	type NodeCreateDraft,
	type NodeDraft,
	NODE_TYPE_OPTIONS,
	neighborOptions,
	nodeCaption,
} from './nodeForm'

/**
 * Дровер узла в левой панели: заменяет `SettingsPanel` целиком, а не ложится поверх карты, поэтому вид
 * панорамы и накопленная раскладка не трогаются. Форма ничего не меняет в данных сама — новые
 * `GraphData` строит родитель чистыми функциями из `nodeForm.ts`.
 */

type NodeFormValues = NodeCreateDraft & {
	firstNeighbor: NeighborOption | null
	secondNeighbor: NeighborOption | null
	thirdNeighbor: NeighborOption | null
}

/** По этим же именам ключи соседних полей и селектов. */
const NEIGHBOR_FIELDS: { name: 'firstNeighbor' | 'secondNeighbor' | 'thirdNeighbor'; label: string }[] = [
	{ name: 'firstNeighbor', label: 'Связать с узлом' },
	{ name: 'secondNeighbor', label: 'Ещё узел' },
	{ name: 'thirdNeighbor', label: 'И ещё узел' },
]

/** Меню — порталом в `body`: панель прокручивается, и обычное меню обрезалось бы её нижним краем. */
const SELECT_STYLES: StylesConfig<NeighborOption, false> = {
	control: (base) => ({
		...base,
		minHeight: '2.1rem',
		backgroundColor: '#fff',
		borderColor: 'rgb(0 0 0 / 18%)',
		borderRadius: 4,
		fontSize: '0.9rem',
		boxShadow: 'none',
	}),
	valueContainer: (base) => ({ ...base, gap: '2px', padding: '0 0.4rem' }),
	input: (base) => ({ ...base, margin: 0, fontSize: '0.9rem' }),
	placeholder: (base) => ({ ...base, color: '#8a97a5' }),
	menu: (base) => ({ ...base, fontSize: '0.9rem' }),
	menuPortal: (base) => ({ ...base, zIndex: 20 }),
}

type NodeFormProps = {
	/** `null` — форма создания новой ноды. */
	node: GraphNodeInput | null
	data: GraphData
	onCreate: (draft: NodeCreateDraft, neighbors: string[]) => void
	onUpdate: (id: string, draft: NodeDraft) => void
	onDelete: (id: string) => void
	onCancel: () => void
}

const EMPTY_NEIGHBORS = { firstNeighbor: null, secondNeighbor: null, thirdNeighbor: null }

export function NodeForm({ node, data, onCreate, onUpdate, onDelete, onCancel }: NodeFormProps) {
	const editing = node !== null
	const {
		register,
		handleSubmit,
		control,
		watch,
		setValue,
		formState: { errors },
	} = useForm<NodeFormValues>({
		// значения читаются один раз при монтировании, поэтому родитель меняет `key` вместе с выбором ноды
		defaultValues: editing
			? {
					type: node.type,
					title: node.title,
					description: node.description ?? '',
					hasWarning: node.hasWarning,
					...EMPTY_NEIGHBORS,
				}
			: {
					type: 'node',
					title: '',
					description: '',
					hasWarning: false,
					...EMPTY_NEIGHBORS,
				},
	})

	const type = watch('type')
	const options = useMemo(() => neighborOptions(data, type), [data, type])

	// иначе связь ушла бы в узел, который с новым типом не связывают
	function changeType(next: GraphNodeType) {
		setValue('type', next)
		NEIGHBOR_FIELDS.forEach((field) => setValue(field.name, null))
	}

	function submit(values: NodeFormValues) {
		const draft: NodeDraft = {
			title: values.title.trim(),
			description: values.description.trim(),
			hasWarning: values.hasWarning,
		}
		if (editing) {
			onUpdate(node.id, draft)
			return
		}
		const neighbors = NEIGHBOR_FIELDS.map((field) => values[field.name]?.value).filter(
			(value): value is string => typeof value === 'string',
		)
		onCreate({ ...draft, type: values.type }, neighbors)
	}

	return (
		<form className="settings-panel node-form" onSubmit={handleSubmit(submit)}>
			<div className="settings-panel__header">
				<h2 className="settings-panel__title">{editing ? 'Правка узла' : 'Новый узел'}</h2>
				<button className="settings-panel__corner" type="button" onClick={onCancel} title="Назад к настройкам">
					←
				</button>
			</div>

			{/* правкой не меняются, иначе поехали бы ключи слоёв */}
			{editing && <p className="node-form__caption">{nodeCaption(node)}</p>}

			{!editing && (
				<div className="settings-panel__field">
					<span className="settings-panel__label">Тип узла</span>
					<select
						className="settings-panel__select"
						value={type}
						title="Работа — облако с текстом, патент — иконка."
						onChange={(event) => changeType(event.target.value as GraphNodeType)}
					>
						{NODE_TYPE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
			)}

			<label className="settings-panel__field" htmlFor="node-title">
				<span className="settings-panel__label">Название</span>
				<input
					className="node-form__input"
					id="node-title"
					type="text"
					title="Короткая подпись узла на карте."
					{...register('title', { required: 'Нужно название' })}
				/>
				{errors.title && <span className="node-form__error">{errors.title.message}</span>}
			</label>

			<label className="settings-panel__field" htmlFor="node-description">
				<span className="settings-panel__label">Описание</span>
				<textarea
					className="node-form__input node-form__textarea"
					id="node-description"
					rows={3}
					title="Полное название: оно остаётся в подсказке узла, когда подпись на карте обрезана."
					{...register('description')}
				/>
			</label>

			<label className="settings-panel__option">
				<input
					className="settings-panel__input"
					type="checkbox"
					title="Красная точка в левом верхнем углу облака."
					{...register('hasWarning')}
				/>
				<span className="settings-panel__checkbox" aria-hidden="true" />
				<span className="settings-panel__label">Предупреждение</span>
			</label>

			{/* править связи существующей ноды здесь нечем — узлы выбирают связи, а не форма */}
			{!editing &&
				NEIGHBOR_FIELDS.map((field) => (
					<div className="settings-panel__field" key={field.name}>
						<span className="settings-panel__label">{field.label}</span>
						<Controller
							control={control}
							name={field.name}
							render={({ field: select }) => (
								<Select
									instanceId={field.name}
									inputId={field.name}
									options={options}
									value={select.value}
									onChange={(option) => select.onChange(option ?? null)}
									onBlur={select.onBlur}
									isClearable
									placeholder="поиск по названию или id"
									noOptionsMessage={() => 'Нечего связать'}
									menuPortalTarget={document.body}
									styles={SELECT_STYLES}
								/>
							)}
						/>
					</div>
				))}

			<div className="settings-panel__actions">
				<button className="settings-panel__button" type="submit">
					{editing ? 'Сохранить' : 'Создать'}
				</button>
				{editing && (
					<button
						className="settings-panel__button node-form__button--danger"
						type="button"
						title="Удалить ноду и все её связи"
						onClick={() => onDelete(node.id)}
					>
						Удалить
					</button>
				)}
				<button className="settings-panel__button settings-panel__button--ghost" type="button" onClick={onCancel}>
					Отмена
				</button>
			</div>
		</form>
	)
}
