import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.middleware';
import { env } from './config/env';

import authRoutes from './modules/auth/auth.routes';
import collectionRoutes from './modules/catalog/collection.routes';
import categoryRoutes from './modules/catalog/category.routes';
import productRoutes from './modules/catalog/product.routes';
import cartRoutes from './modules/cart/cart.routes';
import favouriteRoutes from './modules/favourites/favourites.routes';
import orderRoutes from './modules/orders/order.routes';
import adminRoutes from './modules/admin/admin.routes';
import addressRoutes from './modules/account/address.routes';
import userRoutes from './modules/account/user.routes';

export function buildApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // App-wide baseline limiter; auth routes layer a stricter bucket on top.
  // Disabled under test so suites can fire many requests without tripping it.
  if (env.NODE_ENV !== 'test') {
    app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Vertical-slice module mounting, same convention as pos-backend:
  // one line per module.
  app.use('/api/auth', authRoutes);
  app.use('/api/collections', collectionRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/favourites', favouriteRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/addresses', addressRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);

  // 404 fallback
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  // Must be registered last.
  app.use(errorHandler);

  return app;
}
