import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariantsMatrix, type DraftVariantRow } from './variants-matrix';

function row(over: Partial<DraftVariantRow>): DraftVariantRow {
  return { key: over.sku ?? 'k', sku: '', size: '', color: '', priceOverride: '', stockQuantity: '0', ...over };
}

const rows: DraftVariantRow[] = [
  row({ key: 'r1', sku: 'ALPHA-M', size: 'M', stockQuantity: '5' }),
  row({ key: 'r2', sku: 'ALPHA-L', size: 'L', stockQuantity: '3' }),
];

function renderMatrix(onChange = vi.fn()) {
  render(<VariantsMatrix rows={rows} onChange={onChange} locale="en" minRows={1} />);
  return onChange;
}

describe('<VariantsMatrix>', () => {
  it('does not show the bulk-edit panel until a row is selected', () => {
    renderMatrix();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
    expect(screen.getByText(/Select rows below to bulk-edit/)).toBeInTheDocument();
  });

  it('selecting a row reveals the bulk-edit panel with a selection count', async () => {
    const user = userEvent.setup();
    renderMatrix();

    await user.click(screen.getAllByRole('checkbox', { name: 'Select this variant' })[0]);

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Apply' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Delete \(1\)/ })).toBeInTheDocument();
  });

  it('applying a bulk stock value updates only the selected rows', async () => {
    const user = userEvent.setup();
    const onChange = renderMatrix();

    const checkboxes = screen.getAllByRole('checkbox', { name: 'Select this variant' });
    await user.click(checkboxes[0]);

    await user.type(screen.getByLabelText('Stock'), '20');
    await user.click(screen.getAllByRole('button', { name: 'Apply' })[0]);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ key: 'r1', stockQuantity: '20' }),
      expect.objectContaining({ key: 'r2', stockQuantity: '3' }),
    ]);
  });

  it('"Select all" selects every row and updates the count', async () => {
    const user = userEvent.setup();
    renderMatrix();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('deleting selected rows removes them and hides the bulk-edit panel again', async () => {
    const user = userEvent.setup();
    const onChange = renderMatrix();

    await user.click(screen.getAllByRole('checkbox', { name: 'Select this variant' })[0]);
    await user.click(screen.getByRole('button', { name: /Delete/ }));

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ key: 'r2' })]);
  });

  it('picking a colour from the wheel and generating adds it as a hex-valued row', async () => {
    const user = userEvent.setup();
    const onChange = renderMatrix();

    fireEvent.change(screen.getByLabelText('Add colour'), { target: { value: '#ff0000' } });
    await user.type(screen.getByPlaceholderText('e.g. S, M, L'), 'XL');
    await user.click(screen.getByRole('button', { name: 'Generate matrix' }));

    expect(onChange).toHaveBeenCalledWith([
      ...rows,
      expect.objectContaining({ size: 'XL', color: '#ff0000' }),
    ]);
  });
});
