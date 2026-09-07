// Admin order-alert push notifications. Registered from the admin Settings
// page's Notifications panel (see use-push-notifications.ts) — this file has
// no effect on the storefront; a customer session never registers it and
// never has a PushSubscription to receive anything through.

self.addEventListener('push', (event) => {
  let data = { title: 'New order', body: '' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default title/body above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
