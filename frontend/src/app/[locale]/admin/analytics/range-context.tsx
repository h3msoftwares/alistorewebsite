'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AnalyticsPreset } from '@/lib/api/analytics';

interface RangeCtx {
  preset: AnalyticsPreset;
  setPreset: (p: AnalyticsPreset) => void;
}

const Ctx = createContext<RangeCtx | null>(null);
const LS_KEY = 'alistore:analytics-range';
const VALID: AnalyticsPreset[] = ['7d', '30d', '90d', '12mo'];

function readSaved(): AnalyticsPreset {
  try {
    const saved = window.localStorage.getItem(LS_KEY) as AnalyticsPreset | null;
    if (saved && VALID.includes(saved)) return saved;
  } catch {
    /* private mode — ignore */
  }
  return '30d';
}

export function AnalyticsRangeProvider({ children }: { children: ReactNode }) {
  // Lazy init: this subtree only renders client-side (the admin guard shows a
  // skeleton on the server), so reading localStorage here is safe.
  const [preset, setPreset] = useState<AnalyticsPreset>(readSaved);

  const value = useMemo<RangeCtx>(
    () => ({
      preset,
      setPreset: (p) => {
        setPreset(p);
        try {
          window.localStorage.setItem(LS_KEY, p);
        } catch {
          /* ignore */
        }
      },
    }),
    [preset]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalyticsRange(): RangeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAnalyticsRange must be used within AnalyticsRangeProvider');
  return ctx;
}
