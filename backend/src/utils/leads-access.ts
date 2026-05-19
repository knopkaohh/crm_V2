import { AuthRequest } from '../middleware/auth';

const HARD_DELETE_ROLES = new Set(['EXECUTIVE', 'ADMIN']);

/** Все контакты: любой авторизованный пользователь CRM. */
export function canViewAllLeads(req: AuthRequest): boolean {
  return Boolean(req.userId);
}

/** Полное удаление лида без архива — руководитель отдела продаж или администратор. */
export function canDeleteLead(req: AuthRequest): boolean {
  if (!req.userRole) return false;
  return HARD_DELETE_ROLES.has(req.userRole);
}

export function canAccessLeadByManager(req: AuthRequest, managerId: string | null): boolean {
  if (canViewAllLeads(req)) return true;
  return Boolean(req.userId && managerId === req.userId);
}
