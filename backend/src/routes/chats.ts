import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { canAccessLeadByManager } from '../utils/leads-access';

const router = express.Router();

// Получить или создать чат для лида
router.get('/leads/:leadId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { leadId } = req.params;
    const userId = req.userId!;

    // Проверяем, существует ли лид
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        client: true,
        manager: true,
      },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }

    if (!canAccessLeadByManager(req, lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    // Ищем существующий чат
    let chat = await prisma.chat.findUnique({
      where: { leadId },
      include: {
        messages: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Если чата нет, создаем новый
    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          userId,
          leadId,
          clientId: lead.clientId,
          userName: lead.client.name,
          userPhone: lead.client.phone,
        },
        include: {
          messages: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    res.json(chat);
  } catch (error: any) {
    console.error('Get chat error:', error);
    const errorMessage = error?.message || 'Ошибка при получении чата';
    res.status(500).json({ error: errorMessage, details: error });
  }
});

// Отправить сообщение в чат лида
router.post('/leads/:leadId/messages', authenticate, async (req: AuthRequest, res) => {
  try {
    const { leadId } = req.params;
    const { content } = req.body;
    const userId = req.userId!;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Текст сообщения обязателен' });
    }

    // Проверяем, существует ли лид
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        client: true,
      },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }

    if (!canAccessLeadByManager(req, lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    // Получаем или создаем чат
    let chat = await prisma.chat.findUnique({
      where: { leadId },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          userId,
          leadId,
          clientId: lead.clientId,
          userName: lead.client.name,
          userPhone: lead.client.phone,
        },
      });
    }

    // Создаем сообщение
    const message = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        userId,
        content: content.trim(),
        isOutgoing: true,
        messageId: `internal-${Date.now()}-${Math.random()}`,
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

    // Обновляем время последнего сообщения
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessageAt: new Date(),
      },
    });

    res.status(201).json(message);
  } catch (error: any) {
    console.error('Send message error:', error);
    const errorMessage = error?.message || 'Ошибка при отправке сообщения';
    res.status(500).json({ error: errorMessage, details: error });
  }
});

// Получить сообщения чата лида
router.get('/leads/:leadId/messages', authenticate, async (req: AuthRequest, res) => {
  try {
    const { leadId } = req.params;
    const userId = req.userId!;

    // Проверяем, существует ли лид
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }

    if (!canAccessLeadByManager(req, lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    // Получаем чат
    const chat = await prisma.chat.findUnique({
      where: { leadId },
    });

    if (!chat) {
      return res.json([]);
    }

    // Получаем сообщения
    const messages = await prisma.chatMessage.findMany({
      where: { chatId: chat.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Ошибка при получении сообщений' });
  }
});

export default router;

