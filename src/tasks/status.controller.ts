import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TaskStoreService } from './task-store.service';

@ApiTags('status')
@Controller('api')
export class StatusController {
  constructor(private readonly taskStore: TaskStoreService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Статус очереди (без авторизации)',
    description:
      'Возвращает количество активных (выполняющихся) и ожидающих задач, а также maxConcurrent. ' +
      'Эндпоинт публичный — авторизация не требуется (для мониторинга).',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика очереди',
    schema: {
      type: 'object',
      properties: {
        active: { type: 'number', description: 'Число задач, которые сейчас выполняются воркерами' },
        waiting: { type: 'number', description: 'Число задач в очереди ожидания' },
        maxConcurrent: { type: 'number', description: 'Максимум одновременных воркеров (из MAX_CONCURRENT_JOBS)' },
      },
    },
  })
  getStatus() {
    return this.taskStore.getStats();
  }
}
