import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { vi } from 'vitest';
import {
  ProductCoreFields,
  productCoreSchema,
  productCoreDefaults,
  saleNeedsValue,
  type ProductCoreValues,
} from './product-form';

vi.mock('@/hooks/use-catalog', () => ({
  useAdminCategories: () => ({ data: [] }),
  useCollections: () => ({ data: [] }),
}));

function Harness({ isEditing }: { isEditing?: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = useForm<ProductCoreValues>({ resolver: zodResolver(productCoreSchema), defaultValues: productCoreDefaults });
  return (
    <ProductCoreFields
      register={register}
      control={control}
      errors={errors}
      busy={false}
      locale="en"
      isEditing={isEditing}
    />
  );
}

describe('ProductCoreFields', () => {
  it('has no Compare-at-price field — only the real sale (type + value) is editable', () => {
    render(<Harness />);
    expect(screen.queryByLabelText(/compare-at/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sale type')).toBeInTheDocument();
    expect(screen.getByLabelText('Sale value')).toBeInTheDocument();
  });

  it('does not require a Compare-at-price key on the defaults/values object', () => {
    expect(productCoreDefaults).not.toHaveProperty('compareAtPrice');
  });

  it('omits the "Restocked" toggle on create (no isEditing) — a new product has no restock history', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Restocked')).not.toBeInTheDocument();
  });

  it('shows the "Restocked" toggle when editing an existing product', () => {
    render(<Harness isEditing />);
    expect(screen.getByLabelText('Restocked')).toBeInTheDocument();
  });

  it('auto-fills the SKU from the name on create, and stops once the admin types their own', () => {
    render(<Harness />);
    const sku = screen.getByLabelText(/^SKU/) as HTMLInputElement;
    fireEvent.change(screen.getByLabelText(/Name \(English\)/), { target: { value: 'Linen Summer Dress' } });
    expect(sku.value).toMatch(/^LSD-\d{4}$/);

    fireEvent.change(sku, { target: { value: 'MY-OWN' } });
    fireEvent.change(screen.getByLabelText(/Name \(English\)/), { target: { value: 'Silk Scarf' } });
    expect(sku.value).toBe('MY-OWN');

    // The wand regenerates on demand.
    fireEvent.click(screen.getByRole('button', { name: 'Generate SKU' }));
    expect(sku.value).toMatch(/^SSI-\d{4}$/);
  });

  it('never changes the SKU on its own when editing', () => {
    render(<Harness isEditing />);
    const sku = screen.getByLabelText(/^SKU/) as HTMLInputElement;
    fireEvent.change(screen.getByLabelText(/Name \(English\)/), { target: { value: 'Linen Summer Dress' } });
    expect(sku.value).toBe('');
  });
});

describe('saleNeedsValue', () => {
  it('is satisfied when no sale type is set, regardless of value', () => {
    expect(saleNeedsValue({ saleType: '', saleValue: '' })).toBe(true);
  });

  it('requires a value once a sale type is chosen', () => {
    expect(saleNeedsValue({ saleType: 'PERCENT', saleValue: '' })).toBe(false);
    expect(saleNeedsValue({ saleType: 'PERCENT', saleValue: '20' })).toBe(true);
  });
});

describe('productCoreSchema', () => {
  const base = { ...productCoreDefaults, nameEn: 'x', nameAr: 'x', sku: 'SKU1', primaryCategoryId: 'c1', price: 10 };

  it('rejects a sale type with no sale value', () => {
    const result = productCoreSchema.safeParse({ ...base, saleType: 'PERCENT', saleValue: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a sale type with a value', () => {
    const result = productCoreSchema.safeParse({ ...base, saleType: 'PERCENT', saleValue: '20' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive price', () => {
    const result = productCoreSchema.safeParse({ ...base, price: 0 });
    expect(result.success).toBe(false);
  });
});
