// Focused on the promotion-preview banner added to the product edit page —
// everything else (image gallery, variants manager, category/collection
// pickers) is stubbed out so this test only exercises that one concern.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditProductPage from './page';
import type { Product } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', id: 'p1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/admin/image-gallery', () => ({ ImageGallery: () => null }));
vi.mock('../product-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../product-form')>()),
  ProductCoreFields: () => null,
}));
vi.mock('./variants-manager', () => ({ VariantsManager: () => null }));

const mutationStub = { mutateAsync: vi.fn(), isPending: false };
let mockProduct: Partial<Product> | undefined;

vi.mock('@/hooks/use-catalog', () => ({
  useProduct: () => ({ data: mockProduct, isPending: false, isError: false, refetch: vi.fn() }),
  useUpdateProduct: () => mutationStub,
  useDeleteProduct: () => mutationStub,
  useRestoreProduct: () => mutationStub,
  usePermanentDeleteProduct: () => mutationStub,
  useAddProductImage: () => mutationStub,
  useUpdateProductImage: () => mutationStub,
  useDeleteProductImage: () => mutationStub,
}));

const baseProduct: Product = {
  id: 'p1',
  sku: 'SKU1',
  nameEn: 'Test Product',
  nameAr: 'منتج',
  primaryCategoryID: 'c1',
  price: '100',
  effectivePrice: 100,
  onSale: false,
  isActive: true,
  dateCreated: '2026-01-01T00:00:00.000Z',
  lastEdit: '2026-01-01T00:00:00.000Z',
  images: [],
  variants: [],
};

function renderPage() {
  render(<EditProductPage />);
}

describe('Product edit page — promotion preview', () => {
  it('shows nothing when no promotion currently applies', () => {
    mockProduct = { ...baseProduct, promotion: null };
    renderPage();
    expect(screen.queryByText(/currently applied/i)).not.toBeInTheDocument();
  });

  it('names the promotion and the collection behind it', () => {
    mockProduct = {
      ...baseProduct,
      promotion: {
        nameEn: 'Summer Sale',
        nameAr: 'تخفيضات الصيف',
        type: 'PERCENT',
        value: 20,
        stackable: true,
        source: 'COLLECTION',
        sourceNameEn: 'New Arrivals',
        sourceNameAr: 'وصل حديثًا',
      },
    };
    renderPage();
    expect(screen.getByText(/"Summer Sale" is currently applied to this product: 20% off\./)).toBeInTheDocument();
    expect(screen.getByText(/Applied via the collection "New Arrivals"\./)).toBeInTheDocument();
    expect(screen.getByText(/stacks on top of the sale/i)).toBeInTheDocument();
  });

  it('names the category when the source is CATEGORY, and reports override (not stacking)', () => {
    mockProduct = {
      ...baseProduct,
      promotion: {
        nameEn: 'Men Sale',
        nameAr: 'تخفيض رجالي',
        type: 'AMOUNT',
        value: 5,
        stackable: false,
        source: 'CATEGORY',
        sourceNameEn: 'Men',
        sourceNameAr: 'رجال',
      },
    };
    renderPage();
    expect(screen.getByText(/\$5 off\./)).toBeInTheDocument();
    expect(screen.getByText(/Applied via the category "Men"\./)).toBeInTheDocument();
    expect(screen.getByText(/replaces the sale set above/i)).toBeInTheDocument();
  });

  it('reports a site-wide (ALL) promotion without naming a collection/category', () => {
    mockProduct = {
      ...baseProduct,
      promotion: { nameEn: 'Everything', nameAr: 'الكل', type: 'PERCENT', value: 10, stackable: true, source: 'ALL' },
    };
    renderPage();
    expect(screen.getByText(/Applied site-wide/i)).toBeInTheDocument();
  });
});
