import type { User } from './auth'

/** Все контакты: любой авторизованный пользователь. */
export function canViewAllLeads(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'ISOLATED') return false
  return true
}

/** Удаление лида без архива — руководитель отдела продаж или администратор. */
export function canHardDeleteLead(user: User | null): boolean {
  if (!user) return false
  return user.role === 'EXECUTIVE' || user.role === 'ADMIN'
}
