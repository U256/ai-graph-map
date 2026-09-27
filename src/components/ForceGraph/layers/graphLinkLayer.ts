import type { DrawnLink } from '../../../types/graph'
import { linkKeyOf } from '../crud/graphLinksCRUD'
import { LINK_FORCE_DEFAULT } from '../forceGraph'
import { GraphLayer, type LayerEntry } from './graphLayer'

/** Слой связей: по `<line>` на связь; цвет и непрозрачность держатся на группе слоя, на линии — только толщина и концы. */

const SVG_NS = 'http://www.w3.org/2000/svg'

function strokeWidth(link: DrawnLink): number {
	return Math.sqrt(link.force ?? LINK_FORCE_DEFAULT)
}

export class LinkLayer extends GraphLayer<DrawnLink> {
	constructor(layer: SVGGElement) {
		super(layer, linkKeyOf, {
			create: (link): LayerEntry<DrawnLink> => {
				const element = document.createElementNS(SVG_NS, 'line')
				element.setAttribute('stroke-width', String(strokeWidth(link)))
				return { element, datum: link }
			},
			update: (entry: LayerEntry<DrawnLink>) => {
				entry.element.setAttribute('stroke-width', String(strokeWidth(entry.datum)))
			},
		})
	}

	drawPositions(): void {
		this.draw(({ element, datum }) => {
			const line = element as SVGLineElement
			line.x1.baseVal.value = datum.source.x ?? 0
			line.y1.baseVal.value = datum.source.y ?? 0
			line.x2.baseVal.value = datum.target.x ?? 0
			line.y2.baseVal.value = datum.target.y ?? 0
		})
	}
}
