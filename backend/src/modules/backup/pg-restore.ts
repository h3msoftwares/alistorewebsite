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
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../../config/env';
import { libpqSafeUrl } from './pg-dump';

export interface DumpInspection {
  ok: boolean;
  relations?: number;
  error?: string;
  /** Raw `pg_restore --list` output — reused by restoreFromFile to build a
   *  filtered table-of-contents rather than re-invoking `--list`. */
  tocText?: string;
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
  return { ok: true, relations, tocText: res.stdout };
}

// Two classes of table-of-contents entry get commented out of every
// restore, regardless of --schema=public below (neither is reachable by a
// plain pg_restore flag — see each comment for why):
//
// 1. EVENT TRIGGER — Supabase's managed Postgres pre-installs several
//    (PostgREST schema-cache-reload hooks, pgsodium, pg_graphql, ...) owned
//    by its own internal `supabase_admin` role, not the app's own database
//    role. Event triggers aren't schema-scoped at all (no schema column in
//    pg_event_trigger; PostgreSQL's own docs describe their names as unique
//    "within the database", the same phrasing used for every other
//    non-namespaced object type), so --schema=public doesn't reach them.
//    pg_restore fails restoring them ("must be owner of event trigger
//    pgrst_drop_watch") since the app's role never owned them — confirmed
//    live in production. They're Supabase-internal plumbing the platform
//    re-provisions itself, not app data.
//
// 2. _prisma_migrations — Prisma's own migration-tracking table. It DOES
//    live in `public` (so --schema=public alone doesn't exclude it), but
//    restoring it clobbers the LIVE migration history with whatever it was
//    at backup time. Confirmed live: restoring a backup taken before a
//    since-applied migration silently reverted the tracking table to "that
//    migration never ran", while the table that migration created was left
//    untouched (--clean only drops objects present in the archive being
//    restored) -- the live database ended up simultaneously missing the
//    migration record AND already having the table it creates, so the next
//    `prisma migrate deploy` failed with "relation already exists" and the
//    app couldn't boot at all. New backups exclude it at dump time (see
//    pg-dump.ts's --exclude-table) but backups taken before that fix still
//    carry it, so it's also filtered here for those.
//
// Commenting out TOC lines (pg_restore(1)'s -L/--use-list) is the standard
// technique for excluding specific objects no plain flag reaches.
function buildFilteredTocList(tocText: string): string {
  return tocText
    .split('\n')
    .map((line) =>
      (/EVENT TRIGGER/.test(line) || /\b_prisma_migrations\b/.test(line)) && !line.trimStart().startsWith(';')
        ? `;${line}`
        : line
    )
    .join('\n');
}

export interface RestoreResult {
  ok: boolean;
  relations?: number;
  error?: string;
}

export function restoreFromFile(filePath: string): RestoreResult {
  const inspection = inspectDumpFile(filePath);
  if (!inspection.ok || !inspection.tocText) return { ok: false, error: inspection.error };

  const tocListPath = path.join(os.tmpdir(), `restore-toc-${randomUUID().slice(0, 8)}.list`);
  fs.writeFileSync(tocListPath, buildFilteredTocList(inspection.tocText), 'utf8');

  try {
    const res = spawnSync(
      env.PG_RESTORE_BIN,
      [
        '--dbname', libpqSafeUrl(env.DATABASE_URL),
        '--use-list', tocListPath,
        // This app's entire data model lives in `public` (every Prisma
        // model maps there, no other schema is used) — restrict the
        // restore to it. Confirmed live: a dump taken on Supabase also
        // captures Supabase's own managed schemas (storage, auth, ...),
        // and restoring e.g. storage.vector_indexes fails the same way as
        // the event triggers above ("must be owner of table
        // vector_indexes") since those tables are owned by a Supabase-
        // internal role too. --schema is a POSITIVE filter (restore only
        // what's named) rather than an exclude list, so it stays correct
        // even if Supabase adds more managed schemas later — no need to
        // enumerate every one of them here.
        '--schema', 'public',
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
  } finally {
    fs.rmSync(tocListPath, { force: true });
  }
}
