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
  it('renders the inline panel controls (the drawer copy is aria-hidden while closed)', () => {
    renderFilters();
    // Role queries ignore aria-hidden subtrees, so the drawer's closed copy
    // of the same controls doesn't create duplicate matches here.
    expect(screen.getByRole('button', { name: 'S' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
  });

  it('opens the filters drawer from the trigger and exposes the same controls inside it', async () => {
    const user = userEvent.setup();
    renderFilters();

    await user.click(screen.getByRole('button', { name: /filters/i }));

    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('button', { name: 'S' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Red' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
  });

  it('shows a "Clear filters" control once a filter is active, and it resets them', async () => {
    const user = userEvent.setup();
    renderFilters();

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'S' }));
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'false');
  });
});
