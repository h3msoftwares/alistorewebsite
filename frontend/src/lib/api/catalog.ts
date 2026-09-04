import { api } from './client';
import type {
  CatalogImage,
  Category,
  CategoryBody,
  Collection,
  CollectionBody,
  ImageBody,
  Product,
  ProductBody,
  ProductImageBody,
  ProductListQuery,
  ProductListResult,
  ProductVariant,
  UUID,
  VariantBody,
} from '../types';

// ---- Collections (public) ----

export function listCollections(params?: { includeInactive?: boolean }) {
  return api
    .get<{ collections: Collection[] }>('/api/collections', {
      query: { includeInactive: params?.includeInactive },
    })
    .then((r) => r.collections);
}

export function getCollection(id: UUID) {
  return api.get<{ collection: Collection }>(`/api/collections/${id}`).then((r) => r.collection);
}

export function getCollectionBySlug(slug: string) {
  return api
    .get<{ collection: Collection }>(`/api/collections/slug/${slug}`)
    .then((r) => r.collection);
}

// ---- Collections (admin) ----

export function createCollection(body: CollectionBody) {
  return api.post<{ collection: Collection }>('/api/collections', body).then((r) => r.collection);
}

export function updateCollection(id: UUID, body: Partial<CollectionBody>) {
  return api
    .patch<{ collection: Collection }>(`/api/collections/${id}`, body)
    .then((r) => r.collection);
}

export function deleteCollection(id: UUID) {
  return api.del(`/api/collections/${id}`);
}

export function linkCategoriesToCollection(id: UUID, categoryIds: UUID[]) {
  return api
    .post<{ collection: Collection }>(`/api/collections/${id}/categories`, { categoryIds })
    .then((r) => r.collection);
}

export function addCollectionImage(id: UUID, body: ImageBody) {
  return api
    .post<{ image: CatalogImage }>(`/api/collections/${id}/images`, body)
    .then((r) => r.image);
}

export function updateCollectionImage(id: UUID, imageId: UUID, body: Partial<ImageBody>) {
  return api
    .patch<{ image: CatalogImage }>(`/api/collections/${id}/images/${imageId}`, body)
    .then((r) => r.image);
}

export function deleteCollectionImage(id: UUID, imageId: UUID) {
  return api.del(`/api/collections/${id}/images/${imageId}`);
}

// ---- Categories (public) ----

export function listCategories(collectionId?: UUID) {
  return api
    .get<{ categories: Category[] }>('/api/categories', { query: { collectionId } })
    .then((r) => r.categories);
}

/** Categories attached to no collection (`GET /api/categories?standalone=true`). */
export function listStandaloneCategories() {
  return api
    .get<{ categories: Category[] }>('/api/categories', { query: { standalone: true } })
    .then((r) => r.categories);
}

/** Categories promoted to their own home-page row, across every collection
 *  (`GET /api/categories?showOnHome=true`). */
export function listFeaturedCategories() {
  return api
    .get<{ categories: Category[] }>('/api/categories', { query: { showOnHome: true } })
    .then((r) => r.categories);
}

export function getCategory(id: UUID) {
  return api.get<{ category: Category }>(`/api/categories/${id}`).then((r) => r.category);
}

export function getCategoryBySlug(slug: string) {
  return api
    .get<{ category: Category }>(`/api/categories/slug/${slug}`)
    .then((r) => r.category);
}

/** Products preview for a category — same envelope as `listProducts`, scoped
 *  to the category (`GET /api/categories/:id/products`). */
export function listCategoryProducts(id: UUID, query: ProductListQuery = {}) {
  return api.get<ProductListResult>(`/api/categories/${id}/products`, {
    query: {
      search: query.search,
      size: query.size,
      color: query.color,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
  });
}

// ---- Categories (admin) ----

export function createCategory(body: CategoryBody) {
  return api.post<{ category: Category }>('/api/categories', body).then((r) => r.category);
}

export function updateCategory(id: UUID, body: Partial<CategoryBody>) {
  return api.patch<{ category: Category }>(`/api/categories/${id}`, body).then((r) => r.category);
}

export function deleteCategory(id: UUID) {
  return api.del(`/api/categories/${id}`);
}

export function addCategoryImage(id: UUID, body: ImageBody) {
  return api.post<{ image: CatalogImage }>(`/api/categories/${id}/images`, body).then((r) => r.image);
}

export function updateCategoryImage(id: UUID, imageId: UUID, body: Partial<ImageBody>) {
  return api
    .patch<{ image: CatalogImage }>(`/api/categories/${id}/images/${imageId}`, body)
    .then((r) => r.image);
}

export function deleteCategoryImage(id: UUID, imageId: UUID) {
  return api.del(`/api/categories/${id}/images/${imageId}`);
}

// ---- Products (public) ----

export function listProducts(query: ProductListQuery = {}) {
  return api.get<ProductListResult>('/api/products', {
    query: {
      collectionId: query.collectionId,
      categoryId: query.categoryId,
      search: query.search,
      size: query.size,
      color: query.color,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    },
  });
}

export function getProduct(id: UUID) {
  return api.get<{ product: Product }>(`/api/products/${id}`).then((r) => r.product);
}

// ---- Products (admin) ----

export function createProduct(body: ProductBody) {
  return api.post<{ product: Product }>('/api/products', body).then((r) => r.product);
}

export function updateProduct(id: UUID, body: Partial<Omit<ProductBody, 'variants'>>) {
  return api.patch<{ product: Product }>(`/api/products/${id}`, body).then((r) => r.product);
}

export function deleteProduct(id: UUID) {
  return api.del(`/api/products/${id}`);
}

export function addProductVariant(id: UUID, body: VariantBody) {
  return api
    .post<{ variant: ProductVariant }>(`/api/products/${id}/variants`, body)
    .then((r) => r.variant);
}

export function updateProductVariant(id: UUID, variantId: UUID, body: Partial<VariantBody>) {
  return api
    .patch<{ variant: ProductVariant }>(`/api/products/${id}/variants/${variantId}`, body)
    .then((r) => r.variant);
}

export function deleteProductVariant(id: UUID, variantId: UUID) {
  return api.del(`/api/products/${id}/variants/${variantId}`);
}

export function addProductImage(id: UUID, body: ProductImageBody) {
  return api.post<{ image: CatalogImage }>(`/api/products/${id}/images`, body).then((r) => r.image);
}

export function updateProductImage(id: UUID, imageId: UUID, body: Partial<ProductImageBody>) {
  return api
    .patch<{ image: CatalogImage }>(`/api/products/${id}/images/${imageId}`, body)
    .then((r) => r.image);
}

export function deleteProductImage(id: UUID, imageId: UUID) {
  return api.del(`/api/products/${id}/images/${imageId}`);
}
