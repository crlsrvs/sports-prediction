import { describe, expect, it } from 'vitest';
import { err, ok } from './index.js';

describe('Result helpers', () => {
  it('wraps a successful value', () => {
    // Arrange
    const value = 42;

    // Act
    const result = ok(value);

    // Assert
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('wraps an error', () => {
    // Arrange
    const error = new Error('failed');

    // Act
    const result = err(error);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });
});
