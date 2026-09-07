'use client';

import { useMemo } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { DELIVERY_REGIONS } from '@/lib/regions';

export interface RegionOption {
  value: string;
  label: string;
}

/**
 * Options for a delivery-region `<select>` in the checkout / address forms:
 * the built-in Lebanese governorates, followed by any custom zone the admin
 * has given a delivery rate in Settings → Delivery fees.
 */
export function useDeliveryRegionOptions(locale: 'en' | 'ar'): RegionOption[] {
  const { data: settings } = useSettings();
  return useMemo(() => {
    const builtin = new Set<string>(DELIVERY_REGIONS.map((r) => r.value));
    const custom = (settings?.deliveryRates ?? [])
      .map((r) => r.region)
      .filter((v) => v && !builtin.has(v))
      .filter((v, i, a) => a.indexOf(v) === i);
    return [
      ...DELIVERY_REGIONS.map((r) => ({ value: r.value, label: locale === 'ar' ? r.ar : r.en })),
      ...custom.map((v) => ({ value: v, label: v })),
    ];
  }, [settings?.deliveryRates, locale]);
}
