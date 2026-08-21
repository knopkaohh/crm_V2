import { prisma } from './prisma';
import { sendNotification } from './socket';
import { getTaskBoardManagers } from './task-board-managers';

/** Пн=1, Вт=2, Ср=4, Чт=8, Пт=16, Сб=32, Вс=64 */
export const WEEKDAY_BITS = [
  { bit: 1, label: 'Пн', iso: 0 },
  { bit: 2, label: 'Вт', iso: 1 },
  { bit: 4, label: 'Ср', iso: 2 },
  { bit: 8, label: 'Чт', iso: 3 },
  { bit: 16, label: 'Пт', iso: 4 },
  { bit: 32, label: 'Сб', iso: 5 },
  { bit: 64, label: 'Вс', iso: 6 },
] as const;

export const DEFAULT_WEEKDAYS_MON_FRI = 1 + 2 + 4 + 8 + 16;

export function getIsoWeekday(date = new Date()): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

export function matchesWeekdaysMask(mask: number, date = new Date()): boolean {
  const iso = getIsoWeekday(date);
  const bit = 1 << iso;
  return (mask & bit) !== 0;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = startOfToday();
  d.setHours(23, 59, 59, 999);
  return d;
}

const DEFAULT_TEMPLATES = [
  {
    systemKey: 'daily_sales_report',
    title: 'Заполнить дневной отчет',
    description: 'Автоматическая задача на сегодня',
    linkPath: '/sales-report',
  },
  {
    systemKey: 'avito_old_clients',
    title: 'Отписать старым клиентам на Авито',
    description: 'Автоматическая задача на сегодня',
    linkPath: null,
  },
] as const;

export async function seedMassTaskTemplatesIfEmpty(adminUserId: string): Promise<void> {
  const count = await prisma.massTaskTemplate.count();
  if (count > 0) return;

  const managers = await getTaskBoardManagers();
  const managerIds = managers.map((m) => m.id);

  for (const tpl of DEFAULT_TEMPLATES) {
    const template = await prisma.massTaskTemplate.create({
      data: {
        title: tpl.title,
        description: tpl.description,
        priority: 1,
        systemKey: tpl.systemKey,
        weekdays: DEFAULT_WEEKDAYS_MON_FRI,
        isActive: true,
        linkPath: tpl.linkPath,
        createdById: adminUserId,
        managers: {
          create: managerIds.map((managerId) => ({ managerId })),
        },
      },
    });

    // Link existing tasks with same systemKey
    await prisma.task.updateMany({
      where: { systemKey: tpl.systemKey },
      data: { massTemplateId: template.id },
    });
  }
}

export async function ensureMassTasksForUser(assigneeId: string): Promise<void> {
  const templateCount = await prisma.massTaskTemplate.count();
  if (templateCount === 0) {
    const admin = await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'EXECUTIVE'] }, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      await seedMassTaskTemplatesIfEmpty(admin.id);
    }
  }

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = endOfToday();

  const templates = await prisma.massTaskTemplate.findMany({
    where: {
      isActive: true,
      managers: { some: { managerId: assigneeId } },
    },
    include: { managers: true },
  });

  for (const template of templates) {
    if (template.isOneTime) {
      const existingOneTime = await prisma.task.findFirst({
        where: {
          assigneeId,
          systemKey: template.systemKey,
        },
      });
      if (existingOneTime) continue;
    } else {
      if (!matchesWeekdaysMask(template.weekdays)) continue;

      const existingToday = await prisma.task.findFirst({
        where: {
          assigneeId,
          systemKey: template.systemKey,
          createdAt: { gte: today, lt: tomorrow },
        },
      });
      if (existingToday) continue;
    }

    await prisma.task.create({
      data: {
        title: template.title,
        description: template.description ?? 'Автоматическая задача на сегодня',
        priority: template.priority,
        status: 'PENDING',
        creatorId: assigneeId,
        assigneeId,
        dueDate,
        systemKey: template.systemKey,
        massTemplateId: template.id,
      },
    });

    void sendNotification(
      assigneeId,
      'Новая задача',
      `Вам назначена задача: ${template.title}`,
      'task',
      `/work-tasks`,
    );
  }
}

export async function ensureMassTasksForManagers(managerIds: string[]): Promise<void> {
  for (const managerId of managerIds) {
    await ensureMassTasksForUser(managerId);
  }
}
