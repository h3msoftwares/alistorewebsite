import type { FunnelStep } from '@/lib/types';

const LABELS: Record<string, string> = {
  view_item: 'Product views',
  add_to_cart: 'Added to cart',
  begin_checkout: 'Began checkout',
  purchase: 'Purchased',
};

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

/** Visitor → view → cart → checkout → purchase, as proportional bars with the
 *  step-to-step conversion rate. Pure layout — no chart library needed. */
export function FunnelSteps({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.count ?? 0;
  return (
    <ol className="funnel">
      {steps.map((s) => {
        const width = top > 0 ? Math.max(4, (s.count / top) * 100) : 0;
        return (
          <li key={s.step} className="funnel__step">
            <div className="funnel__row">
              <span className="funnel__label">{LABELS[s.step] ?? s.step}</span>
              <span className="funnel__count">{s.count.toLocaleString()}</span>
            </div>
            <div className="funnel__track">
              <div className="funnel__bar" style={{ width: `${width}%` }} />
            </div>
            <span className="funnel__rate">
              {pct(s.conversionFromPrevious)} from previous · {pct(s.conversionFromTop)} of views
            </span>
          </li>
        );
      })}
    </ol>
  );
}
