/** Настройки карты, которые собирает панель слева. */
export type GraphSettings = {
    /** Вариант набора нод: большой граф с множителем или один из мини-графов. */
    nodeClones: number | 'mini1' | 'mini2' | 'mini3';
    showFullSubNodes: boolean;
    hideSubNodes: boolean;
};
