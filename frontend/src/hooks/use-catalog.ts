'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  CategoryBody,
  CollectionBody,
  ImageBody,
  ProductBody,
  ProductListQuery,
  UUID,
  VariantBody,
} from '@/lib/types';

// ---------------------------------------------------------------- queries ----

export function useCollections(opts?: { includeInactive?: boolean }) {
  const includeInactive = opts?.includeInactive ?? false;
  return useQuery({
    queryKey: queryKeys.collections.list(includeInactive),
    queryFn: () => catalogApi.listCollections({ includeInactive }),
  });
}

export function useCollection(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.collections.detail(id ?? ''),
    queryFn: () => catalogApi.getCollection(id as UUID),
    enabled: Boolean(id),
  });
}

export function useCollectionBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collections.bySlug(slug ?? ''),
    queryFn: () => catalogApi.getCollectionBySlug(slug as string),
    enabled: Boolean(slug),
  });
}

export function useCategories(collectionId?: UUID) {
  return useQuery({
    queryKey: queryKeys.categories.list(collectionId),
    queryFn: () => catalogApi.listCategories(collectionId),
  });
}

export function useCategory(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.categories.detail(id ?? ''),
    queryFn: () => catalogApi.getCategory(id as UUID),
    enabled: Boolean(id),
  });
}

export function useProducts(query: ProductListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.products.list(query),
    queryFn: () => catalogApi.listProducts(query),
    placeholderData: (prev) => prev, // keep the old page visible while paging
  });
}

export function useProduct(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? ''),
    queryFn: () => catalogApi.getProduct(id as UUID),
    enabled: Boolean(id),
  });
}

// -------------------------------------------------------- admin mutations ----

function useInvalidator() {
  const qc = useQueryClient();
  return {
    collections: () => qc.invalidateQueries({ queryKey: queryKeys.collections.all() }),
    categories: () => qc.invalidateQueries({ queryKey: queryKeys.categories.all() }),
    products: () => qc.invalidateQueries({ queryKey: queryKeys.products.all() }),
  };
}

export function useCreateCollection() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (body: CollectionBody) => catalogApi.createCollection(body),
    onSuccess: () => {
      inv.collections();
      inv.categories();
    },
  });
}

export function useUpdateCollection() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<CollectionBody> }) =>
      catalogApi.updateCollection(id, body),
    onSuccess: inv.collections,
  });
}

export function useDeleteCollection() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.deleteCollection(id),
    onSuccess: () => {
      inv.collections();
      inv.categories();
      inv.products();
    },
  });
}

export function useLinkCategoriesToCollection() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, categoryIds }: { id: UUID; categoryIds: UUID[] }) =>
      catalogApi.linkCategoriesToCollection(id, categoryIds),
    onSuccess: () => {
      inv.collections();
      inv.categories();
    },
  });
}

export function useCreateCategory() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (body: CategoryBody) => catalogApi.createCategory(body),
    onSuccess: () => {
      inv.categories();
      inv.collections();
    },
  });
}

export function useUpdateCategory() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<CategoryBody> }) =>
      catalogApi.updateCategory(id, body),
    onSuccess: () => {
      inv.categories();
      inv.collections();
    },
  });
}

export function useDeleteCategory() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.deleteCategory(id),
    onSuccess: () => {
      inv.categories();
      inv.collections();
    },
  });
}

export function useCreateProduct() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (body: ProductBody) => catalogApi.createProduct(body),
    onSuccess: inv.products,
  });
}

export function useUpdateProduct() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<Omit<ProductBody, 'variants'>> }) =>
      catalogApi.updateProduct(id, body),
    onSuccess: inv.products,
  });
}

export function useDeleteProduct() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.deleteProduct(id),
    onSuccess: inv.products,
  });
}

export function useAddProductVariant() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: VariantBody }) =>
      catalogApi.addProductVariant(id, body),
    onSuccess: inv.products,
  });
}

export function useUpdateProductVariant() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, variantId, body }: { id: UUID; variantId: UUID; body: Partial<VariantBody> }) =>
      catalogApi.updateProductVariant(id, variantId, body),
    onSuccess: inv.products,
  });
}

export function useDeleteProductVariant() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, variantId }: { id: UUID; variantId: UUID }) =>
      catalogApi.deleteProductVariant(id, variantId),
    onSuccess: inv.products,
  });
}

type ImageTarget = { id: UUID; body: ImageBody };
type ImageEditTarget = { id: UUID; imageId: UUID; body: Partial<ImageBody> };
type ImageDeleteTarget = { id: UUID; imageId: UUID };

export function useAddCollectionImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: ImageTarget) => catalogApi.addCollectionImage(id, body),
    onSuccess: inv.collections,
  });
}
export function useUpdateCollectionImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId, body }: ImageEditTarget) =>
      catalogApi.updateCollectionImage(id, imageId, body),
    onSuccess: inv.collections,
  });
}
export function useDeleteCollectionImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId }: ImageDeleteTarget) =>
      catalogApi.deleteCollectionImage(id, imageId),
    onSuccess: inv.collections,
  });
}

export function useAddCategoryImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: ImageTarget) => catalogApi.addCategoryImage(id, body),
    onSuccess: inv.categories,
  });
}
export function useUpdateCategoryImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId, body }: ImageEditTarget) =>
      catalogApi.updateCategoryImage(id, imageId, body),
    onSuccess: inv.categories,
  });
}
export function useDeleteCategoryImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId }: ImageDeleteTarget) => catalogApi.deleteCategoryImage(id, imageId),
    onSuccess: inv.categories,
  });
}

export function useAddProductImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: ImageTarget) => catalogApi.addProductImage(id, body),
    onSuccess: inv.products,
  });
}
export function useUpdateProductImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId, body }: ImageEditTarget) =>
      catalogApi.updateProductImage(id, imageId, body),
    onSuccess: inv.products,
  });
}
export function useDeleteProductImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId }: ImageDeleteTarget) => catalogApi.deleteProductImage(id, imageId),
    onSuccess: inv.products,
  });
}
