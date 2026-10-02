import { describe, expect, it } from 'vitest';
import { JOB_NAMES } from './queues.js';

describe('JOB_NAMES', () => {
  it('includes the MVP background jobs', () => {
    // Arrange / Act
    const names = Object.values(JOB_NAMES);

    // Assert
    expect(names).toContain('discover-todays-matches');
    expect(names).toContain('generate-predictions');
    expect(names).toContain('cleanup-raw-data');
  });
});
