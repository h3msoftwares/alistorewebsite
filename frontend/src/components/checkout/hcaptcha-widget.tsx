'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import Script from 'next/script';

// hCaptcha's own global, loaded by the <Script> below. `render: 'explicit'`
// in the script URL means it never auto-renders any `.h-captcha` div itself
// — we call `.render()` ourselves once the script is ready, avoiding a race
// between React's mount and hCaptcha's auto-scan.
declare global {
  interface Window {
    hcaptcha?: {
      render: (container: HTMLElement, params: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export interface HCaptchaHandle {
  /** hCaptcha tokens are single-use — call this after a failed submit so the
   *  widget re-challenges before the next attempt. */
  reset: () => void;
}

interface HCaptchaWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

/** Checkout's bot gate (see checkout-otp module) — renders hCaptcha's
 *  checkbox widget and reports a fresh token via `onVerify` each time it's
 *  solved. Defaults to hCaptcha's own test sitekey when
 *  NEXT_PUBLIC_HCAPTCHA_SITE_KEY isn't set, matching the backend's default
 *  test secret (see backend/.env.example). */
export const HCaptchaWidget = forwardRef<HCaptchaHandle, HCaptchaWidgetProps>(function HCaptchaWidget(
  { onVerify, onExpire },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || '10000000-ffff-ffff-ffff-000000000001';

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.hcaptcha && widgetIdRef.current) window.hcaptcha.reset(widgetIdRef.current);
    },
  }));

  const renderWidget = () => {
    setScriptReady(true);
    if (!window.hcaptcha || !containerRef.current || widgetIdRef.current !== null) return;
    widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      'expired-callback': onExpire,
    });
  };

  return (
    <>
      <Script
        id="hcaptcha-script"
        src="https://js.hcaptcha.com/1/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} aria-hidden={!scriptReady} />
    </>
  );
});
