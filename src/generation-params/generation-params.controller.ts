import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiOperation, ApiBody } from '@nestjs/swagger';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SCENE_WIDTH,
  SCENE_HEIGHT,
  OBJECT_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_CONCURRENT_JOBS,
  COMPOSITE_SCENE,
  GRID_COLS,
  GRID_ROWS,
  COMPOSITE_CONCURRENCY,
  MAX_GENERATION_TOKENS,
  MAX_SVG_ELEMENTS,
  IMAGE_CONFIG,
} from '../config';

const PARAMS_FILE = path.join(process.cwd(), 'config', 'generation-params.json');

@ApiTags('generation-params')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('generation-params')
export class GenerationParamsController {
  @Get()
  @ApiOperation({
    summary: 'Получить параметры генерации по умолчанию',
    description:
      'Читает текущие значения из конфига (env): размеры холста по типам (sceneWidth/Height, objectSize, mapWidth/Height), ' +
      'maxConcurrentJobs, compositeScene, gridCols/Rows, compositeConcurrency, maxGenerationTokens, maxSvgElements, ' +
      'pixelScale, outputFormat, quality, backgroundColor. Секреты (API_KEY и т.д.) не возвращаются.',
  })
  @ApiResponse({
    status: 200,
    description: 'Объект с параметрами (числа и строки)',
    schema: {
      type: 'object',
      properties: {
        sceneWidth: { type: 'number' },
        sceneHeight: { type: 'number' },
        objectSize: { type: 'number' },
        mapWidth: { type: 'number' },
        mapHeight: { type: 'number' },
        maxConcurrentJobs: { type: 'number' },
        compositeScene: { type: 'boolean' },
        gridCols: { type: 'number' },
        gridRows: { type: 'number' },
        compositeConcurrency: { type: 'number' },
        maxGenerationTokens: { type: 'number' },
        maxSvgElements: { type: 'number' },
        pixelScale: { type: 'number' },
        outputFormat: { type: 'string', enum: ['png', 'jpg', 'webp'] },
        quality: { type: 'number' },
        backgroundColor: { type: 'string' },
      },
    },
  })
  getParams(): Record<string, unknown> {
    return {
      sceneWidth: SCENE_WIDTH,
      sceneHeight: SCENE_HEIGHT,
      objectSize: OBJECT_SIZE,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      maxConcurrentJobs: MAX_CONCURRENT_JOBS,
      compositeScene: COMPOSITE_SCENE,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      compositeConcurrency: COMPOSITE_CONCURRENCY,
      maxGenerationTokens: MAX_GENERATION_TOKENS,
      maxSvgElements: MAX_SVG_ELEMENTS,
      pixelScale: IMAGE_CONFIG.pixelScale,
      outputFormat: IMAGE_CONFIG.outputFormat,
      quality: IMAGE_CONFIG.quality,
      backgroundColor: IMAGE_CONFIG.backgroundColor,
    };
  }

  @Put()
  @ApiOperation({
    summary: 'Обновить параметры по умолчанию',
    description:
      'Сохраняет переданные поля в config/generation-params.json (мерж с текущим). ' +
      'Полное применение обычно требует перезапуска приложения. Тело: произвольный объект с ключами как в GET (sceneWidth, pixelScale и т.д.).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      description: 'Подмножество параметров для обновления',
      additionalProperties: true,
    },
  })
  @ApiResponse({ status: 200, description: 'Параметры сохранены', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  @ApiResponse({ status: 401, description: 'Требуется авторизация' })
  async updateParams(@Body() body: Record<string, unknown>): Promise<{ ok: boolean }> {
    const dir = path.dirname(PARAMS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const current = fs.existsSync(PARAMS_FILE)
      ? JSON.parse(fs.readFileSync(PARAMS_FILE, 'utf-8'))
      : {};
    const merged = { ...current, ...body };
    fs.writeFileSync(PARAMS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return { ok: true };
  }
}
