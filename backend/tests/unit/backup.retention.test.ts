import { describe, it, expect } from 'vitest';
import { selectForDeletion } from '../../src/modules/backup/retention';
import type { DriveFile } from '../../src/modules/backup/drive.client';

function file(name: string, createdTime: string, id = name): DriveFile {
  return { id, name, size: 100, createdTime };
}

describe('selectForDeletion', () => {
  it('keeps the newest N and deletes the rest, oldest first', () => {
    const files = [
      file('alistore-20260101-000000-aaaaaaaa.dump', '2026-01-01T00:00:00Z'),
      file('alistore-20260102-000000-bbbbbbbb.dump', '2026-01-02T00:00:00Z'),
      file('alistore-20260103-000000-cccccccc.dump', '2026-01-03T00:00:00Z'),
      file('alistore-20260104-000000-dddddddd.dump', '2026-01-04T00:00:00Z'),
    ];
    const doomed = selectForDeletion(files, 2);
    expect(doomed.map((f) => f.name)).toEqual([
      'alistore-20260101-000000-aaaaaaaa.dump',
      'alistore-20260102-000000-bbbbbbbb.dump',
    ]);
  });

  it('deletes nothing when at or under the keep count', () => {
    const files = [
      file('alistore-20260101-000000-aaaaaaaa.dump', '2026-01-01T00:00:00Z'),
      file('alistore-20260102-000000-bbbbbbbb.dump', '2026-01-02T00:00:00Z'),
    ];
    expect(selectForDeletion(files, 2)).toEqual([]);
    expect(selectForDeletion(files, 7)).toEqual([]);
  });

  it('never touches a file that is not one of this tool\'s own dumps', () => {
    const files = [
      file('alistore-20260101-000000-aaaaaaaa.dump', '2026-01-01T00:00:00Z'),
      file('quarterly-report.pdf', '2020-01-01T00:00:00Z'),
      file('random-backup.dump', '2020-01-01T00:00:00Z'),
    ];
    expect(selectForDeletion(files, 0).map((f) => f.name)).toEqual([
      'alistore-20260101-000000-aaaaaaaa.dump',
    ]);
  });

  it('is order-independent — sorts by createdTime, not input order', () => {
    const files = [
      file('alistore-20260103-000000-cccccccc.dump', '2026-01-03T00:00:00Z'),
      file('alistore-20260101-000000-aaaaaaaa.dump', '2026-01-01T00:00:00Z'),
      file('alistore-20260102-000000-bbbbbbbb.dump', '2026-01-02T00:00:00Z'),
    ];
    const doomed = selectForDeletion(files, 1);
    expect(doomed.map((f) => f.name)).toEqual([
      'alistore-20260101-000000-aaaaaaaa.dump',
      'alistore-20260102-000000-bbbbbbbb.dump',
    ]);
  });
});
