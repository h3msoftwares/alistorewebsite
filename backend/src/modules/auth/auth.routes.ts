import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../lib/asyncHandler';
import { env } from '../../config/env';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema';
import { registerHandler, loginHandler, logoutHandler, refreshHandler } from './auth.controller';

const router = Router();

// Tighter bucket than the app-wide limiter to slow down credential stuffing.
// No-op under test so the auth suite can exercise the lockout path freely.
const authLimiter: RequestHandler =
  env.NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(registerHandler));
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(loginHandler));
router.post('/refresh', validate({ body: refreshSchema.partial() }), asyncHandler(refreshHandler));
router.post('/logout', asyncHandler(logoutHandler));

export default router;
