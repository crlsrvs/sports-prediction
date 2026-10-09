import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_OPTIONS, isJobName, JOB_NAMES } from './jobs.js';

describe('job names', () => {
  it('validates known pipeline job names', () => {
    // Arrange / Act / Assert
    expect(isJobName(JOB_NAMES.SCRAPE_SOURCE)).toBe(true);
    expect(isJobName('not-a-job')).toBe(false);
  });

  it('defines valid default job retry and retention options', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete.count).toBe(100);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail.count).toBe(50);
  });
});
