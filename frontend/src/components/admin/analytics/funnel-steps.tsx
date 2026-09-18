import type { FunnelStep } from '@/lib/types';

const LABELS: Record<string, { en: string; ar: string }> = {
  view_item: { en: 'Product views', ar: 'مشاهدات المنتج' },
  add_to_cart: { en: 'Added to cart', ar: 'أُضيف إلى السلة' },
  begin_checkout: { en: 'Began checkout', ar: 'بدأ إتمام الشراء' },
  purchase: { en: 'Purchased', ar: 'تم الشراء' },
};

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

/** Visitor → view → cart → checkout → purchase, as proportional bars with the
 *  step-to-step conversion rate. Pure layout — no chart library needed. */
export function FunnelSteps({ steps, isAr }: { steps: FunnelStep[]; isAr: boolean }) {
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const top = steps[0]?.count ?? 0;
  return (
    <ol className="funnel">
      {steps.map((s) => {
        const width = top > 0 ? Math.max(4, (s.count / top) * 100) : 0;
        const label = LABELS[s.step];
        return (
          <li key={s.step} className="funnel__step">
            <div className="funnel__row">
              <span className="funnel__label">{label ? t(label.en, label.ar) : s.step}</span>
              <span className="funnel__count">{s.count.toLocaleString()}</span>
            </div>
            <div className="funnel__track">
              <div className="funnel__bar" style={{ width: `${width}%` }} />
            </div>
            <span className="funnel__rate">
              {t(
                `${pct(s.conversionFromPrevious)} from previous · ${pct(s.conversionFromTop)} of views`,
                `${pct(s.conversionFromPrevious)} من السابقة · ${pct(s.conversionFromTop)} من المشاهدات`
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
