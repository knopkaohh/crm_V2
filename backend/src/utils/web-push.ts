import webpush from 'web-push'
import type { PushSubscription } from '@prisma/client'
import { prisma } from './prisma'
import {
  parseNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from './notification-settings'

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject =
  process.env.VAPID_SUBJECT || 'mailto:admin@birkamarket.ru'
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
)

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return true
  if (!vapidPublicKey || !vapidPrivateKey) {
    return false
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  vapidConfigured = true
  return true
}

export function isWebPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey)
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey || null
}

async function getUserPushEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationSettings: true },
  })
  const settings = parseNotificationSettings(user?.notificationSettings)
  return settings.enabled !== false && settings.push === true
}

function resolveNotificationUrl(link?: string | null): string {
  if (!link) return frontendUrl
  if (link.startsWith('http://') || link.startsWith('https://')) {
    return link
  }
  const path = link.startsWith('/') ? link : `/${link}`
  return `${frontendUrl}${path}`
}

export type WebPushPayload = {
  title: string
  message: string
  link?: string | null
  type?: string
}

export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<void> {
  if (!ensureVapid()) {
    return
  }

  const pushEnabled = await getUserPushEnabled(userId)
  if (!pushEnabled) {
    return
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  if (!subscriptions.length) {
    return
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.message,
    url: resolveNotificationUrl(payload.link),
    type: payload.type || 'general',
  })

  await Promise.all(
    subscriptions.map(async (sub: PushSubscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          body
        )
      } catch (error: unknown) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode: number }).statusCode
            : undefined
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(
            () => undefined
          )
        }
        console.error('[WebPush] Failed to send:', {
          userId,
          endpoint: sub.endpoint,
          statusCode,
        })
      }
    })
  )
}

export { DEFAULT_NOTIFICATION_SETTINGS, parseNotificationSettings }
