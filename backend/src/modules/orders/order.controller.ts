import { Request, Response } from 'express';
import type { OrderStatus } from '@prisma/client';
import * as orderService from './order.service';
import { paramString } from '../../lib/params';
import { AppError } from '../../lib/AppError';
import { GUEST_CART_COOKIE } from '../cart/guest-cart-cookie';
import { returnWorkSummary, type OrderReturnFilter } from '../../lib/order-return-indicators';
import { recordCollection, getCollectionSummary } from '../payments/collection.service';
import { publicOrder } from '../../lib/public-return';

export async function checkoutHandler(req: Request, res: Response) {
  const owner = req.user ? { userID: req.user.id } : { sessionID: req.cookies?.[GUEST_CART_COOKIE] };
  const order = await orderService.checkout(owner, { ...req.body, ipAddress: req.ip });
  res.status(201).json({ order });
}

export async function deliveryQuoteHandler(req: Request, res: Response) {
  const owner = req.user ? { userID: req.user.id } : { sessionID: req.cookies?.[GUEST_CART_COOKIE] };
  const { region, couponCode, pricingMode } = (req.validatedQuery ?? {}) as { region: string; couponCode?: string; pricingMode?: 'BUNDLE' | 'COUPON' };
  res.json(await orderService.getDeliveryQuote(owner, region, { couponCode, pricingMode }));
}

export async function listMyOrdersHandler(req: Request, res: Response) {
  const orders = await orderService.listMyOrders(req.user!.id);
  res.json({ orders });
}

export async function getOrderHandler(req: Request, res: Response) {
  const order = await orderService.getOrderById(paramString(req.params.id), req.user?.role === 'CUSTOMER' ? req.user.id : undefined);
  res.json({ order: req.user?.role === 'CUSTOMER' ? publicOrder(order) : order });
}

export async function cancelOrderHandler(req: Request, res: Response) {
  const order = await orderService.cancelOrder(paramString(req.params.id), req.user!.id);
  res.json({ order: publicOrder(order) });
}

export async function getOrderByTokenHandler(req: Request, res: Response) {
  const order = await orderService.getOrderByToken(paramString(req.params.token));
  res.json({ order: publicOrder(order) });
}

export async function cancelOrderByTokenHandler(req: Request, res: Response) {
  const order = await orderService.cancelOrderByToken(paramString(req.params.token));
  res.json({ order: publicOrder(order) });
}

export async function lookupOrderHandler(req: Request, res: Response) {
  const { orderNumber, contact } = req.body as { orderNumber: string; contact: string };
  const token = await orderService.lookupOrder(orderNumber, contact);
  if (!token) {
    throw new AppError('NOT_FOUND', "We couldn't find a matching order. Check the order number and contact info.");
  }
  res.json({ token });
}

// ---- Admin ----

export async function listAllOrdersHandler(req: Request, res: Response) {
  const { status, flagged, awaitingCod, returnFilter } = (req.validatedQuery ?? {}) as {
    status?: OrderStatus[];
    flagged?: boolean;
    awaitingCod?: boolean;
    returnFilter?: OrderReturnFilter;
  };
  const orders = await orderService.listAllOrders(status, flagged, awaitingCod, returnFilter);
  res.json({ orders });
}

export async function reviewOrderHandler(req: Request, res: Response) {
  const order = await orderService.reviewOrder(paramString(req.params.id), req.user!.id);
  res.json({ order });
}

export async function updateOrderStatusHandler(req: Request, res: Response) {
  const order = await orderService.updateOrderStatus(
    paramString(req.params.id),
    req.body.status,
    req.user!.id,
    { estimatedDeliveryDays: req.body.estimatedDeliveryDays }
  );
  res.json({ order });
}

export async function markCodCollectedHandler(req: Request, res: Response) {
  res.json(await recordCollection(paramString(req.params.id), req.body, req.user!.id));
}

export async function collectionSummaryHandler(req: Request, res: Response) {
  res.json(await getCollectionSummary(paramString(req.params.id)));
}

export async function returnWorkSummaryHandler(_req: Request, res: Response) {
  res.json(await returnWorkSummary());
}

export async function correctOrderStatusHandler(req: Request, res: Response) {
  const order = await orderService.correctOrderStatus(paramString(req.params.id), req.body, req.user!.id);
  res.json({ order });
}

export async function salesDashboardHandler(_req: Request, res: Response) {
  const stats = await orderService.salesDashboard();
  res.json(stats);
}
