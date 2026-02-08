import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin',
    description: 'Имя пользователя для входа в API. Задаётся переменной окружения API_USER (по умолчанию admin).',
    minLength: 1,
  })
  @IsString()
  username!: string;

  @ApiProperty({
    example: 'admin',
    description: 'Пароль. Задаётся переменной окружения API_PASSWORD (по умолчанию admin). Не менее 1 символа.',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  password!: string;
}
