import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ADMIN_TOKEN_HEADER, AdminTokenGuard } from './adminToken.guard.js';

function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminTokenGuard', () => {
  it('lets everything through when no token is configured', () => {
    // Arrange
    const guard = new AdminTokenGuard('');

    // Act
    const allowed = guard.canActivate(contextWithHeaders({}));

    // Assert
    expect(allowed).toBe(true);
  });

  it('accepts requests carrying the configured token', () => {
    // Arrange
    const guard = new AdminTokenGuard('s3cret');

    // Act
    const allowed = guard.canActivate(
      contextWithHeaders({ [ADMIN_TOKEN_HEADER]: 's3cret' }),
    );

    // Assert
    expect(allowed).toBe(true);
  });

  it('rejects missing or wrong tokens with 401', () => {
    // Arrange
    const guard = new AdminTokenGuard('s3cret');

    // Act / Assert
    expect(() => guard.canActivate(contextWithHeaders({}))).toThrowError(
      /Token de administración/,
    );
    expect(() =>
      guard.canActivate(contextWithHeaders({ [ADMIN_TOKEN_HEADER]: 'nope' })),
    ).toThrowError(/Token de administración/);
  });
});
