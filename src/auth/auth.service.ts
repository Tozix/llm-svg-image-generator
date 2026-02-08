import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async validateUser(username: string, password: string): Promise<boolean> {
    const envUser = process.env.API_USER || 'admin';
    const envPassword = process.env.API_PASSWORD || 'admin';
    return username === envUser && password === envPassword;
  }

  async login(username: string, password: string): Promise<{ access_token: string }> {
    const valid = await this.validateUser(username, password);
    if (!valid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    const payload = { sub: username };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
