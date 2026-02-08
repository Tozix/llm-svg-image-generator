import { isDebug } from './config';

export function log(message: string): void {
  console.log(message);
}

export function logDebug(message: string): void {
  if (isDebug) {
    console.log(`[DEBUG] ${message}`);
  }
}

export function warn(message: string): void {
  console.warn(message);
}

export function error(message: string, err?: unknown): void {
  console.error(message);
  if (err != null && err instanceof Error && err.message) {
    console.error(err.message);
  }
}
