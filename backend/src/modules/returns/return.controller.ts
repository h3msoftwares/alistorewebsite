import { Request, Response } from 'express';
import type { ReturnStatus } from '@prisma/client';
import * as returnService from './return.service';
import { paramString } from '../../lib/params';

// ---- Customer / guest ----

export async function requestReturnHandler(req: Request, res: Response) {
  const ret = await returnService.requestReturn(
    paramString(req.params.id),
    req.user!.id,
    req.body.items,
    req.body.reason
  );
  res.status(201).json({ return: ret });
}

export async function requestReturnByTokenHandler(req: Request, res: Response) {
  const ret = await returnService.requestReturnByToken(
    paramString(req.params.token),
    req.body.items,
    req.body.reason
  );
  res.status(201).json({ return: ret });
}

export async function cancelReturnHandler(req: Request, res: Response) {
  const ret = await returnService.cancelReturn(
    paramString(req.params.id),
    req.user!.id,
    paramString(req.params.returnId)
  );
  res.json({ return: ret });
}

export async function cancelReturnByTokenHandler(req: Request, res: Response) {
  const ret = await returnService.cancelReturnByToken(
    paramString(req.params.token),
    paramString(req.params.returnId)
  );
  res.json({ return: ret });
}

// ---- Admin ----

export async function listAdminReturnsHandler(req: Request, res: Response) {
  const { status } = (req.validatedQuery ?? {}) as { status?: ReturnStatus[] };
  const returns = await returnService.listAdminReturns(status);
  res.json({ returns });
}

export async function updateReturnStatusHandler(req: Request, res: Response) {
  const ret = await returnService.updateReturnStatus(
    paramString(req.params.id),
    req.body.status,
    req.user!.id
  );
  res.json({ return: ret });
}
