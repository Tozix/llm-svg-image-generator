import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkerPoolService } from '../workers/worker-pool.service';
import { TaskStoreService, TaskResult } from './task-store.service';
import { log, logDebug } from '../logger';

@Injectable()
export class TasksService {
  constructor(
    private readonly taskStore: TaskStoreService,
    private readonly workerPool: WorkerPoolService,
  ) {}

  createTask(options: Record<string, unknown>): string {
    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.taskStore.create(taskId, options);
    log(`Task created: ${taskId}`);
    logDebug(`Task ${taskId} options: ${JSON.stringify(options)}`);
    this.workerPool.enqueue(
      taskId,
      options,
      (err, result) => {
        if (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.taskStore.fail(taskId, msg);
          log(`Task failed: ${taskId} - ${msg}`);
        } else {
          this.taskStore.complete(taskId, result as TaskResult);
          log(`Task completed: ${taskId}`);
        }
      },
      () => this.taskStore.setProcessing(taskId),
    );
    return taskId;
  }

  getTask(taskId: string) {
    const entry = this.taskStore.get(taskId);
    if (!entry) throw new NotFoundException('Задача не найдена');
    return {
      taskId: entry.taskId,
      status: entry.status,
      createdAt: entry.createdAt,
      completedAt: entry.completedAt,
      error: entry.error,
      ...(entry.status === 'completed' && entry.result
        ? {
            svgUrl: `/output/web/${taskId}.svg`,
            pngUrl: `/output/web/${taskId}.png`,
          }
        : {}),
    };
  }

  getTaskResult(taskId: string): { svgUrl: string; pngUrl: string } {
    const entry = this.taskStore.get(taskId);
    if (!entry) throw new NotFoundException('Задача не найдена');
    if (entry.status !== 'completed' || !entry.result) {
      throw new NotFoundException('Результат ещё не готов или задача не выполнена');
    }
    return {
      svgUrl: `/output/web/${taskId}.svg`,
      pngUrl: `/output/web/${taskId}.png`,
    };
  }

  getStats() {
    return this.taskStore.getStats();
  }
}
