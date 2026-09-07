import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.middleware';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { csrfProtection } from './middleware/csrf.middleware';
import { env } from './config/env';

import authRoutes from './modules/auth/auth.routes';
import { adminAuthRoutes } from './modules/auth/admin-auth.routes';
import { passwordResetRoutes } from './modules/auth/password-reset.routes';
import { changePasswordRoutes } from './modules/auth/change-password.routes';
import { emailVerificationRoutes } from './modules/auth/email-verification.routes';
import { checkoutOtpRoutes } from './modules/checkout-otp/checkout-otp.routes';
import collectionRoutes from './modules/catalog/collection.routes';
import categoryRoutes from './modules/catalog/category.routes';
import productRoutes from './modules/catalog/product.routes';
import cartRoutes from './modules/cart/cart.routes';
import favouriteRoutes from './modules/favourites/favourites.routes';
import orderRoutes from './modules/orders/order.routes';
import adminRoutes from './modules/admin/admin.routes';
import addressRoutes from './modules/account/address.routes';
import userRoutes from './modules/account/user.routes';
import uploadRoutes from './modules/uploads/upload.routes';
import settingsRoutes from './modules/settings/settings.routes';

export function buildApp(
  opts: {
    // Gates BOTH the /login and /register limiters (they share one authRoutes
    // switch). `customerRegisterRateLimit` is an alias for readability in the
    // register-focused rate-limit test.
    customerLoginRateLimit?: boolean;
    customerRegisterRateLimit?: boolean;
    adminLoginRateLimit?: boolean;
    forgotPasswordRateLimit?: boolean;
    resetPasswordRateLimit?: boolean;
    verifyEmailRateLimit?: boolean;
    resendVerificationRateLimit?: boolean;
    changePasswordRateLimit?: boolean;
    checkoutOtpVerifyRateLimit?: boolean;
    // Double-submit-cookie CSRF check. Defaults ON everywhere except tests
    // (where the suites don't carry the header); a focused test passes `true`.
    csrf?: boolean;
  } = {}
) {
  const app = express();

  // In production the API sits behind one reverse-proxy hop (Railway/Fly).
  // Trust exactly that hop so `req.ip` is the real client — used for per-IP
  // rate limiting and for the admin-login audit log — and not the proxy's
  // address. Left off in dev/test so `req.ip` is the raw socket address and
  // a spoofed X-Forwarded-For can't be trusted.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // CORS_ORIGIN may be a comma-separated list (e.g. localhost + a LAN IP for
  // testing on a phone). credentials:true still requires an exact match.
  const corsOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Global input hardening: strip control chars, reject HTML-tag / markup
  // syntax, drop prototype-pollution keys — on every body and query string,
  // before any route. Defence-in-depth for XSS on top of React's output
  // encoding. (SQL injection is handled structurally by Prisma's
  // parameterisation, not by keyword filtering here.)
  app.use(sanitizeInput);

  // Bare, ahead of the limiter and CSRF — uptime probes shouldn't be
  // throttled or handed a Set-Cookie.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // App-wide baseline limiter; auth routes layer a stricter bucket on top.
  // First (before CSRF), so even a request that is about to fail the CSRF
  // check still counts against the per-IP budget. Disabled under test so
  // suites can fire many requests without tripping it.
  if (env.NODE_ENV !== 'test') {
    app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
  }

  // CSRF: sets/reads the `csrfToken` cookie and requires a matching
  // `X-CSRF-Token` header on every state-changing request. Off under test.
  const csrfOn = opts.csrf ?? env.NODE_ENV !== 'test';
  if (csrfOn) app.use(csrfProtection(env.NODE_ENV === 'production'));

  // `GET /api/csrf` primes the double-submit cookie and returns the token in
  // the body too (for a cross-origin SPA that can't read the cookie). After
  // the baseline limiter so it can't be hammered.
  if (csrfOn) {
    app.get('/api/csrf', (_req, res) =>
      res.json({ ok: true, csrfToken: (res.locals.csrfToken as string | undefined) ?? null })
    );
  }

  // Vertical-slice module mounting, same convention as pos-backend:
  // one line per module.
  app.use(
    '/api/auth',
    authRoutes({
      rateLimit:
        opts.customerLoginRateLimit ??
        opts.customerRegisterRateLimit ??
        env.NODE_ENV !== 'test',
    })
  );
  // Separate admin-login path (POST /api/auth/ali-admin-login) mounted on the
  // same prefix — the path is deliberately unguessable. Its rate limiter is
  // on everywhere except tests, where it would throttle the suite.
  app.use(
    '/api/auth',
    adminAuthRoutes({ rateLimit: opts.adminLoginRateLimit ?? env.NODE_ENV !== 'test' })
  );
  // Forgot/reset-password — shared across every role, not role-specific.
  app.use(
    '/api/auth',
    passwordResetRoutes({
      forgotPasswordRateLimit: opts.forgotPasswordRateLimit ?? env.NODE_ENV !== 'test',
      resetPasswordRateLimit: opts.resetPasswordRateLimit ?? env.NODE_ENV !== 'test',
    })
  );
  // Change-password — signed-in credential change (current password required).
  app.use(
    '/api/auth',
    changePasswordRoutes({ rateLimit: opts.changePasswordRateLimit ?? env.NODE_ENV !== 'test' })
  );
  // Email verification — the customer-registration companion flow.
  app.use(
    '/api/auth',
    emailVerificationRoutes({
      verifyRateLimit: opts.verifyEmailRateLimit ?? env.NODE_ENV !== 'test',
      resendRateLimit: opts.resendVerificationRateLimit ?? env.NODE_ENV !== 'test',
    })
  );
  // Checkout email-OTP — request is DB-backed rate-limited internally (see
  // checkout-otp.service.ts), so only /verify's in-memory defense-in-depth
  // limiter is gated here.
  app.use(
    '/api/checkout/otp',
    checkoutOtpRoutes({ verifyRateLimit: opts.checkoutOtpVerifyRateLimit ?? env.NODE_ENV !== 'test' })
  );
  app.use('/api/collections', collectionRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/favourites', favouriteRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/addresses', addressRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/settings', settingsRoutes);

  // 404 fallback
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  // Must be registered last.
  app.use(errorHandler);

  return app;
}
