import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  loadLibrary,
  saveLibraryEntry,
  generateElementId,
  type LibraryEntry,
  type ElementType,
} from '../library';
import { SVGGenerator } from '../generator';
import { AddLibraryElementDto } from './dto/add-library-element.dto';

@ApiTags('library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('library')
export class LibraryApiController {
  @Get()
  @ApiOperation({
    summary: 'Список элементов библиотеки',
    description:
      'Возвращает все элементы, сохранённые в библиотеке (id, type, description, width, height, style, createdAt). ' +
      'Элементы из библиотеки можно подставлять в композитные сцены (plot_view + useLibrary=true).',
  })
  @ApiResponse({
    status: 200,
    description: 'Массив записей библиотеки',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['window', 'door', 'tree', 'lamp', 'sign', 'character', 'prop', 'other'] },
              description: { type: 'string' },
              width: { type: 'number' },
              height: { type: 'number' },
              style: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async listLibrary(): Promise<{ ok: boolean; entries: LibraryEntry[] }> {
    const entries = await loadLibrary();
    return { ok: true, entries };
  }

  @Post()
  @ApiOperation({
    summary: 'Добавить элемент в библиотеку',
    description:
      'По описанию генерируется SVG (тип object_detail), LLM классифицирует тип элемента, запись сохраняется в library. ' +
      'Операция может занять 1–2 минуты. Параметры width и height: диапазон 64–1024, по умолчанию 512.',
  })
  @ApiBody({ type: AddLibraryElementDto })
  @ApiResponse({
    status: 201,
    description: 'Элемент добавлен',
    schema: { type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' }, type: { type: 'string' } }, required: ['ok', 'id', 'type'] },
  })
  @ApiResponse({ status: 400, description: 'Не указано описание' })
  @ApiResponse({ status: 401, description: 'Требуется авторизация' })
  async addElement(@Body() dto: AddLibraryElementDto): Promise<{ ok: boolean; id: string; type: string }> {
    const description = dto.description.trim();
    const w = dto.width != null ? Math.min(1024, Math.max(64, dto.width)) : 512;
    const h = dto.height != null ? Math.min(1024, Math.max(64, dto.height)) : 512;
    const generator = new SVGGenerator();
    const svgCode = await generator.generateSVGFromDescription({
      description,
      accents: '',
      type: 'object_detail',
      width: w,
      height: h,
    });
    const type = await generator.classifyElementType(description);
    const id = generateElementId(type as ElementType);
    const entry: LibraryEntry = {
      id,
      type: type as ElementType,
      description,
      width: w,
      height: h,
      style: 'pixelart',
      createdAt: new Date().toISOString(),
    };
    await saveLibraryEntry(entry, svgCode);
    return { ok: true, id, type };
  }
}
