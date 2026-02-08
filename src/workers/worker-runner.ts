/**
 * Скрипт воркера: запускается в worker_threads, получает taskId и options,
 * вызывает SVGGenerator.generateCompleteImage, возвращает результат в main thread.
 */
import { parentPort } from 'worker_threads';
import * as path from 'path';
import { SVGGenerator } from '../generator';
import { VALID_GENERATION_TYPES } from '../prompts/types';
import type { GenerationType } from '../prompts/types';

interface WorkerMessage {
  taskId: string;
  options: Record<string, unknown>;
}

interface WorkerResult {
  taskId: string;
  success: boolean;
  result?: { svgPath: string; pngPath: string };
  error?: string;
}

if (!parentPort) {
  process.exit(1);
}

parentPort.on('message', async (msg: WorkerMessage) => {
  const { taskId, options } = msg;
  const outputDir = path.join(process.cwd(), 'output', 'web');
  const resolvedOptions = {
    ...options,
    outputDir,
    fileName: taskId,
  } as Parameters<SVGGenerator['generateCompleteImage']>[0];

  const type = (resolvedOptions.type ?? 'plot_view') as string;
  if (!VALID_GENERATION_TYPES.includes(type as GenerationType)) {
    (resolvedOptions as unknown as Record<string, unknown>).type = 'plot_view';
  }

  try {
    const generator = new SVGGenerator();
    const result = await generator.generateCompleteImage(resolvedOptions);
    const response: WorkerResult = {
      taskId,
      success: true,
      result: { svgPath: result.svgPath, pngPath: result.pngPath },
    };
    parentPort!.postMessage(response);
  } catch (err) {
    const response: WorkerResult = {
      taskId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort!.postMessage(response);
  }
});
