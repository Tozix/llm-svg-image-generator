import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { MAX_CONCURRENT_JOBS } from '../config';

interface QueuedJob {
  taskId: string;
  options: Record<string, unknown>;
  callback: (err: Error | null, result?: { svgPath: string; pngPath: string }) => void;
  onStart?: (taskId: string) => void;
}

@Injectable()
export class WorkerPoolService implements OnModuleInit, OnModuleDestroy {
  private workers: { worker: Worker; busy: boolean; currentJob?: QueuedJob }[] = [];
  private queue: QueuedJob[] = [];
  private workerPath: string;

  constructor() {
    const isTsNode = __filename.endsWith('.ts');
    this.workerPath = path.join(
      process.cwd(),
      'dist',
      'workers',
      'worker-runner.js',
    );
  }

  async onModuleInit() {
    const n = Math.max(1, MAX_CONCURRENT_JOBS);
    for (let i = 0; i < n; i++) {
      const worker = new Worker(this.workerPath, {
        workerData: {},
      });
      worker.on('message', (msg: { taskId: string; success: boolean; result?: { svgPath: string; pngPath: string }; error?: string }) => {
        this.onWorkerMessage(worker, msg);
      });
      worker.on('error', (err) => {
        console.error('Worker error:', err);
      });
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker exited with code ${code}`);
        }
      });
      this.workers.push({ worker, busy: false, currentJob: undefined });
    }
  }

  async onModuleDestroy() {
    for (const { worker } of this.workers) {
      await worker.terminate();
    }
    this.workers = [];
    this.queue = [];
  }

  enqueue(
    taskId: string,
    options: Record<string, unknown>,
    callback: (err: Error | null, result?: { svgPath: string; pngPath: string }) => void,
    onStart?: (taskId: string) => void,
  ): void {
    this.queue.push({ taskId, options, callback, onStart });
    this.processQueue();
  }

  private onWorkerMessage(
    worker: Worker,
    msg: { taskId: string; success: boolean; result?: { svgPath: string; pngPath: string }; error?: string },
  ): void {
    const slot = this.workers.find((s) => s.worker === worker);
    if (!slot) return;
    const job = slot.currentJob;
    slot.busy = false;
    slot.currentJob = undefined;
    if (job) {
      if (msg.success && msg.result) {
        job.callback(null, msg.result);
      } else {
        job.callback(new Error(msg.error || 'Unknown error'));
      }
    }
    this.processQueue();
  }

  private processQueue(): void {
    const free = this.workers.find((s) => !s.busy);
    if (!free || this.queue.length === 0) return;
    const job = this.queue.shift();
    if (!job) return;
    free.busy = true;
    free.currentJob = job;
    job.onStart?.(job.taskId);
    free.worker.postMessage({ taskId: job.taskId, options: job.options });
  }
}
