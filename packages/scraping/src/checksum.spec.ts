import { describe, expect, it } from 'vitest';
import { checksumPayload } from './checksum.js';

describe('checksumPayload', () => {
  it('returns a stable sha256 digest', () => {
    // Arrange
    const payload = '{"ok":true}';

    // Act
    const first = checksumPayload(payload);
    const second = checksumPayload(payload);

    // Assert
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});
