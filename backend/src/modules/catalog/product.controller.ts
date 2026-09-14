import { Request, Response } from 'express';
import * as productService from './product.service';
import { paramString } from '../../lib/params';
import { resolveListStatus, type CatalogListStatus } from './list-access';

export async function listProductsHandler(req: Request, res: Response) {
  // Coerced/defaulted by the validate() middleware — see req.validatedQuery
  // in middleware/validate.middleware.ts (req.query itself can't carry
  // this: Express 5 made it a read-only getter).
  const q = (req.validatedQuery ?? {}) as Record<string, unknown> & {
    status?: CatalogListStatus;
    includeInactive?: boolean;
  };
  const status = resolveListStatus(req, q.status, q.includeInactive);
  const result = await productService.listProducts({ ...q, status } as never);
  res.json(result);
}

export async function getProductHandler(req: Request, res: Response) {
  const includeInactive = req.user?.role === 'STAFF' || req.user?.role === 'ADMIN';
  const product = await productService.getProductById(paramString(req.params.id), includeInactive);
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

export async function restoreProductHandler(req: Request, res: Response) {
  const product = await productService.restoreProduct(paramString(req.params.id));
  res.json({ product });
}

export async function hardDeleteProductHandler(req: Request, res: Response) {
  await productService.hardDeleteProduct(paramString(req.params.id));
  res.status(204).send();
}

// ---- Variants ----

export async function addVariantHandler(req: Request, res: Response) {
  const variant = await productService.addVariant(paramString(req.params.id), req.body);
  res.status(201).json({ variant });
}

export async function updateVariantHandler(req: Request, res: Response) {
  const variant = await productService.updateVariant(
    paramString(req.params.id),
    paramString(req.params.variantId),
    req.body,
    req.user?.id
  );
  res.json({ variant });
}

export async function deleteVariantHandler(req: Request, res: Response) {
  await productService.deleteVariant(paramString(req.params.id), paramString(req.params.variantId));
  res.status(204).send();
}

export async function setVariantsHandler(req: Request, res: Response) {
  const variants = await productService.setVariants(paramString(req.params.id), req.body.variants, req.user?.id);
  res.json({ variants });
}

export async function updateStockHandler(req: Request, res: Response) {
  const variant = await productService.updateStock(
    paramString(req.params.variantId),
    req.body.stockQuantity,
    req.user?.id
  );
  res.json({ variant });
}

// ---- Images ----

export async function addProductImageHandler(req: Request, res: Response) {
  const image = await productService.addImage(paramString(req.params.id), req.body);
  res.status(201).json({ image });
}

export async function updateProductImageHandler(req: Request, res: Response) {
  const image = await productService.updateImage(
    paramString(req.params.id),
    paramString(req.params.imageId),
    req.body
  );
  res.json({ image });
}

export async function deleteProductImageHandler(req: Request, res: Response) {
  await productService.deleteImage(paramString(req.params.id), paramString(req.params.imageId));
  res.status(204).send();
}
