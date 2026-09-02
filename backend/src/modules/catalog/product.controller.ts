import { Request, Response } from 'express';
import * as productService from './product.service';
import { paramString } from '../../lib/params';

export async function listProductsHandler(req: Request, res: Response) {
  // Coerced/defaulted by the validate() middleware — see req.validatedQuery
  // in middleware/validate.middleware.ts (req.query itself can't carry
  // this: Express 5 made it a read-only getter).
  const result = await productService.listProducts(req.validatedQuery as never);
  res.json(result);
}

export async function getProductHandler(req: Request, res: Response) {
  const product = await productService.getProductById(paramString(req.params.id));
  res.json({ product });
}

// ---- Admin ----

export async function createProductHandler(req: Request, res: Response) {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ product });
}

export async function updateProductHandler(req: Request, res: Response) {
  const product = await productService.updateProduct(paramString(req.params.id), req.body);
  res.json({ product });
}

export async function deleteProductHandler(req: Request, res: Response) {
  await productService.deleteProduct(paramString(req.params.id));
  res.status(204).send();
}

export async function updateStockHandler(req: Request, res: Response) {
  const variant = await productService.updateStock(paramString(req.params.variantId), req.body.stockQuantity);
  res.json({ variant });
}
