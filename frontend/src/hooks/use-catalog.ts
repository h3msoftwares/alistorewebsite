'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  CatalogListQuery,
  CategoryBody,
  CollectionBody,
  ImageBody,
  ProductBody,
  ProductImageBody,
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

/** Root categories (Women/Men/Kids) — carries the storefront nav/home-banner
 *  fields that moved here from Collection in the Stage 1 catalog redesign
 *  (see catalog-redesign-implementation-plan.md's nav/banner decision). */
export function useTopLevelCategories() {
  return useQuery({
    queryKey: queryKeys.categories.topLevel(),
    queryFn: () => catalogApi.listTopLevelCategories(),
  });
}

/** The root categories the owner has promoted into the storefront chrome, in
 *  `sortOrder`. Derived from `useTopLevelCategories()` — no separate request. */
export function useNavCategories() {
  const q = useTopLevelCategories();
  return {
    ...q,
    data: q.data
      ?.filter((c) => c.showInNav)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Root categories promoted into the home page's featured row (own row: name
 *  + a horizontal scroll of their child categories), in `homeSortOrder`.
 *  Image categories (`showOnHomeAsImage`) are excluded — they render as a
 *  banner. */
export function useFeaturedTopCategories() {
  const q = useTopLevelCategories();
  return {
    ...q,
    data: q.data
      ?.filter((c) => c.showOnHome && !c.showOnHomeAsImage)
      .slice()
      .sort((a, b) => a.homeSortOrder - b.homeSortOrder),
  };
}

/** Every root category NOT on the home page at all — the "rest" block below
 *  the curated zone, in `homeSortOrder`. */
export function useOtherTopCategories() {
  const q = useTopLevelCategories();
  return {
    ...q,
    data: q.data
      ?.filter((c) => !c.showOnHome && !c.showOnHomeAsImage)
      .slice()
      .sort((a, b) => a.homeSortOrder - b.homeSortOrder),
  };
}

/** Root categories the owner shows on the home page as a full-width image
 *  banner (`showOnHomeAsImage`), in `homeSortOrder`. */
export function useHomeImageCategories() {
  const q = useTopLevelCategories();
  return {
    ...q,
    data: q.data
      ?.filter((c) => c.showOnHomeAsImage)
      .slice()
      .sort((a, b) => a.homeSortOrder - b.homeSortOrder),
  };
}

/** Admin collection list — the whole filtered set (small), with search +
 *  status. The admin list page paginates the returned array client-side. */
export function useAdminCollections(query: CatalogListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.collections.adminList(query),
    queryFn: () => catalogApi.listCollections({ status: 'all', ...query }),
    placeholderData: (prev) => prev,
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

export function useCategories(parentId?: UUID) {
  return useQuery({
    queryKey: queryKeys.categories.list(parentId),
    queryFn: () => catalogApi.listCategories(parentId),
  });
}

/** Admin category list — the whole filtered set (every collection + standalone),
 *  with search + status. The admin list page paginates it client-side. */
export function useAdminCategories(query: CatalogListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.categories.adminList(query),
    queryFn: () => catalogApi.listCategories({ status: 'all', ...query }),
    placeholderData: (prev) => prev,
  });
}

/** Categories promoted to their own home-page row, across the whole tree,
 *  sorted by `homeSortOrder` (the shared home-page ranking key — see
 *  `useFeaturedCollections`). */
export function useFeaturedCategories() {
  return useQuery({
    queryKey: queryKeys.categories.featured(),
    queryFn: () => catalogApi.listFeaturedCategories(),
    select: (data) => data.slice().sort((a, b) => a.homeSortOrder - b.homeSortOrder),
  });
}

export function useCategory(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.categories.detail(id ?? ''),
    queryFn: () => catalogApi.getCategory(id as UUID),
    enabled: Boolean(id),
  });
}

export function useCategoryBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.categories.bySlug(slug ?? ''),
    queryFn: () => catalogApi.getCategoryBySlug(slug as string),
    enabled: Boolean(slug),
  });
}

/** Products preview for a category (`GET /api/categories/:id/products`). */
export function useCategoryProducts(id: UUID | undefined, query: ProductListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.categories.products(id ?? '', query),
    queryFn: () => catalogApi.listCategoryProducts(id as UUID, query),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}

