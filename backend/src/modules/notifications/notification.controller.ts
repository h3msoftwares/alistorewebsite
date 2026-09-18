import { Request, Response } from 'express';
import { loadEffectivePermissions } from '../../middleware/rbac.middleware';
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../lib/notifications/notification.service';
import { paramString } from '../../lib/params';

export async function listNotificationsHandler(req: Request, res: Response) {
  const { unreadOnly } = (req.validatedQuery ?? {}) as { unreadOnly?: boolean };
  const held = await loadEffectivePermissions(req);
  const result = await listNotificationsForUser(req.user!.id, held, { unreadOnly });
  res.json(result);
}

export async function markNotificationReadHandler(req: Request, res: Response) {
  const held = await loadEffectivePermissions(req);
  await markNotificationRead(paramString(req.params.id), req.user!.id, held);
  res.status(204).end();
}

export async function markAllNotificationsReadHandler(req: Request, res: Response) {
  const held = await loadEffectivePermissions(req);
  await markAllNotificationsRead(req.user!.id, held);
  res.status(204).end();
}
