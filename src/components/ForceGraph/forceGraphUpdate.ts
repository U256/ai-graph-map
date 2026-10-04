import type { GraphLink, GraphLinkInput, GraphNode, GraphNodeInput } from '../../types/graph'
import type { NextLink } from './crud/graphLinksCRUD'
import { buildLink, collectInputSeeds, diffLinks, linkKeyOf } from './crud/graphLinksCRUD'
import type { NextNode } from './crud/graphNodesCRUD'
import {
	buildNode,
	isNodeRenderDataChanged,
	isNodeTypeChanged,
	nodeKey,
	nodeKeyOf,
	nodeRenderData,
	seedPosition,
} from './crud/graphNodesCRUD'
import type { NodeRenderData, SeedPoint } from './forceGraph'

/**
 * Разбор новых данных графа относительно текущего состояния сцены. Модуль чистый, поэтому весь разбор
 * проверяется в Node — там ловятся `NaN` в координатах и несуществующие концы связей.
 */

/**
 * Узлы берутся из симуляции, связи — из силы связей: она уже подменила концы объектами узлов, и именно
 * этот список физика переключит на новый. Снимок значений нужен, чтобы сравнение не зависело от мутации
 * данных на месте.
 */
export interface GraphState {
	nodes: Map<string, GraphNode>
	snapshots: Map<string, NodeRenderData>
	links: Map<string, GraphLink>
	linkKeys: string[]
}

/** `added` входит в `kept` — новый узел тоже едет в следующий список. */
interface NodesDiff {
	added: NextNode[]
	updated: NextNode[]
	kept: NextNode[]
	removedNodeKeys: string[]
}

/** Сущности, у которых правились данные: им пересчитывается раскладка, цвет и толщина линии. */
export interface ChangedGraph {
	nodes: NextNode[]
	links: NextLink[]
}

/** Итог разбора: операции add/update/delete плюс точки высадки новых узлов. */
export interface GraphUpdatePlan {
	addedNodes: NextNode[]
	updatedNodes: NextNode[]
	keptNodes: NextNode[]
	removedNodeKeys: string[]
	keptLinks: NextLink[]
	addedLinks: NextLink[]
	removedLinkKeys: string[]
	changed: ChangedGraph
	seeds: Map<string, SeedPoint>
}

/** Чтобы слои тронули только добавленные и изменённые элементы, а не всю сцену. */
export interface GraphUpdateResult {
	nodes: GraphNode[]
	links: GraphLink[]
	addedNodeKeys: Set<string>
	removedNodeKeys: Set<string>
	changedNodeKeys: Set<string>
	addedLinkKeys: Set<string>
	changedLinkKeys: Set<string>
}

/** Снимки значений всех узлов — то, с чем сравниваются следующие данные. */
export function snapshotNodes(nodes: GraphNode[]): Map<string, NodeRenderData> {
	const snapshots = new Map<string, NodeRenderData>()
	nodes.forEach((node) => snapshots.set(node.id, nodeRenderData(node)))
	return snapshots
}

export function readGraphState(nodes: GraphNode[], links: GraphLink[]): GraphState {
	return {
		nodes: new Map(nodes.map((node) => [node.id, node])),
		snapshots: snapshotNodes(nodes),
		links: new Map(links.map((link) => [linkKeyOf(link), link])),
		linkKeys: links.map(linkKeyOf),
	}
}

/** Удалённые возвращаются ключом: их объекта в новых данных уже нет. Дубликаты id схлопываются в первую запись: второй узел с тем же id сломал бы и `simulation.nodes()`, и слой. */
export function diffNodes(state: GraphState, nextNodes: GraphNodeInput[]): NodesDiff {
	const byKey = new Map<string, NextNode>()

	nextNodes.forEach((node) => {
		const key = nodeKeyOf(node)
		if (byKey.has(key)) return
		const before = state.nodes.get(node.id)

		if (!before) {
			// облако нового узла считается заново, поэтому он же и «изменённый»
			byKey.set(key, { key, node, changed: true })
			return
		}

		const snapshot = state.snapshots.get(node.id) as NodeRenderData
		byKey.set(key, { key, node, changed: isNodeRenderDataChanged(snapshot, node) })
	})

	const kept = [...byKey.values()]

	return {
		added: kept.filter(({ node }) => !state.nodes.has(node.id)),
		updated: kept.filter(({ changed }) => changed),
		kept,
		removedNodeKeys: [...state.nodes.keys()].filter((id) => !byKey.has(nodeKey(id))),
	}
}

