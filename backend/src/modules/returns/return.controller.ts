import { Request, Response } from 'express';
import type { ReturnStatus } from '@prisma/client';
import * as returnService from './return.service';
import { paramString } from '../../lib/params';
import { publicReturn } from '../../lib/public-return';

// ---- Customer / guest ----

export async function previewReturnHandler(req: Request, res: Response) {
  res.json(await returnService.previewOwnedReturn(paramString(req.params.id), req.user!.id, req.body.items));
}

export async function previewReturnByTokenHandler(req: Request, res: Response) {
  res.json(await returnService.previewReturnByToken(paramString(req.params.token), req.body.items));
}

export async function adminPreviewReturnHandler(req: Request, res: Response) {
  res.json(await returnService.previewReturn(paramString(req.params.id), req.body.items));
}

export async function requestReturnHandler(req: Request, res: Response) {
  const ret = await returnService.requestReturn(
    paramString(req.params.id),
    req.user!.id,
    req.body.items,
    req.body.reason,
    req.body.expectedRefundCents
  );
  res.status(201).json({ return: publicReturn(ret) });
}

export async function requestReturnByTokenHandler(req: Request, res: Response) {
  const ret = await returnService.requestReturnByToken(
    paramString(req.params.token),
    req.body.items,
    req.body.reason,
    req.body.expectedRefundCents
  );
  res.status(201).json({ return: publicReturn(ret) });
}

export async function cancelReturnHandler(req: Request, res: Response) {
  const ret = await returnService.cancelReturn(
    paramString(req.params.id),
    req.user!.id,
    paramString(req.params.returnId)
  );
  res.json({ return: publicReturn(ret) });
}

export async function cancelReturnByTokenHandler(req: Request, res: Response) {
  const ret = await returnService.cancelReturnByToken(
    paramString(req.params.token),
    paramString(req.params.returnId)
  );
  res.json({ return: publicReturn(ret) });
}

// ---- Admin ----

export async function adminRequestReturnHandler(req: Request, res: Response) {
  const ret = await returnService.adminRequestReturn(
    paramString(req.params.id),
    req.user!.id,
    req.body.items,
    req.body.reason,
    req.body.expectedRefundCents
  );
  res.status(201).json({ return: ret });
}

export async function listAdminReturnsHandler(req: Request, res: Response) {
  const { status } = (req.validatedQuery ?? {}) as { status?: ReturnStatus[] };
  const returns = await returnService.listAdminReturns(status);
  res.json({ returns });
}

export async function updateReturnStatusHandler(req: Request, res: Response) {
  const ret = await returnService.updateReturnStatus(
    paramString(req.params.id),
    req.body.status,
    req.user!.id,
    req.body
  );
  res.json({ return: ret });
}
