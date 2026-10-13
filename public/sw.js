// Service worker for the installed app: shows Web Push notifications sent by
// src/modules/push and opens their target page on tap. It deliberately does not
// cache or intercept requests, so the app behaves exactly as in a normal tab.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Management", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/app-icon/192",
      badge: "/app-icon/badge",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const origin = self.location.origin;
  let target = new URL(event.notification.data?.url || "/", origin);
  if (target.origin !== origin) target = new URL("/", origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === origin);
    if (!open) return self.clients.openWindow(target.href);
    await open.focus();
    try {
      await open.navigate(target.href);
    } catch {
      await self.clients.openWindow(target.href);
    }
  })());
});
