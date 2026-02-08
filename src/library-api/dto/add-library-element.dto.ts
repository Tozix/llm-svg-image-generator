import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class AddLibraryElementDto {
  @ApiProperty({
    example: 'Светящееся окно в неоновой рамке',
    description: 'Текстовое описание элемента. По нему генерируется SVG и определяется тип (window, door, tree, lamp, sign, character, prop, other) для сохранения в библиотеке.',
    minLength: 1,
  })
  @IsString()
  description!: string;

  @ApiPropertyOptional({
    description: 'Ширина элемента в пикселях. Диапазон: 64–1024. По умолчанию 512.',
    minimum: 64,
    maximum: 1024,
    default: 512,
  })
  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(1024)
  width?: number;

  @ApiPropertyOptional({
    description: 'Высота элемента в пикселях. Диапазон: 64–1024. По умолчанию 512.',
    minimum: 64,
    maximum: 1024,
    default: 512,
  })
  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(1024)
  height?: number;
}
