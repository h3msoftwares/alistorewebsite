// CLI entrypoint for the scheduled GitHub Actions workflow — invokes the
// exact same backup.service.runBackup() used by POST /api/admin/backup, per
// the "reuse the same underlying function, not a separate implementation"
// requirement. No audit log here (no admin actor triggered this — the
// workflow run itself is GitHub's own audit trail).

import { runBackup } from '../src/modules/backup/backup.service';

runBackup('schedule')
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
  })
  .catch((err) => {
    console.error('[backup] run failed:', err.message ?? err);
    process.exit(1);
  });
