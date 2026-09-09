import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esc } from '../../src/lib/mailer';

describe('mailer HTML escaping (pentest H1)', () => {
  it('esc() neutralises every HTML-significant character', () => {
    expect(esc(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(esc(`" onmouseover="alert(1)`)).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(esc(`Ben & Jerry's`)).toBe('Ben &amp; Jerry&#39;s');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  // Static guard: inside any HTML template literal (a backtick string that
  // contains a `<` tag), every customer-controlled interpolation must be
  // wrapped in esc(). This is what stops a `<script>` in a delivery name /
  // address / notes from executing in the order emails.
  it('no HTML template interpolates a raw order/customer field', () => {
    const src = readFileSync(join(__dirname, '../../src/lib/mailer.ts'), 'utf8');
    // crude but effective: split into `...` template literals, keep the ones
    // that look like HTML, and scan them for un-esc'd ${order. / ${itemLabel /
    // ${deliveryLine / ${i.variantSKU / ${*Url}.
    const templates = src.match(/`[^`]*`/gs) ?? [];
    const offenders: string[] = [];
    for (const tpl of templates) {
      if (!/<\w/.test(tpl)) continue; // not an HTML template
      // Flag a customer field interpolated directly, but NOT when it's the
      // test of a ternary (`${order.notes ? ... : ''}`) — there the rendered
      // branch has its own esc() wrap.
      const bad = tpl.match(
        /\$\{(?!esc\()(order\.\w+(?!\w)|itemLabel\(|deliveryLine\(|i\.variantSKU(?!\w)|resetUrl(?!\w)|verifyUrl(?!\w)|orderUrl(?!\w)|trackUrl(?!\w))(?!\s*\?)/g
      );
      if (bad) offenders.push(...bad);
    }
    expect(offenders).toEqual([]);
  });
});
