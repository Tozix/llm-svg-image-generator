import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiBody, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskStoreService } from './task-store.service';
import * as path from 'path';
import * as fs from 'fs';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskStore: TaskStoreService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Создать задачу генерации',
    description:
      'Ставит задачу в очередь. Генерация выполняется в отдельном воркере (может занять несколько минут). ' +
      'В ответ приходит taskId — по нему опрашивайте GET /tasks/:id до status=completed или failed. ' +
      'При completed результат доступен по GET /tasks/:id/result, /tasks/:id/svg, /tasks/:id/png.',
  })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({
    status: 201,
    description: 'Задача создана',
    schema: { type: 'object', properties: { taskId: { type: 'string', example: '1739123456789-abc12de' } }, required: ['taskId'] },
  })
  @ApiResponse({ status: 400, description: 'Неверные параметры (например, пустое description)' })
  @ApiResponse({ status: 401, description: 'Требуется авторизация (Bearer JWT)' })
  createTask(@Body() dto: CreateTaskDto): { taskId: string } {
    const options = this.buildOptions(dto);
    const taskId = this.tasksService.createTask(options);
    return { taskId };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Статистика очереди задач',
    description: 'Количество активных (выполняющихся) и ожидающих задач, а также maxConcurrent (размер пула воркеров).',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика',
    schema: {
      type: 'object',
      properties: {
        active: { type: 'number', description: 'Число задач в обработке' },
        waiting: { type: 'number', description: 'Число задач в очереди' },
        maxConcurrent: { type: 'number', description: 'Макс. одновременных воркеров' },
      },
    },
  })
  getStatus() {
    return this.tasksService.getStats();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить статус задачи',
    description:
      'Опрашивайте этот эндпоинт по taskId (polling, например каждые 3–5 сек). ' +
      'status: pending — в очереди; processing — выполняется; completed — готово (в ответе есть svgUrl, pngUrl); failed — ошибка (см. error).',
  })
  @ApiParam({ name: 'id', description: 'Идентификатор задачи (taskId), полученный из POST /tasks', example: '1739123456789-abc12de' })
  @ApiResponse({
    status: 200,
    description: 'Статус задачи',
    schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
        error: { type: 'string', description: 'Сообщение об ошибке при status=failed' },
        svgUrl: { type: 'string', description: 'URL SVG при status=completed' },
        pngUrl: { type: 'string', description: 'URL PNG при status=completed' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Задача с таким id не найдена' })
  getTask(@Param('id') id: string) {
    return this.tasksService.getTask(id);
  }

  @Get(':id/result')
  @ApiOperation({
    summary: 'Получить результат задачи (URL файлов)',
    description: 'Возвращает svgUrl и pngUrl только если задача в статусе completed. Иначе 404.',
  })
  @ApiParam({ name: 'id', description: 'taskId' })
  @ApiResponse({
    status: 200,
    schema: { type: 'object', properties: { svgUrl: { type: 'string' }, pngUrl: { type: 'string' } }, required: ['svgUrl', 'pngUrl'] },
  })
  @ApiResponse({ status: 404, description: 'Задача не найдена или ещё не завершена' })
  getTaskResult(@Param('id') id: string) {
    return this.tasksService.getTaskResult(id);
  }

  @Get(':id/svg')
  @ApiOperation({
    summary: 'Скачать SVG файл',
    description: 'Отдаёт файл image/svg+xml. Доступно только при status=completed.',
  })
  @ApiParam({ name: 'id', description: 'taskId' })
  @ApiResponse({ status: 200, description: 'Файл SVG (Content-Type: image/svg+xml)' })
  @ApiResponse({ status: 404, description: 'Задача не найдена или результат ещё не готов' })
  async getTaskSvg(@Param('id') id: string, @Res() res: Response) {
    const entry = this.taskStore.get(id);
    if (!entry || entry.status !== 'completed' || !entry.result) {
      throw new NotFoundException('Результат недоступен');
    }
    const svgPath = path.join(process.cwd(), 'output', 'web', `${id}.svg`);
    if (!fs.existsSync(svgPath)) {
      throw new NotFoundException('Файл не найден');
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(svgPath);
  }

  @Get(':id/png')
  @ApiOperation({
    summary: 'Скачать PNG файл',
    description: 'Отдаёт растровое изображение (Content-Type: image/png). Доступно только при status=completed.',
  })
  @ApiParam({ name: 'id', description: 'taskId' })
  @ApiResponse({ status: 200, description: 'Файл PNG (Content-Type: image/png)' })
  @ApiResponse({ status: 404, description: 'Задача не найдена или результат ещё не готов' })
  async getTaskPng(@Param('id') id: string, @Res() res: Response) {
    const entry = this.taskStore.get(id);
    if (!entry || entry.status !== 'completed' || !entry.result) {
      throw new NotFoundException('Результат недоступен');
    }
    const pngPath = path.join(process.cwd(), 'output', 'web', `${id}.png`);
    if (!fs.existsSync(pngPath)) {
      throw new NotFoundException('Файл не найден');
    }
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(pngPath);
  }

  private buildOptions(dto: CreateTaskDto): Record<string, unknown> {
    const VALID_GENERATION_TYPES = [
      'mob',
      'npc',
      'player',
      'plot_map',
      'plot_view',
      'object_detail',
    ];
    const type = VALID_GENERATION_TYPES.includes(dto.type as never)
      ? dto.type
      : 'plot_view';
    const outputDir = path.join(process.cwd(), 'output', 'web');
    return {
      description: dto.description.trim(),
      accents: (dto.accents ?? '').trim(),
      type,
      outputDir,
      fileName: '', // worker will set to taskId
      composite: dto.composite === true,
      useLibrary: dto.useLibrary === true,
      ...(type === 'plot_view' && dto.sceneView === 'first_person'
        ? { sceneView: 'first_person' as const }
        : {}),
      ...(type === 'plot_map' && dto.mapBiome ? { mapBiome: dto.mapBiome.trim() } : {}),
      ...(type === 'plot_map' && dto.mapEdges ? { mapEdges: dto.mapEdges } : {}),
      ...(dto.width != null ? { width: dto.width } : {}),
      ...(dto.height != null ? { height: dto.height } : {}),
      ...(dto.pixelScale != null ? { pixelScale: dto.pixelScale } : {}),
      ...(dto.outputFormat ? { outputFormat: dto.outputFormat } : {}),
      ...(dto.quality != null ? { quality: dto.quality } : {}),
      ...(dto.backgroundColor ? { backgroundColor: dto.backgroundColor } : {}),
    };
  }
}
