import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';

const PARAMS_FILE = path.join(process.cwd(), 'config', 'generation-params.json');

function loadGenerationParamsFile(): Record<string, unknown> {
  try {
    if (fs.existsSync(PARAMS_FILE)) {
      return JSON.parse(fs.readFileSync(PARAMS_FILE, 'utf-8'));
    }
  } catch (_) {
    /* ignore */
  }
  return {};
}

const fileParams = loadGenerationParamsFile();

function numEnv(name: string, fileKey: string, defaultVal: number, min: number, max: number): number {
  const envVal = process.env[name];
  if (envVal !== undefined && envVal !== '') {
    const n = parseInt(envVal, 10);
    if (!Number.isNaN(n)) return Math.max(min, Math.min(max, n));
  }
  const fileVal = fileParams[fileKey];
  if (typeof fileVal === 'number' && !Number.isNaN(fileVal)) return Math.max(min, Math.min(max, fileVal));
  return Math.max(min, Math.min(max, defaultVal));
}

function boolEnv(name: string, fileKey: string, defaultVal: boolean): boolean {
  const envVal = process.env[name];
  if (envVal !== undefined && envVal !== '') return envVal === 'true' || envVal === '1';
  const fileVal = fileParams[fileKey];
  if (typeof fileVal === 'boolean') return fileVal;
  return defaultVal;
}

export interface ApiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  /** Повторять запрос при 5xx (по умолчанию 3 попытки) */
  maxRetries?: number;
  /** Задержка между попытками в мс (базовая, удваивается при каждой попытке) */
  retryDelayMs?: number;
  /** Включить стриминг ответа (SSE) */
  stream?: boolean;
}

/** Включён ли стриминг ответа API (SSE). По умолчанию false. */
export const STREAM_ENABLED =
  process.env.STREAM_ENABLED === 'true' || process.env.STREAM_ENABLED === '1';

/** Включить расширение описания через дополнительный запрос к LLM. По умолчанию false. */
export const ENABLE_EXTENDED_DESCRIPTION =
  process.env.ENABLE_EXTENDED_DESCRIPTION === 'true' ||
  process.env.ENABLE_EXTENDED_DESCRIPTION === '1';

/** Уровень логирования: debug выводит подробные сообщения. */
export const isDebug =
  process.env.LOG_LEVEL === 'debug' ||
  process.env.DEBUG === '1' ||
  process.env.DEBUG === 'true';

/** Сколько раз повторять запрос при неполном или невалидном SVG. По умолчанию 3. */
export const MAX_VALIDATION_RETRIES = Math.max(
  1,
  parseInt(process.env.MAX_VALIDATION_RETRIES || '3', 10) || 3,
);

/** Включить композитную генерацию: разбиение сцены на элементы и сборка из фрагментов. */
export const COMPOSITE_SCENE = boolEnv('COMPOSITE_SCENE', 'compositeScene', false);

/** Сетка для композитной сцены: число ячеек по горизонтали и вертикали. */
export const GRID_COLS = numEnv('GRID_COLS', 'gridCols', 16, 1, 32);
export const GRID_ROWS = numEnv('GRID_ROWS', 'gridRows', 12, 1, 32);

/** Максимум одновременных заданий генерации (API Worker). По умолчанию 3. */
export const MAX_CONCURRENT_JOBS = numEnv('MAX_CONCURRENT_JOBS', 'maxConcurrentJobs', 3, 1, 20);

/** Максимум одновременных запросов генерации фрагментов (пул). По умолчанию 5. */
export const COMPOSITE_CONCURRENCY = numEnv('COMPOSITE_CONCURRENCY', 'compositeConcurrency', 5, 1, 20);

/** Лимит токенов на один ответ при генерации SVG (чтобы не тянуть слишком долго). По умолчанию 8000. */
export const MAX_GENERATION_TOKENS = numEnv('MAX_GENERATION_TOKENS', 'maxGenerationTokens', 8000, 2000, 32000);

