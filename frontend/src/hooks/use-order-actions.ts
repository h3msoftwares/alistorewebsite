'use client';

import { useState } from 'react';
import { useUpdateOrderStatus, useReviewOrder, useCorrectOrderStatus } from '@/hooks/use-orders';
import { usePermissions } from '@/lib/rbac';
import { useReturnPermissions } from '@/hooks/use-return-permissions';
import { useStepUp } from '@/hooks/use-auth';
import { isApiError } from '@/lib/api';
import type { Order, OrderStatus } from '@/lib/types';

// The status-changer <Select>'s full option list — shared by the Orders
// list and the order detail page so both offer the exact same transitions.
export const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

export function normalOrderStatuses(current: OrderStatus): OrderStatus[] {
  if (current === 'CANCELLED' || current === 'RETURNED') return [current];
  const next: Partial<Record<OrderStatus, OrderStatus>> = { PENDING: 'CONFIRMED', CONFIRMED: 'SHIPPED', SHIPPED: 'DELIVERED' };
  return [current, ...(next[current] ? [next[current]!] : []), 'CANCELLED', 'RETURNED'];
}

// Status changes that get a confirmation modal (both are effectively
// terminal; CANCELLED also restocks + emails the customer).
const CONFIRM_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];

/** What the admin is mid-way through doing — drives which modal is open. */
export type PendingOrderAction =
  | { kind: 'correction'; order: Order }
  | { kind: 'confirm'; order: Order; status: OrderStatus }
  | { kind: 'days'; order: Order; status: OrderStatus; mode: 'ship' | 'edit' };

export interface OrderActionMessages {
  statusChangeFailed: string;
  updateFailed: string;
  daysRangeError: string;
  incorrectPassword: string;
}

/**
 * Order status/payment/review action logic — shared by the admin Orders
 * list (one row at a time) and the admin order detail page (a single
 * order), so both drive the exact same confirm/ship-days/step-up-retry
 * behavior instead of two hand-copied implementations that could drift.
 * i18n-agnostic on purpose: callers pass already-translated `messages`,
 * mirroring how `failMsg` was already threaded through call by call before
 * this was extracted.
 */
export function useOrderActions(messages: OrderActionMessages) {
  const { has } = usePermissions();
  const canCorrect = has('orders:manage') && has('order_corrections:manage');
  const returnPermissions = useReturnPermissions();
  const { canReturnWholeOrder } = returnPermissions;
  const availableOrderStatuses = (current: OrderStatus) => normalOrderStatuses(current)
    .filter(status => status !== 'RETURNED' || status === current || canReturnWholeOrder);
  const correctionStatuses = ORDER_STATUSES.filter(status => status !== 'RETURNED' || canReturnWholeOrder);
  const correctStatus = useCorrectOrderStatus();
  const [correctionStatus, setCorrectionStatus] = useState<OrderStatus>('PENDING');
  const [correctionReason, setCorrectionReason] = useState('');
  const updateStatus = useUpdateOrderStatus();
  const reviewOrder = useReviewOrder();
  const stepUp = useStepUp();

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOrderAction | null>(null);
  const [daysInput, setDaysInput] = useState('');
  const [daysError, setDaysError] = useState<string | null>(null);
  const [stepUpPrompt, setStepUpPrompt] = useState<{ id: string; fn: () => Promise<unknown>; failMsg: string } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, failMsg: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      if (isApiError(e) && e.code === 'STEP_UP_REQUIRED') {
        setStepUpPrompt({ id, fn, failMsg });
      } else {
        setActionError(e instanceof Error ? e.message : failMsg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const closeStepUp = () => {
    setStepUpPrompt(null);
    setStepUpPassword('');
    setStepUpError(null);
  };

  const submitStepUp = async () => {
    if (!stepUpPrompt) return;
    setStepUpError(null);
    try {
      await stepUp.mutateAsync(stepUpPassword);
    } catch {
      setStepUpError(messages.incorrectPassword);
      return;
    }
    const { id, fn, failMsg } = stepUpPrompt;
    closeStepUp();
    await run(id, fn, failMsg);
  };

  const openDaysModal = (o: Order, mode: 'ship' | 'edit') => {
    setDaysInput(o.estimatedDeliveryDays != null ? String(o.estimatedDeliveryDays) : '');
    setDaysError(null);
    setPending({ kind: 'days', order: o, status: mode === 'ship' ? 'SHIPPED' : o.status, mode });
  };

  // Called from a status <Select>. Confirmable statuses and the first move
  // to SHIPPED open a modal; everything else applies immediately.
  const changeStatus = (o: Order, next: OrderStatus) => {
    if (next === o.status) return;
    if (!availableOrderStatuses(o.status).includes(next)) {
      setActionError(messages.statusChangeFailed);
      return;
    }
    if (CONFIRM_STATUSES.includes(next)) {
      setPending({ kind: 'confirm', order: o, status: next });
      return;
    }
    if (next === 'SHIPPED') {
      openDaysModal(o, 'ship');
      return;
    }
    run(o.id, () => updateStatus.mutateAsync({ id: o.id, status: next }), messages.statusChangeFailed);
  };

  const closeModal = () => setPending(null);

  const confirmStatusChange = async () => {
    if (pending?.kind !== 'confirm') return;
    const { order, status: next } = pending;
    if (next === 'RETURNED' && !canReturnWholeOrder) return;
    closeModal();
    await run(order.id, () => updateStatus.mutateAsync({ id: order.id, status: next }), messages.statusChangeFailed);
  };

  const submitDays = async () => {
    if (pending?.kind !== 'days') return;
    const trimmed = daysInput.trim();
    let estimatedDeliveryDays: number | null;
    if (trimmed === '') {
      estimatedDeliveryDays = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || n > 90) {
        setDaysError(messages.daysRangeError);
        return;
      }
      estimatedDeliveryDays = n;
    }
    const { order, status: next } = pending;
    closeModal();
    await run(order.id, () => updateStatus.mutateAsync({ id: order.id, status: next, estimatedDeliveryDays }), messages.updateFailed);
  };

  const markReviewed = (o: Order) => run(o.id, () => reviewOrder.mutateAsync(o.id), messages.updateFailed);

  const openCorrection = (order: Order) => {
    if (!canCorrect || ['CANCELLED', 'RETURNED'].includes(order.status)) return;
    setCorrectionStatus(order.status);
    setCorrectionReason('');
    setPending({ kind: 'correction', order });
  };
  const submitCorrection = async () => {
    if (!canCorrect || pending?.kind !== 'correction' || !correctionReason.trim() || correctionStatus === pending.order.status) return;
    if (correctionStatus === 'RETURNED' && !canReturnWholeOrder) return;
    const { order } = pending;
    const body = { id: order.id, status: correctionStatus, expectedStatus: order.status, reason: correctionReason.trim() };
    closeModal();
    await run(order.id, () => correctStatus.mutateAsync(body), messages.statusChangeFailed);
  };

  return {
    ...returnPermissions, availableOrderStatuses, correctionStatuses,
    canCorrect, openCorrection, submitCorrection, correctionStatus, setCorrectionStatus, correctionReason, setCorrectionReason,
    actionError,
    busyId,
    pending,
    daysInput,
    setDaysInput,
    daysError,
    stepUpPrompt,
    stepUpPassword,
    setStepUpPassword,
    stepUpError,
    stepUpPending: stepUp.isPending,
    run,
    changeStatus,
    openDaysModal,
    closeModal,
    confirmStatusChange,
    submitDays,
    closeStepUp,
    submitStepUp,
    markReviewed,
  };
}

export type OrderActionsApi = ReturnType<typeof useOrderActions>;
