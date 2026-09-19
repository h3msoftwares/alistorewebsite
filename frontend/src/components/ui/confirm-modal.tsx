'use client';

import type { ReactNode } from 'react';
import { Modal } from './modal';
import { Button } from './button';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Required (not defaulted) — there's no shared translation dictionary in
   *  this app, so a default here would silently render English to Arabic
   *  locale users with no compiler/lint signal to catch a caller that forgot
   *  to pass a bilingual label. */
  cancelLabel: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
}

/**
 * Formalizes the `.admin-modal` confirm-dialog convention the Orders page
 * already hand-rolls (status-change/delivery-days confirms) into a reusable
 * component, so other pages stop falling back to `window.confirm()` — which
 * looks nothing like the rest of the admin UI.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="admin-modal">
        <h2 className="admin-modal__title">{title}</h2>
        <p className="admin-modal__body">{body}</p>
        <div className="admin-modal__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
