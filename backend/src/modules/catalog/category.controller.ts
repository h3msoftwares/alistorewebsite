import { Request, Response } from 'express';
import * as categoryService from './category.service';
import { paramString } from '../../lib/params';

export async function listCategoriesHandler(req: Request, res: Response) {
  const { collectionId } = (req.validatedQuery ?? {}) as { collectionId?: string };
  const categories = await categoryService.listCategories(collectionId);
  res.json({ categories });
}

export async function getCategoryHandler(req: Request, res: Response) {
  const category = await categoryService.getCategoryById(paramString(req.params.id));
  res.json({ category });
}

// ---- Admin ----

export async function createCategoryHandler(req: Request, res: Response) {
  const category = await categoryService.createCategory(req.body);
  res.status(201).json({ category });
}

export async function updateCategoryHandler(req: Request, res: Response) {
  const category = await categoryService.updateCategory(paramString(req.params.id), req.body);
  res.json({ category });
}

export async function deleteCategoryHandler(req: Request, res: Response) {
  await categoryService.deleteCategory(paramString(req.params.id));
  res.status(204).send();
}

// ---- Images ----

export async function addCategoryImageHandler(req: Request, res: Response) {
  const image = await categoryService.addImage(paramString(req.params.id), req.body);
  res.status(201).json({ image });
}

export async function updateCategoryImageHandler(req: Request, res: Response) {
  const image = await categoryService.updateImage(
    paramString(req.params.id),
    paramString(req.params.imageId),
    req.body
  );
  res.json({ image });
}

export async function deleteCategoryImageHandler(req: Request, res: Response) {
  await categoryService.deleteImage(paramString(req.params.id), paramString(req.params.imageId));
  res.status(204).send();
}
