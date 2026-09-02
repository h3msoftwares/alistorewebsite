import { Request, Response } from 'express';
import * as orderService from './order.service';

export async function checkoutHandler(req: Request, res: Response) {
  const owner = req.user ? { userID: req.user.id } : { sessionID: req.cookies?.cartSession };
  const order = await orderService.checkout(owner, req.body);
  res.status(201).json({ order });
}

export async function listMyOrdersHandler(req: Request, res: Response) {
  const orders = await orderService.listMyOrders(req.user!.id);
  res.json({ orders });
}

export async function getOrderHandler(req: Request, res: Response) {
  const order = await orderService.getOrderById(req.params.id, req.user?.role === 'CUSTOMER' ? req.user.id : undefined);
  res.json({ order });
}

export async function cancelOrderHandler(req: Request, res: Response) {
  const order = await orderService.cancelOrder(req.params.id, req.user!.id);
  res.json({ order });
}

// ---- Admin ----

export async function listAllOrdersHandler(req: Request, res: Response) {
  const orders = await orderService.listAllOrders(req.query.status as never);
  res.json({ orders });
}

export async function updateOrderStatusHandler(req: Request, res: Response) {
  const order = await orderService.updateOrderStatus(req.params.id, req.body.status);
  res.json({ order });
}

export async function markCodCollectedHandler(req: Request, res: Response) {
  const order = await orderService.markCodCollected(req.params.id, req.body.collected);
  res.json({ order });
}

export async function salesDashboardHandler(_req: Request, res: Response) {
  const stats = await orderService.salesDashboard();
  res.json(stats);
}
