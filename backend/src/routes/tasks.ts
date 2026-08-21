import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ensureMassTasksForUser } from '../utils/mass-task-generator';
import { getTaskBoardManagers } from '../utils/task-board-managers';
import { isTaskPrivilegedRole } from '../utils/task-exclusions';
import { sendNotification } from '../utils/socket';
import { prisma } from '../utils/prisma';
import { parsePeriodMonth } from '../utils/sales-report-participants';

const router = express.Router();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function canModifyTask(req: AuthRequest, task: { creatorId: string; assigneeId: string | null }) {
  if (isTaskPrivilegedRole(req.userRole)) return true;
  return task.creatorId === req.userId || task.assigneeId === req.userId;
}

function applyClosedAtOnStatusChange(
  status: string | undefined,
  existingTask: { status: string; completedAt: Date | null; closedAt: Date | null },
  updateData: Record<string, unknown>,
) {
  if (status === undefined) return;
  updateData.status = status;
  if (status === 'COMPLETED') {
    updateData.completedAt = new Date();
    updateData.closedAt = new Date();
  } else if (status === 'CANCELLED') {
    updateData.completedAt = null;
    updateData.closedAt = new Date();
  } else {
    updateData.completedAt = null;
    updateData.closedAt = null;
  }
}

// Менеджеры для доски задач
router.get('/board-managers', authenticate, async (_req, res) => {
  try {
    const managers = await getTaskBoardManagers();
    res.json(
      managers.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
      })),
    );
  } catch (error) {
    console.error('Get task board managers error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке менеджеров' });
  }
});

// Статистика задач за месяц
router.get('/stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const period = (req.query.period as string) || '';
    const managerIdFilter = req.query.managerId as string | undefined;
    const range = parsePeriodMonth(period);
    if (!range) {
      return res.status(400).json({ error: 'Укажите период в формате YYYY-MM' });
    }

    const managers = await getTaskBoardManagers();
    const privileged = isTaskPrivilegedRole(req.userRole);

    let targetManagers = managers;
    if (!privileged) {
      targetManagers = managers.filter((m) => m.id === req.userId);
    } else if (managerIdFilter) {
      targetManagers = managers.filter((m) => m.id === managerIdFilter);
    }

    const managerStats = await Promise.all(
      targetManagers.map(async (manager) => {
        const baseWhere = {
          assigneeId: manager.id,
          closedAt: { gte: range.start, lte: range.end },
        };

        const completed = await prisma.task.count({
          where: { ...baseWhere, status: 'COMPLETED' },
        });
        const cancelled = await prisma.task.count({
          where: { ...baseWhere, status: 'CANCELLED' },
        });

        const massCompleted = await prisma.task.count({
          where: { ...baseWhere, status: 'COMPLETED', massTemplateId: { not: null } },
        });
        const massCancelled = await prisma.task.count({
          where: { ...baseWhere, status: 'CANCELLED', massTemplateId: { not: null } },
        });
        const manualCompleted = await prisma.task.count({
          where: {
            ...baseWhere,
            status: 'COMPLETED',
            massTemplateId: null,
            systemKey: null,
          },
        });
        const manualCancelled = await prisma.task.count({
          where: {
            ...baseWhere,
            status: 'CANCELLED',
            massTemplateId: null,
            systemKey: null,
          },
        });

        return {
          managerId: manager.id,
          firstName: manager.firstName,
          lastName: manager.lastName,
          completed,
          cancelled,
          total: completed + cancelled,
          byType: {
            manual: { completed: manualCompleted, cancelled: manualCancelled },
            mass: { completed: massCompleted, cancelled: massCancelled },
          },
        };
      }),
    );

    res.json({ period, managers: managerStats });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке статистики' });
  }
});

