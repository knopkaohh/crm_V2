'use client'

import { useEffect, useRef } from 'react'
import { auth } from '@/lib/auth'
import api from '@/lib/api'
import {
  hasActivePushSubscription,
  isPushSupported,
  unsubscribeFromWebPush,
} from '@/lib/web-push'

/**
 * Синхронизирует отписку, если push выключен в настройках.
 * Подписка только вручную (кнопка в настройках) — без автозапроса разрешений на каждой странице.
 */
export function PushNotificationManager() {
  const syncingRef = useRef(false)

  useEffect(() => {
    const syncPushSubscription = async () => {
      if (syncingRef.current || !isPushSupported()) return

      const user = await auth.getCurrentUser()
      if (!user) return

      syncingRef.current = true
      try {
        const response = await api.get('/notifications/settings')
        const settings = response.data
        const pushEnabled = settings?.enabled !== false && settings?.push === true
        const configured = settings?.pushConfigured === true

        if (!configured || !pushEnabled) {
          const hasSub = await hasActivePushSubscription()
          if (hasSub) {
            await unsubscribeFromWebPush()
          }
        }
      } catch (error) {
        console.error('[WebPush] Sync failed:', error)
      } finally {
        syncingRef.current = false
      }
    }

    syncPushSubscription()

    const onSettingsUpdated = () => {
      syncPushSubscription()
    }

    window.addEventListener('notification-settings-updated', onSettingsUpdated)
    return () => {
      window.removeEventListener('notification-settings-updated', onSettingsUpdated)
    }
  }, [])

  return null
}
