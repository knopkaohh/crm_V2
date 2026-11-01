import express, { Response } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { getIsolatedUserIds, isIsolatedRole } from '../utils/isolated-access';
import { funnelManagerSortOrder } from '../utils/funnel-managers';
import { formatDateOnly, parseDateOnly } from '../utils/sales-report-participants';
import { broadcastWeeklyPlanUpdate } from '../utils/socket';
import {
  WEEK_DAYS,
  WeekAccess,
  activeWeekStart,
  addDaysYmd,
  canEditWeeklyPlan,
  formatWeekRange,
  moscowYmd,
  parseWeekStartParam,
  recentWeekStarts,
  weekAccess,
} from '../utils/weekly-plan';

const router = express.Router();
router.use(authenticate);

const managerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
} as const;

type ManagerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
};

function fail(res: Response, status: number, error: string) {
  return res.status(status).json({ error });
}

function publish(weekStart: string) {
  try {
    broadcastWeeklyPlanUpdate(weekStart);
  } catch (error) {
    console.error('Weekly plan broadcast error:', error);
  }
}

function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.trim();
  if (!title || title.length > 500) return null;
  return title;
}

function cleanDay(raw: unknown): number | null {
  const day = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(day) || day < 1 || day > 5) return null;
  return day;
}

function sortManagers(users: ManagerRow[]): ManagerRow[] {
  return [...users].sort((a, b) => {
    const aOrder = funnelManagerSortOrder(a);
    const bOrder = funnelManagerSortOrder(b);
    if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
    if (aOrder != null && bOrder == null) return -1;
    if (aOrder == null && bOrder != null) return 1;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'ru');
  });
}

async function salesManagers(): Promise<ManagerRow[]> {
  const isolatedIds = new Set(await getIsolatedUserIds());
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: [UserRole.SALES_MANAGER, UserRole.CLIENT_MANAGER] } },
        { secondaryRoles: { has: UserRole.SALES_MANAGER } },
        { secondaryRoles: { has: UserRole.CLIENT_MANAGER } },
      ],
    },
    select: managerSelect,
  });
  return sortManagers(
    users.filter((user) => user.role !== 'ISOLATED' && !isolatedIds.has(user.id)),
  );
}

async function boardManagers(req: AuthRequest): Promise<ManagerRow[]> {
  if (isIsolatedRole(req.userRole)) {
    const self = await prisma.user.findUnique({
      where: { id: req.userId },
      select: managerSelect,
    });
    return self ? [self] : [];
  }
  return salesManagers();
}

function taskWhere(req: AuthRequest, weekStart: Date, isolatedIds: string[]) {
  if (isIsolatedRole(req.userRole)) {
    return { weekStart, managerId: req.userId };
  }
  if (isolatedIds.length > 0) {
    return { weekStart, managerId: { notIn: isolatedIds } };
  }
  return { weekStart };
}

function presentTask(task: {
  id: string;
  managerId: string;
  dayOfWeek: number;
  title: string;
  completed: boolean;
  completedAt: Date | null;
  createdById: string;
  sortOrder: number;
  createdAt: Date;
  createdBy: { firstName: string; lastName: string };
}) {
  return {
    id: task.id,
    managerId: task.managerId,
    dayOfWeek: task.dayOfWeek,
    title: task.title,
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdById: task.createdById,
    createdByName: `${task.createdBy.firstName} ${task.createdBy.lastName}`.trim(),
    sortOrder: task.sortOrder,
    createdAt: task.createdAt.toISOString(),
  };
}

