import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../lib/AppError';

// zod v4 dropped the AnyZodObject alias — z.ZodType is the generic base
// type every schema (object/array/etc.) shares, and all we need here is
// .parse().
interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Zod-parsed/coerced query params (defaults applied, strings
       *  coerced to number, etc.) — read this instead of req.query in any
       *  handler behind validate({ query: ... }). Express 5 made req.query
       *  a getter-only property computed fresh from req.url on every read,
       *  so it can no longer be reassigned with the validated result. */
      validatedQuery?: Record<string, unknown>;
    }
  }
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Express 5 leaves req.body undefined when no JSON body was sent; treat
      // that as an empty object so object schemas validate field-by-field.
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query) as Record<string, unknown>;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          new AppError('VALIDATION_ERROR', 'Request validation failed', {
            issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          })
        );
      }
      next(err);
    }
  };
}
