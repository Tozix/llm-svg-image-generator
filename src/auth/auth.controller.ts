import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Вход в API',
    description:
      'Возвращает JWT (access_token) по логину и паролю. ' +
      'Токен передавайте в заголовке: Authorization: Bearer <access_token>. ' +
      'Учётные данные задаются в .env: API_USER и API_PASSWORD (по умолчанию admin/admin).',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description: 'Успешный вход',
    schema: { type: 'object', properties: { access_token: { type: 'string', description: 'JWT токен' } }, required: ['access_token'] },
  })
  @ApiResponse({ status: 401, description: 'Неверный логин или пароль' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }
}
