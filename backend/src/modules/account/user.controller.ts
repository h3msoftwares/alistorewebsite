import { Request, Response } from 'express';
import * as userService from './user.service';

export async function getMeHandler(req: Request, res: Response) {
  const user = await userService.getProfile(req.user!.id);
  res.json({ user });
}

export async function updateMeHandler(req: Request, res: Response) {
  const user = await userService.updateProfile(req.user!.id, req.body);
  res.json({ user });
}
