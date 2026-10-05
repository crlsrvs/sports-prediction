import { describe, expect, it } from 'vitest';
import {
  adminSessionConfig,
  createAdminSessionToken,
  passwordsMatch,
  verifyAdminSessionToken,
} from './adminSession.js';

describe('adminSessionConfig', () => {
  it('stays open when neither secret is set', () => {
    // Arrange / Act
    const status = adminSessionConfig({});

    // Assert
    expect(status).toEqual({ required: false, passwordLogin: false });
  });

  it('requires a session when a password is configured', () => {
    // Arrange / Act
    const status = adminSessionConfig({ ADMIN_PASSWORD: 'secret' });

    // Assert
    expect(status).toEqual({ required: true, passwordLogin: true });
  });
});

describe('admin session tokens', () => {
  it('accepts a token it just issued and rejects a wrong password', () => {
    // Arrange
    const now = new Date('2026-10-02T12:00:00Z');
    const issued = createAdminSessionToken('secret', now);

    // Act
    const valid = verifyAdminSessionToken(issued.token, 'secret', now);
    const wrong = verifyAdminSessionToken(issued.token, 'other', now);

    // Assert
    expect(valid).toBe(true);
    expect(wrong).toBe(false);
    expect(passwordsMatch('secret', 'secret')).toBe(true);
  });

  it('rejects an expired token', () => {
    // Arrange
    const issued = createAdminSessionToken('secret', new Date('2026-10-02T12:00:00Z'), 1000);
    const later = new Date('2026-10-02T12:00:02Z');

    // Act
    const valid = verifyAdminSessionToken(issued.token, 'secret', later);

    // Assert
    expect(valid).toBe(false);
  });
});
