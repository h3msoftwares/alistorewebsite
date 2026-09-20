import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeProductCard } from './home-card';
import type { Product } from '@/lib/types';

const product: Product = {
  id: 'p1',
  sku: 'SKU1',
  nameEn: 'Test Shirt',
  nameAr: 'قميص',
  primaryCategoryID: 'cat1',
  price: '30.00',
  effectivePrice: 30,
  onSale: false,
  isRestocked: false,
  isActive: true,
  dateCreated: '2026-01-01T00:00:00.000Z',
  lastEdit: '2026-01-01T00:00:00.000Z',
  images: [
    { id: 'img1', productID: 'p1', url: 'https://example.com/generic.jpg', altEn: 'Front (generic)', altAr: null, sortOrder: 0, color: null },
    { id: 'img2', productID: 'p1', url: 'https://example.com/red.jpg', altEn: 'Red colourway', altAr: null, sortOrder: 1, color: 'Red' },
  ],
  // The first (and only listed-first) variant is Red — the old `activeColor`
  // default (selectedColor ?? colors[0]) fed straight into the gallery pick,
  // so the generic/lead shot never showed before a click for any product
  // whose first colour had a tagged photo (fix-list.md #7 broader scope).
  variants: [
    { id: 'v1', productID: 'p1', sku: 'SKU1-1', size: 'S', color: 'Red', stockQuantity: 5 },
    { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: 'M', color: 'Blue', stockQuantity: 5 },
  ],
};

describe('HomeProductCard image selection (fix-list.md #7 broader scope)', () => {
  it('shows the generic photo before any swatch is clicked, not the first variant\'s colour', () => {
    render(<HomeProductCard product={product} locale="en" />);
    expect(screen.getByRole('img', { name: 'Front (generic)' })).toBeInTheDocument();
  });

  it('swaps to the colour-tagged photo once that swatch is actually clicked', async () => {
    const user = userEvent.setup();
    render(<HomeProductCard product={product} locale="en" />);

    await user.click(screen.getByRole('button', { name: 'Colour: Red' }));

    expect(screen.getByRole('img', { name: 'Red colourway' })).toBeInTheDocument();
  });

  it('advances to the next photo on hover before any swatch is picked (regression: a lone generic photo used to leave nothing to cycle through)', () => {
    render(<HomeProductCard product={product} locale="en" />);
    const media = screen.getByRole('img', { name: 'Front (generic)' }).closest('a')!;

    fireEvent.mouseEnter(media);
    expect(screen.getByRole('img', { name: 'Red colourway' })).toBeInTheDocument();

    fireEvent.mouseLeave(media);
    expect(screen.getByRole('img', { name: 'Front (generic)' })).toBeInTheDocument();
  });
});
