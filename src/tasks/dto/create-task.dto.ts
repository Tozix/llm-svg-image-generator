import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsObject,
  Min,
  Max,
  IsIn,
} from 'class-validator';

const VALID_TYPES = [
  'mob',
  'npc',
  'player',
  'plot_map',
  'plot_view',
  'object_detail',
] as const;

export class MapEdgesDto {
  @ApiPropertyOptional({
    description: 'Описание того, что примыкает с севера к фрагменту карты (для стыковки тайлов). Используется только при type=plot_map.',
    example: 'река входит с севера',
  })
  @IsOptional()
  @IsString()
  n?: string;

  @ApiPropertyOptional({
    description: 'Граница юг: что примыкает с юга.',
    example: 'переход в степь',
  })
  @IsOptional()
  @IsString()
  s?: string;

  @ApiPropertyOptional({
    description: 'Граница восток.',
    example: 'граница леса',
  })
  @IsOptional()
  @IsString()
  e?: string;

  @ApiPropertyOptional({
    description: 'Граница запад.',
    example: 'дорога вдоль границы',
  })
  @IsOptional()
  @IsString()
  w?: string;
}

export class CreateTaskDto {
  @ApiProperty({
    example: 'Киберпанк город ночью в дождь',
    description: 'Текстовое описание изображения для генерации. Обязательное поле. Чем конкретнее описание, тем предсказуемее результат.',
    minLength: 1,
  })
  @IsString()
  description!: string;

  @ApiPropertyOptional({
    example: 'неон, дождь, летающие такси',
    description: 'Дополнительные акценты и детали, усиливающие описание. Передаются в промпт к LLM.',
  })
  @IsOptional()
  @IsString()
  accents?: string;

  @ApiPropertyOptional({
    enum: VALID_TYPES,
    default: 'plot_view',
    description:
      'Тип генерации: mob — монстр; npc — NPC (мутант, человек); player — внешний вид игрока; ' +
      'plot_map — фрагмент карты вид сверху; plot_view — вид сцены из глаз игрока (сцена); object_detail — крупный план объекта. ' +
      'Влияет на размер холста и промпты.',
  })
  @IsOptional()
  @IsIn(VALID_TYPES)
  type?: string;

  @ApiPropertyOptional({
    description:
      'Композитная генерация: сцена разбивается на элементы (здания, окна, дороги и т.д.), каждый генерируется отдельно, затем собирается в один SVG. ' +
      'Имеет смысл только при type=plot_view. По умолчанию false.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  composite?: boolean;

  @ApiPropertyOptional({
    description:
      'При композитной генерации подставлять типовые элементы (окна, двери, фонари) из библиотеки, если найдены по типу. Только для plot_view. По умолчанию false.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  useLibrary?: boolean;

  @ApiPropertyOptional({
    description: 'Вид от первого лица (перспектива из глаз героя). Только для type=plot_view. Укажите значение "first_person".',
    example: 'first_person',
  })
  @IsOptional()
  @IsString()
  sceneView?: string;

  @ApiPropertyOptional({
    description: 'Биом фрагмента карты (смешанный лес, равнина, городской квартал и т.д.). Только для type=plot_map.',
    example: 'смешанный лес',
  })
  @IsOptional()
  @IsString()
  mapBiome?: string;

  @ApiPropertyOptional({
    description: 'Границы карты N/S/E/W для стыковки с соседними тайлами. Только для type=plot_map.',
    type: MapEdgesDto,
  })
  @IsOptional()
  @IsObject()
  mapEdges?: MapEdgesDto;

  @ApiPropertyOptional({
    description: 'Ширина изображения в пикселях. Диапазон: 64–2048. Если не указано — берётся из конфига по типу.',
    minimum: 64,
    maximum: 2048,
    example: 640,
  })
  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(2048)
  width?: number;

  @ApiPropertyOptional({
    description: 'Высота изображения в пикселях. Диапазон: 64–2048.',
    minimum: 64,
    maximum: 2048,
    example: 480,
  })
  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(2048)
  height?: number;

  @ApiPropertyOptional({
    description: 'Масштаб пикселей при рендере SVG в растр (увеличивает чёткость пиксель-арта). Диапазон: 1–16. По умолчанию 4.',
    minimum: 1,
    maximum: 16,
    default: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(16)
  pixelScale?: number;

  @ApiPropertyOptional({
    enum: ['png', 'jpg', 'webp'],
    description: 'Формат растрового вывода. png — без потерь; jpg/webp — с качеством (см. quality). По умолчанию png.',
    default: 'png',
  })
  @IsOptional()
  @IsIn(['png', 'jpg', 'webp'])
  outputFormat?: 'png' | 'jpg' | 'webp';

  @ApiPropertyOptional({
    description: 'Качество сжатия для jpg/webp. Диапазон: 1–100. Игнорируется для png.',
    minimum: 1,
    maximum: 100,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quality?: number;

  @ApiPropertyOptional({
    description: 'Цвет фона в формате hex (например #0a0a1a). По умолчанию из конфига.',
    example: '#0a0a1a',
  })
  @IsOptional()
  @IsString()
  backgroundColor?: string;
}
