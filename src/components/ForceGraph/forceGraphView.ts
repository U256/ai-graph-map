import { drag, type D3DragEvent, type DragBehavior } from 'd3-drag'
import { select, type Selection } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom'
import type { DrawnLink, GraphData, GraphLink, GraphNode } from '../../types/graph'
import { createTypeColors, DRAG_CLICK_SLOP, GRAPH_HEIGHT, GRAPH_WIDTH } from './forceGraph'
import { createCloudLayouts, type CloudLayout } from './forceGraphCloud'
import { createTextMeasurer } from './forceGraphText'
import { LinkLayer } from './layers/graphLinkLayer'
import { NODE_CLASS, NodeLayer } from './layers/graphNodeLayer'

/**
 * Сборка статичной svg-сцены графа: здесь только svg, drag и панорама/зум.
 */

export interface ForceGraphOptions {
	panZoom?: boolean
	/**
	 * Наружу уходит только id: данные живут в стейте вызывающего, а `__data__` группы после правки может
	 * держать прежний объект симуляции. Клоны (`nodeClones > 1`) дают id вида `2-…`, которого в данных
	 * нет — вызывающий сам решает, что с этим делать (см. `App`).
	 */
	onNodeClick?: (id: string) => void
}

export interface ForceGraphHandle {
	svg: SVGSVGElement
	zoomIndicator: HTMLDivElement
	zoomControls: HTMLDivElement
	getZoomTransform: () => ZoomTransform
	setZoomTransform: (transform: ZoomTransform) => void
	setSelectedNode: (id: string | null) => void
	destroy: () => void
}

type SvgSelection = Selection<SVGSVGElement, unknown, null, undefined>
type ContentSelection = Selection<SVGGElement, unknown, null, undefined>

const SVG_NS = 'http://www.w3.org/2000/svg'
const ARIA_LABEL = 'Граф связей научных работ и патентов'
/** Без них граф легко потерять за краем экрана. */
const ZOOM_EXTENT: [number, number] = [0.1, 8]

/** Drag меняет только выбранный узел: статичная раскладка не должна разогревать соседей. */
function createDrag(onDrag: () => void): {
	behavior: DragBehavior<SVGGElement, GraphNode, GraphNode>
	wasDragging: () => boolean
} {
	let dragging = false
	let startX = 0
	let startY = 0

	function dragstarted(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		dragging = false
		startX = event.sourceEvent?.clientX ?? 0
		startY = event.sourceEvent?.clientY ?? 0
	}

	function dragged(event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
		const { subject } = event
		const source = event.sourceEvent as MouseEvent | undefined
		// порог в пикселях: дрожащая рука не должна превращать намеренный клик в жест
		if (source && Math.hypot(source.clientX - startX, source.clientY - startY) > DRAG_CLICK_SLOP) dragging = true
		subject.x = event.x
		subject.y = event.y
		onDrag()
	}

	function dragended(_event: D3DragEvent<SVGGElement, GraphNode, GraphNode>) {}

	const behavior = drag<SVGGElement, GraphNode, GraphNode>()
		.on('start', dragstarted)
		.on('drag', dragged)
		.on('end', dragended)

	return { behavior, wasDragging: () => dragging }
}

/** Узлы уводят жест себе (d3-drag глушит всплытие). Колесо поверх узла остаётся зумом: drag его не перехватывает, иначе на плотной карте зум работал бы почти никогда. */
function createZoomButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
	const button = document.createElement('button')
	button.type = 'button'
	button.textContent = label
	button.title = title
	button.setAttribute('aria-label', title)
	button.addEventListener('click', onClick)
	return button
}

function attachPanZoom(
	root: SvgSelection,
	content: ContentSelection,
	zoomIndicator: HTMLDivElement,
	onScale: (scale: number) => void,
): { controls: HTMLDivElement; getTransform: () => ZoomTransform; setTransform: (transform: ZoomTransform) => void } {
	const indicator = zoomIndicator
	let currentScale = zoomIdentity.k
	const behavior = zoom<SVGSVGElement, unknown>()
		.scaleExtent(ZOOM_EXTENT)
		.filter((event) => event.type === 'wheel' || !(event.target as Element).closest(`.${NODE_CLASS}`))
		.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
			const { x, y, k } = event.transform
			currentScale = k
			content.attr('transform', `translate(${x},${y}) scale(${k})`)
			onScale(k)
			indicator.textContent = `Зум: ${k.toFixed(1)}`
		})
	root.call(behavior)
	const getTransform = () => root.property('__zoom') ?? zoomIdentity
	const setTransform = (transform: ZoomTransform) => root.call(behavior.transform, transform)

	const controls = document.createElement('div')
	controls.className = 'force-graph__zoom-controls'
	controls.append(
		createZoomButton('□', 'Отцентровать карту', () => {
			root.call(behavior.transform, zoomIdentity)
		}),
		createZoomButton('+', 'Приблизить карту', () => {
			const nextScale = Math.min(ZOOM_EXTENT[1], currentScale + 0.3)
			root.call(behavior.scaleBy, nextScale / currentScale)
		}),
		createZoomButton('−', 'Отдалить карту', () => {
			const nextScale = Math.max(ZOOM_EXTENT[0], currentScale - 0.3)
			root.call(behavior.scaleBy, nextScale / currentScale)
		}),
	)
	return { controls, getTransform, setTransform }
}

