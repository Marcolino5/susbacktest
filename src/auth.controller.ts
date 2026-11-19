
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private cookieOptions() {
    const crossSite = process.env.COOKIE_CROSS_SITE === 'true';

    return {
      httpOnly: true,
      secure: crossSite || process.env.NODE_ENV === 'production',
      sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { email?: string; senha?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      typeof body?.email !== 'string' ||
      typeof body?.senha !== 'string' ||
      !this.authService.validateCredentials(body.email, body.senha)
    ) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const token = await this.authService.createToken();

    response.cookie('sus_session', token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { success: true };
  }

  @Get('me')
  me() {
    return { authenticated: true };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('sus_session', this.cookieOptions());
    return { success: true };
  }
}
