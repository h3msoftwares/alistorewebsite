import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import {
  checkoutSchema,
  orderIdParamSchema,
  deliveryQuoteQuerySchema,
  orderTrackTokenParamSchema,
  orderLookupSchema,
} from './order.schema';
import {
  checkoutHandler,
  deliveryQuoteHandler,
  listMyOrdersHandler,
  getOrderHandler,
  cancelOrderHandler,
  getOrderByTokenHandler,
  cancelOrderByTokenHandler,
  lookupOrderHandler,
} from './order.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * GET /track/:token: the token itself is 256 bits — brute force is
 * infeasible regardless — this is defense in depth / hygiene, exactly
 * mirroring reset-password's own stated reasoning for rate-limiting a
 * token-bearing endpoint the same way.
 *
 * POST /lookup: the real enumeration surface — order numbers are only a
 * 6-char unambiguous-alphabet suffix (~887M/day, not astronomical) combined
 * with a guessable contact value. Same dual-limiter shape as
 * password-reset.routes.ts's /forgot-password: per-IP blunts sweeping many
 * order numbers from one source, per-order-number blunts hammering one
 * order number's contact guesses from rotating IPs.
 *
 * All limiters default ON; buildApp() turns them off under test.
 */
export function orderRoutes(
  opts: { trackRateLimit?: boolean; lookupRateLimit?: boolean } = {}
): Router {
  const router = Router();

  const trackOn = opts.trackRateLimit !== false;
  const lookupOn = opts.lookupRateLimit !== false;

  const trackIpLimiter: RequestHandler = trackOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const lookupIpLimiter: RequestHandler = lookupOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  const lookupOrderNumberLimiter: RequestHandler = lookupOn
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          const orderNumber = typeof req.body?.orderNumber === 'string' ? req.body.orderNumber : '';
          return orderNumber.trim().toUpperCase() || 'unknown';
        },
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

  // Checkout works for guests and logged-in users alike (COD only, per spec).
  router.post('/checkout', optionalAuth, validate({ body: checkoutSchema }), asyncHandler(checkoutHandler));

  // Live delivery-fee estimate for the caller's cart (GET → no CSRF).
  router.get(
    '/delivery-quote',
    optionalAuth,
    validate({ query: deliveryQuoteQuerySchema }),
    asyncHandler(deliveryQuoteHandler)
  );

  // Order history/detail/cancel require an account — guests track orders via
  // the confirmation they received instead (or /orders/lookup, below).
  router.get('/mine', requireAuth, asyncHandler(listMyOrdersHandler));
  router.get('/:id', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(getOrderHandler));
  router.post('/:id/cancel', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(cancelOrderHandler));

  // Guest tracking — the token itself is the proof of access, no login
  // needed. Mounted before validate() runs the per-route param schema so a
  // malformed token still 400s before burning down the IP bucket.
  router.get(
    '/track/:token',
    trackIpLimiter,
    validate({ params: orderTrackTokenParamSchema }),
    asyncHandler(getOrderByTokenHandler)
  );
  router.post(
    '/track/:token/cancel',
    trackIpLimiter,
    validate({ params: orderTrackTokenParamSchema }),
    asyncHandler(cancelOrderByTokenHandler)
  );

  // Manual fallback for a guest without (or who lost) their tracking link.
  router.post(
    '/lookup',
    lookupIpLimiter,
    validate({ body: orderLookupSchema }),
    // Runs after validate() so it only ever sees a real, parsed order
    // number — a malformed body 400s before it can burn down anyone's bucket.
    lookupOrderNumberLimiter,
    asyncHandler(lookupOrderHandler)
  );

  return router;
}
