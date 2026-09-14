import { formatCurrency } from '@/lib/format';
import { regionLabel } from '@/lib/regions';
import type { ReceiptFormat } from '@/lib/print-preferences';
import type { Order } from '@/lib/types';

type Locale = 'en' | 'ar';

/**
 * Printable COD delivery receipt — hidden on screen, shown only by the
 * `.order-receipt` `@media print` rules in globals.css, triggered from the
 * admin Orders page's "Print receipt" button via `window.print()`. Handed
 * to the courier/admin to give the customer when cash is collected on
 * delivery, so it covers exactly what a physical receipt needs: what was
 * bought, what's owed, and where it's going — no PDF library, the
 * browser's own print dialog already offers "Save as PDF".
 *
 * `format` picks between the full-page layout and a narrow, supermarket/
 * thermal-roll-style one (`.order-receipt--compact` in globals.css) — the
 * admin's saved per-device preference, not something this component
 * decides on its own.
 */
export function OrderReceipt({
  order,
  locale,
  brandName,
  format = 'standard',
}: {
  order: Order;
  locale: Locale;
  brandName: string;
  format?: ReceiptFormat;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);
  const date = new Date(order.dateCreated).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const discount = Number(order.discountAmount ?? 0);

  return (
    <div
      className={format === 'compact' ? 'order-receipt order-receipt--compact' : 'order-receipt'}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="order-receipt__head">
        <h1>{brandName}</h1>
        <p>{t('Delivery receipt', 'إيصال التوصيل')}</p>
      </div>

      <div className="order-receipt__meta">
        <span>
          {t('Order', 'الطلب')} <strong>{order.orderNumber}</strong>
        </span>
        <span>
          {t('Date', 'التاريخ')} <strong>{date}</strong>
        </span>
      </div>

      <div className="order-receipt__customer">
        <strong>{order.deliveryName}</strong>
        <br />
        {order.deliveryAddress}
        {[order.deliveryArea, order.deliveryCity, order.deliveryRegion ? regionLabel(order.deliveryRegion, locale) : null]
          .filter(Boolean)
          .map((part) => `, ${part}`)
          .join('')}
        <br />
        {t('Phone', 'الهاتف')}: {order.deliveryPhone}
        {order.deliveryNotes && (
          <>
            <br />
            {t('Notes', 'ملاحظات')}: {order.deliveryNotes}
          </>
        )}
      </div>

      <table className="order-receipt__items">
        <thead>
          <tr>
            <th>{t('Item', 'المنتج')}</th>
            <th className="is-numeric">{t('Qty', 'الكمية')}</th>
            <th className="is-numeric">{t('Price', 'السعر')}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => {
            const variantBits = [i.size, i.color].filter(Boolean).join(' / ');
            return (
              <tr key={i.id}>
                <td>
                  {i.productName}
                  {variantBits ? ` (${variantBits})` : ''}
                </td>
                <td className="is-numeric">{i.quantity}</td>
                <td className="is-numeric">{money(Number(i.lineTotal))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="order-receipt__totals">
        <div>
          <span>{t('Subtotal', 'المجموع الفرعي')}</span>
          <span>{money(Number(order.subtotal))}</span>
        </div>
        {discount > 0 && (
          <div>
            <span>
              {t('Discount', 'الخصم')}
              {order.couponCode ? ` (${order.couponCode})` : ''}
            </span>
            <span>−{money(discount)}</span>
          </div>
        )}
        <div>
          <span>{t('Delivery', 'التوصيل')}</span>
          <span>{Number(order.deliveryFee) === 0 ? t('Free', 'مجاني') : money(Number(order.deliveryFee))}</span>
        </div>
        <div className="order-receipt__grand-total">
          <span>{order.paymentStatus === 'COLLECTED' ? t('Total paid', 'الإجمالي المدفوع') : t('Amount due', 'المبلغ المستحق')}</span>
          <span>{money(Number(order.total))}</span>
        </div>
      </div>

      <p className="order-receipt__payment">{t('Payment method: Cash on Delivery', 'طريقة الدفع: الدفع عند الاستلام')}</p>
      <p className="order-receipt__thanks">
        {t(`Thank you for shopping with ${brandName}!`, `شكرًا لتسوقكم مع ${brandName}!`)}
      </p>
    </div>
  );
}
