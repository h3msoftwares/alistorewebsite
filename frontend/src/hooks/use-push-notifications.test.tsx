import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  pushApi: { saveSubscription: vi.fn(), deleteSubscription: vi.fn() },
}));

import { pushApi } from '@/lib/api';
import { usePushNotifications } from './use-push-notifications';

const mockSave = vi.mocked(pushApi.saveSubscription);
const mockDelete = vi.mocked(pushApi.deleteSubscription);

// jsdom implements none of ServiceWorker / PushManager / Notification —
// stand in with the minimum surface the hook actually calls, restored after
// every test so other suites (which don't expect these globals) stay clean.
let originalServiceWorker: unknown;
let originalPushManager: unknown;
let originalNotification: unknown;

function installBrowserApis({
  permission = 'default' as NotificationPermission,
  existingSubscription = null as { endpoint: string } | null,
} = {}) {
  const subscribeResult = {
    endpoint: 'https://push.example/new',
    toJSON: () => ({
      endpoint: 'https://push.example/new',
      keys: { p256dh: 'p256dh-val', auth: 'auth-val' },
    }),
  };

  const registration = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(
        existingSubscription
          ? { ...existingSubscription, unsubscribe: vi.fn().mockResolvedValue(true) }
          : null
      ),
      subscribe: vi.fn().mockResolvedValue(subscribeResult),
    },
  };

  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) },
    configurable: true,
  });
  (globalThis as unknown as { PushManager: unknown }).PushManager = function PushManager() {};

  class MockNotification {
    static permission = permission;
    static requestPermission = vi.fn().mockResolvedValue(permission);
  }
  (globalThis as unknown as { Notification: unknown }).Notification = MockNotification;

  return { registration, MockNotification };
}

beforeEach(() => {
  mockSave.mockReset();
  mockDelete.mockReset();
  // Vitest doesn't load Next's .env files — subscribe() needs a truthy
  // public key to proceed past its own "not configured" guard.
  // A real (test-only) VAPID public key shape — an arbitrary short string
  // isn't guaranteed to be valid base64url (padding length depends on the
  // string length mod 4), and urlBase64ToUint8Array correctly rejects
  // malformed input via atob().
  vi.stubEnv(
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'BMSLeouIIIyDUiKjJk0db5CesC1snutfSBi0mJXzsWu69oavWapqi3amUNimiLEJj14Wi1RkKCbjkzWFv2ZSwQU'
  );
  originalServiceWorker = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serviceWorker');
  originalPushManager = (globalThis as Record<string, unknown>).PushManager;
  originalNotification = (globalThis as Record<string, unknown>).Notification;
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalServiceWorker) {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', originalServiceWorker as PropertyDescriptor);
  } else {
    delete (globalThis.navigator as unknown as Record<string, unknown>).serviceWorker;
  }
  (globalThis as Record<string, unknown>).PushManager = originalPushManager;
  (globalThis as Record<string, unknown>).Notification = originalNotification;
});

describe('usePushNotifications — state detection', () => {
  it('starts null ("checking") while the async support/subscription check is pending', async () => {
    installBrowserApis({ permission: 'default' }); // has real awaited promises to resolve
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.state).toBeNull();
    await waitFor(() => expect(result.current.state).toBe('off'));
  });

  it('reports "unsupported" when serviceWorker/PushManager/Notification are missing', async () => {
    delete (globalThis.navigator as unknown as Record<string, unknown>).serviceWorker;
    delete (globalThis as Record<string, unknown>).PushManager;
    delete (globalThis as Record<string, unknown>).Notification;

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('unsupported'));
  });

  it('reports "blocked" when Notification.permission is denied', async () => {
    installBrowserApis({ permission: 'denied' });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('blocked'));
  });

  it('reports "off" when permission is default (never asked)', async () => {
    installBrowserApis({ permission: 'default' });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('off'));
  });

  it('reports "on" when permission is granted AND an active subscription exists', async () => {
    installBrowserApis({ permission: 'granted', existingSubscription: { endpoint: 'https://push.example/x' } });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('on'));
  });

  it('reports "off" when permission is granted but no subscription exists (e.g. cleared browser data)', async () => {
    installBrowserApis({ permission: 'granted', existingSubscription: null });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('off'));
  });
});

describe('usePushNotifications — subscribe()', () => {
  it('requests permission, subscribes, and saves the subscription to the backend', async () => {
    const { registration, MockNotification } = installBrowserApis({ permission: 'default' });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('off'));

    // The initial check saw "default" (never asked); simulate the user
    // granting the prompt this click triggers.
    MockNotification.requestPermission = vi.fn().mockResolvedValue('granted');

    await act(() => result.current.subscribe());

    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    expect(mockSave).toHaveBeenCalledWith({
      endpoint: 'https://push.example/new',
      keys: { p256dh: 'p256dh-val', auth: 'auth-val' },
    });
    expect(result.current.state).toBe('on');
  });

  it('moves to "blocked" (and never subscribes) if the browser prompt is denied', async () => {
    const { registration } = installBrowserApis({ permission: 'denied' });
    // Permission starts denied, but exercise the actual requestPermission()
    // rejection path a fresh "default" hook would hit:
    (globalThis as unknown as { Notification: { requestPermission: () => Promise<string> } }).Notification.requestPermission =
      vi.fn().mockResolvedValue('denied');
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('blocked'));

    await act(() => result.current.subscribe());

    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(result.current.state).toBe('blocked');
  });
});

describe('usePushNotifications — unsubscribe()', () => {
  it('deletes the backend record and unsubscribes the browser subscription', async () => {
    const { registration } = installBrowserApis({
      permission: 'granted',
      existingSubscription: { endpoint: 'https://push.example/mine' },
    });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.state).toBe('on'));

    await act(() => result.current.unsubscribe());

    expect(mockDelete).toHaveBeenCalledWith('https://push.example/mine');
    const sub = await registration.pushManager.getSubscription();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(result.current.state).toBe('off');
  });
});

// NOT covered here, deliberately: the actual browser permission-prompt UI,
// whether a click handler's call stack still counts as "user activation" by
// the time it reaches Notification.requestPermission() in a real browser,
// and real push delivery end-to-end. jsdom has no concept of user activation
// or a real permission dialog — a test asserting "the prompt appears" here
// would only prove the mock was called, not that a real browser would honor
// the gesture. That's why the checkout-flow verification for this feature
// was done manually in real browsers (see the session's live-test notes),
// not simulated in this file.