/** Максимум элементов в SVG (path, rect, circle, line и т.д.) — ограничивает сложность и время генерации. По умолчанию 80. */
export const MAX_SVG_ELEMENTS = numEnv('MAX_SVG_ELEMENTS', 'maxSvgElements', 1000, 20, 2000);

/** Ширина сцены (режим scene). По умолчанию 640. Ограничено 256–2048. */
export const SCENE_WIDTH = numEnv('SCENE_WIDTH', 'sceneWidth', 640, 256, 2048);
/** Высота сцены (режим scene). По умолчанию 480. Ограничено 256–2048. */
export const SCENE_HEIGHT = numEnv('SCENE_HEIGHT', 'sceneHeight', 480, 256, 2048);
/** Сторона квадрата для режимов object, character. По умолчанию 256. Ограничено 64–1024. */
export const OBJECT_SIZE = numEnv('OBJECT_SIZE', 'objectSize', 256, 64, 1024);
/** Размеры фрагмента карты (режим map). По умолчанию 512×512. Ограничено 256–1024. */
export const MAP_WIDTH = numEnv('MAP_WIDTH', 'mapWidth', 512, 256, 1024);
export const MAP_HEIGHT = numEnv('MAP_HEIGHT', 'mapHeight', 512, 256, 1024);

export interface ImageConfig {
  width: number;
  height: number;
  pixelScale: number;
  backgroundColor: string;
  outputFormat: 'png' | 'jpg' | 'webp';
  quality: number;
}

/** Режим генерации: сцена (пейзаж/город), один предмет, персонаж/существо, фрагмент карты. */
export type GenerationMode = 'scene' | 'object' | 'character' | 'map';

/** Размеры холста по режиму (scene — SCENE_*, object/character — OBJECT_SIZE, map — MAP_*). */
export const CANVAS_BY_MODE: Record<GenerationMode, { width: number; height: number }> = {
  scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
  object: { width: OBJECT_SIZE, height: OBJECT_SIZE },
  character: { width: OBJECT_SIZE, height: OBJECT_SIZE },
  map: { width: MAP_WIDTH, height: MAP_HEIGHT },
};

export const API_CONFIG: ApiConfig = {
  endpoint: process.env.API_ENDPOINT || 'https://qwen.agent-lia.ru/api/v1/chat/completions',
  apiKey: process.env.API_KEY || 'Bearer 2dcdaba1-fbbe-496a-93fb-792f34454424',
  model: process.env.MODEL || 'qwen-max-latest',
  maxTokens: 16000,
  temperature: 0.7,
  maxRetries: 3,
  retryDelayMs: 3000,
  stream: STREAM_ENABLED,
};

const imagePixelScale =
  typeof fileParams.pixelScale === 'number' && !Number.isNaN(fileParams.pixelScale)
    ? Math.max(1, Math.min(16, fileParams.pixelScale))
    : 4;
const imageBg =
  typeof fileParams.backgroundColor === 'string' && fileParams.backgroundColor
    ? fileParams.backgroundColor
    : '#0a0a1a';
const imageFormat =
  fileParams.outputFormat === 'jpg' || fileParams.outputFormat === 'webp'
    ? fileParams.outputFormat
    : 'png';
const imageQuality =
  typeof fileParams.quality === 'number' && !Number.isNaN(fileParams.quality)
    ? Math.max(1, Math.min(100, fileParams.quality))
    : 100;

export const IMAGE_CONFIG: ImageConfig = {
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT,
  pixelScale: imagePixelScale,
  backgroundColor: imageBg,
  outputFormat: imageFormat,
  quality: imageQuality,
};

/** Описание границ карты для стыковки с соседними фрагментами (N/S/W/E). */
export interface MapEdges {
  n?: string;
  s?: string;
  e?: string;
  w?: string;
}
