'use client';

import { Alert, Button, ConfirmModal, Field, Input, Modal } from '@/components/ui';
import type { OrderActionsApi } from '@/hooks/use-order-actions';

/**
 * The three modals a status/payment action can open — confirm-before-apply
 * for CANCELLED/RETURNED, the ship/edit delivery-estimate form, and the
 * step-up password re-check. Shared by the admin Orders list and the order
 * detail page so both drive identical modals off the same `useOrderActions`
 * state instead of two hand-copied JSX blocks.
 */
export function OrderActionModals({ locale, oa }: { locale: 'en' | 'ar'; oa: OrderActionsApi }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { pending, stepUpPrompt } = oa;

  return (
    <>
      <ConfirmModal
        open={pending?.kind === 'confirm'}
        onClose={oa.closeModal}
        onConfirm={() => void oa.confirmStatusChange()}
        title={
          pending?.kind === 'confirm'
            ? pending.status === 'CANCELLED'
              ? t('Cancel this order?', 'إلغاء هذا الطلب؟')
              : t('Mark this order as returned?', 'وضع علامة "مُرتجَع" على هذا الطلب؟')
            : ''
        }
        body={
          pending?.kind === 'confirm'
            ? pending.status === 'CANCELLED'
              ? t(
                  `Order ${pending.order.orderNumber} will be cancelled — its items go back into stock and the customer is emailed.`,
                  `سيُلغى الطلب ${pending.order.orderNumber} — تُعاد قطعه إلى المخزون ويُرسَل بريد إلى الزبون.`
                )
              : t(
                  `Order ${pending.order.orderNumber} will be marked as returned.`,
                  `سيوضع على الطلب ${pending.order.orderNumber} علامة "مُرتجَع".`
                )
            : ''
        }
        confirmLabel={
          pending?.kind === 'confirm'
            ? pending.status === 'CANCELLED'
              ? t('Cancel order', 'إلغاء الطلب')
              : t('Mark returned', 'وضع علامة مُرتجَع')
            : ''
        }
        cancelLabel={t('Keep as is', 'الإبقاء كما هو')}
        tone={pending?.kind === 'confirm' && pending.status === 'CANCELLED' ? 'danger' : 'default'}
      />

      {pending?.kind === 'days' && (
        <Modal open onClose={oa.closeModal} title={t('Delivery estimate', 'مدة التوصيل المتوقعة')} closeLabel={t('Close', 'إغلاق')}>
          <form
            className="admin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void oa.submitDays();
            }}
          >
            <h2 className="admin-modal__title">
              {pending.mode === 'ship'
                ? t(`Ship order ${pending.order.orderNumber}`, `شحن الطلب ${pending.order.orderNumber}`)
                : t(`Delivery estimate — ${pending.order.orderNumber}`, `مدة التوصيل — ${pending.order.orderNumber}`)}
            </h2>
            <Field
              label={t('Arrives in about (days)', 'يصل خلال (أيام)')}
              hint={t(
                'Leave blank if unknown. Shown to the customer in the shipped email.',
                'اتركه فارغًا إن لم يكن معروفًا. يظهر للزبون في بريد الشحن.'
              )}
              error={oa.daysError ?? undefined}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  max={90}
                  step={1}
                  inputMode="numeric"
                  value={oa.daysInput}
                  onChange={(e) => oa.setDaysInput(e.target.value)}
                  placeholder={t('e.g. 3', 'مثال: 3')}
                />
              )}
            </Field>
            <div className="admin-modal__actions">
              <Button type="button" variant="ghost" onClick={oa.closeModal}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button type="submit" variant="primary">
                {pending.mode === 'ship' ? t('Ship order', 'شحن الطلب') : t('Save estimate', 'حفظ المدة')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {stepUpPrompt && (
        <Modal open onClose={oa.closeStepUp} title={t('Re-enter your password', 'أعد إدخال كلمة المرور')} closeLabel={t('Close', 'إغلاق')}>
          <form
            className="admin-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void oa.submitStepUp();
            }}
          >
            <h2 className="admin-modal__title">{t('Re-enter your password', 'أعد إدخال كلمة المرور')}</h2>
            <p className="admin-modal__body">
              {t(
                'Your session needs a fresh password check before making this change.',
                'يحتاج جلستك إلى تحقق حديث من كلمة المرور قبل إجراء هذا التغيير.'
              )}
            </p>
            <Field label={t('Password', 'كلمة المرور')}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoFocus
                  value={oa.stepUpPassword}
                  onChange={(e) => oa.setStepUpPassword(e.target.value)}
                  disabled={oa.stepUpPending}
                />
              )}
            </Field>
            {oa.stepUpError && <Alert tone="danger">{oa.stepUpError}</Alert>}
            <div className="admin-modal__actions">
              <Button type="button" variant="ghost" onClick={oa.closeStepUp} disabled={oa.stepUpPending}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button type="submit" variant="primary" loading={oa.stepUpPending} disabled={!oa.stepUpPassword}>
                {t('Confirm', 'تأكيد')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
