import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('inspectDumpFile', () => {
  beforeEach(() => vi.mocked(spawnSync).mockReset());

  it('reports ok + relation count for a valid archive', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: TOC_LISTING, stderr: '' } as never);
    const res = inspectDumpFile('/tmp/whatever.dump');
    expect(res).toEqual({ ok: true, relations: 2 });
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

  it('restores and reports relations on success', () => {
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
