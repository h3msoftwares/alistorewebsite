// Restores DATABASE_URL from a .dump file produced by pg-dump.ts (downloaded
// from Drive by the caller). DESTRUCTIVE: replaces all current data.
//
// Safety:
//   - the file is validated first (`pg_restore --list` must parse it as a
//     custom-format archive) — a wrong/corrupt file is rejected before
//     anything is touched;
//   - the restore runs as ONE transaction (`--single-transaction` +
//     `--exit-on-error`): if any step fails it rolls back whole and the
//     existing data is left exactly as it was.
// Callers (backup.controller.ts) additionally gate this behind step-up
// re-auth and an audit log — this module has no opinion on who's allowed to
// call it.

import { spawnSync } from 'node:child_process';
import { env } from '../../config/env';
import { libpqSafeUrl } from './pg-dump';

export interface DumpInspection {
  ok: boolean;
  relations?: number;
  error?: string;
}

/** Parse-check a candidate file without changing anything. */
export function inspectDumpFile(filePath: string): DumpInspection {
  const res = spawnSync(env.PG_RESTORE_BIN, ['--list', filePath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0) {
    return {
      ok: false,
      error: `Not a valid backup archive (${(res.stderr || '').trim().split('\n')[0] || 'unreadable'}).`,
    };
  }
  const relations = (res.stdout.match(/^\d+;.*\bTABLE DATA\b/gm) || []).length;
  return { ok: true, relations };
}

export interface RestoreResult {
  ok: boolean;
  relations?: number;
  error?: string;
}

export function restoreFromFile(filePath: string): RestoreResult {
  const inspection = inspectDumpFile(filePath);
  if (!inspection.ok) return { ok: false, error: inspection.error };

  const res = spawnSync(
    env.PG_RESTORE_BIN,
    [
      '--dbname', libpqSafeUrl(env.DATABASE_URL),
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      filePath,
    ],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 }
  );

  if (res.status !== 0) {
    return {
      ok: false,
      error:
        'Restore failed and was rolled back — existing data is unchanged. ' +
        (res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' / '),
    };
  }

  return { ok: true, relations: inspection.relations };
}
