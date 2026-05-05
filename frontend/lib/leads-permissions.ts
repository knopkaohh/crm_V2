import type { User } from './auth'

/** Все контакты: только EXECUTIVE. */
export function canViewAllLeads(user: User | null): boolean {
  if (!user) return false
  return user.role === 'EXECUTIVE'
}

/** Удаление лида без архива — только те же права, что и просмотр всех контактов. */
export function canHardDeleteLead(user: User | null): boolean {
  return canViewAllLeads(user)
}
