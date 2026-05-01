import type { User } from './auth'

/** Email(ы) с полным доступом к контактам (как у EXECUTIVE/ADMIN). По умолчанию — Антон Федотов из сида. */
const defaultFullAccessEmails = 'antonfedtube@gmail.com'

function fullAccessEmailSet(): Set<string> {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LEADS_FULL_ACCESS_EMAILS) ||
    defaultFullAccessEmails
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Все контакты: EXECUTIVE, ADMIN или email из NEXT_PUBLIC_LEADS_FULL_ACCESS_EMAILS. */
export function canViewAllLeads(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'ADMIN' || user.role === 'EXECUTIVE') return true
  return fullAccessEmailSet().has(user.email.toLowerCase())
}

/** Удаление лида без архива — только те же права, что и просмотр всех контактов. */
export function canHardDeleteLead(user: User | null): boolean {
  return canViewAllLeads(user)
}
