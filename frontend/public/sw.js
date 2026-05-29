/* Service Worker для Web Push (CRM Birka Market) */

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Birka CRM',
    body: '',
    url: '/',
  }

  try {
    if (event.data) {
      const parsed = event.data.json()
      payload = { ...payload, ...parsed }
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text()
    }
  }

  const options = {
    body: payload.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: payload.url || '/' },
    tag: 'crm-notification',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Birka CRM', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if (client.url.includes(self.location.origin)) {
              client.navigate(targetUrl)
              return client.focus()
            }
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
        return undefined
      })
  )
})
