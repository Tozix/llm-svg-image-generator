import axios, { AxiosResponse } from 'axios';
import sharp from 'sharp';
import { optimize } from 'svgo';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { JSDOM } from 'jsdom';
import {
  API_CONFIG,
  IMAGE_CONFIG,
  ENABLE_EXTENDED_DESCRIPTION,
  MAX_VALIDATION_RETRIES,
  GRID_COLS,
  GRID_ROWS,
  COMPOSITE_CONCURRENCY,
  COMPOSITE_SCENE,
  CANVAS_BY_MODE,
  MAX_GENERATION_TOKENS,
  MAX_SVG_ELEMENTS,
  isDebug,
  type GenerationMode,
} from './config';
import { loadPrompt } from './prompts/loader';
import {
  getGenerationTypeConfig,
  VALID_GENERATION_TYPES,
  type GenerationType,
} from './prompts/types';
import {
  ELEMENT_TYPES,
  type ElementType,
  loadLibrary,
  findByType,
  getElementSvg,
} from './library';
import { log, logDebug, warn, error as logError } from './logger';

const MIN_SVG_LENGTH = 200;

/** Данные фрагмента для мержа: SVG и опционально исходные размеры (для масштабирования из библиотеки). */
export interface FragmentData {
  svg: string;
  sourceWidth?: number;
  sourceHeight?: number;
}
const MAX_COMPOSITE_ELEMENTS = 20;

/** Элемент сцены после декомпозиции (координаты в ячейках сетки). */
export interface SceneElement {
  id: string;
  description: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  zIndex: number;
  /** Опционально: id элемента, на который накладывается (область должна быть внутри родителя). */
  parentId?: string;
  /** Тип элемента для поиска в библиотеке (window, door, tree, …). */
  elementType?: string;
  /** Использовать элемент из библиотеки, если найден по elementType. */
  useFromLibrary?: boolean;
}

/** Преобразует координаты сетки в пиксели (левый верхний угол и размер). */
function gridToPixels(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number } {
  const cellW = canvasWidth / GRID_COLS;
  const cellH = canvasHeight / GRID_ROWS;
  return {
    x: gridX * cellW,
    y: gridY * cellH,
    width: gridW * cellW,
    height: gridH * cellH,
  };
}

interface LLMResponse {
  choices: Array<{
    message?: { content: string };
    delta?: { content?: string };
  }>;
}

/** Описание границ карты (N/S/W/E) для стыковки с соседними фрагментами. */
export interface MapEdgesOption {
  n?: string;
  s?: string;
  e?: string;
  w?: string;
}

interface GenerationOptions {
  description: string;
  accents?: string;
  outputDir?: string;
  fileName?: string;
  width?: number;
  height?: number;
  pixelScale?: number;
  backgroundColor?: string;
  outputFormat?: 'png' | 'jpg' | 'webp';
  quality?: number;
  /** Тип генерации для MMORPG (mob, npc, player, plot_map, plot_view, object_detail). */
  type?: GenerationType;
  /** Композитная генерация: разбить сцену на элементы, собрать из фрагментов (только для plot_view). */
  composite?: boolean;
  /** Режим (legacy): используется если type не указан. */
  mode?: GenerationMode;
  /** Использовать элементы из библиотеки при композитной генерации. */
  useLibrary?: boolean;
  /** Перспектива сцены: вид от первого лица (только для scene/plot_view). */
  sceneView?: 'default' | 'first_person';
  /** Биом фрагмента карты (только для plot_map). */
  mapBiome?: string;
  /** Границы карты для стыковки с соседними тайлами (только для plot_map). */
  mapEdges?: MapEdgesOption;
}

/** Маппинг mode -> type для обратной совместимости */
function modeToType(mode: GenerationMode): GenerationType {
  const map: Record<GenerationMode, GenerationType> = {
    scene: 'plot_view',
    object: 'object_detail',
    character: 'mob',
    map: 'plot_map',
  };
  return map[mode];
}

export class SVGGenerator {
  private apiConfig = API_CONFIG;
  private imageConfig = IMAGE_CONFIG;

  constructor(config?: Partial<typeof API_CONFIG>) {
    if (config) {
      this.apiConfig = { ...this.apiConfig, ...config };
    }
  }

