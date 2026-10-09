import type { GraphData } from '../types/graph';

/** Мини-граф на 40 нод с искусственно распределёнными связями. */
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
            id: 'work-8',
            title: 'mGluR5 и базиглурант — 8',
            description:
                'Metabotropic Glutamate Receptor 5 Negative Allosteric Modulators: Discovery of 2-Chloro-4-[1-(4-fluorophenyl)-2,5-dimethyl-1H-imidazol-4-ylethynyl]pyridine (Basimglurant, RO4917523), a Promising Novel Medicine for Psychiatric Diseases',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-9',
            title: 'Nrf2 и продукция ROS — 9',
            description: 'Nrf2 regulates ROS production by mitochondria and NADPH oxidase.',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-10',
            title: 'Дазатиниб и босутиниб — 10',
            description:
                'The clinically approved drugs dasatinib and bosutinib induce anti-inflammatory macrophages by inhibiting the salt-inducible kinases',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-11',
            title: 'Активаторы Keap1/Nrf2 — 11',
            description:
                'New Monocyclic, Bicyclic, and Tricyclic Ethynylcyanodienones as Activators of the Keap1/Nrf2/ARE Pathway and Inhibitors of Inducible Nitric Oxide Synthase',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-12',
            title: 'Пальмитоилирование NCX — 12',
            description:
                'Palmitoylation of the Na/Ca exchanger cytoplasmic loop controls its inactivation and internalization during stress signaling',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-13',
            title: 'Вакцина против менингококка — 13',
            description:
                'Molecular Cloning and Functional Characterization of Components of the Capsule Biosynthesis Complex of Neisseria meningitidis Serogroup A TOWARD IN VITRO VACCINE PRODUCTION',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-14',
            title: 'Метод bump-and-hole — 14',
            description:
                'A bump-and-hole approach to engineer controlled selectivity of BET bromodomain chemical probes',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-15',
            title: 'TAK1 активирует IKKβ — 15',
            description:
                'An unexpected twist to the activation of IKKβ: TAK1 primes IKKβ for activation by autophosphorylation',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-16',
            title: 'PorB и TLR2 — 16',
            description:
                'Crystallographic analysis of Neisseria meningitidis PorB extracellular loops potentially implicated in TLR2 recognition',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-17',
            title: 'LKB1/SIK и глюконеогенез — 17',
            description:
                'The LKB1-salt-inducible kinase pathway functions as a key gluconeogenic suppressor in the liver',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-18',
            title: 'Ингибитор VPS34-IN1 — 18',
            description:
                'Characterization of VPS34-IN1, a selective inhibitor of Vps34, reveals that the phosphatidylinositol 3-phosphate-binding SGK3 protein kinase is a downstream target of class III phosphoinositide 3-kinase',
            hasWarning: false,
            type: 'node',
        },
        {
            id: 'work-19',
            title: 'Активаторы Nrf2 — 19',
            description:
                '3-(2-oxoethylidene)indolin-2-one derivatives activate Nrf2 and inhibit NF-κB: potential candidates for chemoprevention.',
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
        {
            id: 'mini-patent-9',
            title: 'Патент 741096',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-10',
            title: 'Патент 741233',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-11',
            title: 'Патент 741370',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-12',
            title: 'Патент 741507',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-13',
            title: 'Патент 741644',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-14',
            title: 'Патент 741781',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-15',
            title: 'Патент 741918',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-16',
            title: 'Патент 742055',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-17',
            title: 'Патент 742192',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-18',
            title: 'Патент 742329',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-19',
            title: 'Патент 742466',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-20',
            title: 'Патент 742603',
            hasWarning: false,
            type: 'subNode',
        },
        {
            id: 'mini-patent-21',
            title: 'Патент 742740',
            hasWarning: false,
            type: 'subNode',
        },
    ],
    links: [
        {
            source: 'work-13',
            target: 'mini-patent-10',
            force: 2,
        },
        {
            source: 'work-1',
            target: 'mini-patent-9',
            force: 3,
        },
        {
            source: 'work-1',
            target: 'mini-patent-16',
            force: 1,
        },
        {
            source: 'work-6',
            target: 'mini-patent-6',
            force: 3,
        },
        {
            source: 'work-8',
            target: 'mini-patent-9',
            force: 2,
        },
        {
            source: 'work-13',
            target: 'mini-patent-6',
            force: 1,
        },
        {
            source: 'work-1',
            target: 'mini-patent-4',
            force: 1,
        },
        {
            source: 'work-15',
            target: 'mini-patent-12',
            force: 3,
        },
        {
            source: 'work-1',
            target: 'mini-patent-12',
            force: 3,
        },
        {
            source: 'work-5',
            target: 'mini-patent-14',
            force: 2,
        },
        {
            source: 'work-3',
            target: 'mini-patent-12',
            force: 2,
        },
        {
            source: 'work-7',
            target: 'mini-patent-15',
            force: 2,
        },
        {
            source: 'work-12',
            target: 'mini-patent-2',
            force: 2,
        },
        {
            source: 'work-15',
            target: 'mini-patent-2',
            force: 3,
        },
        {
            source: 'work-15',
            target: 'mini-patent-4',
            force: 2,
        },
        {
            source: 'work-9',
            target: 'mini-patent-8',
            force: 1,
        },
        {
            source: 'work-15',
            target: 'mini-patent-20',
            force: 1,
        },
        {
            source: 'work-17',
            target: 'mini-patent-3',
            force: 3,
        },
        {
            source: 'work-16',
            target: 'mini-patent-16',
            force: 2,
        },
        {
            source: 'work-19',
            target: 'mini-patent-15',
            force: 1,
        },
        {
            source: 'work-19',
            target: 'mini-patent-14',
            force: 2,
        },
        {
            source: 'work-2',
            target: 'mini-patent-11',
            force: 1,
        },
        {
            source: 'work-19',
            target: 'mini-patent-6',
            force: 2,
        },
        {
            source: 'work-1',
            target: 'mini-patent-18',
            force: 3,
        },
        {
            source: 'work-16',
            target: 'mini-patent-20',
            force: 1,
        },
        {
            source: 'work-5',
            target: 'mini-patent-16',
            force: 3,
        },
        {
            source: 'work-7',
            target: 'mini-patent-17',
            force: 2,
        },
        {
            source: 'work-2',
            target: 'mini-patent-18',
            force: 3,
        },
        {
            source: 'work-2',
            target: 'mini-patent-7',
            force: 1,
        },
        {
            source: 'work-15',
            target: 'mini-patent-19',
            force: 2,
        },
        {
            source: 'work-14',
            target: 'mini-patent-18',
            force: 1,
        },
        {
            source: 'work-9',
            target: 'mini-patent-1',
            force: 3,
        },
        {
            source: 'work-14',
            target: 'mini-patent-3',
            force: 1,
        },
        {
            source: 'work-9',
            target: 'mini-patent-9',
            force: 3,
        },
        {
            source: 'work-4',
            target: 'mini-patent-2',
            force: 1,
        },
        {
            source: 'work-8',
            target: 'mini-patent-11',
            force: 3,
        },
        {
            source: 'work-15',
            target: 'mini-patent-16',
            force: 1,
        },
        {
            source: 'work-15',
            target: 'mini-patent-15',
            force: 3,
        },
    ],
};
