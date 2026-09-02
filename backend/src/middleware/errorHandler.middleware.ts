import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/AppError';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, meta: err.meta },
    });
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong' },
  });
}
