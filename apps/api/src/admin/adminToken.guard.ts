import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

interface HeaderCarrier {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/**
 * Shared-secret gate for `/admin/*` once the API is reachable from the internet.
 * Disabled when `ADMIN_TOKEN` is empty so local development keeps working as is.
 * This is not user authentication (out of MVP scope); it only keeps strangers
 * from enqueueing jobs or merging teams.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly expectedToken: string | undefined = process.env['ADMIN_TOKEN']) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.expectedToken?.trim();
    if (!expected) return true;

    const request = context.switchToHttp().getRequest<HeaderCarrier>();
    const raw = request.headers[ADMIN_TOKEN_HEADER];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (typeof provided !== 'string' || !safeEquals(provided, expected)) {
      throw new UnauthorizedException('Token de administración inválido');
    }
    return true;
  }
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
