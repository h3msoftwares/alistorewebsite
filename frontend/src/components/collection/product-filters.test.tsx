import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ProductFilters } from './product-filters';

function renderFilters() {
  const { Wrapper } = createWrapper();
  return render(<ProductFilters locale="en" sizes={['S', 'M']} colors={['Red']} />, { wrapper: Wrapper });
}

describe('ProductFilters', () => {
  it('shows only the Filters button + inline Sort in the toolbar (rest is in the drawer)', () => {
    renderFilters();
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    // Size/colour chips live in the closed (aria-hidden) drawer — not exposed yet.
    expect(screen.queryByRole('button', { name: 'S' })).not.toBeInTheDocument();
  });

  it('opens the drawer from the Filters button and exposes the size/colour/price controls', async () => {
    const user = userEvent.setup();
    renderFilters();

    await user.click(screen.getByRole('button', { name: /filters/i }));

    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('button', { name: 'S' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Red' })).toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton', { name: 'Minimum price' })).toBeInTheDocument();
  });

  it('shows a "Clear filters" control once a filter is active, and it resets them', async () => {
    const user = userEvent.setup();
    renderFilters();

    await user.click(screen.getByRole('button', { name: /filters/i }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'S' }));
    expect(within(dialog).getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Clear filters' }));
    expect(within(dialog).queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'false');
  });
});
