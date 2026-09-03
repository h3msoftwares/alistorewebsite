import { Request, Response } from 'express';
import * as collectionService from './collection.service';
import { paramString } from '../../lib/params';

export async function listCollectionsHandler(req: Request, res: Response) {
  const { includeInactive } = (req.validatedQuery ?? {}) as { includeInactive?: boolean };
  const collections = await collectionService.listCollections(includeInactive);
  res.json({ collections });
}

export async function getCollectionHandler(req: Request, res: Response) {
  const collection = await collectionService.getCollectionById(paramString(req.params.id));
  res.json({ collection });
}

// ---- Admin ----

export async function createCollectionHandler(req: Request, res: Response) {
  const collection = await collectionService.createCollection(req.body);
  res.status(201).json({ collection });
}

export async function updateCollectionHandler(req: Request, res: Response) {
  const collection = await collectionService.updateCollection(paramString(req.params.id), req.body);
  res.json({ collection });
}

export async function deleteCollectionHandler(req: Request, res: Response) {
  await collectionService.deleteCollection(paramString(req.params.id));
  res.status(204).send();
}

export async function linkCategoriesHandler(req: Request, res: Response) {
  const collection = await collectionService.linkCategories(
    paramString(req.params.id),
    req.body.categoryIds
  );
  res.json({ collection });
}
