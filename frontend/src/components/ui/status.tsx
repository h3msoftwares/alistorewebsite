export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

const LABELS: Record<OrderStatus, { en: string; ar: string }> = {
  PENDING: { en: 'Pending', ar: 'قيد الانتظار' },
  CONFIRMED: { en: 'Confirmed', ar: 'مؤكد' },
  SHIPPED: { en: 'Shipped', ar: 'تم الشحن' },
  DELIVERED: { en: 'Delivered', ar: 'تم التوصيل' },
  CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
  RETURNED: { en: 'Returned', ar: 'مُرتجع' },
};

export interface StatusPillProps {
  status: OrderStatus;
  locale?: 'en' | 'ar';
}

/** Order-status pill on the .status--* classes. Colour is backed by a dot +
 *  text label (never colour alone). Maps the backend OrderStatus enum. */
export function StatusPill({ status, locale = 'en' }: StatusPillProps) {
  return (
    <span className={`status status--${status.toLowerCase()}`}>{LABELS[status][locale]}</span>
  );
}