/** Две группы: связи под узлами — порядок слоёв задан разметкой, а не z-index. */
function createScene(): {
	svg: SVGSVGElement
	content: ContentSelection
	linkLayer: SVGGElement
	nodeLayer: SVGGElement
} {
	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('viewBox', `${-GRAPH_WIDTH / 2} ${-GRAPH_HEIGHT / 2} ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`)
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
	svg.setAttribute('role', 'img')
	svg.setAttribute('aria-label', ARIA_LABEL)

	const content = select(svg).append('g')
	// цвет и непрозрачность — на группе слоя, чтобы на линии оставалась только толщина
	const links = content.append('g').attr('stroke', '#999').attr('stroke-opacity', 0.6)
	const nodes = content.append('g')

	return { svg, content, linkLayer: links.node() as SVGGElement, nodeLayer: nodes.node() as SVGGElement }
}

/** Превращает строковые концы входных связей в узлы, как раньше это делал `forceLink`. */
function resolveLinks(nodes: GraphNode[], links: GraphLink[]): DrawnLink[] {
	const byId = new Map(nodes.map((node) => [node.id, node]))
	return links.flatMap((link) => {
		const source = typeof link.source === 'string' ? byId.get(link.source) : link.source
		const target = typeof link.target === 'string' ? byId.get(link.target) : link.target
		return source && target ? [{ ...link, source, target } as DrawnLink] : []
	})
}

export function createForceGraph(data: GraphData, options: ForceGraphOptions = {}): ForceGraphHandle {
	const { panZoom = true, onNodeClick } = options
	const { svg, content, linkLayer: linkGroup, nodeLayer: nodeGroup } = createScene()
	const zoomIndicator = document.createElement('div')
	zoomIndicator.className = 'force-graph__zoom'
	zoomIndicator.textContent = 'Зум: 1.0'
	let zoomControls = document.createElement('div')
	let getZoomTransform = () => zoomIdentity
	let setZoomTransform = (_transform: ZoomTransform) => {}
	const root = select(svg)

	const measure = createTextMeasurer()
	const initialNodes: GraphNode[] = data.nodes.map((node) => ({ ...node }))
	const initialLinks: GraphLink[] = data.links.map((link) => ({ ...link }))
	// палитра живёт вместе со сценой: прежние типы не перекрасятся, новый получит свой оттенок
	const colorOf = createTypeColors(initialNodes)
	const drawnLinks = resolveLinks(initialNodes, initialLinks)
	let drawPositions = (): void => {}
	const { behavior: dragBehavior, wasDragging } = createDrag(() => drawPositions())

	const layers = {
		links: new LinkLayer(linkGroup),
		nodes: new NodeLayer(nodeGroup, {
			colorOf,
			layoutOf: (node) => createCloudLayouts([node], measure).get(node) as CloudLayout,
			// навешивается при создании: прежние группы не трогаются
			attach: (element) => {
				const group = select<SVGGElement, GraphNode>(element)
				group.call(dragBehavior)
				if (!onNodeClick) return
				group.on('click', (_event: MouseEvent, node: GraphNode) => {
					// d3-drag не глушит `click`, который браузер стреляет после отпускания мыши
					if (wasDragging()) return
					onNodeClick(node.id)
				})
			},
		}),
	}

	layers.links.sync(drawnLinks)
	layers.nodes.sync(initialNodes)
	layers.nodes.setSelectedNode(null)
	drawPositions = (): void => {
		layers.links.drawPositions()
		layers.nodes.drawPositions()
	}
	drawPositions()
	function setSelectedNode(id: string | null): void {
		layers.nodes.setSelectedNode(id)
	}

	if (panZoom) {
		const panZoomState = attachPanZoom(root, content, zoomIndicator, (scale) => layers.nodes.setZoomScale(scale))
		zoomControls = panZoomState.controls
		getZoomTransform = panZoomState.getTransform
		setZoomTransform = panZoomState.setTransform
	}

	return {
		svg,
		zoomIndicator,
		zoomControls,
		getZoomTransform,
		setZoomTransform,
		setSelectedNode,
		destroy: () => {
			layers.links.clear()
			layers.nodes.clear()
			svg.remove()
			zoomIndicator.remove()
			zoomControls.remove()
		},
	}
}
