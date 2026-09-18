'use client';

import { useEffect, useState } from 'react';

const LS_KEY = 'alistore:admin-sidebar-collapsed';

/**
 * Per-device preference for whether the desktop admin sidebar is collapsed
 * (hidden) — same reason as use-print-preferences.ts to keep it out of
 * shared SiteSettings: it's a local screen-space choice, not something that
 * should follow an admin between devices. Hydrates from localStorage in an
 * effect (not the initial useState) so the server/first-client render never
 * reads from `window` and can't hydration-mismatch.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(LS_KEY) === 'true');
    } catch {
      /* private mode / unavailable — stays expanded */
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LS_KEY, String(next));
      } catch {
        /* private mode / quota — preference just won't persist */
      }
      return next;
    });
  };

  return { collapsed, toggle };
}
