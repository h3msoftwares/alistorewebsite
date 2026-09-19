// Shared between the popup page (app/[locale]/gmail-connect-result) and the
// opener's mutation (hooks/use-mail-gmail.ts's useConnectGmail) — the
// postMessage "source" tag so the opener only reacts to messages from this
// specific flow. Kept separate from drive-connect-message.ts's own source
// tag so the two OAuth flows can never be confused for one another.
export const GMAIL_CONNECT_MESSAGE_SOURCE = 'h3m-gmail-connect';

export interface GmailConnectMessage {
  source: typeof GMAIL_CONNECT_MESSAGE_SOURCE;
  result: 'connected' | 'error';
}
