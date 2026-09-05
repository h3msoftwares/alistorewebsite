import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminListControls } from './admin-list-controls';

describe('AdminListControls', () => {
  it('pushes the (debounced) search value up', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(
      <AdminListControls
        search=""
        onSearchChange={onSearchChange}
        status="active"
        onStatusChange={() => {}}
        locale="en"
      />
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'shirt');
    await waitFor(() => expect(onSearchChange).toHaveBeenCalledWith('shirt'));
  });

  it('reports the chosen status', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <AdminListControls
        search=""
        onSearchChange={() => {}}
        status="active"
        onStatusChange={onStatusChange}
        locale="en"
      />
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status filter' }), 'archived');
    expect(onStatusChange).toHaveBeenCalledWith('archived');
  });
});