router.get('/weeks', async (req: AuthRequest, res: Response) => {
  try {
    const active = activeWeekStart();
    const isolated = isIsolatedRole(req.userRole);
    const isolatedIds = isolated ? [] : await getIsolatedUserIds();
    const where = isolated
      ? { managerId: req.userId }
      : isolatedIds.length > 0
        ? { managerId: { notIn: isolatedIds } }
        : {};

    const grouped = await prisma.weeklyPlanTask.groupBy({
      by: ['weekStart', 'completed'],
      where,
      _count: { _all: true },
    });

    const counts = new Map<string, { total: number; completed: number }>();
    for (const row of grouped) {
      const key = formatDateOnly(row.weekStart);
      const current = counts.get(key) ?? { total: 0, completed: 0 };
      current.total += row._count._all;
      if (row.completed) current.completed += row._count._all;
      counts.set(key, current);
    }

    const keys = new Set<string>([...recentWeekStarts(active), ...counts.keys()]);
    const weeks = [...keys]
      .filter((weekStart) => weekAccess(weekStart) !== 'upcoming' || counts.has(weekStart))
      .sort((a, b) => (a < b ? 1 : -1))
      .map((weekStart) => {
        const access = weekAccess(weekStart);
        const stats = counts.get(weekStart) ?? { total: 0, completed: 0 };
        return {
          weekStart,
          label: formatWeekRange(weekStart),
          access,
          total: stats.total,
          completed: stats.completed,
        };
      });

    res.json({ activeWeekStart: active, weeks });
  } catch (error) {
    console.error('Weekly plan weeks error:', error);
    res.status(500).json({ error: 'Не удалось загрузить список недель' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const weekStart = parseWeekStartParam(req.query.weekStart);
    if (!weekStart) {
      return fail(res, 400, 'Укажите понедельник недели в формате ГГГГ-ММ-ДД');
    }

    const access: WeekAccess = weekAccess(weekStart);
    const date = parseDateOnly(weekStart);
    if (!date) return fail(res, 400, 'Некорректная дата недели');

    const isolatedIds = isIsolatedRole(req.userRole) ? [] : await getIsolatedUserIds();
    const [managers, tasks] = await Promise.all([
      boardManagers(req),
      prisma.weeklyPlanTask.findMany({
        where: taskWhere(req, date, isolatedIds),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    let rows = managers;
    if (!isIsolatedRole(req.userRole)) {
      const known = new Set(managers.map((manager) => manager.id));
      const hidden = new Set(isolatedIds);
      const missingIds = [
        ...new Set(
          tasks
            .map((task) => task.managerId)
            .filter((id) => !known.has(id) && !hidden.has(id)),
        ),
      ];
      if (missingIds.length > 0) {
        const extras = await prisma.user.findMany({
          where: { id: { in: missingIds } },
          select: managerSelect,
        });
        rows = sortManagers([...managers, ...extras]);
      }
    }

    const presented = tasks.map(presentTask);
    const managersWithTasks = new Set(presented.map((task) => task.managerId));
    const publicManagers = rows.map((manager) => ({
      id: manager.id,
      firstName: manager.firstName,
      lastName: manager.lastName,
      isActive: manager.isActive,
      canEdit: canEditWeeklyPlan({
        role: req.userRole,
        userId: req.userId || '',
        managerId: manager.id,
        access,
      }),
    }));

    res.json({
      weekStart,
      weekEnd: addDaysYmd(weekStart, 4),
      label: formatWeekRange(weekStart),
      access,
      today: moscowYmd(),
      scope: isIsolatedRole(req.userRole) ? 'own' : 'department',
      days: WEEK_DAYS.map((day, index) => {
        const dateYmd = addDaysYmd(weekStart, index);
        return {
          ...day,
          date: dateYmd,
          isToday: dateYmd === moscowYmd(),
        };
      }),
      managers: publicManagers,
      tasks: presented,
      summary: {
        total: presented.length,
        completed: presented.filter((task) => task.completed).length,
        managersWithoutTasks: publicManagers.filter((manager) => !managersWithTasks.has(manager.id))
          .length,
      },
    });
  } catch (error) {
    console.error('Weekly plan load error:', error);
    res.status(500).json({ error: 'Не удалось загрузить планировщик' });
  }
});

router.post('/tasks', async (req: AuthRequest, res: Response) => {
  try {
    const weekStart = parseWeekStartParam(req.body?.weekStart);
    if (!weekStart || req.body?.weekStart == null || req.body?.weekStart === '') {
      return fail(res, 400, 'Укажите неделю');
    }
    const access = weekAccess(weekStart);
    if (access !== 'current') {
      return fail(res, 403, 'Эта неделя закрыта для изменений');
    }

    const managerId = typeof req.body?.managerId === 'string' ? req.body.managerId : '';
    const dayOfWeek = cleanDay(req.body?.dayOfWeek);
    const title = cleanTitle(req.body?.title);
    if (!managerId || dayOfWeek == null || !title) {
      return fail(res, 400, 'Укажите менеджера, день и текст задачи');
    }
    if (
      !canEditWeeklyPlan({
        role: req.userRole,
        userId: req.userId || '',
        managerId,
        access,
      })
    ) {
      return fail(res, 403, 'Нельзя изменять чужой план');
    }

    const allowed = await boardManagers(req);
    if (!allowed.some((manager) => manager.id === managerId)) {
      return fail(res, 400, 'Менеджер не входит в планировщик отдела продаж');
    }

    const date = parseDateOnly(weekStart);
    if (!date || !req.userId) return fail(res, 400, 'Некорректные данные');

    const last = await prisma.weeklyPlanTask.aggregate({
      where: { weekStart: date, managerId, dayOfWeek },
      _max: { sortOrder: true },
    });

    const task = await prisma.weeklyPlanTask.create({
      data: {
        weekStart: date,
        managerId,
        dayOfWeek,
        title,
        createdById: req.userId,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    publish(weekStart);
    res.status(201).json(presentTask(task));
  } catch (error) {
    console.error('Weekly plan create error:', error);
    res.status(500).json({ error: 'Не удалось сохранить задачу' });
  }
});

router.patch('/tasks/:id', async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.weeklyPlanTask.findUnique({
      where: { id: req.params.id },
    });
    if (!task) return fail(res, 404, 'Задача не найдена');

    const weekStart = formatDateOnly(task.weekStart);
    const access = weekAccess(weekStart);
    if (access !== 'current') {
      return fail(res, 403, 'Архивная неделя доступна только для просмотра');
    }
    if (
      !canEditWeeklyPlan({
        role: req.userRole,
        userId: req.userId || '',
        managerId: task.managerId,
        access,
      })
    ) {
      return fail(res, 403, 'Нельзя изменять чужой план');
    }

    const data: { title?: string; completed?: boolean; completedAt?: Date | null } = {};
    if (req.body?.title !== undefined) {
      const title = cleanTitle(req.body.title);
      if (!title) return fail(res, 400, 'Текст задачи не может быть пустым');
      data.title = title;
    }
    if (req.body?.completed !== undefined) {
      if (typeof req.body.completed !== 'boolean') {
        return fail(res, 400, 'Статус выполнения указан неверно');
      }
      data.completed = req.body.completed;
      data.completedAt = req.body.completed ? new Date() : null;
    }
    if (data.title === undefined && data.completed === undefined) {
      return fail(res, 400, 'Нет изменений');
    }

    const updated = await prisma.weeklyPlanTask.update({
      where: { id: task.id },
      data,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    publish(weekStart);
    res.json(presentTask(updated));
  } catch (error) {
    console.error('Weekly plan update error:', error);
    res.status(500).json({ error: 'Не удалось обновить задачу' });
  }
});

router.delete('/tasks/:id', async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.weeklyPlanTask.findUnique({
      where: { id: req.params.id },
    });
    if (!task) return fail(res, 404, 'Задача не найдена');

    const weekStart = formatDateOnly(task.weekStart);
    const access = weekAccess(weekStart);
    if (access !== 'current') {
      return fail(res, 403, 'Архивная неделя доступна только для просмотра');
    }
    if (
      !canEditWeeklyPlan({
        role: req.userRole,
        userId: req.userId || '',
        managerId: task.managerId,
        access,
      })
    ) {
      return fail(res, 403, 'Нельзя удалять чужие задачи');
    }

    await prisma.weeklyPlanTask.delete({ where: { id: task.id } });
    publish(weekStart);
    res.json({ success: true });
  } catch (error) {
    console.error('Weekly plan delete error:', error);
    res.status(500).json({ error: 'Не удалось удалить задачу' });
  }
});

export default router;
