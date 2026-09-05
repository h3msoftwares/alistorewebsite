import { Request, Response } from 'express';
import * as analytics from './analytics.service';
import type { AnalyticsRangeQuery } from './analytics.schema';

const query = (req: Request) => (req.validatedQuery ?? {}) as AnalyticsRangeQuery;

export async function overviewHandler(req: Request, res: Response) {
  res.json(await analytics.overview(query(req)));
}

export async function salesHandler(req: Request, res: Response) {
  res.json(await analytics.sales(query(req)));
}

export async function customersHandler(req: Request, res: Response) {
  res.json(await analytics.customers(query(req)));
}

export async function inventoryHandler(req: Request, res: Response) {
  res.json(await analytics.inventory(query(req)));
}

export async function productsHandler(req: Request, res: Response) {
  res.json(await analytics.products(query(req)));
}

export async function visitorsHandler(req: Request, res: Response) {
  res.json(await analytics.visitors(query(req)));
}

export async function funnelHandler(req: Request, res: Response) {
  res.json(await analytics.funnelReport(query(req)));
}
