import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ProductPreviewCard } from './product-preview-card';
import type { Product } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  catalogApi: { getProduct: vi.fn() },
  cartApi: { addCartItem: vi.fn() },
  favouritesApi: { listFavourites: vi.fn(), addFavourite: vi.fn(), removeFavourite: vi.fn() },
  isApiError: () => false,
}));

const product: Product = {
  id: 'p1',
  sku: 'SKU1',
  nameEn: 'Test Shirt',
  nameAr: 'قميص',
  primaryCategoryID: 'cat1',
  price: '30.00',
  quantity: 10,
  effectivePrice: 30,
  onSale: false,
  isActive: true,
  dateCreated: '2026-01-01T00:00:00.000Z',
  lastEdit: '2026-01-01T00:00:00.000Z',
  images: [],
  // No S/Blue variant on purpose: S only exists paired with Red, M only
  // with Blue. Both individual axes ("is there stock for S anywhere" / "is
  // there stock for Blue anywhere") say yes — only the cross-axis check
  // catches that S+Blue specifically doesn't exist.
  variants: [
    { id: 'v1', productID: 'p1', sku: 'SKU1-1', size: 'S', color: 'Red', stockQuantity: 5 },
    { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: 'M', color: 'Blue', stockQuantity: 5 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductPreviewCard out-of-stock cross-axis check', () => {
  it('shows size S as available while colour Red (its real pairing) is selected', () => {
    const { Wrapper } = createWrapper();
    render(<ProductPreviewCard product={product} locale="en" />, { wrapper: Wrapper });

    // Nothing selected yet — the cross-axis check has no other axis to
    // filter by, so S is judged on its own stock alone (S/Red has 5).
    expect(screen.getByRole('button', { name: 'S' })).not.toBeDisabled();
  });

  it('marks size S out-of-stock once colour Blue is selected, even though S has stock in another colour', async () => {
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductPreviewCard product={product} locale="en" />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: 'Colour: Blue' }));

    // Regression: the old check only asked "does any variant with size S
    // have stock, in any colour" — true (S/Red has stock) — and would leave
    // this chip enabled even though S/Blue doesn't exist.
    expect(screen.getByRole('button', { name: 'S' })).toBeDisabled();
    // M is genuinely available with Blue (M/Blue has stock).
    expect(screen.getByRole('button', { name: 'M' })).not.toBeDisabled();
  });

  it('marks colour Red out-of-stock once size M is selected, even though Red has stock in another size', async () => {
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductPreviewCard product={product} locale="en" />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: 'M' }));

    expect(screen.getByRole('button', { name: 'Colour: Red' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Colour: Blue' })).not.toBeDisabled();
  });
});

describe('ProductPreviewCard image selection (fix-list.md #7 broader scope)', () => {
  const productWithImages: Product = {
    ...product,
    images: [
      { id: 'img1', productID: 'p1', url: 'https://example.com/generic.jpg', altEn: 'Front (generic)', altAr: null, sortOrder: 0, color: null },
      { id: 'img2', productID: 'p1', url: 'https://example.com/red.jpg', altEn: 'Red colourway', altAr: null, sortOrder: 1, color: 'Red' },
    ],
  };

  it('shows the generic photo before any swatch is clicked, not the first variant\'s colour', () => {
    // firstVariant is Red — the old `effectiveColor` (defaulted from
    // firstVariant.color for pricing) was also used to filter the card's
    // image, unconditionally, so the generic/lead shot never showed for any
    // product whose first variant had a colour, even before a click.
    const { Wrapper } = createWrapper();
    render(<ProductPreviewCard product={productWithImages} locale="en" />, { wrapper: Wrapper });

    expect(screen.getByRole('img', { name: 'Front (generic)' })).toBeInTheDocument();
  });

  it('swaps to the colour-tagged photo once that swatch is actually clicked', async () => {
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductPreviewCard product={productWithImages} locale="en" />, { wrapper: Wrapper });

    await user.click(screen.getByRole('button', { name: 'Colour: Red' }));

    expect(screen.getByRole('img', { name: 'Red colourway' })).toBeInTheDocument();
  });

  it('advances to the next photo on hover before any swatch is picked, and resets on mouse leave', () => {
    const { Wrapper } = createWrapper();
    render(<ProductPreviewCard product={productWithImages} locale="en" />, { wrapper: Wrapper });
    const mediaWrap = screen.getByRole('img', { name: 'Front (generic)' }).closest('.product-preview-card__media-wrap')!;

    fireEvent.mouseEnter(mediaWrap);
    expect(screen.getByRole('img', { name: 'Red colourway' })).toBeInTheDocument();

    fireEvent.mouseLeave(mediaWrap);
    expect(screen.getByRole('img', { name: 'Front (generic)' })).toBeInTheDocument();
  });
});