// Получить все задачи
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { status, assigneeId, creatorId, priority, dueDate, board } = req.query;
    const boardMode = board === '1' || board === 'true';

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (boardMode) {
      const boardAssigneeId = (assigneeId as string) || req.userId!;
      await ensureMassTasksForUser(boardAssigneeId);
      where.assigneeId = boardAssigneeId;

      const todayStart = startOfToday();
      where.AND = [
        {
          OR: [
            { status: { in: ['PENDING', 'IN_PROGRESS'] } },
            { closedAt: { gte: todayStart } },
          ],
        },
      ];
    } else {
      if (assigneeId) {
        where.assigneeId = assigneeId as string;
      }

      if (creatorId) {
        where.creatorId = creatorId as string;
      }

      if (req.userRole === 'SALES_MANAGER') {
        where.OR = [
          { assigneeId: req.userId },
          { creatorId: req.userId },
        ];
      }
    }

    if (priority) {
      where.priority = parseInt(priority as string, 10);
    }

    if (dueDate === 'today') {
      const today = startOfToday();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.dueDate = { gte: today, lt: tomorrow };
    } else if (dueDate === 'overdue') {
      where.dueDate = { lt: new Date() };
      where.status = { not: 'COMPLETED' };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true },
        },
        massTemplate: {
          select: { id: true, linkPath: true },
        },
        lead: {
          include: {
            client: { select: { id: true, name: true, phone: true } },
          },
        },
        order: {
          include: {
            client: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Ошибка при получении задач' });
  }
});

// Получить задачу по ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        creatorId: true,
        assigneeId: true,
        leadId: true,
        orderId: true,
        systemKey: true,
        massTemplateId: true,
        massTemplate: { select: { linkPath: true } },
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        comments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Ошибка при получении задачи' });
  }
});

// Создать задачу
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigneeId, dueDate, leadId, orderId } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Название задачи обязательно' });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: priority || 0,
        creatorId: req.userId!,
        assigneeId: assigneeId || req.userId,
        dueDate: dueDate ? new Date(dueDate) : null,
        leadId,
        orderId,
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const targetUserId = assigneeId || req.userId;
    if (targetUserId) {
      await sendNotification(
        targetUserId,
        'Новая задача',
        targetUserId === req.userId
          ? `Вы создали задачу: ${title}`
          : `Вам назначена задача: ${title}`,
        'task',
        '/work-tasks',
      );
    }

    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Ошибка при создании задачи' });
  }
});

// Обновить задачу
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigneeId, dueDate } = req.body;

    const existingTask = await prisma.task.findUnique({ where: { id } });

    if (!existingTask) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    if (!canModifyTask(req, existingTask)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    applyClosedAtOnStatusChange(status, existingTask, updateData);
    if (priority !== undefined) updateData.priority = priority;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        massTemplate: { select: { id: true, linkPath: true } },
      },
    });

    if (assigneeId && assigneeId !== existingTask.assigneeId && assigneeId !== req.userId) {
      await sendNotification(
        assigneeId,
        'Новая задача',
        `Вам назначена задача: ${task.title}`,
        'task',
        '/work-tasks',
      );
    }

    if (status === 'COMPLETED' && task.creatorId !== req.userId) {
      await sendNotification(
        task.creatorId,
        'Задача выполнена',
        `Задача "${task.title}" выполнена`,
        'task',
        `/tasks/${task.id}`,
      );
    }

    res.json(task);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении задачи' });
  }
});

// Удалить задачу
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    if (!isTaskPrivilegedRole(req.userRole) && task.creatorId !== req.userId) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    await prisma.task.delete({ where: { id } });

    res.json({ message: 'Задача удалена' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Ошибка при удалении задачи' });
  }
});

// Получить комментарии задачи
router.get('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    if (!canModifyTask(req, task)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(comments);
  } catch (error) {
    console.error('Get task comments error:', error);
    res.status(500).json({ error: 'Ошибка при получении комментариев' });
  }
});

// Добавить комментарий к задаче
router.post('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Содержимое комментария обязательно' });
    }

    const task = await prisma.task.findUnique({ where: { id } });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    if (!canModifyTask(req, task)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.userId!,
        taskId: id,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Create task comment error:', error);
    res.status(500).json({ error: 'Ошибка при создании комментария' });
  }
});

export default router;
