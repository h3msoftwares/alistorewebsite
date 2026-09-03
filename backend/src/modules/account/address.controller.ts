import { Request, Response } from 'express';
import * as addressService from './address.service';
import { paramString } from '../../lib/params';

export async function listAddressesHandler(req: Request, res: Response) {
  const addresses = await addressService.listAddresses(req.user!.id);
  res.json({ addresses });
}

export async function getAddressHandler(req: Request, res: Response) {
  const address = await addressService.getAddress(req.user!.id, paramString(req.params.id));
  res.json({ address });
}

export async function createAddressHandler(req: Request, res: Response) {
  const address = await addressService.createAddress(req.user!.id, req.body);
  res.status(201).json({ address });
}

export async function updateAddressHandler(req: Request, res: Response) {
  const address = await addressService.updateAddress(
    req.user!.id,
    paramString(req.params.id),
    req.body
  );
  res.json({ address });
}

export async function deleteAddressHandler(req: Request, res: Response) {
  await addressService.deleteAddress(req.user!.id, paramString(req.params.id));
  res.status(204).send();
}
