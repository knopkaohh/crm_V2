import { AuthRequest } from '../middleware/auth';

const FULL_ACCESS_ROLES = new Set(['ADMIN', 'EXECUTIVE']);

function fullAccessEmails(): string[] {
  return (process.env.LEADS_FULL_ACCESS_EMAILS || 'antonfedtube@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Все контакты: руководитель отдела продаж (EXECUTIVE), админ, либо email из LEADS_FULL_ACCESS_EMAILS (по умолчанию Антон Федотов). */
export function canViewAllLeads(req: AuthRequest): boolean {
  if (!req.userId || !req.userRole) return false;
  if (FULL_ACCESS_ROLES.has(req.userRole)) return true;
  const email = req.userEmail?.toLowerCase();
  if (email && fullAccessEmails().includes(email)) return true;
  return false;
}

/** Полное удаление лида без архива — только те же роли/пользователи, что и «все контакты». */
export function canDeleteLead(req: AuthRequest): boolean {
  return canViewAllLeads(req);
}

export function canAccessLeadByManager(req: AuthRequest, managerId: string | null): boolean {
  if (canViewAllLeads(req)) return true;
  return Boolean(req.userId && managerId === req.userId);
}
