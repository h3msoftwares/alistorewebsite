// CLI entrypoint for the scheduled GitHub Actions workflow (fires daily —
// see .github/workflows/backup.yml). Checks isBackupDueNow() first: the
// admin-configurable frequency (default weekly) means most daily ticks are
// a no-op skip, not a real backup. When one IS due, invokes the exact same
// backup.service.runBackup() used by POST /api/admin/backup, per the "reuse
// the same underlying function, not a separate implementation" requirement.
// No audit log here (no admin actor triggered this — the workflow run
// itself is GitHub's own audit trail).

import { isBackupDueNow, runBackup } from '../src/modules/backup/backup.service';

async function main() {
  const due = await isBackupDueNow();
  if (!due.due) {
    console.log(`[backup] skipped — not due yet (frequency: ${due.frequency}, next due: ${due.nextDueAt})`);
    return;
  }

  const result = await runBackup('schedule');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[backup] run failed:', err.message ?? err);
  process.exitCode = 1;
});
