// Runs `pg_dump` against `DATABASE_URL` and writes a compressed custom-format
// dump (.dump, restorable with `pg_restore`) to a temp file. The generic,
// reusable half of the backup tool: it never touches Drive and doesn't care
// which project's database it's pointed at — that's entirely env.DATABASE_URL.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../../config/env';

// Prisma's connection string carries query params libpq doesn't recognize —
// pg_dump/pg_restore reject the URI outright on the first one they hit
// ("invalid URI query parameter: ..."), so ALL of Prisma's own params need
// stripping, not just `schema` (see docs/DEPLOYMENT.md's DATABASE_URL
// example: `?sslmode=require&connection_limit=8&pool_timeout=10&
// connect_timeout=5` — the connection_limit/pool_timeout pair is exactly
// what a production DB found this failing on). `sslmode` and
// `connect_timeout` ARE real libpq parameters, so those are left alone.
const PRISMA_ONLY_PARAMS = ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size'];
export function libpqSafeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const p of PRISMA_ONLY_PARAMS) u.searchParams.delete(p);
    return u.toString();
  } catch {
    let out = url;
    for (const p of PRISMA_ONLY_PARAMS) out = out.replace(new RegExp(`[?&]${p}=[^&]*`, 'i'), '');
    return out.replace(/\?&/, '?').replace(/\?$/, '');
  }
}

// alistore-YYYYMMDD-HHMMSS.dump (UTC) — kept in sync with DUMP_NAME_RE in
// retention.ts, which is what decides which Drive files this tool is allowed
// to prune.
export function timestampName(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `alistore-${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}.dump`
  );
}

export interface DumpResult {
  path: string;
  name: string;
  bytes: number;
}

/** Produce one dump file in the OS temp directory. Writes to a `.partial`
 *  path first and renames on a clean exit, so a crash never leaves a
 *  half-written file that looks like a real backup. Caller is responsible
 *  for deleting the file once it's been uploaded. */
export function runPgDump(): Promise<DumpResult> {
  return new Promise((resolve, reject) => {
    // Random suffix disambiguates two dumps requested in the same second
    // (a double-tap of "back up now") so neither ever overwrites the other.
    const stamp = timestampName().replace(/\.dump$/, '');
    const finalPath = path.join(os.tmpdir(), `${stamp}-${randomUUID().slice(0, 8)}.dump`);
    const partialPath = `${finalPath}.partial`;

    const args = [
      `--dbname=${libpqSafeUrl(env.DATABASE_URL)}`,
      '--format=custom',
      // This app's entire data model lives in `public` — every Prisma model
      // maps there, no other schema is used. On Supabase, dumping the whole
      // database also captures Supabase's own managed schemas (storage,
      // auth, extensions, ...), which pg_restore can't later restore under
      // the app's own database role ("must be owner of table
      // vector_indexes" — confirmed live; see pg-restore.ts's matching
      // --schema flag, which is what actually matters for backups already
      // taken before this existed). Scoping the dump itself keeps backups
      // smaller and avoids capturing objects that were never restorable
      // anyway. Doesn't cover event triggers (not schema-scoped at all —
      // see pg-restore.ts), which is why that fix stays restore-side.
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '--file',
      partialPath,
    ];

    let child;
    try {
      child = spawn(env.PG_DUMP_BIN, args, { windowsHide: true });
    } catch (err) {
      reject(new Error(`pg_dump could not start: ${(err as Error).message}`));
      return;
    }

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      cleanupPartial();
      reject(new Error(`pg_dump could not start: ${err.message}`));
    });
    child.on('exit', (code, signal) => {
      if (code !== 0) {
        cleanupPartial();
        reject(new Error(`pg_dump exited ${code}${signal ? ` (${signal})` : ''}${stderr.trim() ? `:\n${stderr.trim()}` : ''}`));
        return;
      }
      let bytes: number;
      try {
        bytes = fs.statSync(partialPath).size;
      } catch (err) {
        reject(new Error(`pg_dump reported success but wrote no file: ${(err as Error).message}`));
        return;
      }
      if (!bytes) {
        cleanupPartial();
        reject(new Error('pg_dump produced an empty file'));
        return;
      }
      try {
        fs.renameSync(partialPath, finalPath);
      } catch (err) {
        cleanupPartial();
        reject(new Error(`could not finalize dump file: ${(err as Error).message}`));
        return;
      }
      resolve({ path: finalPath, bytes, name: path.basename(finalPath) });
    });

    function cleanupPartial() {
      try {
        fs.rmSync(partialPath, { force: true });
      } catch {
        /* best effort */
      }
    }
  });
}
