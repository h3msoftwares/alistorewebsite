import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ProductFilters } from './product-filters';

function renderFilters() {
  const { Wrapper } = createWrapper();
  return render(<ProductFilters locale="en" sizes={['S', 'M']} colors={['Red']} />, { wrapper: Wrapper });
}

describe('ProductFilters', () => {
  it('renders the size / colour / sort dropdowns inline', () => {
    renderFilters();
    expect(screen.getByRole('combobox', { name: 'Size' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Colour' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    // No `categories` prop, so no Category dropdown.
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument();
  });

  it('picking a size shows a Clear control that resets the filters', async () => {
    const user = userEvent.setup();
    renderFilters();

    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();

    const sizeSelect = screen.getByRole('combobox', { name: 'Size' });
    await user.selectOptions(sizeSelect, 'S');
    expect(sizeSelect).toHaveValue('S');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveValue('');
  });
});
