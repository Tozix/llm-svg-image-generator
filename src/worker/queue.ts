/**
 * Очередь задач с ограничением конкурренции (семафор).
 * Позволяет обрабатывать несколько запросов параллельно, но не более maxConcurrent.
 */

export interface QueueStats {
  active: number;
  waiting: number;
  maxConcurrent: number;
}

export class JobQueue<T, R> {
  private maxConcurrent: number;
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  /** Текущая статистика очереди */
  getStats(): QueueStats {
    return {
      active: this.active,
      waiting: this.waiting.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /** Выполняет задачу с учётом лимита конкурренции */
  async run(task: () => Promise<R>): Promise<R> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) next();
    } else {
      this.active--;
    }
  }
}
