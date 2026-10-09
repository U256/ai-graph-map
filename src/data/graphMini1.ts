import type { GraphData } from '../types/graph';

/** Мини-граф на 15 нод с искусственно распределёнными связями. */
export const graphData: GraphData = {
    nodes: [
        {
            id: 'work-1',
            title: 'Узнавание PROTAC — 1',
            description: 'Structural basis of PROTAC cooperative recognition for selective protein degradation.',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-2',
            title: 'ЛПС и пептиды — 2',
            description:
                'The influence of rough lipopolysaccharide structure on molecular interactions with mammalian antimicrobial peptides',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-3',
            title: 'Синтез ингибиторов BET — 3',
            description:
                'New Synthetic Routes to Triazolo-benzodiazepine Analogues: Expanding the Scope of the Bump-and-Hole Approach for Selective Bromo and Extra-Terminal (BET) Bromodomain Inhibition.',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-4',
            title: 'Пептиды против PPI — 4',
            description:
                'Cyclic and Macrocyclic Peptides as Chemical Tools To Recognise Protein Surfaces and Probe Protein-Protein Interactions.',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-5',
            title: 'Ингибиторы KDM4/KDM5 — 5',
            description:
                '8-Substituted Pyrido[3,4-d]pyrimidin-4(3H)-one Derivatives As Potent, Cell Permeable, KDM4 (JMJD2) and KDM5 (JARID1) Histone Lysine Demethylase Inhibitors.',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-6',
            title: 'Ингибиторы TAK1/MAP4K2 — 6',
            description:
                'Discovery of Type II Inhibitors of TGFβ-Activated Kinase 1 (TAK1) and Mitogen-Activated Protein Kinase Kinase Kinase Kinase 2 (MAP4K2)',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-7',
            title: 'SIK2 в адипоцитах — 7',
            description: 'SIK2 regulates CRTCs, HDAC4 and glucose uptake in adipocytes',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'mini-patent-1',
            title: 'Патент 740000',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-2',
            title: 'Патент 740137',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-3',
            title: 'Патент 740274',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-4',
            title: 'Патент 740411',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-5',
            title: 'Патент 740548',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-6',
            title: 'Патент 740685',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-7',
            title: 'Патент 740822',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-8',
            title: 'Патент 740959',
            hasWarning: false,
            type: 'subNode',
        },
    ],
    links: [
        {
            source: 'work-4',
            target: 'mini-patent-7',
            force: 3,
        },
        {
            source: 'work-2',
            target: 'mini-patent-4',
            force: 2,
        },
        {
            source: 'work-3',
            target: 'mini-patent-7',
            force: 2,
        },
        {
            source: 'work-3',
            target: 'mini-patent-8',
            force: 3,
        },
        {
            source: 'work-7',
            target: 'mini-patent-2',
            force: 1,
        },
        {
            source: 'work-7',
            target: 'mini-patent-4',
            force: 3,
        },
        {
            source: 'work-6',
            target: 'mini-patent-2',
            force: 2,
        },
        {
            source: 'work-5',
            target: 'mini-patent-3',
            force: 3,
        },
        {
            source: 'work-4',
            target: 'mini-patent-4',
            force: 2,
        },
        {
            source: 'work-2',
            target: 'mini-patent-3',
            force: 2,
        },
        {
            source: 'work-3',
            target: 'mini-patent-2',
            force: 3,
        },
        {
            source: 'work-4',
            target: 'mini-patent-8',
            force: 3,
        },
        {
            source: 'work-1',
            target: 'mini-patent-8',
            force: 1,
        },
        {
            source: 'work-1',
            target: 'mini-patent-7',
            force: 3,
        },
    ],
};
