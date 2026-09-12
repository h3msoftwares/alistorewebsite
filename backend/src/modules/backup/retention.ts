// Rolling retention: which of this tool's own Drive backups to delete once
// there are more than the configured keep-count. Pure and directly
// unit-testable — no network, no filesystem.

import type { DriveFile } from './drive.client';

// Matches pg-dump.ts's timestampName()+suffix. Kept deliberately strict so a
// prune can never touch a file this tool didn't create itself, even if a
// human drops something else into the same Drive folder.
export const DUMP_NAME_RE = /^alistore-\d{8}-\d{6}-[0-9a-f]{8}\.dump$/;

/** Given every file in the backup folder and how many to keep, returns the
 *  ones to delete: only files matching this tool's own naming pattern,
 *  oldest first beyond the newest `keep`. */
export function selectForDeletion(files: DriveFile[], keep: number): DriveFile[] {
  const ours = files.filter((f) => DUMP_NAME_RE.test(f.name));
  const sorted = [...ours].sort((a, b) => Date.parse(a.createdTime) - Date.parse(b.createdTime));
  const safeKeep = Math.max(0, keep);
  return sorted.slice(0, Math.max(0, sorted.length - safeKeep));
}