  /**
   * Улучшает промпт для генерации изображения: добавляет конкретные технические детали (размеры, цвета, композиция, дизеринг).
   */
  private async expandDescription(
    description: string,
    accents?: string,
  ): Promise<string> {
    const systemPrompt = loadPrompt('system/expand_description.txt');
    const userContent = loadPrompt('expand_user.txt', {
      description,
      accentsLine: accents ? `Акценты для усиления: ${accents}` : '',
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    logDebug('Запрос улучшения промта к LLM...');
    if (isDebug) {
      this.logLLMDebugRequest(messages);
    }

    const response: AxiosResponse<LLMResponse> = await axios({
      method: 'post',
      url: this.apiConfig.endpoint,
      headers: {
        Authorization: this.apiConfig.apiKey,
        'Content-Type': 'application/json',
      },
      data: {
        model: this.apiConfig.model,
        messages,
        response_format: { type: 'text' },
        stream: false,
        max_tokens: 1024,
        temperature: 0.3,
      },
      timeout: 120000,
    });

    if (!response.data.choices?.[0]?.message?.content) {
      throw new Error('Пустой ответ LLM при улучшении промта');
    }

    let improved = response.data.choices[0].message.content.trim();

    if (isDebug) {
      this.logLLMDebugResponse(improved, false);
    }

    const requiredElements = ['#', 'пиксел', '1024', 'дизеринг'];
    const missing = requiredElements.filter((el) => !improved.toLowerCase().includes(el));
    if (missing.length > 0) {
      logDebug(`Добавляем недостающие элементы: ${missing.join(', ')}`);
      improved += `\n\nВАЖНО: Используй базовый пиксель 4x4, палитру 32-64 цвета с дизерингом. Холст 1024x1024 пикселей.`;
    }

    logDebug(`Улучшенный промт получен, длина: ${improved.length} символов`);
    return improved;
  }

  /**
   * Классифицирует тип элемента по описанию через LLM (для сохранения в библиотеку).
   */
  async classifyElementType(description: string): Promise<ElementType> {
    const typeList = ELEMENT_TYPES.join(', ');
    const systemPrompt = loadPrompt('classification_system.txt', { typeList });
    const userContent = loadPrompt('classification_user.txt', { description, typeList });
    logDebug('Классификация типа элемента через LLM…');
    const raw = await this.fetchLLMContent([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');
    for (const t of ELEMENT_TYPES) {
      if (normalized === t || normalized.includes(t)) {
        return t;
      }
    }
    return 'other';
  }

  /**
   * Декомпозиция сцены: один запрос к LLM, возвращает список элементов с координатами на сетке.
   * Наложенные элементы (окна на зданиях) должны иметь ту же область или подмножество области базового элемента.
   * При useLibrary в ответ добавляются elementType и useFromLibrary для подстановки из библиотеки.
   */
  private async decomposeScene(
    description: string,
    accents: string,
    useLibrary?: boolean,
  ): Promise<SceneElement[]> {
    const typeList = ELEMENT_TYPES.join(', ');
    const libraryHint = useLibrary
      ? `

Для типовых элементов (окна, двери, фонари, вывески, деревья и т.д.) укажи elementType (один из: ${typeList}) и useFromLibrary: true, чтобы переиспользовать из библиотеки. Для уникальных объектов укажи useFromLibrary: false или не указывай.`
      : '';
    const systemPrompt = loadPrompt('decomposition_system.txt', {
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      gridColsM1: GRID_COLS - 1,
      gridRowsM1: GRID_ROWS - 1,
      libraryFields: useLibrary ? ', elementType, useFromLibrary' : '',
      maxCompositeElements: MAX_COMPOSITE_ELEMENTS,
      libraryHint,
    });
    const userContent = loadPrompt('decomposition_user.txt', {
      description,
      accentsLine: accents ? `\nАкценты: ${accents}` : '',
      libraryUserHint: useLibrary ? ' Для типовых элементов укажи elementType и useFromLibrary: true.' : '',
    });

    log('Декомпозиция сцены через LLM…');
    const raw = await this.fetchLLMContent([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ]);

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : raw.trim();
    let items: unknown[];
    try {
      items = JSON.parse(jsonStr);
    } catch (e) {
      logError('Не удалось распарсить JSON декомпозиции', e);
      throw new Error('Невалидный JSON от LLM при декомпозиции сцены');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Декомпозиция вернула пустой или не массив');
    }

    const elements: SceneElement[] = [];
    for (let i = 0; i < Math.min(items.length, MAX_COMPOSITE_ELEMENTS); i++) {
      const o = items[i] as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : `element_${i}`;
      const desc = typeof o.description === 'string' ? o.description : String(o.description ?? '');
      let gridX = Math.max(0, Math.min(GRID_COLS - 1, Number(o.gridX) || 0));
      let gridY = Math.max(0, Math.min(GRID_ROWS - 1, Number(o.gridY) || 0));
      let gridW = Math.max(1, Math.min(GRID_COLS - gridX, Number(o.gridW) || 1));
      let gridH = Math.max(1, Math.min(GRID_ROWS - gridY, Number(o.gridH) || 1));
      const zIndex = Math.max(0, Math.floor(Number(o.zIndex) || 0));
      const parentId = typeof o.parentId === 'string' ? o.parentId : undefined;
      const elementType = typeof o.elementType === 'string' && ELEMENT_TYPES.includes(o.elementType as ElementType) ? (o.elementType as ElementType) : undefined;
      const useFromLibrary = o.useFromLibrary === true && !!elementType;
      elements.push({
        id,
        description: desc,
        gridX,
        gridY,
        gridW,
        gridH,
        zIndex,
        parentId,
        elementType,
        useFromLibrary,
      });
    }

    // Валидация parentId: область дочернего должна быть внутри области родителя
    const byId = new Map(elements.map((el) => [el.id, el]));
    for (const el of elements) {
      if (!el.parentId) continue;
      const parent = byId.get(el.parentId);
      if (!parent) continue;
      if (
        el.gridX < parent.gridX ||
        el.gridY < parent.gridY ||
        el.gridX + el.gridW > parent.gridX + parent.gridW ||
        el.gridY + el.gridH > parent.gridY + parent.gridH
      ) {
        logDebug(
          `Элемент ${el.id} с parentId=${el.parentId}: область вне родителя, корректирую к области родителя`,
        );
        el.gridX = parent.gridX;
        el.gridY = parent.gridY;
        el.gridW = parent.gridW;
        el.gridH = parent.gridH;
      }
    }

    log(`Декомпозиция: ${elements.length} элементов`);
    return elements;
  }

  /**
   * Генерирует SVG-фрагмент для одного элемента (viewBox под размер области элемента).
   */
  private async generateFragment(
    element: SceneElement,
    sceneContext: string,
  ): Promise<string> {
    const canvasWidth = this.imageConfig.width;
    const canvasHeight = this.imageConfig.height;
    const { width: fragmentWidth, height: fragmentHeight } = gridToPixels(
      element.gridX,
      element.gridY,
      element.gridW,
      element.gridH,
      canvasWidth,
      canvasHeight,
    );

    const w = Math.round(fragmentWidth);
    const h = Math.round(fragmentHeight);
    const maxElementsFragment = Math.max(20, Math.floor(MAX_SVG_ELEMENTS / 3));
    const systemBase = loadPrompt('system/pixelart.txt', { maxSvgElements: MAX_SVG_ELEMENTS });
    const systemSuffix = loadPrompt('fragment_system_suffix.txt', {
      width: w,
      height: h,
      maxElementsFragment,
    });
    const systemPrompt = systemBase + systemSuffix;
    const userPrompt = loadPrompt('fragment_user.txt', {
      sceneContext,
      elementDescription: element.description,
      width: w,
      height: h,
      maxElementsFragment,
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const svgContent = await this.fetchLLMContent(messages);
    let svgCode = this.extractSVGCode(svgContent, Math.round(fragmentWidth), Math.round(fragmentHeight));
    if (!this.isValidSVG(svgCode)) {
      throw new Error(`Невалидный SVG фрагмент для элемента ${element.id}`);
    }
    return svgCode;
  }

  /**
   * Извлекает SVG и подставляет viewBox (перегрузка для фрагментов).
   */
  private extractSVGCode(
    text: string,
    overrideWidth?: number,
    overrideHeight?: number,
  ): string {
    const svgStart = text.indexOf('<svg');
    const svgEnd = text.lastIndexOf('</svg>');

    if (svgStart === -1 || svgEnd === -1) {
      throw new Error('В ответе LLM не найден SVG код');
    }

    let svgCode = text.substring(svgStart, svgEnd + 6);
    const w = overrideWidth ?? this.imageConfig.width;
    const h = overrideHeight ?? this.imageConfig.height;

    if (!svgCode.includes('viewBox')) {
      svgCode = svgCode.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
    }

    if (!svgCode.includes('width=') && !svgCode.includes('width="')) {
      svgCode = svgCode.replace('<svg', `<svg width="${w}" height="${h}"`);
    }

    return svgCode;
  }

  /**
   * Объединяет фрагменты в один SVG: корневой viewBox 0 0 width height, группы по zIndex с translate и опционально scale для библиотечных элементов.
   */
  private mergeFragments(
    elements: SceneElement[],
    fragmentByElementId: Map<string, FragmentData>,
    canvasWidth: number,
    canvasHeight: number,
    backgroundColor: string,
  ): string {
    const cellW = canvasWidth / GRID_COLS;
    const cellH = canvasHeight / GRID_ROWS;

    const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    const groups: string[] = [];

    for (const el of sorted) {
      const data = fragmentByElementId.get(el.id);
      if (!data) continue;

      try {
        const dom = new JSDOM(data.svg, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        const svgRoot = doc.querySelector('svg');
        if (!svgRoot) continue;

        const px = el.gridX * cellW;
        const py = el.gridY * cellH;
        const innerHtml = svgRoot.innerHTML;
        const targetW = el.gridW * cellW;
        const targetH = el.gridH * cellH;
        let transform = `translate(${px},${py})`;
        if (data.sourceWidth != null && data.sourceHeight != null && data.sourceWidth > 0 && data.sourceHeight > 0) {
          const sx = targetW / data.sourceWidth;
          const sy = targetH / data.sourceHeight;
          transform += ` scale(${sx},${sy})`;
        }
        groups.push(`<g transform="${transform}">${innerHtml}</g>`);
      } catch {
        logDebug(`Пропуск фрагмента ${el.id} при мерже`);
      }
    }

    const backgroundRect = `<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="${backgroundColor}"/>`;
    const root = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" width="${canvasWidth}" height="${canvasHeight}">${backgroundRect}${groups.join('')}</svg>`;
    return root;
  }

  /**
   * Выполняет задачи с ограничением конкурренции (пул из maxConcurrent одновременных).
   */
  private async runWithConcurrencyLimit<T, R>(
    items: T[],
    maxConcurrent: number,
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;

    const runNext = async (): Promise<void> => {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      await runNext();
    };

    const workers = Array.from({ length: Math.min(maxConcurrent, items.length) }, () => runNext());
    await Promise.all(workers);
    return results;
  }

  /**
   * Проверяет валидность SVG через парсинг (jsdom)
   */
  private isValidSVG(svgCode: string): boolean {
    if (!svgCode || svgCode.length < MIN_SVG_LENGTH) {
      logDebug(`SVG слишком короткий: ${svgCode?.length ?? 0} символов`);
      return false;
    }
    try {
      const dom = new JSDOM(svgCode, { contentType: 'image/svg+xml' });
      const doc = dom.window.document;
      const svg = doc.querySelector('svg');
      if (!svg) {
        logDebug('В разобранном SVG отсутствует корневой элемент svg');
        return false;
      }
      return true;
    } catch (e) {
      logDebug('Ошибка парсинга SVG: ' + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  }

  /** В debug выводит отправляемые в LLM сообщения (request). */
  private logLLMDebugRequest(messages: Array<{ role: string; content: string }>): void {
    const maxLogLen = 2500;
    logDebug('--- LLM request ---');
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const content = m.content || '';
      const preview = content.length <= maxLogLen ? content : content.slice(0, maxLogLen) + `\n... [ещё ${content.length - maxLogLen} символов]`;
      logDebug(`[${m.role}] ${preview}`);
    }
    logDebug('--- end request ---');
  }

  /** В debug выводит превью ответа LLM (response). */
  private logLLMDebugResponse(response: string, streamed: boolean): void {
    logDebug(`--- LLM response${streamed ? ' (stream)' : ''}, ${response.length} символов ---`);
    const head = 600;
    const tail = 300;
    if (response.length <= head + tail + 50) {
      logDebug(response);
    } else {
      logDebug(response.slice(0, head) + `\n... [пропущено ${response.length - head - tail} символов] ...\n` + response.slice(-tail));
    }
    logDebug('--- end response ---');
  }

  /**
   * Парсит SSE-поток ответа API и возвращает собранный текст
   */
  private async parseSSEStream(stream: Readable): Promise<string> {
    let buffer = '';
    let fullContent = '';
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as LLMResponse;
              const content = parsed.choices?.[0]?.delta?.content;
              if (typeof content === 'string') fullContent += content;
            } catch {
              // игнорируем невалидные строки
            }
          }
        }
      });
      stream.on('end', () => resolve(fullContent));
      stream.on('error', reject);
    });
  }

  /**
   * Выполняет один запрос к API (стрим или обычный) и возвращает сырой текст ответа
   */
  private async fetchLLMContent(messages: Array<{ role: string; content: string }>): Promise<string> {
    const useStream = this.apiConfig.stream === true;
    logDebug(useStream ? 'Запрос к API (режим stream)' : 'Запрос к API (обычный режим)');
    if (isDebug) {
      this.logLLMDebugRequest(messages);
    }

    const maxRetries = this.apiConfig.maxRetries ?? 3;
    const retryDelayMs = this.apiConfig.retryDelayMs ?? 3000;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (useStream) {
          const response = await axios({
            method: 'post',
            url: this.apiConfig.endpoint,
            headers: {
              Authorization: this.apiConfig.apiKey,
              'Content-Type': 'application/json',
            },
            data: {
              model: this.apiConfig.model,
              messages,
              response_format: { type: 'text' },
              stream: true,
              max_tokens: MAX_GENERATION_TOKENS,
            },
            timeout: 600000,
            responseType: 'stream',
          });
          const content = await this.parseSSEStream(response.data as Readable);
          logDebug(`Получен стрим, длина ответа: ${content.length} символов`);
          if (isDebug) {
            this.logLLMDebugResponse(content, true);
          }
          if (!content || content.length < MIN_SVG_LENGTH) {
            throw new Error('Ответ стрима пустой или слишком короткий');
          }
          return content;
        }

        const response: AxiosResponse<LLMResponse> = await axios({
          method: 'post',
          url: this.apiConfig.endpoint,
          headers: {
            Authorization: this.apiConfig.apiKey,
            'Content-Type': 'application/json',
          },
          data: {
            model: this.apiConfig.model,
            messages,
            response_format: { type: 'text' },
            stream: false,
            max_tokens: MAX_GENERATION_TOKENS,
          },
          timeout: 600000,
        });

        if (!response.data.choices?.[0]?.message?.content) {
          throw new Error('Пустой ответ от LLM');
        }
        const content = response.data.choices[0].message.content;
        logDebug(`Длина ответа: ${content.length} символов`);
        if (isDebug) {
          this.logLLMDebugResponse(content, false);
        }
        return content;
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { response?: { status?: number } })?.response?.status;
        const is5xx = typeof status === 'number' && status >= 500 && status < 600;

        if (is5xx && attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt - 1);
          warn(
            `API вернул ${status}. Повтор ${attempt}/${maxRetries} через ${delay / 1000} с…`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        logError('Ошибка при запросе к LLM', err);
        if (typeof status === 'number' && status >= 500 && status < 600) {
          logError('Сервер API временно недоступен. Проверьте статус API или повторите позже.');
        }
        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Строит user prompt из шаблона типа с подстановкой переменных.
   */
  private buildUserPromptFromType(
    type: GenerationType,
    description: string,
    accents: string,
    width: number,
    height: number,
    mapBiome?: string,
    mapEdges?: MapEdgesOption,
  ): string {
    const accentsFormatted = accents ? `АКЦЕНТЫ: ${accents}` : '';
    const biomeLine =
      type === 'plot_map' && (mapBiome ?? description)
        ? `\nБиом этого фрагмента: ${(mapBiome ?? description).trim()}`
        : '';
    const edges = mapEdges;
    const edgesLines =
      type === 'plot_map' && edges && (edges.n ?? edges.s ?? edges.e ?? edges.w)
        ? `\nСтыковка с соседними фрагментами (рисуй границы так, чтобы они продолжались логично):\nСевер (N): ${edges.n ?? 'свободная граница'}\nЮг (S): ${edges.s ?? 'свободная граница'}\nЗапад (W): ${edges.w ?? 'свободная граница'}\nВосток (E): ${edges.e ?? 'свободная граница'}`
        : '';

    return loadPrompt(`types/${type}.txt`, {
      description,
      accents: accentsFormatted,
      width,
      height,
      maxSvgElements: MAX_SVG_ELEMENTS,
      biomeLine,
      edgesLines,
    });
  }

  /**
   * Отправляет запрос к LLM API для генерации SVG (универсальный промпт по типу и размеру).
   */
  async generateSVGFromDescription(
    options: GenerationOptions,
  ): Promise<string> {
    let description = options.description;
    const accents = options.accents ?? '';
    const type: GenerationType = options.type ?? modeToType(options.mode ?? 'scene');
    const typeConfig = getGenerationTypeConfig(type);
    const width = options.width ?? typeConfig.width;
    const height = options.height ?? typeConfig.height;

    if (ENABLE_EXTENDED_DESCRIPTION) {
      log('Расширение описания через LLM…');
      description = await this.expandDescription(description, accents);
    }

    const systemPrompt = loadPrompt('system/pixelart.txt', { maxSvgElements: MAX_SVG_ELEMENTS });
    const userPrompt = this.buildUserPromptFromType(
      type,
      description,
      accents,
      width,
      height,
      options.mapBiome,
      options.mapEdges,
    );
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    log('Отправка запроса к LLM API…');

    for (let validationAttempt = 1; validationAttempt <= MAX_VALIDATION_RETRIES; validationAttempt++) {
      try {
        logDebug(`Попытка генерации SVG ${validationAttempt}/${MAX_VALIDATION_RETRIES}`);
        const svgContent = await this.fetchLLMContent(messages);
        const svgCode = this.extractSVGCode(svgContent, width, height);

        if (!this.isValidSVG(svgCode)) {
          warn(
            `Невалидный или неполный SVG (попытка ${validationAttempt}/${MAX_VALIDATION_RETRIES}). Повтор запроса…`,
          );
          if (validationAttempt === MAX_VALIDATION_RETRIES) {
            throw new Error('Не удалось получить валидный SVG после нескольких попыток');
          }
          continue;
        }

        log('SVG успешно сгенерирован');
        return svgCode;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('не найден SVG') || msg.includes('пустой') || msg.includes('короткий')) {
          warn(
            `Неполный ответ (попытка ${validationAttempt}/${MAX_VALIDATION_RETRIES}). Повтор запроса…`,
          );
          if (validationAttempt === MAX_VALIDATION_RETRIES) {
            throw new Error('Не удалось получить полный SVG после нескольких попыток');
          }
          continue;
        }
        throw err;
      }
    }

    throw new Error('Не удалось сгенерировать валидный SVG');
  }

  /**
   * Композитная генерация: декомпозиция → параллельная генерация фрагментов → объединение.
   */
  async generateCompositeScene(options: GenerationOptions): Promise<string> {
    const { description, accents = '' } = options;
    const canvasWidth = options.width ?? this.imageConfig.width;
    const canvasHeight = options.height ?? this.imageConfig.height;
    const backgroundColor = options.backgroundColor ?? this.imageConfig.backgroundColor;
    let sceneContext = `${description}${accents ? `. ${accents}` : ''}`;
    if (options.sceneView === 'first_person') {
      sceneContext += ' Вид от первого лица — герой смотрит на локацию собственными глазами.';
    }

    let elements: SceneElement[];
    try {
      elements = await this.decomposeScene(description, accents, options.useLibrary);
    } catch (err) {
      warn(
        `Декомпозиция не удалась, fallback на одну сцену целиком: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.generateSVGFromDescription(options);
    }

    if (elements.length === 0) {
      return this.generateSVGFromDescription(options);
    }

    const fragmentByElementId = new Map<string, FragmentData>();

    if (options.useLibrary) {
      const libraryEntries = await loadLibrary();
      for (const el of elements) {
        if (!el.useFromLibrary || !el.elementType) continue;
        const candidates = findByType(el.elementType, 'pixelart', libraryEntries);
        if (candidates.length === 0) continue;
        const chosen = candidates[0];
        try {
          const svg = await getElementSvg(chosen.id);
          fragmentByElementId.set(el.id, {
            svg,
            sourceWidth: chosen.width,
            sourceHeight: chosen.height,
          });
          logDebug(`Элемент ${el.id} подставлен из библиотеки (${chosen.id})`);
        } catch (err) {
          logDebug(`Не удалось загрузить элемент библиотеки ${chosen.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const toGenerate = elements.filter((el) => !fragmentByElementId.has(el.id));
    if (toGenerate.length > 0) {
      log(`Параллельная генерация ${toGenerate.length} фрагментов (конкурренция: ${COMPOSITE_CONCURRENCY})…`);
      const fragmentResults = await this.runWithConcurrencyLimit(
        toGenerate,
        COMPOSITE_CONCURRENCY,
        async (el) => {
          try {
            const svg = await this.generateFragment(el, sceneContext);
            return { id: el.id, svg };
          } catch (err) {
            logDebug(`Фрагмент ${el.id} не сгенерирован: ${err instanceof Error ? err.message : String(err)}`);
            return { id: el.id, svg: null };
          }
        },
      );
      for (const r of fragmentResults) {
        if (r.svg) fragmentByElementId.set(r.id, { svg: r.svg });
      }
    }

    if (fragmentByElementId.size === 0) {
      warn('Ни один фрагмент не сгенерирован, fallback на одну сцену');
      return this.generateSVGFromDescription(options);
    }

    const merged = this.mergeFragments(
      elements,
      fragmentByElementId,
      canvasWidth,
      canvasHeight,
      backgroundColor,
    );
    log(`Собрано ${fragmentByElementId.size}/${elements.length} фрагментов`);
    return merged;
  }

  /**
   * Оптимизирует SVG код (опционально с подстановкой width/height).
   */
  private optimizeSVG(
    svgCode: string,
    width?: number,
    height?: number,
  ): string {
    const w = width ?? this.imageConfig.width;
    const h = height ?? this.imageConfig.height;
    const result = optimize(svgCode, {
      multipass: true,
      plugins: [
        'preset-default',
        'removeDimensions',
        {
          name: 'addAttributesToSVGElement',
          params: {
            attributes: [{ width: `${w}`, height: `${h}` }],
          },
        },
      ],
    });

    return result.data;
  }

  /**
   * Рендерит SVG в растр (PNG/JPEG/WebP) с помощью sharp
   */
  async renderSVGToPNG(
    svgCode: string,
    outputPath: string,
    options?: Partial<typeof IMAGE_CONFIG>,
  ): Promise<void> {
    const config = { ...this.imageConfig, ...options };
    const width = config.width ?? this.imageConfig.width;
    const height = config.height ?? this.imageConfig.height;
    const pixelScale = Number(config.pixelScale ?? this.imageConfig.pixelScale) || 4;
    const density = Math.min(100000, Math.max(1, pixelScale * 96));

    try {
      // Оптимизируем SVG
      const optimizedSVG = this.optimizeSVG(svgCode);

      const inputOptions = {
        density,
        background: config.backgroundColor ?? this.imageConfig.backgroundColor,
      };

      let pipeline = sharp(Buffer.from(optimizedSVG), inputOptions).resize(
        width,
        height,
        {
          fit: 'fill',
          kernel: 'nearest',
        },
      );

      const format = config.outputFormat ?? this.imageConfig.outputFormat;
      const quality = Math.min(100, Math.max(1, Number(config.quality ?? this.imageConfig.quality) || 100));
      if (format === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else if (format === 'jpg') {
        pipeline = pipeline.jpeg({ quality });
      } else {
        pipeline = pipeline.webp({ quality });
      }

      await pipeline.toFile(outputPath);

      log(`Изображение сохранено: ${outputPath}`);
    } catch (err: unknown) {
      logError('Ошибка рендеринга изображения', err);
      throw err;
    }
  }

  /**
   * Сохраняет SVG в файл (опционально с размерами для атрибутов).
   */
  async saveSVGToFile(
    svgCode: string,
    filePath: string,
    width?: number,
    height?: number,
  ): Promise<void> {
    try {
      const optimizedSVG = this.optimizeSVG(svgCode, width, height);
      await fs.promises.writeFile(filePath, optimizedSVG, 'utf-8');
      log(`SVG сохранён: ${filePath}`);
    } catch (err: unknown) {
      logError('Ошибка сохранения SVG', err);
      throw err;
    }
  }

  /**
   * Полная генерация: SVG → Сохранение → PNG. Размер по типу; композит только для plot_view.
   */
  async generateCompleteImage(options: GenerationOptions): Promise<{
    svgPath: string;
    pngPath: string;
    svgCode: string;
  }> {
    const {
      outputDir = './output',
      fileName = `image_${Date.now()}`,
      ...generationOptions
    } = options;

    const type: GenerationType = options.type ?? modeToType(options.mode ?? 'scene');
    const typeConfig = getGenerationTypeConfig(type);
    const effectiveWidth = options.width ?? typeConfig.width;
    const effectiveHeight = options.height ?? typeConfig.height;
    const useComposite =
      (options.composite ?? typeConfig.useComposite ?? COMPOSITE_SCENE) && type === 'plot_view';

    const resolvedOptions: GenerationOptions = {
      ...generationOptions,
      description: options.description,
      accents: options.accents,
      type,
      mode: typeConfig.mode,
      width: effectiveWidth,
      height: effectiveHeight,
      useLibrary: options.useLibrary,
      sceneView: typeConfig.sceneView ?? options.sceneView,
      mapBiome: options.mapBiome,
      mapEdges: options.mapEdges,
    };

    await fs.promises.mkdir(outputDir, { recursive: true });

    const svgCode = useComposite
      ? await this.generateCompositeScene(resolvedOptions)
      : await this.generateSVGFromDescription(resolvedOptions);

    const svgPath = path.join(outputDir, `${fileName}.svg`);
    const outputFormat = options.outputFormat ?? this.imageConfig.outputFormat;
    const rasterPath = path.join(
      outputDir,
      `${fileName}.${outputFormat === 'jpg' ? 'jpg' : outputFormat}`,
    );

    await this.saveSVGToFile(svgCode, svgPath, effectiveWidth, effectiveHeight);

    await this.renderSVGToPNG(svgCode, rasterPath, {
      width: effectiveWidth,
      height: effectiveHeight,
      pixelScale: options.pixelScale,
      backgroundColor: options.backgroundColor,
      outputFormat: options.outputFormat,
      quality: options.quality,
    });

    return {
      svgPath,
      pngPath: rasterPath,
      svgCode,
    };
  }

  /**
   * Пакетная генерация нескольких изображений (запросы выполняются параллельно)
   */
  async batchGenerate(
    descriptions: Array<{
      description: string;
      accents?: string;
      type?: GenerationType;
      fileName?: string;
    }>,
    outputDir: string = './output/batch',
  ): Promise<Array<{ svgPath: string; pngPath: string }>> {
    log(
      `Запуск пакетной генерации: ${descriptions.length} изображений (параллельно)…`,
    );

    const tasks = descriptions.map((desc, i) => {
      const fileName = desc.fileName || `image_${i}_${Date.now()}`;
      return this.generateCompleteImage({
        ...desc,
        outputDir,
        fileName,
      }).then((result) => ({
        svgPath: result.svgPath,
        pngPath: result.pngPath,
      }));
    });

    const settled = await Promise.allSettled(tasks);
    const results: Array<{ svgPath: string; pngPath: string }> = [];

    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        logError(
          `Ошибка изображения ${i + 1}/${descriptions.length}:`,
          outcome.reason,
        );
      }
    });

    log(
      `Пакетная генерация завершена: ${results.length}/${descriptions.length} успешно`,
    );
    return results;
  }
}

/**
 * Вспомогательная функция для CLI использования
 */
export async function generateImageFromCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  npm run dev -- "описание" [акценты] [тип] [имя файла]
  Типы: mob, npc, player, plot_map, plot_view, object_detail
  
Examples:
  npm run dev -- "Огненный дракон" "" mob dragon
  npm run dev -- "Киберпанк город" "неон, такси" plot_view city
    `);
    return;
  }

  const generator = new SVGGenerator();

  const description = args[0];
  const accents = args[1] || '';
  const typeArg = args[2];
  const type = VALID_GENERATION_TYPES.includes(typeArg as GenerationType)
    ? (typeArg as GenerationType)
    : 'plot_view';
  const fileName = args[3] || `generated_${Date.now()}`;

  try {
    const result = await generator.generateCompleteImage({
      description,
      accents,
      type,
      fileName,
      outputDir: './output',
    });

    const typeConfig = getGenerationTypeConfig(type);
    log(`
Генерация завершена.
SVG: ${result.svgPath}
PNG: ${result.pngPath}
Размер: ${typeConfig.width}x${typeConfig.height}
Тип: ${type}
    `);
  } catch (err: unknown) {
    logError('Генерация не удалась', err);
    process.exit(1);
  }
}

// Если скрипт запущен напрямую из CLI
if (require.main === module) {
  generateImageFromCLI();
}
