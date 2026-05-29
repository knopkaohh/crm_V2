import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { parseNotificationSettings } from '../utils/notification-settings';
import { getVapidPublicKey, isWebPushConfigured } from '../utils/web-push';

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

    const settings = parseNotificationSettings(user?.notificationSettings);

    res.json({
      ...settings,
      pushConfigured: isWebPushConfigured(),
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ error: 'Ошибка при получении настроек уведомлений' });
  }
});

// Обновить настройки уведомлений пользователя
router.put('/settings', authenticate, async (req: AuthRequest, res) => {
  try {
    const { pushConfigured: _readOnly, ...settings } = req.body as Record<string, unknown>;

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

// Публичный VAPID-ключ для подписки в браузере
router.get('/push/vapid-public-key', authenticate, async (_req: AuthRequest, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({
      error: 'Web Push не настроен на сервере (нет VAPID ключей)',
      configured: false,
    });
  }
  res.json({ publicKey, configured: true });
});

// Сохранить подписку Web Push
router.post('/push/subscribe', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!isWebPushConfigured()) {
      return res.status(503).json({ error: 'Web Push не настроен на сервере' });
    }

    const { endpoint, keys } = req.body as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Некорректная подписка push' });
    }

    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: req.userId!,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      update: {
        userId: req.userId!,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    })

    res.json({ message: 'Подписка сохранена' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении подписки' });
  }
});

// Отписаться от Web Push
router.post('/push/unsubscribe', authenticate, async (req: AuthRequest, res) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      return res.status(400).json({ error: 'Укажите endpoint подписки' });
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: req.userId!,
      },
    });

    res.json({ message: 'Подписка удалена' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ error: 'Ошибка при отписке' });
  }
});

export default router;