/**
 * Смена `type` узла меняет его цвет, а значит и вид его связей: они попадают в `changed.links`, хотя их
 * данные не менялись.
 */
function collectChanged(state: GraphState, nodes: NodesDiff, links: NextLink[]): ChangedGraph {
	const changedNodes: NextNode[] = []
	const typeChanged = new Set<string>()

	nodes.updated.forEach((next) => {
		const before = state.nodes.get(next.node.id)
		if (before && isNodeTypeChanged(before, next.node)) typeChanged.add(next.node.id)
		changedNodes.push(next)
	})

	const changedLinks = links.filter(
		(next) => typeChanged.has(next.link.source as string) || typeChanged.has(next.link.target as string),
	)

	return { nodes: changedNodes, links: changedLinks }
}

export function planGraphUpdate(
	state: GraphState,
	data: { nodes: GraphNodeInput[]; links: GraphLinkInput[] },
): GraphUpdatePlan {
	const nodes = diffNodes(state, data.nodes)
	const wantedIds = new Set(data.nodes.map((node) => node.id))
	const links = diffLinks(state.linkKeys, data.links, wantedIds)
	const keptKeys = new Set(links.all.map(({ key }) => key))

	return {
		addedNodes: nodes.added,
		updatedNodes: nodes.updated,
		keptNodes: nodes.kept,
		removedNodeKeys: nodes.removedNodeKeys,
		keptLinks: links.all.filter((next) => !next.added),
		addedLinks: links.added,
		removedLinkKeys: state.linkKeys.filter((key) => !keptKeys.has(key)),
		seeds: collectInputSeeds(data.links, state.nodes),
		changed: collectChanged(state, nodes, links.all),
	}
}

/** Концы всегда строковые: их подменяет узлами `forceLink.links()`. */
function rebuildLink(link: GraphLink): GraphLink {
	return buildLink({ source: String(link.source), target: String(link.target), force: link.force })
}

function toKeySet(items: { key: string }[]): Set<string> {
	return new Set(items.map(({ key }) => key))
}

/** Порядок списков — как в новых данных: он задаёт и порядок в симуляции, и порядок групп в Canvas. Связи пересобираются новыми объектами всегда: `forceLink.links()` заново разрешает строковые концы по id, а renderer перерисовывает толщину по данным — переиспользование прежнего объекта ничего бы не сэкономило. */
export function applyGraphUpdate(state: GraphState, plan: GraphUpdatePlan): GraphUpdateResult {
	const nodes = plan.keptNodes.map(({ node, changed }, index) => {
		const before = state.nodes.get(node.id)
		if (!changed) return before as GraphNode
		// новому узлу нужен посев (угол высадки задаёт позиция в новом списке), изменённому — прежние координаты
		if (!before) return buildNode(node, undefined, seedPosition(plan.seeds.get(node.id), index))
		return buildNode(node, before)
	})

	return {
		nodes,
		links: plan.keptLinks.concat(plan.addedLinks).map(({ link }) => rebuildLink(link)),
		addedNodeKeys: toKeySet(plan.addedNodes),
		removedNodeKeys: new Set(plan.removedNodeKeys.map((id) => nodeKey(id))),
		changedNodeKeys: toKeySet(plan.updatedNodes),
		addedLinkKeys: toKeySet(plan.addedLinks),
		changedLinkKeys: toKeySet(plan.changed.links),
	}
}
