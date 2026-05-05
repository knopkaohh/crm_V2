import { AuthRequest } from '../middleware/auth';

const FULL_ACCESS_ROLES = new Set(['EXECUTIVE']);

/** Все контакты: только руководитель отдела продаж (EXECUTIVE). */
export function canViewAllLeads(req: AuthRequest): boolean {
  if (!req.userId || !req.userRole) return false;
  return FULL_ACCESS_ROLES.has(req.userRole);
}

/** Полное удаление лида без архива — только те же роли/пользователи, что и «все контакты». */
export function canDeleteLead(req: AuthRequest): boolean {
  return canViewAllLeads(req);
}

export function canAccessLeadByManager(req: AuthRequest, managerId: string | null): boolean {
  if (canViewAllLeads(req)) return true;
  return Boolean(req.userId && managerId === req.userId);
}
