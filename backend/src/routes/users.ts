import express from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = express.Router();

// Получить всех пользователей (админ или исполнитель)
router.get('/', authenticate, requireRole('ADMIN', 'EXECUTIVE'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        secondaryRoles: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Ошибка при получении пользователей' });
  }
});

// Получить пользователя по ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Пользователь может видеть только себя, админы и исполнители - всех
    if (id !== req.userId && req.userRole !== 'ADMIN' && req.userRole !== 'EXECUTIVE') {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        secondaryRoles: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Ошибка при получении пользователя' });
  }
});

// Обновить пользователя (админ или сам пользователь)
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone } = req.body;

    // Пользователь может обновлять только себя, админ - любого
    if (id !== req.userId && req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { firstName, lastName, phone },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
  }
});

// Деактивировать/активировать пользователя (только админ)
router.patch('/:id/status', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении статуса пользователя' });
  }
});

export default router;
