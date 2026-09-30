import { AuthRequest } from '../middleware/auth';
import { prisma } from './prisma';

/** Свой кабинет: пользователь работает в CRM, но не видит чужие данные. */
export const ISOLATED_ROLE = 'ISOLATED';

const CACHE_TTL_MS = 30_000;

let isolatedIdsCache: { at: number; ids: string[] } | null = null;

export function isIsolatedRole(role?: string | null): boolean {
  return role === ISOLATED_ROLE;
}

export function clearIsolatedUserCache(): void {
  isolatedIdsCache = null;
}

/**
 * Id пользователей изолированного кабинета.
 * Пока таких пользователей нет, список пустой и запросы остальных ролей не дополняются.
 * Роль сравнивается в коде, без фильтра по новому значению enum в SQL.
 */
export async function getIsolatedUserIds(): Promise<string[]> {
  const now = Date.now();
  if (isolatedIdsCache && now - isolatedIdsCache.at < CACHE_TTL_MS) {
    return isolatedIdsCache.ids;
  }

  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });
  const ids = users.filter((user) => user.role === ISOLATED_ROLE).map((user) => user.id);
  isolatedIdsCache = { at: now, ids };
  return ids;
}

export function andWhere(
  base: Record<string, unknown>,
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!extra || Object.keys(extra).length === 0) return base;
  if (!base || Object.keys(base).length === 0) return extra;
  return { AND: [base, extra] };
}

/** null — условие добавлять не нужно, выборка для текущих ролей остаётся прежней. */
export function managerExclusion(isolatedIds: string[]): Record<string, unknown> | null {
  if (isolatedIds.length === 0) return null;
  return { managerId: { notIn: isolatedIds } };
}

export function creatorExclusion(isolatedIds: string[]): Record<string, unknown> | null {
  if (isolatedIds.length === 0) return null;
  return { creatorId: { notIn: isolatedIds } };
}

export function orderVisibleToRole(params: {
  role?: string | null;
  userId?: string | null;
  managerId: string;
  creatorId: string;
  isolatedManagerIds: string[];
}): boolean {
  if (isIsolatedRole(params.role)) {
    return params.managerId === params.userId || params.creatorId === params.userId;
  }
  if (params.isolatedManagerIds.length === 0) return true;
  return !params.isolatedManagerIds.includes(params.managerId);
}

export function isolatedOrderScope(userId: string): Record<string, unknown> {
  return { OR: [{ managerId: userId }, { creatorId: userId }] };
}

export function isolatedLeadScope(userId: string): Record<string, unknown> {
  return { OR: [{ managerId: userId }, { creatorId: userId }] };
}

export function isolatedClientScope(userId: string): Record<string, unknown> {
  return { createdById: userId };
}

export function isolatedTaskScope(userId: string): Record<string, unknown> {
  return { OR: [{ assigneeId: userId }, { creatorId: userId }] };
}

export function isolatedFunnelScope(userId: string): Record<string, unknown> {
  return { OR: [{ managerId: userId }, { createdById: userId }] };
}

export async function orderListScope(req: AuthRequest): Promise<Record<string, unknown> | null> {
  if (!req.userId) return null;
  if (isIsolatedRole(req.userRole)) return isolatedOrderScope(req.userId);
  return managerExclusion(await getIsolatedUserIds());
}

export async function leadListScope(req: AuthRequest): Promise<Record<string, unknown> | null> {
  if (!req.userId) return null;
  if (isIsolatedRole(req.userRole)) return isolatedLeadScope(req.userId);
  return managerExclusion(await getIsolatedUserIds());
}

export async function isOrderVisible(req: AuthRequest, order: { managerId: string; creatorId: string }): Promise<boolean> {
  return orderVisibleToRole({
    role: req.userRole,
    userId: req.userId,
    managerId: order.managerId,
    creatorId: order.creatorId,
    isolatedManagerIds: isIsolatedRole(req.userRole) ? [] : await getIsolatedUserIds(),
  });
}

type JsonResponse = {
  status: (code: number) => { json: (body: unknown) => void };
};

/** true — ответ уже отправлен, обработчик нужно прервать. */
export async function rejectIfOrderHidden(
  req: AuthRequest,
  res: JsonResponse,
  orderId: string,
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { managerId: true, creatorId: true },
  });

  if (!order) {
    if (isIsolatedRole(req.userRole)) {
      res.status(404).json({ error: 'Заказ не найден' });
      return true;
    }
    return false;
  }

  if (!(await isOrderVisible(req, order))) {
    res.status(404).json({ error: 'Заказ не найден' });
    return true;
  }

  return false;
}

export async function isClientHiddenFrom(
  req: AuthRequest,
  client: { createdById: string | null },
): Promise<boolean> {
  if (isIsolatedRole(req.userRole)) {
    if (!req.userId) return true;
    if (client.createdById === req.userId) return false;
    return true;
  }

  const ids = await getIsolatedUserIds();
  if (ids.length === 0) return false;
  return Boolean(client.createdById && ids.includes(client.createdById));
}

export async function rejectIfClientHidden(
  req: AuthRequest,
  res: JsonResponse,
  clientId: string,
): Promise<boolean> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { createdById: true },
  });

  if (!client) {
    if (isIsolatedRole(req.userRole)) {
      res.status(404).json({ error: 'Клиент не найден' });
      return true;
    }
    return false;
  }

  if (await isClientHiddenFrom(req, client)) {
    res.status(404).json({ error: 'Клиент не найден' });
    return true;
  }

  return false;
}

export async function rejectIfLeadHidden(
  req: AuthRequest,
  res: JsonResponse,
  lead: { managerId: string; creatorId?: string | null },
): Promise<boolean> {
  if (isIsolatedRole(req.userRole)) {
    const owns = lead.managerId === req.userId || lead.creatorId === req.userId;
    if (!owns) {
      res.status(404).json({ error: 'Лид не найден' });
      return true;
    }
    return false;
  }

  const ids = await getIsolatedUserIds();
  if (ids.length > 0 && ids.includes(lead.managerId)) {
    res.status(404).json({ error: 'Лид не найден' });
    return true;
  }
  return false;
}
