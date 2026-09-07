import { Request, Response } from 'express';
import * as pushService from './push.service';

export async function saveSubscriptionHandler(req: Request, res: Response) {
  await pushService.saveSubscription(req.user!.id, req.body, req.get('user-agent'));
  res.status(204).end();
}

export async function deleteSubscriptionHandler(req: Request, res: Response) {
  await pushService.deleteSubscription(req.user!.id, req.body.endpoint);
  res.status(204).end();
}
