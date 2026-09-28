import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderReturnIndicators } from './order-return-indicators';
import type { OrderReturnIndicators as Indicators } from '@/lib/types';

const mixed: Indicators = { returnStatus: 'PARTIALLY_RETURNED', refundStatus: 'PARTIALLY_MARKED', hasReturn: true,
  orderedUnits: 5, originalMerchandiseCents: 10000, activeReturns: 3, inProgressReturns: 1, inProgressUnits: 1,
  pendingRefundCents: 2000, physicallyReturnedUnits: 3, awaitingMarkingReturns: 1, awaitingMarkingCents: 3000,
  markedReturns: 1, markedUnits: 2, markedRefundCents: 4000 };

it('shows pending, received-awaiting-marking and marked amounts together', () => {
  render(<OrderReturnIndicators indicators={mixed} locale="en" customer />);
  expect(screen.getByText('Partially returned · 3 of 5 units')).toBeInTheDocument();
  expect(screen.getByText('Partially marked refunded')).toBeInTheDocument();
  expect(screen.getByText('Return in progress: 1 units · pending amount $20.00')).toBeInTheDocument();
  expect(screen.getByText('Marked refunded: $40.00 of $100.00')).toBeInTheDocument();
  expect(screen.getByText('Received returns awaiting refund marking: $30.00')).toBeInTheDocument();
  expect(screen.getByText(/does not confirm that you received money/)).toBeInTheDocument();
});

it('uses Arabic wording and currency formatting', () => {
  render(<OrderReturnIndicators indicators={mixed} locale="ar" />);
  expect(screen.getByText('مرتجع جزئيًا · 3 من 5 وحدات')).toBeInTheDocument();
  expect(screen.getByText('معلّم كمسترد جزئيًا')).toBeInTheDocument();
  expect(screen.getByText(/مستلمة بانتظار تعليم الاسترداد/)).toBeInTheDocument();
  expect(screen.getByText(/ليس إثبات دفع/)).toBeInTheDocument();
});

it('shows the absence of both kinds of activity explicitly', () => {
  render(<OrderReturnIndicators indicators={{ ...mixed, returnStatus: 'NONE', refundStatus: 'NONE', hasReturn: false,
    inProgressReturns: 0, physicallyReturnedUnits: 0, markedReturns: 0, awaitingMarkingReturns: 0 }} locale="en" compact />);
  expect(screen.getAllByText('None')).toHaveLength(2);
});
