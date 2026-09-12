// Shared between the popup page (app/[locale]/drive-connect-result) and the
// opener's mutation (hooks/use-backup.ts's useConnectDrive) — the postMessage
// "source" tag so the opener only reacts to messages from this specific flow.
export const DRIVE_CONNECT_MESSAGE_SOURCE = 'h3m-drive-connect';

export interface DriveConnectMessage {
  source: typeof DRIVE_CONNECT_MESSAGE_SOURCE;
  result: 'connected' | 'error';
}
