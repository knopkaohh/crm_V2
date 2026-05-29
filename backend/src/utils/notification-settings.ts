export type NotificationSettings = {
  enabled: boolean
  desktop: boolean
  push?: boolean
  task: {
    assigned: boolean
    completed: boolean
    dueSoon: boolean
    overdue: boolean
  }
  order: {
    created: boolean
    statusChanged: boolean
    ready: boolean
    delivered: boolean
  }
  lead: {
    created: boolean
    statusChanged: boolean
    converted: boolean
  }
  general: {
    system: boolean
  }
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  desktop: true,
  push: false,
  task: {
    assigned: true,
    completed: true,
    dueSoon: true,
    overdue: true,
  },
  order: {
    created: true,
    statusChanged: true,
    ready: true,
    delivered: true,
  },
  lead: {
    created: true,
    statusChanged: true,
    converted: true,
  },
  general: {
    system: true,
  },
}

export function parseNotificationSettings(
  raw: unknown
): NotificationSettings {
  if (!raw) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
  try {
    const parsed =
      typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>)
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}
