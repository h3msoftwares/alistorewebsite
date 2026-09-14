'use client';

import { useEffect, useState } from 'react';

export type TypewriterOptions = {
  /** Delay between characters while typing forward. */
  typeSpeedMs?: number;
  /** Delay between characters while deleting back to empty. */
  deleteSpeedMs?: number;
  /** Pause once the full text is shown, before it starts deleting. */
  holdMs?: number;
  /** Pause once fully deleted, before it starts typing again. */
  restartDelayMs?: number;
};

/**
 * Types `text` out one character at a time, pauses, deletes it back to
 * nothing, pauses, and repeats — a continuous typewriter loop. Restarts from
 * scratch whenever `text` itself changes (e.g. the locale switches or the
 * admin-set brand name loads in after the shipped default). Skips straight to
 * the full text — no animation loop — under `prefers-reduced-motion: reduce`,
 * or when running where `matchMedia` isn't available (SSR / tests).
 */
export function useTypewriter(
  text: string,
  { typeSpeedMs = 200, deleteSpeedMs = 100, holdMs = 2600, restartDelayMs = 700 }: TypewriterOptions = {}
): string {
  const [shown, setShown] = useState('');

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(text);
      return;
    }
    if (!text) {
      setShown('');
      return;
    }

    let i = 0;
    let deleting = false;
    let timeoutId: number;

    const tick = () => {
      i += deleting ? -1 : 1;
      setShown(text.slice(0, i));

      let delay = deleting ? deleteSpeedMs : typeSpeedMs;
      if (!deleting && i >= text.length) {
        deleting = true;
        delay = holdMs;
      } else if (deleting && i <= 0) {
        deleting = false;
        delay = restartDelayMs;
      }
      timeoutId = window.setTimeout(tick, delay);
    };

    setShown('');
    timeoutId = window.setTimeout(tick, typeSpeedMs);
    return () => window.clearTimeout(timeoutId);
  }, [text, typeSpeedMs, deleteSpeedMs, holdMs, restartDelayMs]);

  return shown;
}
