import { Injectable } from '@nestjs/common';
import { logDebug } from '../logger';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TaskResult {
  svgPath: string;
  pngPath: string;
}

export interface TaskEntry {
  taskId: string;
  status: TaskStatus;
  createdAt: Date;
  completedAt?: Date;
  options?: Record<string, unknown>;
  result?: TaskResult;
  error?: string;
}

@Injectable()
export class TaskStoreService {
  private readonly tasks = new Map<string, TaskEntry>();

  create(taskId: string, options: Record<string, unknown>): void {
    this.tasks.set(taskId, {
      taskId,
      status: 'pending',
      createdAt: new Date(),
      options,
    });
  }

  get(taskId: string): TaskEntry | undefined {
    return this.tasks.get(taskId);
  }

  setProcessing(taskId: string): void {
    const entry = this.tasks.get(taskId);
    if (entry) {
      entry.status = 'processing';
      logDebug(`Task ${taskId} processing started`);
    }
  }

  complete(taskId: string, result: TaskResult): void {
    const entry = this.tasks.get(taskId);
    if (entry) {
      entry.status = 'completed';
      entry.completedAt = new Date();
      entry.result = result;
    }
  }

  fail(taskId: string, error: string): void {
    const entry = this.tasks.get(taskId);
    if (entry) {
      entry.status = 'failed';
      entry.completedAt = new Date();
      entry.error = error;
    }
  }

  getStats(): { active: number; waiting: number; maxConcurrent: number } {
    let active = 0;
    let waiting = 0;
    for (const e of this.tasks.values()) {
      if (e.status === 'processing') active++;
      if (e.status === 'pending') waiting++;
    }
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10) || 3;
    return { active, waiting, maxConcurrent };
  }
}
