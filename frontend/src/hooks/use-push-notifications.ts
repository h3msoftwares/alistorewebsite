'use client';

import { useCallback, useEffect, useState } from 'react';
import { pushApi } from '@/lib/api';

export type PushState = 'unsupported' | 'off' | 'on' | 'blocked';

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

// Web Push wants the VAPID public key as a Uint8Array, not the base64url
// string everything else passes it around as.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toBody(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = sub.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } };
}

/**
 * Drives the admin Notifications panel's "Enable order alerts" toggle.
 *
 * `state` is `null` while the initial check is in flight, then one of the
 * four real states (`unsupported`, `off`, `on`, `blocked`). Registering the
 * service worker is silent and safe to do eagerly (it prompts nothing) —
 * only `subscribe()` ever touches `Notification.requestPermission()`, and it
 * must be called directly from a click handler: browsers ignore or
 * auto-deny a permission request that isn't tied to a user gesture, so
 * `subscribe` calls it as its very first line, before any other `await`.
 */
export function usePushNotifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupported()) {
        if (!cancelled) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('blocked');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(Notification.permission === 'granted' && existing ? 'on' : 'off');
      } catch {
        if (!cancelled) setState('unsupported');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Must be the first await — see the doc comment above.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setState('unsupported');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      await pushApi.saveSubscription(toBody(subscription));
      setState('on');
    } catch {
      setError('Could not enable notifications. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushApi.deleteSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      setError('Could not disable notifications. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, subscribe, unsubscribe };
}
