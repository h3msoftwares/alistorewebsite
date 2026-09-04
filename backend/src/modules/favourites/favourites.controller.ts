import { Request, Response } from 'express';
import * as favouritesService from './favourites.service';
import { paramString } from '../../lib/params';

export async function listFavouritesHandler(req: Request, res: Response) {
  const favourites = await favouritesService.listFavourites(req.user!.id);
  res.json({ favourites });
}

export async function addFavouriteHandler(req: Request, res: Response) {
  // 200 whether the row was just created or already existed — hearting is
  // idempotent, a repeat is not an error.
  const favourite = await favouritesService.addFavourite(req.user!.id, req.body.productID);
  res.status(200).json({ favourite });
}

export async function removeFavouriteHandler(req: Request, res: Response) {
  await favouritesService.removeFavourite(req.user!.id, paramString(req.params.productID));
  res.status(204).send();
}
