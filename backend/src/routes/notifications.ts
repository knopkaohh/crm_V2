import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = express.Router();

// Получить все уведомления пользователя
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { read, type } = req.query;

    const where: any = {
      userId: req.userId!,
    };

    if (read !== undefined) {
      where.read = read === 'true';
    }

    if (type) {
      where.type = type;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100, // Ограничение на количество
    });

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Ошибка при получении уведомлений' });
  }
});

// Получить количество непрочитанных уведомлений
router.get('/unread-count', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.userId!,
        read: false,
      },
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Ошибка при получении количества уведомлений' });
  }
});

// Отметить уведомление как прочитанное
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }

    if (notification.userId !== req.userId) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении уведомления' });
  }
});

// Отметить все уведомления как прочитанные
router.patch('/read-all', authenticate, async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.userId!,
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({ message: 'Все уведомления отмечены как прочитанные' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении уведомлений' });
  }
});

// Удалить уведомление
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }

    if (notification.userId !== req.userId) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.json({ message: 'Уведомление удалено' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Ошибка при удалении уведомления' });
  }
});

// Получить настройки уведомлений пользователя
router.get('/settings', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { notificationSettings: true },
    });

    // Дефолтные настройки
    const defaultSettings = {
      enabled: true,
      task: {
        assigned: true,
        completed: true,
        dueSoon: true,
        overdue: true,
      },
      order: {
        created: true,
        statusChanged: true,
        ready: true,
        delivered: true,
      },
      lead: {
        created: true,
        statusChanged: true,
        converted: true,
      },
      general: {
        system: true,
      },
      desktop: true, // Всплывающие уведомления на рабочем столе
    };

    let settings = defaultSettings;
    
    if (user?.notificationSettings) {
      try {
        // Если это JSON объект, парсим его
        const userSettings = typeof user.notificationSettings === 'string' 
          ? JSON.parse(user.notificationSettings) 
          : user.notificationSettings;
        settings = { ...defaultSettings, ...userSettings };
      } catch (e) {
        // Если ошибка парсинга, используем дефолтные настройки
        console.error('Error parsing notification settings:', e);
        settings = defaultSettings;
      }
    }

    res.json(settings);
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ error: 'Ошибка при получении настроек уведомлений' });
  }
});

// Обновить настройки уведомлений пользователя
router.put('/settings', authenticate, async (req: AuthRequest, res) => {
  try {
    const settings = req.body;

    await prisma.user.update({
      where: { id: req.userId! },
      data: { notificationSettings: settings },
    });

    res.json({ message: 'Настройки уведомлений обновлены', settings });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении настроек уведомлений' });
  }
});

export default router;
