import { LeadStatus } from '@prisma/client'
import { prisma } from './prisma'
import { extractContactPurpose } from './lead-description'
import { parseNotificationSettings } from './notification-settings'
import { sendNotification } from './socket'

const CALL_REMINDER_TITLE = 'Нужно позвонить клиенту!'

const OPEN_LEAD_STATUSES: LeadStatus[] = [
  'NEW_LEAD',
  'CONSIDERING',
  'MOVED_TO_WHATSAPP',
]

export function formatLeadCallReminderNotification(params: {
  clientName: string
  contactPurpose: string
}): { title: string; message: string } {
  const purpose =
    params.contactPurpose.trim() || 'не указана'
  return {
    title: CALL_REMINDER_TITLE,
    message: `${params.clientName} ожидает твоего звонка. Цель звонка - ${purpose}`,
  }
}

export function isLeadContactDueTodayOrOverdue(
  nextContactDate: Date | null | undefined
): boolean {
  if (!nextContactDate) return false
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)
  return new Date(nextContactDate) <= endOfDay
}

function getStartOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

async function wasCallReminderSentToday(
  managerId: string,
  leadId: string
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: managerId,
      link: `/leads/${leadId}`,
      title: CALL_REMINDER_TITLE,
      createdAt: { gte: getStartOfToday() },
    },
    select: { id: true },
  })
  return Boolean(existing)
}

/** Уведомление только ответственному менеджеру лида */
export async function sendLeadCallDueNotification(params: {
  leadId: string
  managerId: string
  clientName: string
  description: string | null | undefined
  skipIfAlreadySentToday?: boolean
}): Promise<void> {
  const { leadId, managerId, clientName, description } = params
  if (!managerId) return

  const user = await prisma.user.findUnique({
    where: { id: managerId },
    select: { notificationSettings: true, isActive: true },
  })
  if (!user?.isActive) return

  const settings = parseNotificationSettings(user.notificationSettings)
  if (settings.enabled === false || settings.lead.callDue === false) {
    return
  }

  if (params.skipIfAlreadySentToday !== false) {
    if (await wasCallReminderSentToday(managerId, leadId)) {
      return
    }
  }

  const { title, message } = formatLeadCallReminderNotification({
    clientName,
    contactPurpose: extractContactPurpose(description),
  })

  await sendNotification(managerId, title, message, 'lead', `/leads/${leadId}`)
}

/** Утреннее напоминание: все контакты на сегодня и просроченные */
export async function processLeadCallRemindersForToday(): Promise<{
  sent: number
}> {
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const leads = await prisma.lead.findMany({
    where: {
      status: { in: OPEN_LEAD_STATUSES },
      nextContactDate: { lte: endOfDay },
    },
    include: {
      client: { select: { name: true } },
    },
  })

  let sent = 0
  for (const lead of leads) {
    if (!lead.managerId || !lead.nextContactDate) continue
    if (await wasCallReminderSentToday(lead.managerId, lead.id)) continue

    await sendLeadCallDueNotification({
      leadId: lead.id,
      managerId: lead.managerId,
      clientName: lead.client.name,
      description: lead.description,
      skipIfAlreadySentToday: true,
    })
    sent += 1
  }

  return { sent }
}