export function useProducts(
  query: ProductListQuery = {},
  opts?: { enabled?: boolean; keepPreviousData?: boolean },
) {
  // Paging a listing wants the old page to stay visible during the fetch;
  // a type-ahead does NOT — showing the previous query's hits under a new
  // search term (or after it resolves to zero) is just wrong.
  const keepPreviousData = opts?.keepPreviousData ?? true;
  return useQuery({
    queryKey: queryKeys.products.list(query),
    queryFn: () => catalogApi.listProducts(query),
    placeholderData: keepPreviousData ? (prev) => prev : undefined,
    enabled: opts?.enabled ?? true,
  });
}

export function useProduct(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? ''),
    queryFn: () => catalogApi.getProduct(id as UUID),
    enabled: Boolean(id),
  });
}

export interface ProductFacets {
  sizes: string[];
  colors: string[];
}

// Unique, sorted size/colour values across a product page's variants — used
// to populate the filter chips. Independent of the currently-applied filters
// (always the full unfiltered scope) so switching one filter never hides the
// options for another.
function extractFacets(items: { variants: { size?: string | null; color?: string | null }[] }[]): ProductFacets {
  const sizes = new Set<string>();
  const colors = new Set<string>();
  for (const item of items) {
    for (const v of item.variants) {
      if (v.size) sizes.add(v.size);
      if (v.color) colors.add(v.color);
    }
  }
  return { sizes: [...sizes].sort(), colors: [...colors].sort() };
}

const FACETS_PAGE_SIZE = 60; // the API's max — good enough to sample facets for a small-catalog storefront

/** Available size/colour filter options across a collection's manually
 *  curated products, independent of the currently-applied filters. */
export function useCollectionFacets(collectionId: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.products.facetsByCollection(collectionId ?? ''),
    queryFn: () => catalogApi.listProducts({ collectionId, pageSize: FACETS_PAGE_SIZE }),
    enabled: Boolean(collectionId),
    select: (data) => extractFacets(data.items),
  });
}

/** Available size/colour filter options within a category, independent of
 *  the currently-applied filters. */
export function useCategoryFacets(categoryId: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.products.facetsByCategory(categoryId ?? ''),
    queryFn: () => catalogApi.listCategoryProducts(categoryId as UUID, { pageSize: FACETS_PAGE_SIZE }),
    enabled: Boolean(categoryId),
    select: (data) => extractFacets(data.items),
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

/** Archives the collection (the primary "remove"). */
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

export function useRestoreCollection() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.restoreCollection(id),
    onSuccess: () => {
      inv.collections();
      inv.categories();
      inv.products();
    },
  });
}

export function usePermanentDeleteCollection() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.permanentDeleteCollection(id),
    onSuccess: () => {
      inv.collections();
      inv.categories();
    },
  });
}

/** A collection's manually-curated products (`GET /api/collections/:id/products`). */
export function useCollectionProducts(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.collections.products(id ?? ''),
    queryFn: () => catalogApi.listCollectionProducts(id as UUID),
    enabled: Boolean(id),
  });
}

export function useSetCollectionProducts() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, productIds }: { id: UUID; productIds: UUID[] }) =>
      catalogApi.setCollectionProducts(id, productIds),
    onSuccess: () => {
      inv.collections();
      inv.products();
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
      // Re-linking a category re-derives its products' denormalized collection.
      inv.products();
    },
  });
}

/** Archives the category (the primary "remove"). */
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

export function useRestoreCategory() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.restoreCategory(id),
    onSuccess: () => {
      inv.categories();
      inv.collections();
    },
  });
}

export function usePermanentDeleteCategory() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.permanentDeleteCategory(id),
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
    mutationFn: ({
      id,
      body,
    }: {
      id: UUID;
      body: Partial<Omit<ProductBody, 'variants'>> & { expectedLastEdit?: string };
    }) => catalogApi.updateProduct(id, body),
    onSuccess: inv.products,
  });
}

/** Archives the product (soft-delete — order history stays intact). */
export function useDeleteProduct() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.deleteProduct(id),
    onSuccess: inv.products,
  });
}

export function useRestoreProduct() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.restoreProduct(id),
    onSuccess: inv.products,
  });
}

export function usePermanentDeleteProduct() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: (id: UUID) => catalogApi.permanentDeleteProduct(id),
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
type ProductImageTarget = { id: UUID; body: ProductImageBody };
type ProductImageEditTarget = { id: UUID; imageId: UUID; body: Partial<ProductImageBody> };

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
    mutationFn: ({ id, body }: ProductImageTarget) => catalogApi.addProductImage(id, body),
    onSuccess: inv.products,
  });
}
export function useUpdateProductImage() {
  const inv = useInvalidator();
  return useMutation({
    mutationFn: ({ id, imageId, body }: ProductImageEditTarget) =>
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
