import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MerchandiseBreakdown } from './merchandise-breakdown';

it('shows separate quantities and exact marked-refund/net cents in a breakdown', () => {
  render(<MerchandiseBreakdown isAr={false} rows={[{
    label: 'Blue / M', units: 4, revenue: 36, merchandiseValue: 50.4,
    merchandiseMarkedRefunded: 14.4, netMerchandiseValue: 36,
    receivedReturnsAwaitingRefundMarking: 0, orderedUnits: 7, physicallyReturnedUnits: 3, retainedUnits: 4,
  }]} />);
  const headers = screen.getAllByRole('columnheader').map((el) => el.textContent);
  expect(headers).toEqual(['Group', 'Ordered units', 'Physically returned units', 'Retained units',
    'Marked refunded', 'Net merchandise value after marked refunds']);
  const row = screen.getByText('Blue / M').closest('tr')!;
  expect(within(row).getAllByRole('cell').map((el) => el.textContent)).toEqual(['Blue / M', '7', '3', '4', '$14.40', '$36.00']);
});
