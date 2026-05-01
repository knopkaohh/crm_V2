import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendNotification } from '../utils/socket';
import { prisma } from '../utils/prisma';

const router = express.Router();

// Получить все задачи
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { status, assigneeId, creatorId, priority, dueDate } = req.query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (assigneeId) {
      where.assigneeId = assigneeId as string;
    }

    if (creatorId) {
      where.creatorId = creatorId as string;
    }

    if (priority) {
      where.priority = parseInt(priority as string);
    }

    // Менеджеры видят свои задачи (как созданные, так и назначенные)
    if (req.userRole === 'SALES_MANAGER') {
      where.OR = [
        { assigneeId: req.userId },
        { creatorId: req.userId },
      ];
    }

    // Фильтр по дате выполнения
    if (dueDate === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.dueDate = {
        gte: today,
        lt: tomorrow,
      };
    } else if (dueDate === 'overdue') {
      where.dueDate = {
        lt: new Date(),
      };
      where.status = {
        not: 'COMPLETED',
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        lead: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        order: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
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
        createdAt: true,
        updatedAt: true,
        creatorId: true,
        assigneeId: true,
        leadId: true,
        orderId: true,
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        comments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      task.creatorId !== req.userId &&
      task.assigneeId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
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
        assigneeId: assigneeId || req.userId, // Если не указан исполнитель, задача себе
        dueDate: dueDate ? new Date(dueDate) : null,
        leadId,
        orderId,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Уведомление исполнителю
    const targetUserId = assigneeId || req.userId;
    if (targetUserId && targetUserId !== req.userId) {
      await sendNotification(
        targetUserId,
        'Новая задача',
        `Вам назначена задача: ${title}`,
        'task',
        `/tasks/${task.id}`
      );
    } else if (targetUserId === req.userId) {
      // Уведомление создателю, если он сам себе назначил задачу
      await sendNotification(
        req.userId!,
        'Новая задача',
        `Вы создали задачу: ${title}`,
        'task',
        `/tasks/${task.id}`
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

    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      existingTask.creatorId !== req.userId &&
      existingTask.assigneeId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
      } else if (status !== 'COMPLETED' && existingTask.completedAt) {
        updateData.completedAt = null;
      }
    }
    if (priority !== undefined) updateData.priority = priority;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Уведомление при смене исполнителя
    if (assigneeId && assigneeId !== existingTask.assigneeId && assigneeId !== req.userId) {
      await sendNotification(
        assigneeId,
        'Новая задача',
        `Вам назначена задача: ${task.title}`,
        'task',
        `/tasks/${task.id}`
      );
    }

    // Уведомление создателю при завершении задачи
    if (status === 'COMPLETED' && task.creatorId !== req.userId) {
      await sendNotification(
        task.creatorId,
        'Задача выполнена',
        `Задача "${task.title}" выполнена`,
        'task',
        `/tasks/${task.id}`
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

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Только создатель может удалить задачу
    if (task.creatorId !== req.userId && req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    await prisma.task.delete({
      where: { id },
    });

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

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      task.creatorId !== req.userId &&
      task.assigneeId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
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

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      task.creatorId !== req.userId &&
      task.assigneeId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.userId!,
        taskId: id,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Create task comment error:', error);
    res.status(500).json({ error: 'Ошибка при создании комментария' });
  }
});

export default router;
