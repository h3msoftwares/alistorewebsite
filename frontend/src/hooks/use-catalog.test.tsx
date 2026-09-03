import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { queryKeys } from '@/lib/query-keys';
import {
  useCollections,
  useCollection,
  useProducts,
  useProduct,
  useCreateProduct,
  useDeleteCollection,
} from './use-catalog';

vi.mock('@/lib/api', () => ({
  catalogApi: {
    listCollections: vi.fn(),
    getCollection: vi.fn(),
    getCollectionBySlug: vi.fn(),
    listCategories: vi.fn(),
    getCategory: vi.fn(),
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
      collectionId: 'col',
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
