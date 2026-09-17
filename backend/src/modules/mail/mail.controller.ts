import { Request, Response } from 'express';
import { env } from '../../config/env';
import { recordAudit } from '../../lib/audit';
import * as gmailClient from './gmail.client';
import { signConnectState, verifyConnectState } from './gmail-state';

const GMAIL_CALLBACK_PATH = '/api/admin/mail/gmail/callback';
function gmailRedirectUri(): string {
  return `${env.BACKEND_URL}${GMAIL_CALLBACK_PATH}`;
}
// Mirrors backup.controller.ts's drivePopupCloserUrl — a tiny page outside
// the /admin subtree that posts the result to `window.opener` and closes
// itself (see useConnectGmail on the frontend). Runs in the popup this
// whole OAuth round-trip happens in, never the admin's main tab.
function gmailPopupCloserUrl(result: 'connected' | 'error'): string {
  return `${env.FRONTEND_URL}/gmail-connect-result?result=${result}`;
}

export async function gmailStatusHandler(_req: Request, res: Response) {
  res.json(await gmailClient.getConnectionStatus());
}

/** Returns the Google consent URL — the frontend opens it in a popup window,
 *  not the main tab, same reasoning as backup.controller.ts's
 *  driveConnectHandler. */
export async function gmailConnectHandler(req: Request, res: Response) {
  const state = signConnectState(req.user!.id);
  const url = gmailClient.buildAuthUrl(gmailRedirectUri(), state);
  res.json({ url });
}

/** Google redirects here after consent — a plain top-level GET with no auth
 *  header, so this route is intentionally NOT behind requireAuth/requireRole
 *  (see mail.routes.ts); `state` is the actual gate (gmail-state.ts). */
export async function gmailCallbackHandler(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const closePopup = (result: 'connected' | 'error') => res.redirect(gmailPopupCloserUrl(result));

  if (error) return closePopup('error');
  if (typeof code !== 'string' || typeof state !== 'string') return closePopup('error');

  const adminId = verifyConnectState(state);
  if (!adminId) return closePopup('error');

  try {
    const { email } = await gmailClient.completeConnection(code, gmailRedirectUri());
    await recordAudit({
      entityType: 'Mail',
      entityID: 'gmail',
      action: 'mail.gmail.connect',
      actorID: adminId,
      metadata: { email },
    });
    return closePopup('connected');
  } catch (err) {
    await recordAudit({
      entityType: 'Mail',
      entityID: 'gmail',
      action: 'mail.gmail.connect.failed',
      actorID: adminId,
      metadata: { error: (err as Error).message },
    });
    return closePopup('error');
  }
}

export async function gmailDisconnectHandler(req: Request, res: Response) {
  await gmailClient.disconnect();
  await recordAudit({
    entityType: 'Mail',
    entityID: 'gmail',
    action: 'mail.gmail.disconnect',
    actorID: req.user!.id,
  });
  res.json({ ok: true });
}
