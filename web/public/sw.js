self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: "ECOVISA", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || "ECOVISA", {
      body: payload.body || "",
      icon: payload.icon || "/assets/ECOVISA_ICON.png",
      badge: payload.badge || "/assets/ECOVISA_ICON.png",
      vibrate: [200, 100, 200],
      data: payload.data || {},
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});