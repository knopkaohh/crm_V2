export type NotificationSettings = {
  enabled: boolean
  desktop: boolean
  push?: boolean
  pushConfigured?: boolean
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
    callDue: boolean
  }
  general: {
    system: boolean
  }
}

const DEFAULTS: NotificationSettings = {
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
    callDue: true,
  },
  general: {
    system: true,
  },
}

/** Нормализация ответа API (защита от неполного JSON в БД) */
export function normalizeNotificationSettings(
  data: unknown
): NotificationSettings {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    enabled: raw.enabled !== false,
    desktop: raw.desktop !== false,
    push: raw.push === true,
    pushConfigured: raw.pushConfigured === true,
    task: { ...DEFAULTS.task, ...(raw.task as object) },
    order: { ...DEFAULTS.order, ...(raw.order as object) },
    lead: { ...DEFAULTS.lead, ...(raw.lead as object) },
    general: { ...DEFAULTS.general, ...(raw.general as object) },
  }
}

/** Только поля, которые хранятся в БД */
export function settingsForApiSave(settings: NotificationSettings) {
  const { pushConfigured: _pc, ...rest } = settings
  return rest
}
