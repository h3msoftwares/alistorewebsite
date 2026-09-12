import { describe, it, expect } from 'vitest';
import { isDue, nextDueAt, frequencyIntervalMs } from '../../src/modules/backup/schedule';

describe('frequencyIntervalMs', () => {
  it('maps each frequency to the expected day count', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    expect(frequencyIntervalMs('DAILY')).toBe(1 * DAY_MS);
    expect(frequencyIntervalMs('WEEKLY')).toBe(7 * DAY_MS);
    expect(frequencyIntervalMs('MONTHLY')).toBe(30 * DAY_MS);
  });
});

describe('isDue', () => {
  const now = new Date('2026-01-15T00:00:00Z');

  it('is always due when there is no prior backup', () => {
    expect(isDue(null, 'DAILY', now)).toBe(true);
    expect(isDue(null, 'MONTHLY', now)).toBe(true);
  });

  it('DAILY: due once 1 day has elapsed, not before', () => {
    const almostADayAgo = new Date('2026-01-14T00:00:01Z');
    const exactlyADayAgo = new Date('2026-01-14T00:00:00Z');
    expect(isDue(almostADayAgo, 'DAILY', now)).toBe(false);
    expect(isDue(exactlyADayAgo, 'DAILY', now)).toBe(true);
  });

  it('WEEKLY: not due after 6 days, due after 7', () => {
    const sixDaysAgo = new Date('2026-01-09T00:00:00Z');
    const sevenDaysAgo = new Date('2026-01-08T00:00:00Z');
    expect(isDue(sixDaysAgo, 'WEEKLY', now)).toBe(false);
    expect(isDue(sevenDaysAgo, 'WEEKLY', now)).toBe(true);
  });

  it('MONTHLY: not due after 29 days, due after 30', () => {
    const twentyNineDaysAgo = new Date('2025-12-17T00:00:00Z');
    const thirtyDaysAgo = new Date('2025-12-16T00:00:00Z');
    expect(isDue(twentyNineDaysAgo, 'MONTHLY', now)).toBe(false);
    expect(isDue(thirtyDaysAgo, 'MONTHLY', now)).toBe(true);
  });

  it('treats a bogus future timestamp (clock skew) as due, not "wait forever"', () => {
    const future = new Date('2026-06-01T00:00:00Z');
    expect(isDue(future, 'DAILY', now)).toBe(true);
  });
});

describe('nextDueAt', () => {
  it('returns null when there is no prior backup ("due now" has no future date)', () => {
    expect(nextDueAt(null, 'WEEKLY')).toBeNull();
  });

  it('adds the frequency interval to the last backup time', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    expect(nextDueAt(last, 'DAILY')?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(nextDueAt(last, 'WEEKLY')?.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(nextDueAt(last, 'MONTHLY')?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});
