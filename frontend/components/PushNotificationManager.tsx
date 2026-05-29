'use client'

import { useEffect, useRef } from 'react'
import { auth } from '@/lib/auth'
import api from '@/lib/api'
import {
  hasActivePushSubscription,
  isPushSupported,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '@/lib/web-push'

/** Поддерживает Web Push при включённой настройке push */
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
          return
        }

        const hasSub = await hasActivePushSubscription()
        if (!hasSub) {
          const result = await subscribeToWebPush()
          if (!result.ok && result.reason === 'denied') {
            console.warn('[WebPush] Permission denied by user')
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
