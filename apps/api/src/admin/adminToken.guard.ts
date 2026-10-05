import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { verifyAdminSessionToken } from './adminSession.js';

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
/**
 * No constructor arguments: Nest's emitDecoratorMetadata would treat them as
 * injected providers and the API would fail to boot.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return authorizeAdmin(readAdminToken(context), process.env);
  }
}

export function authorizeAdmin(
  provided: string | undefined,
  env: NodeJS.ProcessEnv,
  now: Date = new Date(),
): boolean {
  const expected = env['ADMIN_TOKEN']?.trim() ?? '';
  const password = env['ADMIN_PASSWORD']?.trim() ?? '';
  if (!expected && !password) return true;
  if (provided && expected && safeEquals(provided, expected)) return true;
  if (provided && password && verifyAdminSessionToken(provided, password, now)) return true;
  throw new UnauthorizedException('Token de administración inválido');
}

function readAdminToken(context: ExecutionContext): string | undefined {
  const request = context.switchToHttp().getRequest<HeaderCarrier>();
  const raw = request.headers[ADMIN_TOKEN_HEADER];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  return typeof provided === 'string' ? provided : undefined;
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
