#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IMAGE_CONFIG } from './config';
import { SVGGenerator } from './generator';
import {
  saveLibraryEntry,
  generateElementId,
  type LibraryEntry,
  type ElementType,
} from './library';
import {
  VALID_GENERATION_TYPES,
  getGenerationTypeConfig,
  type GenerationType,
} from './prompts/types';

const program = new Command();

program
  .name('svg-generator')
  .description('Генерация SVG/изображений по текстовому описанию через LLM API (MMORPG)')
  .version('1.0.0');

program
  .command('generate')
  .description('Сгенерировать одно изображение')
  .requiredOption('-d, --description <text>', 'Описание')
  .option('-a, --accents <text>', 'Дополнительные акценты и детали')
  .option(
    '-t, --type <type>',
    'Тип: mob, npc, player, plot_map, plot_view, object_detail, item',
    'plot_view',
  )
  .option('-o, --output <dir>', 'Папка для сохранения', './output')
  .option('-n, --name <name>', 'Имя файла (без расширения)')
  .option('-w, --width <px>', 'Ширина изображения')
  .option('--height <px>', 'Высота изображения')
  .option('-ps, --pixel-scale <scale>', 'Масштаб пикселей для pixelart', '4')
  .option(
    '-bg, --background <color>',
    'Цвет фона',
    IMAGE_CONFIG.backgroundColor,
  )
  .option(
    '-f, --format <format>',
    'Формат: png, jpg, webp',
    IMAGE_CONFIG.outputFormat,
  )
  .option(
    '-q, --quality <number>',
    'Качество (1-100)',
    IMAGE_CONFIG.quality.toString(),
  )
  .option('-c, --composite', 'Композитная генерация (только для plot_view)')
  .option('--biome <text>', 'Биом фрагмента карты (только для plot_map)')
  .option('--edge-n <text>', 'Граница север — что примыкает с севера (plot_map)')
  .option('--edge-s <text>', 'Граница юг (plot_map)')
  .option('--edge-e <text>', 'Граница восток (plot_map)')
  .option('--edge-w <text>', 'Граница запад (plot_map)')
  .action(async (options) => {
    try {
      const type = VALID_GENERATION_TYPES.includes(options.type)
        ? (options.type as GenerationType)
        : 'plot_view';
      const typeConfig = getGenerationTypeConfig(type);
      const generator = new SVGGenerator();

      const genOpts: Parameters<SVGGenerator['generateCompleteImage']>[0] = {
        description: options.description,
        accents: options.accents || '',
        type,
        outputDir: options.output,
        fileName: options.name || `generated_${Date.now()}`,
        width: options.width ? parseInt(options.width) : typeConfig.width,
        height: options.height ? parseInt(options.height) : typeConfig.height,
        pixelScale: parseInt(options.pixelScale),
        backgroundColor: options.background,
        outputFormat: options.format as 'png' | 'jpg' | 'webp',
        quality: parseInt(options.quality),
        composite: options.composite === true,
      };
      if (type === 'plot_map') {
        if (options.biome && typeof options.biome === 'string') genOpts.mapBiome = options.biome.trim();
        const edges: { n?: string; s?: string; e?: string; w?: string } = {};
        if (options.edgeN && typeof options.edgeN === 'string') edges.n = options.edgeN.trim();
        if (options.edgeS && typeof options.edgeS === 'string') edges.s = options.edgeS.trim();
        if (options.edgeE && typeof options.edgeE === 'string') edges.e = options.edgeE.trim();
        if (options.edgeW && typeof options.edgeW === 'string') edges.w = options.edgeW.trim();
        if (Object.keys(edges).length > 0) genOpts.mapEdges = edges;
      }

      const result = await generator.generateCompleteImage(genOpts);

      const sizeStr = `${typeConfig.width}x${typeConfig.height}`;

      console.log('\nГенерация выполнена успешно.');
      console.log('SVG:', path.relative(process.cwd(), result.svgPath));
      console.log('PNG:', path.relative(process.cwd(), result.pngPath));
      console.log('Размер:', sizeStr);
      console.log('Тип:', type);
    } catch (err: unknown) {
      console.error('Ошибка:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Сгенерировать несколько изображений из JSON-файла')
  .requiredOption('-f, --file <path>', 'Путь к JSON-файлу с описаниями')
  .option('-o, --output <dir>', 'Папка для сохранения', './output/batch')
  .action(async (options) => {
    try {
      const fileContent = await fs.readFile(options.file, 'utf-8');
      const descriptions = JSON.parse(fileContent);

      if (!Array.isArray(descriptions)) {
        throw new Error('В JSON-файле должен быть массив описаний');
      }

      const generator = new SVGGenerator();
      const results = await generator.batchGenerate(
        descriptions,
        options.output,
      );

      console.log(`\nПакетная генерация завершена: ${results.length} изображений`);

      const report = {
        timestamp: new Date().toISOString(),
        total: descriptions.length,
        successful: results.length,
        failed: descriptions.length - results.length,
        results: results.map((r) => ({
          svg: path.relative(process.cwd(), r.svgPath),
          png: path.relative(process.cwd(), r.pngPath),
        })),
      };

      const reportPath = path.join(options.output, 'generation_report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log('Отчёт сохранён:', reportPath);
    } catch (err: unknown) {
      console.error('Ошибка:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('add-element')
  .description('Сгенерировать один элемент и добавить в библиотеку')
  .requiredOption('-d, --description <text>', 'Описание элемента')
  .option('-w, --width <px>', 'Ширина элемента', '512')
  .option('--height <px>', 'Высота элемента', '512')
  .action(async (options) => {
    try {
      const w = Math.min(1024, Math.max(64, parseInt(options.width, 10) || 512));
      const h = Math.min(1024, Math.max(64, parseInt(options.height, 10) || 512));
      const generator = new SVGGenerator();
      const svgCode = await generator.generateSVGFromDescription({
        description: options.description.trim(),
        accents: '',
        type: 'object_detail',
        width: w,
        height: h,
      });
      const type = await generator.classifyElementType(options.description.trim());
      const id = generateElementId(type as ElementType);
      const entry: LibraryEntry = {
        id,
        type: type as ElementType,
        description: options.description.trim(),
        width: w,
        height: h,
        style: 'pixelart',
        createdAt: new Date().toISOString(),
      };
      await saveLibraryEntry(entry, svgCode);
      console.log('\nЭлемент добавлен в библиотеку.');
      console.log('ID:', id);
      console.log('Тип:', type);
      console.log('Размер:', w + 'x' + h);
    } catch (err: unknown) {
      console.error('Ошибка:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('types')
  .description('Показать доступные типы генерации')
  .action(() => {
    console.log('\nДоступные типы генерации (MMORPG):\n');

    const descriptions: Record<GenerationType, string> = {
      mob: 'Монстры',
      npc: 'NPC (мутанты, люди)',
      player: 'Внешний вид игрока',
      plot_map: 'Plot-карта (вид сверху)',
      plot_view: 'Вид plot из глаз игрока',
      object_detail: 'Zoom объекта (дом, NPC, предмет)',
      item: 'Небольшие предметы (оружие, сундуки, кружки, овощи)',
    };

    VALID_GENERATION_TYPES.forEach((t) => {
      const cfg = getGenerationTypeConfig(t);
      console.log(`  ${t}: ${descriptions[t]} (${cfg.width}x${cfg.height})`);
    });
    console.log();
  });

program.parse(process.argv);
