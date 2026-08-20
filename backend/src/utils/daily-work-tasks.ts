import { prisma } from './prisma';

const DAILY_TASK_TEMPLATES = [
  { systemKey: 'daily_sales_report', title: 'Заполнить дневной отчет' },
  { systemKey: 'avito_old_clients', title: 'Отписать старым клиентам на Авито' },
] as const;

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

export async function ensureDailyWorkTasks(assigneeId: string): Promise<void> {
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDate = endOfToday();

  for (const tpl of DAILY_TASK_TEMPLATES) {
    const existing = await prisma.task.findFirst({
      where: {
        assigneeId,
        systemKey: tpl.systemKey,
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    if (!existing) {
      await prisma.task.create({
        data: {
          title: tpl.title,
          description: 'Автоматическая задача на сегодня',
          priority: 1,
          status: 'PENDING',
          creatorId: assigneeId,
          assigneeId,
          dueDate,
          systemKey: tpl.systemKey,
        },
      });
    }
  }
}
