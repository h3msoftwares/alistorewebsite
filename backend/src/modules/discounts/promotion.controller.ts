import type { Request, Response } from 'express';
import { AppError } from '../../lib/AppError';
import { paramString } from '../../lib/params';
import * as promotions from './promotion.service';
import * as coupons from './coupon.service';

// ---- Promotions (admin) ----

export async function listPromotionsHandler(_req: Request, res: Response) {
  res.json({ promotions: await promotions.listPromotions() });
}

export async function getPromotionHandler(req: Request, res: Response) {
  res.json({ promotion: await promotions.getPromotion(paramString(req.params.id)) });
}

export async function createPromotionHandler(req: Request, res: Response) {
  res.status(201).json({ promotion: await promotions.createPromotion(req.body) });
}

export async function updatePromotionHandler(req: Request, res: Response) {
  res.json({ promotion: await promotions.updatePromotion(paramString(req.params.id), req.body) });
}

export async function deletePromotionHandler(req: Request, res: Response) {
  await promotions.deletePromotion(paramString(req.params.id));
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
