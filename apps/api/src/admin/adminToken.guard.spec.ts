import { describe, expect, it } from 'vitest';
import { createAdminSessionToken } from './adminSession.js';
import { ADMIN_TOKEN_HEADER, authorizeAdmin } from './adminToken.guard.js';

function tokenFrom(headers: Record<string, string>): string | undefined {
  return headers[ADMIN_TOKEN_HEADER];
}

describe('authorizeAdmin', () => {
  it('lets everything through when no secret is configured', () => {
    // Arrange / Act
    const allowed = authorizeAdmin(undefined, {});

    // Assert
    expect(allowed).toBe(true);
  });

  it('accepts requests carrying the configured token', () => {
    // Arrange
    const headers = { [ADMIN_TOKEN_HEADER]: 's3cret' };

    // Act
    const allowed = authorizeAdmin(tokenFrom(headers), { ADMIN_TOKEN: 's3cret' });

    // Assert
    expect(allowed).toBe(true);
  });

  it('rejects missing or wrong tokens with 401', () => {
    // Arrange
    const env = { ADMIN_TOKEN: 's3cret' };

    // Act / Assert
    expect(() => authorizeAdmin(undefined, env)).toThrowError(/Token de administración/);
    expect(() => authorizeAdmin('nope', env)).toThrowError(/Token de administración/);
  });

  it('accepts a session token issued from the password', () => {
    // Arrange
    const issued = createAdminSessionToken('secret');

    // Act
    const allowed = authorizeAdmin(issued.token, { ADMIN_PASSWORD: 'secret' });

    // Assert
    expect(allowed).toBe(true);
  });
});
