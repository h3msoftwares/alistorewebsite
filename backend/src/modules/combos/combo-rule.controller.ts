import type { Request, Response } from 'express';
import { paramString } from '../../lib/params';
import * as comboRules from './combo-rule.service';

export async function listComboRulesHandler(_req: Request, res: Response) {
  res.json({ comboRules: await comboRules.listComboRules() });
}

export async function getComboRuleHandler(req: Request, res: Response) {
  res.json({ comboRule: await comboRules.getComboRule(paramString(req.params.id)) });
}

export async function createComboRuleHandler(req: Request, res: Response) {
  res.status(201).json({ comboRule: await comboRules.createComboRule(req.body, req.user!.id) });
}

export async function updateComboRuleHandler(req: Request, res: Response) {
  res.json({ comboRule: await comboRules.updateComboRule(paramString(req.params.id), req.body, req.user!.id) });
}

export async function deleteComboRuleHandler(req: Request, res: Response) {
  await comboRules.deleteComboRule(paramString(req.params.id), req.user!.id);
  res.status(204).end();
}

export async function previewComboCoverageHandler(req: Request, res: Response) {
  res.json(await comboRules.previewComboCoverage(req.body));
}
