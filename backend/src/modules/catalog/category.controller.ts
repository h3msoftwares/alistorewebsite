import { Request, Response } from 'express';
import { Department } from '@prisma/client';
import * as categoryService from './category.service';

export async function listCategoriesHandler(req: Request, res: Response) {
  const department = req.query.department as Department | undefined;
  const categories = await categoryService.listCategories(department);
  res.json({ categories });
}
