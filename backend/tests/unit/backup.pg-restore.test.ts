import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
import { spawnSync } from 'node:child_process';
import { inspectDumpFile, restoreFromFile } from '../../src/modules/backup/pg-restore';

const TOC_LISTING = [
  ';',
  '; Archive created at 2026-01-01 00:00:00',
  ';',
  '3959; 0 0 COMMENT - EXTENSION pg_trgm ',
  '3000; 0 0 TABLE DATA public User alistore',
  '3001; 0 0 TABLE DATA public Product alistore',
].join('\n');

// A dump taken from Supabase carries its platform-owned event triggers too
// (PostgREST schema-cache-reload hooks etc.) — see pg-restore.ts's
// buildFilteredTocList doc comment for why these must be excluded from the
// restore, confirmed live: restoring one without filtering failed with
// "must be owner of event trigger pgrst_drop_watch".
const TOC_LISTING_WITH_EVENT_TRIGGERS = [
  ';',
  '; Archive created at 2026-01-01 00:00:00',
  ';',
  '3959; 0 0 COMMENT - EXTENSION pg_trgm ',
  '3000; 0 0 TABLE DATA public User alistore',
  '3001; 0 0 TABLE DATA public Product alistore',
  '3200; 0 0 EVENT TRIGGER - pgrst_ddl_watch supabase_admin',
  '3201; 0 0 EVENT TRIGGER - pgrst_drop_watch supabase_admin',
].join('\n');

describe('inspectDumpFile', () => {
  beforeEach(() => vi.mocked(spawnSync).mockReset());

  it('reports ok + relation count + the raw TOC for a valid archive', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: TOC_LISTING, stderr: '' } as never);
    const res = inspectDumpFile('/tmp/whatever.dump');
    expect(res).toEqual({ ok: true, relations: 2, tocText: TOC_LISTING });
  });

  it('rejects a file pg_restore --list cannot parse', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'pg_restore: error: input file does not appear to be a valid archive\n',
    } as never);
    const res = inspectDumpFile('/tmp/not-a-dump.txt');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not a valid backup archive/i);
  });
});

describe('restoreFromFile', () => {
  beforeEach(() => vi.mocked(spawnSync).mockReset());

  it('refuses to restore an invalid file without ever invoking the destructive restore call', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: 'bad archive' } as never);
    const res = restoreFromFile('/tmp/bad.dump');
    expect(res.ok).toBe(false);
    // Only the --list inspection ran — never a second spawnSync for the
    // actual --clean/--single-transaction restore.
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('restores and reports relations on success, passing --use-list', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: TOC_LISTING, stderr: '' } as never) // --list
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as never); // actual restore

    const res = restoreFromFile('/tmp/good.dump');
    expect(res).toEqual({ ok: true, relations: 2 });

    const restoreCall = vi.mocked(spawnSync).mock.calls[1];
    const args = restoreCall[1] as string[];
    expect(args).toContain('--clean');
    expect(args).toContain('--single-transaction');
    expect(args).toContain('--exit-on-error');
    expect(args).toContain('--use-list');
    // Restricted to the app's own schema — Supabase's managed schemas
    // (storage, auth, ...) are never restorable under the app's own role.
    expect(args[args.indexOf('--schema') + 1]).toBe('public');
  });

  it('comments out EVENT TRIGGER entries in the filtered TOC list handed to --use-list', () => {
    let tocListPath = '';
    let writtenAtRestoreTime = '';
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: TOC_LISTING_WITH_EVENT_TRIGGERS, stderr: '' } as never) // --list
      .mockImplementationOnce((_cmd, args) => {
        // Read the filtered TOC file DURING the (mocked) restore call — the
        // real implementation cleans it up immediately afterward, so it
        // must be captured here, not after restoreFromFile() returns.
        const a = args as string[];
        tocListPath = a[a.indexOf('--use-list') + 1];
        writtenAtRestoreTime = fs.readFileSync(tocListPath, 'utf8');
        return { status: 0, stdout: '', stderr: '' } as never;
      });

    const res = restoreFromFile('/tmp/from-supabase.dump');
    expect(res.ok).toBe(true);

    expect(writtenAtRestoreTime).toContain(';3200; 0 0 EVENT TRIGGER - pgrst_ddl_watch supabase_admin');
    expect(writtenAtRestoreTime).toContain(';3201; 0 0 EVENT TRIGGER - pgrst_drop_watch supabase_admin');
    // The non-event-trigger entries are untouched.
    expect(writtenAtRestoreTime).toContain('3000; 0 0 TABLE DATA public User alistore');
    // The temp TOC file is cleaned up after the restore runs.
    expect(fs.existsSync(tocListPath)).toBe(false);
  });

  it('reports failure and never throws when the restore itself fails (rolled back)', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: TOC_LISTING, stderr: '' } as never)
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'constraint violation' } as never);

    const res = restoreFromFile('/tmp/good.dump');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/rolled back/i);
  });
});
