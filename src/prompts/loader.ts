import * as fs from 'fs';
import * as path from 'path';

const PROMPTS_DIR = path.join(process.cwd(), 'prompts');
const cache = new Map<string, string>();

/**
 * Заменяет плейсхолдеры {{name}} в строке на значения из vars.
 * Пустые/undefined значения заменяются на пустую строку.
 */
function replaceVars(template: string, vars: Record<string, string | number | undefined>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const str = value !== undefined && value !== null ? String(value) : '';
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), str);
  }
  return result;
}

/**
 * Загружает текст промпта из файла. Путь относительно prompts/.
 * Кэширует результат.
 */
export function loadPromptFile(relativePath: string): string {
  const fullPath = path.join(PROMPTS_DIR, relativePath);
  const cached = cache.get(fullPath);
  if (cached !== undefined) {
    return cached;
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Prompt file not found: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  cache.set(fullPath, content);
  return content;
}

/**
 * Загружает промпт из файла и подставляет переменные.
 * @param relativePath Путь относительно prompts/ (напр. "system/pixelart.txt")
 * @param vars Объект с переменными для подстановки {{key}}
 */
export function loadPrompt(
  relativePath: string,
  vars?: Record<string, string | number | undefined>,
): string {
  const template = loadPromptFile(relativePath);
  if (!vars || Object.keys(vars).length === 0) {
    return template;
  }
  return replaceVars(template, vars);
}

/**
 * Сбрасывает кэш (для hot-reload при разработке).
 */
export function clearPromptCache(): void {
  cache.clear();
}
