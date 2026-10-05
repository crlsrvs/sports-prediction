import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  adminSessionConfig,
  createAdminSessionToken,
  passwordsMatch,
  type AdminSessionStatus,
} from './adminSession.js';

interface LoginBody {
  readonly password?: string;
}

interface LoginResponse extends AdminSessionStatus {
  readonly token: string | null;
  readonly expiresAt: string | null;
}

/**
 * Public on purpose: the guard lives on AdminController, and this is how a
 * browser obtains a session without shipping ADMIN_PASSWORD in the bundle.
 */
@Controller('admin')
export class AdminSessionController {
  @Get('session')
  status(): AdminSessionStatus {
    return adminSessionConfig();
  }

  @Post('session')
  login(@Body() body: LoginBody): LoginResponse {
    const status = adminSessionConfig();
    const expected = process.env['ADMIN_PASSWORD']?.trim() ?? '';
    if (!expected) {
      return { ...status, token: null, expiresAt: null };
    }
    if (!body.password || !passwordsMatch(body.password, expected)) {
      throw new UnauthorizedException('Contraseña de administración incorrecta');
    }
    const session = createAdminSessionToken(expected);
    return { ...status, token: session.token, expiresAt: session.expiresAt };
  }
}
