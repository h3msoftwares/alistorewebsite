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

// Prisma's connection string carries `?schema=public`, which is not a valid
// libpq connection-URI parameter — pg_dump rejects it outright ("invalid URI
// query parameter: schema"). Strip any non-libpq params so pg_dump gets a URI
// it accepts.
export function libpqSafeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('schema');
    return u.toString();
  } catch {
    return url.replace(/[?&]schema=[^&]*/i, '').replace(/\?$/, '');
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
