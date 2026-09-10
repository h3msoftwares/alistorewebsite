import { Request, Response } from 'express';
import * as customerService from './customers.service';
import { paramString } from '../../lib/params';
import type { ListCustomersQuery } from './customers.schema';

export async function listCustomersHandler(req: Request, res: Response) {
  const query = (req.validatedQuery ?? {}) as ListCustomersQuery;
  res.json(await customerService.listCustomers(query));
}

export async function getCustomerHandler(req: Request, res: Response) {
  const customer = await customerService.getCustomer(paramString(req.params.id));
  res.json({ customer });
}

export async function updateCustomerHandler(req: Request, res: Response) {
  const customer = await customerService.setCustomerActive(
    req.user!.id,
    paramString(req.params.id),
    req.body.isActive
  );
  res.json({ customer });
}
