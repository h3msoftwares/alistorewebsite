import type { Request, Response } from 'express';
import { paramString } from '../../lib/params';
import * as loyalty from './loyalty.service';

export async function listLoyaltyRulesHandler(_req: Request, res: Response) {
  res.json({ rules: await loyalty.listLoyaltyRules() });
}

export async function createLoyaltyRuleHandler(req: Request, res: Response) {
  res.status(201).json({ rule: await loyalty.createLoyaltyRule(req.body) });
}

export async function updateLoyaltyRuleHandler(req: Request, res: Response) {
  res.json({ rule: await loyalty.updateLoyaltyRule(paramString(req.params.id), req.body) });
}

export async function deleteLoyaltyRuleHandler(req: Request, res: Response) {
  await loyalty.deleteLoyaltyRule(paramString(req.params.id));
  res.status(204).end();
}
