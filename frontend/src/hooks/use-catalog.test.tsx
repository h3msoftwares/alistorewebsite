import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { queryKeys } from '@/lib/query-keys';
import {
  useCollections,
  useNavCollections,
  useFeaturedCollections,
  useOtherCollections,
  useFeaturedCategories,
  useCollection,
  useProducts,
  useProduct,
  useCreateProduct,
  useDeleteCollection,
  useCategoryBySlug,
  useStandaloneCategories,
  useCategoryProducts,
  useCollectionFacets,
  useCategoryFacets,
} from './use-catalog';

vi.mock('@/lib/api', () => ({
  catalogApi: {
    listCollections: vi.fn(),
    getCollection: vi.fn(),
    getCollectionBySlug: vi.fn(),
    listCategories: vi.fn(),
    listStandaloneCategories: vi.fn(),
    listFeaturedCategories: vi.fn(),
    getCategory: vi.fn(),
    getCategoryBySlug: vi.fn(),
    listCategoryProducts: vi.fn(),
    listProducts: vi.fn(),
    getProduct: vi.fn(),
    createProduct: vi.fn(),
    deleteCollection: vi.fn(),
  },
}));

import { catalogApi } from '@/lib/api';
const mockCatalog = vi.mocked(catalogApi, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('use-catalog queries', () => {
  it('useCollections fetches and returns the list', async () => {
    mockCatalog.listCollections.mockResolvedValue([{ id: 'c1' }] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCollections(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'c1' }]);
    expect(mockCatalog.listCollections).toHaveBeenCalledWith({ includeInactive: false });
  });

  it('useCollections passes includeInactive through', async () => {
    mockCatalog.listCollections.mockResolvedValue([] as never);
    const { Wrapper } = createWrapper();
    renderHook(() => useCollections({ includeInactive: true }), { wrapper: Wrapper });
    await waitFor(() => expect(mockCatalog.listCollections).toHaveBeenCalledWith({ includeInactive: true }));
  });

  it('useNavCollections keeps only showInNav and orders by sortOrder', async () => {
    mockCatalog.listCollections.mockResolvedValue([
      { id: 'c', slug: 'c', showInNav: true, sortOrder: 3 },
      { id: 'a', slug: 'a', showInNav: true, sortOrder: 1 },
      { id: 'hidden', slug: 'hidden', showInNav: false, sortOrder: 0 },
      { id: 'b', slug: 'b', showInNav: true, sortOrder: 2 },
    ] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useNavCollections(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((c) => c.slug)).toEqual(['a', 'b', 'c']);
  });

  it('useFeaturedCollections keeps only showOnHome and orders by sortOrder', async () => {
    mockCatalog.listCollections.mockResolvedValue([
      { id: 'c', slug: 'c', showOnHome: true, sortOrder: 3 },
      { id: 'a', slug: 'a', showOnHome: true, sortOrder: 1 },
      { id: 'hidden', slug: 'hidden', showOnHome: false, sortOrder: 0 },
    ] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useFeaturedCollections(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((c) => c.slug)).toEqual(['a', 'c']);
  });

  it('useOtherCollections keeps everything showOnHome=false, ordered by sortOrder', async () => {
    mockCatalog.listCollections.mockResolvedValue([
      { id: 'featured', slug: 'featured', showOnHome: true, sortOrder: 0 },
      { id: 'z', slug: 'z', showOnHome: false, sortOrder: 2 },
      { id: 'a', slug: 'a', showOnHome: false, sortOrder: 1 },
    ] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useOtherCollections(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((c) => c.slug)).toEqual(['a', 'z']);
  });

  it('useFeaturedCategories fetches showOnHome=true categories, sorted by sortOrder', async () => {
    mockCatalog.listFeaturedCategories.mockResolvedValue([
      { id: 'c', slug: 'c', sortOrder: 2 },
      { id: 'a', slug: 'a', sortOrder: 1 },
    ] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useFeaturedCategories(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((c) => c.slug)).toEqual(['a', 'c']);
    expect(mockCatalog.listFeaturedCategories).toHaveBeenCalled();
  });

  it('useCollectionFacets derives unique sorted sizes/colours from the variants, only when given an id', async () => {
    mockCatalog.listProducts.mockResolvedValue({
      items: [
        { variants: [{ size: 'M', color: 'Black' }, { size: 'S', color: 'Black' }] },
        { variants: [{ size: 'M', color: 'Navy' }, { size: null, color: null }] },
      ],
      total: 2,
      page: 1,
      pageSize: 60,
    } as never);
    const { Wrapper } = createWrapper();

    const off = renderHook(() => useCollectionFacets(undefined), { wrapper: Wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useCollectionFacets('col-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ sizes: ['M', 'S'], colors: ['Black', 'Navy'] });
    expect(mockCatalog.listProducts).toHaveBeenCalledWith({ collectionId: 'col-1', pageSize: 60 });
  });

  it('useCategoryFacets derives facets from listCategoryProducts, only when given an id', async () => {
    mockCatalog.listCategoryProducts.mockResolvedValue({
      items: [{ variants: [{ size: 'L', color: 'White' }] }],
      total: 1,
      page: 1,
      pageSize: 60,
    } as never);
    const { Wrapper } = createWrapper();

    const off = renderHook(() => useCategoryFacets(undefined), { wrapper: Wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useCategoryFacets('cat-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ sizes: ['L'], colors: ['White'] });
    expect(mockCatalog.listCategoryProducts).toHaveBeenCalledWith('cat-1', { pageSize: 60 });
  });

  it('useCollection is disabled without an id and enabled with one', async () => {
    mockCatalog.getCollection.mockResolvedValue({ id: 'c1' } as never);
    const { Wrapper } = createWrapper();

    const off = renderHook(() => useCollection(undefined), { wrapper: Wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
    expect(mockCatalog.getCollection).not.toHaveBeenCalled();

    const on = renderHook(() => useCollection('c1'), { wrapper: Wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(mockCatalog.getCollection).toHaveBeenCalledWith('c1');
  });

  it('useProducts forwards the whole query object', async () => {
    mockCatalog.listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24 } as never);
    const { Wrapper } = createWrapper();
    const query = { collectionId: 'c1', sort: 'price_asc' as const, page: 2 };
    const { result } = renderHook(() => useProducts(query), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCatalog.listProducts).toHaveBeenCalledWith(query);
  });

  it('useStandaloneCategories fetches the standalone list', async () => {
    mockCatalog.listStandaloneCategories.mockResolvedValue([{ id: 'sc1' }] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useStandaloneCategories(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'sc1' }]);
    expect(mockCatalog.listStandaloneCategories).toHaveBeenCalled();
  });

  it('useCategoryBySlug is disabled without a slug and enabled with one', async () => {
    mockCatalog.getCategoryBySlug.mockResolvedValue({ id: 'k1', slug: 'clearance' } as never);
    const { Wrapper } = createWrapper();

    const off = renderHook(() => useCategoryBySlug(undefined), { wrapper: Wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
    expect(mockCatalog.getCategoryBySlug).not.toHaveBeenCalled();

    const on = renderHook(() => useCategoryBySlug('clearance'), { wrapper: Wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(mockCatalog.getCategoryBySlug).toHaveBeenCalledWith('clearance');
  });

  it('useCategoryProducts only fires with an id and forwards the query', async () => {
    mockCatalog.listCategoryProducts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
    } as never);
    const { Wrapper } = createWrapper();

    const off = renderHook(() => useCategoryProducts(undefined), { wrapper: Wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useCategoryProducts('cat-1', { pageSize: 12 }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCatalog.listCategoryProducts).toHaveBeenCalledWith('cat-1', { pageSize: 12 });
  });

  it('useProduct only fires when given an id', async () => {
    mockCatalog.getProduct.mockResolvedValue({ id: 'p1' } as never);
    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useProduct(id), {
      wrapper: Wrapper,
      initialProps: {},
    });
    expect(mockCatalog.getProduct).not.toHaveBeenCalled();
    rerender({ id: 'p1' });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'p1' }));
  });
});

describe('use-catalog mutations', () => {
  it('useCreateProduct calls the api and invalidates the product list', async () => {
    mockCatalog.createProduct.mockResolvedValue({ id: 'p9' } as never);
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateProduct(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      sku: 'S1',
      nameEn: 'x',
      nameAr: 'x',
      categoryId: 'c',
      price: 10,
      variants: [{ sku: 'v1' }],
    });

    expect(mockCatalog.createProduct).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.products.all() });
  });

  it('useDeleteCollection cascades invalidation to categories and products', async () => {
    mockCatalog.deleteCollection.mockResolvedValue(undefined as never);
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteCollection(), { wrapper: Wrapper });

    await result.current.mutateAsync('col-1');

    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(queryKeys.collections.all());
    expect(keys).toContainEqual(queryKeys.categories.all());
    expect(keys).toContainEqual(queryKeys.products.all());
  });
});
