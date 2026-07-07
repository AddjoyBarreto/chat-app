// VaultChat service worker — handles Web Push for incoming calls (Phase C scaffold).
self.addEventListener("push", (event) => {
  const data = event.data?.json() as
    | { type?: string; title?: string; body?: string; callId?: string; callerId?: string; callType?: string }
    | undefined;

  if (!data) return;

  const title = data.title ?? "VaultChat";
  const body = data.body ?? "Incoming notification";
  const options = {
    body,
    data,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.callId ?? "vaultchat",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
