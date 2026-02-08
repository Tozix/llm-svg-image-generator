import { Controller, Get, Put, Param, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiBody, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { loadPromptFile, clearPromptCache } from '../prompts/loader';

const PROMPTS_DIR = path.join(process.cwd(), 'prompts');

function listPromptFiles(dir: string, base = ''): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isFile() && e.name.endsWith('.txt')) {
      result.push(rel);
    } else if (e.isDirectory()) {
      result.push(...listPromptFiles(path.join(dir, e.name), rel));
    }
  }
  return result;
}

function getPromptNameFromRequest(req: Request): string {
  const prefix = '/prompts/';
  const url = req.url?.split('?')[0] ?? '';
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length);
  }
  return '';
}

@ApiTags('prompts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('prompts')
export class PromptsController {
  @Get()
  @ApiOperation({
    summary: 'Список промптов',
    description: 'Возвращает пути к .txt файлам в папке prompts/ (например system/pixelart.txt, types/plot_view.txt).',
  })
  @ApiResponse({ status: 200, description: 'Массив строк — относительные пути к файлам промптов' })
  listPrompts(): string[] {
    if (!fs.existsSync(PROMPTS_DIR)) return [];
    return listPromptFiles(PROMPTS_DIR);
  }

  @Get('*')
  @ApiOperation({
    summary: 'Получить содержимое промпта',
    description: 'Путь в URL после /prompts/, например GET /prompts/system/pixelart.txt вернёт содержимое файла. Поддерживаются переменные {{name}} в шаблонах (подстановка при использовании в генераторе).',
  })
  @ApiResponse({ status: 200, description: 'name — путь файла, content — текст промпта' })
  @ApiResponse({ status: 400, description: 'Недопустимый путь (например .. в имени)' })
  @ApiResponse({ status: 404, description: 'Файл не найден' })
  getPrompt(@Req() req: Request): { name: string; content: string } {
    const name = getPromptNameFromRequest(req);
    if (!name || name.includes('..')) {
      throw new BadRequestException('Недопустимое имя промпта');
    }
    const fullPath = path.join(PROMPTS_DIR, name);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new BadRequestException('Промпт не найден');
    }
    const content = loadPromptFile(name);
    return { name, content };
  }

  @Put('*')
  @ApiOperation({
    summary: 'Обновить промпт',
    description: 'Путь в URL после /prompts/. Тело: { "content": "новый текст промпта" }. Файл перезаписывается, кэш сбрасывается.',
  })
  @ApiBody({ schema: { type: 'object', properties: { content: { type: 'string', description: 'Полное содержимое файла промпта' } }, required: ['content'] } })
  @ApiResponse({ status: 200, description: 'Промпт обновлён', schema: { type: 'object', properties: { name: { type: 'string' } } } })
  @ApiResponse({ status: 400, description: 'Недопустимый путь' })
  @ApiResponse({ status: 401, description: 'Требуется авторизация' })
  async updatePrompt(
    @Req() req: Request,
    @Body() body: { content: string },
  ): Promise<{ name: string }> {
    const name = getPromptNameFromRequest(req);
    if (!name || name.includes('..')) {
      throw new BadRequestException('Недопустимое имя промпта');
    }
    const fullPath = path.join(PROMPTS_DIR, name);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, body?.content ?? '', 'utf-8');
    clearPromptCache();
    return { name };
  }
}
