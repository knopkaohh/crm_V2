import api from '@/lib/api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    )
  } catch {
    return false
  }
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })
    await navigator.serviceWorker.ready
    return registration
  } catch (error) {
    console.error('[WebPush] Service worker registration failed:', error)
    return null
  }
}

export async function subscribeToWebPush(): Promise<{
  ok: boolean
  reason?: string
}> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' }
  }

  try {
    let publicKey: string
    try {
      const response = await api.get('/notifications/push/vapid-public-key')
      publicKey = response.data.publicKey
      if (!publicKey || typeof publicKey !== 'string') {
        return { ok: false, reason: 'not_configured' }
      }
    } catch {
      return { ok: false, reason: 'not_configured' }
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' }
    }

    const registration = await getServiceWorkerRegistration()
    if (!registration?.pushManager) {
      return { ok: false, reason: 'no_sw' }
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'invalid_subscription' }
    }

    await api.post('/notifications/push/subscribe', {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    })

    return { ok: true }
  } catch (error) {
    console.error('[WebPush] subscribe failed:', error)
    return { ok: false, reason: 'error' }
  }
}

export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isPushSupported()) return

  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager?.getSubscription()
    if (!subscription) return

    const endpoint = subscription.endpoint
    try {
      await api.post('/notifications/push/unsubscribe', { endpoint })
    } catch (error) {
      console.error('[WebPush] Unsubscribe API error:', error)
    }

    await subscription.unsubscribe()
  } catch (error) {
    console.error('[WebPush] unsubscribe failed:', error)
  }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager?.getSubscription()
    return Boolean(subscription)
  } catch {
    return false
  }
}
