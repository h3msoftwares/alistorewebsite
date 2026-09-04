import { Request, Response } from 'express';
import { getImageKitAuthParams } from './upload.service';

export async function getImageKitAuthHandler(_req: Request, res: Response) {
  res.json(getImageKitAuthParams());
}
