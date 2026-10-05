import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'v1';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminSessionStatus {
  /** True when /admin/* rejects anonymous calls. */
  readonly required: boolean;
  /** True when POST /admin/session can mint a token from ADMIN_PASSWORD. */
  readonly passwordLogin: boolean;
}

export function adminSessionConfig(
  env: NodeJS.ProcessEnv = process.env,
): AdminSessionStatus {
  const token = env['ADMIN_TOKEN']?.trim() ?? '';
  const password = env['ADMIN_PASSWORD']?.trim() ?? '';
  return {
    required: token.length > 0 || password.length > 0,
    passwordLogin: password.length > 0,
  };
}

export function createAdminSessionToken(
  password: string,
  now: Date = new Date(),
  ttlMs: number = SESSION_TTL_MS,
): { readonly token: string; readonly expiresAt: string } {
  const expiresAtMs = now.getTime() + ttlMs;
  const payload = `${PREFIX}.${expiresAtMs}`;
  const mac = createHmac('sha256', password).update(payload).digest('hex');
  return {
    token: `${payload}.${mac}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function verifyAdminSessionToken(
  token: string,
  password: string,
  now: Date = new Date(),
): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const expiresAtMs = Number(parts[1]);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) return false;
  const payload = `${PREFIX}.${expiresAtMs}`;
  const expected = createHmac('sha256', password).update(payload).digest('hex');
  const given = parts[2] ?? '';
  return safeEquals(given, expected);
}

export function passwordsMatch(provided: string, expected: string): boolean {
  return safeEquals(provided, expected);
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
