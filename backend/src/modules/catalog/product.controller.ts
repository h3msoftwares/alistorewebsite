import { Request, Response } from 'express';
import * as productService from './product.service';

export async function listProductsHandler(req: Request, res: Response) {
  const result = await productService.listProducts(req.query as never);
  res.json(result);
}

export async function getProductHandler(req: Request, res: Response) {
  const product = await productService.getProductById(req.params.id);
  res.json({ product });
}

// ---- Admin ----

export async function createProductHandler(req: Request, res: Response) {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ product });
}

export async function updateProductHandler(req: Request, res: Response) {
  const product = await productService.updateProduct(req.params.id, req.body);
  res.json({ product });
}

export async function deleteProductHandler(req: Request, res: Response) {
  await productService.deleteProduct(req.params.id);
  res.status(204).send();
}

export async function updateStockHandler(req: Request, res: Response) {
  const variant = await productService.updateStock(req.params.variantId, req.body.stockQuantity);
  res.json({ variant });
}
