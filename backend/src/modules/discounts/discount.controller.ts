import type { Request, Response } from 'express';
import { AppError } from '../../lib/AppError';
import { paramString } from '../../lib/params';
import * as discounts from './discount.service';
import * as coupons from './coupon.service';

// ---- Catalog discounts (admin) ----

export async function listDiscountsHandler(_req: Request, res: Response) {
  res.json({ discounts: await discounts.listDiscounts() });
}

export async function createDiscountHandler(req: Request, res: Response) {
  res.status(201).json({ discount: await discounts.createDiscount(req.body) });
}

export async function updateDiscountHandler(req: Request, res: Response) {
  res.json({ discount: await discounts.updateDiscount(paramString(req.params.id), req.body) });
}

export async function deleteDiscountHandler(req: Request, res: Response) {
  await discounts.deleteDiscount(paramString(req.params.id));
  res.status(204).end();
}

// ---- Coupons (admin) ----

export async function listCouponsHandler(_req: Request, res: Response) {
  res.json({ coupons: await coupons.listCoupons() });
}

export async function createCouponHandler(req: Request, res: Response) {
  res.status(201).json({ coupon: await coupons.createCoupon(req.body) });
}

export async function updateCouponHandler(req: Request, res: Response) {
  res.json({ coupon: await coupons.updateCoupon(paramString(req.params.id), req.body) });
}

export async function deleteCouponHandler(req: Request, res: Response) {
  await coupons.deleteCoupon(paramString(req.params.id));
  res.status(204).end();
}

// ---- Coupon lookup (public, used by the cart / checkout) ----

export async function validateCouponHandler(req: Request, res: Response) {
  const { code } = req.body as { code: string };
  const coupon = await coupons.resolveCoupon(code);
  if (!coupon) throw new AppError('NOT_FOUND', 'That code is not valid.');
  res.json({ coupon });
}
