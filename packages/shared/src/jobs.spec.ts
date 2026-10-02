import { describe, expect, it } from 'vitest';
import { isJobName, JOB_NAMES } from './jobs.js';

describe('job names', () => {
  it('validates known pipeline job names', () => {
    // Arrange / Act / Assert
    expect(isJobName(JOB_NAMES.SCRAPE_SOURCE)).toBe(true);
    expect(isJobName('not-a-job')).toBe(false);
  });
});
