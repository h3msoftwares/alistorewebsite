// Pure scheduling math for the automatic-backup cadence — no network, no
// filesystem, no DB — so it's directly unit-testable. "Due" is derived from
// the newest backup already on Drive rather than a separately-tracked
// "last run" timestamp: Drive itself is the source of truth for what's
// already been backed up, so there's nothing else to keep in sync.

export type BackupFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export const BACKUP_FREQUENCIES: BackupFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

const DAY_MS = 24 * 60 * 60 * 1000;

// Fixed day-counts, not real calendar months — simple, and close enough for
// a backup cadence (a "month" landing on the 28th vs the 30th doesn't matter
// here the way it would for, say, billing).
const INTERVAL_DAYS: Record<BackupFrequency, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
};

export function frequencyIntervalMs(frequency: BackupFrequency): number {
  return INTERVAL_DAYS[frequency] * DAY_MS;
}

/** Is a new automatic backup due right now? `lastBackupAt` is the newest
 *  backup's createdTime already on Drive (or null if there are none yet —
 *  always due in that case). */
export function isDue(lastBackupAt: Date | null, frequency: BackupFrequency, now: Date = new Date()): boolean {
  if (!lastBackupAt) return true;
  if (lastBackupAt.getTime() > now.getTime()) return true; // clock skew / bogus future timestamp — don't wait on it
  return now.getTime() - lastBackupAt.getTime() >= frequencyIntervalMs(frequency);
}

/** When the next automatic backup will become due — purely informational
 *  (the admin panel's "next scheduled backup" hint). */
export function nextDueAt(lastBackupAt: Date | null, frequency: BackupFrequency): Date | null {
  if (!lastBackupAt) return null; // "due now" — no meaningful future date
  return new Date(lastBackupAt.getTime() + frequencyIntervalMs(frequency));
}
