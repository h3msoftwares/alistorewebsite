import { Request, Response } from 'express';
import * as blacklistService from './blacklist.service';
import { paramString } from '../../lib/params';

export async function listBlacklistHandler(_req: Request, res: Response) {
  const entries = await blacklistService.listBlacklistEntries();
  res.json({ entries });
}

export async function createBlacklistHandler(req: Request, res: Response) {
  const entry = await blacklistService.createBlacklistEntry({ ...req.body, createdBy: req.user!.id });
  res.status(201).json({ entry });
}

export async function deleteBlacklistHandler(req: Request, res: Response) {
  await blacklistService.deleteBlacklistEntry(paramString(req.params.id));
  res.status(204).end();
}
