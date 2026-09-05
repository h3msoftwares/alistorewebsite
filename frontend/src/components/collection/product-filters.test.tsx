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
  it('renders inline size/colour/sort selects, a Filters fallback button, and a pin toggle', () => {
    renderFilters();
    // Drawer copies are aria-hidden while closed, so role queries see one of each.
    expect(screen.getByRole('combobox', { name: 'Size' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Colour' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin the filter bar/i })).toBeInTheDocument();
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

  it('the pin toggle flips its pressed state and the pinned flag', async () => {
    const user = userEvent.setup();
    const { container } = renderFilters();

    const pin = screen.getByRole('button', { name: /pin the filter bar/i });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.product-filters-wrap')).not.toHaveAttribute('data-filters-pinned');

    await user.click(pin);
    const unpin = screen.getByRole('button', { name: /unpin the filter bar/i });
    expect(unpin).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.product-filters-wrap')).toHaveAttribute('data-filters-pinned');
  });
});
