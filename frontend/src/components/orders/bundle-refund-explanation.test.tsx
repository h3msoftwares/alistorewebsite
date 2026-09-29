import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BundleRefundExplanation } from './bundle-refund-explanation';
import { bundleRefundCalculation as calculation } from '@/test/bundle-refund';
import { formatCurrency } from '@/lib/format';

describe('Bundle refund explanation', () => {
  it.each(['en', 'ar'] as const)('shows group repricing, lost discount and purchase rates in %s', locale => {
    render(<BundleRefundExplanation locale={locale} calculation={calculation} />);
    expect(screen.getByText(locale === 'en' ? 'Bundle: A and B' : 'باقة: باقة أ وب')).toBeInTheDocument();
    expect(screen.getByText(locale === 'en' ? 'Complete Bundles kept: 0 of 1.' : 'الباقات الكاملة المحتفظ بها: 0 من 1.')).toBeInTheDocument();
    expect(screen.getByText(locale === 'en' ? 'Bundle discount lost' : 'خصم الباقة المفقود')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === formatCurrency(70, locale))).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === formatCurrency(10, locale))).toBeInTheDocument();
  });
});
