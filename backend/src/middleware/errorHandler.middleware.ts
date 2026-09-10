import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/AppError';

/** Pull an HTTP status off an `http-errors` / body-parser style error
 *  (PayloadTooLargeError, the SyntaxError from a malformed JSON body, an
 *  unsupported charset, …). */
function httpStatusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; statusCode?: unknown };
    if (typeof e.status === 'number') return e.status;
    if (typeof e.statusCode === 'number') return e.statusCode;
  }
  return undefined;
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, meta: err.meta },
    });
  }

  // Client errors thrown by express.json()/body-parser before any handler
  // runs — a too-large body, malformed JSON, a bad charset. These are
  // well-formed 4xx conditions, not internal faults: answer with a clean
  // envelope (never echoing the raw parser message) and don't console.error,
  // so a flood of oversized/garbage bodies can't spam the logs.
  const status = httpStatusOf(err);
  if (status && status >= 400 && status < 500) {
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'BAD_REQUEST';
    const message = status === 413 ? 'Request body too large' : 'Malformed request';
    return res.status(status).json({ error: { code, message } });
  }

  // Prisma "the database is momentarily overloaded" errors — a connection-pool
  // timeout (P2024), an interactive-transaction timeout (P2028), or a write
  // conflict / deadlock (P2034). These are transient: answer 503 with a
  // Retry-After so the client (or its user) can try again, instead of a bare
  // 500 that reads as "the app is broken".
  const prismaCode = (err as { code?: unknown } | null)?.code;
  if (prismaCode === 'P2024' || prismaCode === 'P2028' || prismaCode === 'P2034') {
    console.error(`[transient db error ${prismaCode}]`, (err as Error).message?.split('\n')[0]);
    res.setHeader('Retry-After', '2');
    return res.status(503).json({
      error: { code: 'SERVICE_BUSY', message: 'The service is busy right now. Please try again in a moment.' },
    });
  }

  console.error('[unhandled error]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong' },
  });
}
