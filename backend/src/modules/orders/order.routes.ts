import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { loadEffectivePermissions } from '../../middleware/rbac.middleware';
import { AppError } from '../../lib/AppError';
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
import {
  createReturnSchema,
  orderReturnIdParamSchema,
  orderTrackTokenReturnIdParamSchema,
} from '../returns/return.schema';
import {
  requestReturnHandler,
  requestReturnByTokenHandler,
  cancelReturnHandler,
  cancelReturnByTokenHandler,
} from '../returns/return.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * GET /:id is reachable by any authenticated role, not just customers (STAFF
 * need to look up any order, e.g. from a support request). The controller
 * already scopes CUSTOMER callers to their own orders; this guard closes the
 * gap for STAFF/ADMIN by requiring the same `orders:view` permission the
 * admin-only order routes require, instead of letting any authenticated
 * staff account — even one whose custom role grants nothing order-related —
 * read an arbitrary customer's order by id.
 */
const requireOwnerOrOrdersView: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.user) return next(new AppError('UNAUTHORIZED', 'Not authenticated'));
  if (req.user.role === 'CUSTOMER') return next();
  const held = await loadEffectivePermissions(req);
  if (!held.has('orders:view')) {
    return next(new AppError('FORBIDDEN', 'Missing permission: orders:view'));
  }
  next();
});

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
  opts: { trackRateLimit?: boolean; lookupRateLimit?: boolean; checkoutRateLimit?: boolean } = {}
): Router {
  const router = Router();

  const trackOn = opts.trackRateLimit !== false;
  const lookupOn = opts.lookupRateLimit !== false;
  const checkoutOn = opts.checkoutRateLimit !== false;

  // Checkout is the heaviest transaction in the app and had NO limiter — a
  // script could hammer it. 12 per 5 min per IP is well above any real
  // shopper (1–3 orders a session) but stops abuse. Nginx adds an edge
  // backstop (deploy/nginx/alistore.conf).
  const checkoutLimiter: RequestHandler = checkoutOn
    ? rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 12,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMITED_BODY,
      })
    : passThrough;

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
  router.post('/checkout', checkoutLimiter, optionalAuth, validate({ body: checkoutSchema }), asyncHandler(checkoutHandler));

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
  router.get(
    '/:id',
    requireAuth,
    requireOwnerOrOrdersView,
    validate({ params: orderIdParamSchema }),
    asyncHandler(getOrderHandler)
  );
  router.post('/:id/cancel', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(cancelOrderHandler));
  router.post(
    '/:id/returns',
    requireAuth,
    validate({ params: orderIdParamSchema, body: createReturnSchema }),
    asyncHandler(requestReturnHandler)
  );
  router.post(
    '/:id/returns/:returnId/cancel',
    requireAuth,
    validate({ params: orderReturnIdParamSchema }),
    asyncHandler(cancelReturnHandler)
  );

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
  router.post(
    '/track/:token/returns',
    trackIpLimiter,
    validate({ params: orderTrackTokenParamSchema, body: createReturnSchema }),
    asyncHandler(requestReturnByTokenHandler)
  );
  router.post(
    '/track/:token/returns/:returnId/cancel',
    trackIpLimiter,
    validate({ params: orderTrackTokenReturnIdParamSchema }),
    asyncHandler(cancelReturnByTokenHandler)
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
