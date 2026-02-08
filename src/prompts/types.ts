/** Типы генерации для MMORPG */
export type GenerationType =
  | 'mob'
  | 'npc'
  | 'player'
  | 'plot_map'
  | 'plot_view'
  | 'object_detail';

/** Внутренний режим генератора */
export type GenerationMode = 'scene' | 'object' | 'character' | 'map';

/** Конфигурация типа генерации */
export interface GenerationTypeConfig {
  mode: GenerationMode;
  width: number;
  height: number;
  sceneView?: 'default' | 'first_person';
  useComposite?: boolean;
}

/** Размеры по умолчанию для типов (могут переопределяться через config) */
export const CHARACTER_SIZE = 128;
export const PLOT_MAP_SIZE = 512;
export const PLOT_VIEW_WIDTH = 640;
export const PLOT_VIEW_HEIGHT = 480;
export const OBJECT_DETAIL_SIZE = 256;

/** Маппинг типа генерации в конфигурацию */
export function getGenerationTypeConfig(
  type: GenerationType,
  overrides?: {
    characterSize?: number;
    plotMapSize?: number;
    plotViewWidth?: number;
    plotViewHeight?: number;
    objectDetailSize?: number;
  },
): GenerationTypeConfig {
  const charSize = overrides?.characterSize ?? CHARACTER_SIZE;
  const mapSize = overrides?.plotMapSize ?? PLOT_MAP_SIZE;
  const viewW = overrides?.plotViewWidth ?? PLOT_VIEW_WIDTH;
  const viewH = overrides?.plotViewHeight ?? PLOT_VIEW_HEIGHT;
  const objSize = overrides?.objectDetailSize ?? OBJECT_DETAIL_SIZE;

  switch (type) {
    case 'mob':
    case 'npc':
    case 'player':
      return {
        mode: 'character',
        width: charSize,
        height: charSize,
      };
    case 'plot_map':
      return {
        mode: 'map',
        width: mapSize,
        height: mapSize,
      };
    case 'plot_view':
      return {
        mode: 'scene',
        width: viewW,
        height: viewH,
        sceneView: 'first_person',
        useComposite: true,
      };
    case 'object_detail':
      return {
        mode: 'object',
        width: objSize,
        height: objSize,
      };
    default:
      return {
        mode: 'scene',
        width: viewW,
        height: viewH,
      };
  }
}

/** Валидные типы генерации */
export const VALID_GENERATION_TYPES: GenerationType[] = [
  'mob',
  'npc',
  'player',
  'plot_map',
  'plot_view',
  'object_detail',
];
