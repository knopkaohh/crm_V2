import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendNotification, broadcastLeadUpdate, broadcastOrderUpdate } from '../utils/socket';
import { prisma } from '../utils/prisma';
import { generateOrderNumber } from '../utils/order-utils';
import { canViewAllLeads, canDeleteLead, canAccessLeadByManager } from '../utils/leads-access';

const router = express.Router();

// Получить все лиды
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, managerId, clientId, search, page = '1', limit = '100', contactDateFilter } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10) || 100, 200); // Максимум 200
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    const authReq = req as AuthRequest;
    if (canViewAllLeads(authReq)) {
      if (managerId) {
        where.managerId = managerId as string;
      }
    } else {
      where.managerId = authReq.userId!;
    }

    if (clientId) {
      where.clientId = clientId as string;
    }

    // Фильтрация по дате следующего контакта
    // «На сегодня» = контакт запланирован на сегодня ИЛИ уже просрочен (раньше начала сегодняшнего дня).
    // Иначе просроченные лиды не попадали ни в today, ни в future и пропадали из вкладки.
    if (contactDateFilter === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const todayOrOverdue = {
        OR: [
          { nextContactDate: { gte: startOfDay, lte: endOfDay } },
          { nextContactDate: { lt: startOfDay } },
        ],
      };
      if (!where.AND) {
        where.AND = [todayOrOverdue];
      } else if (Array.isArray(where.AND)) {
        where.AND.push(todayOrOverdue);
      } else {
        where.AND = [where.AND, todayOrOverdue];
      }
    } else if (contactDateFilter === 'future') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      where.nextContactDate = {
        gte: tomorrow,
      };
    }

    // Поиск по клиенту или менеджеру
    if (search) {
      where.OR = [
        { client: { name: { contains: search as string, mode: 'insensitive' } } },
        { client: { phone: { contains: search as string, mode: 'insensitive' } } },
        { manager: { firstName: { contains: search as string, mode: 'insensitive' } } },
        { manager: { lastName: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    // Определяем порядок сортировки
    let orderBy: any = { createdAt: 'desc' };
    if (contactDateFilter === 'future') {
      orderBy = { nextContactDate: 'asc' }; // Ближайшие даты сверху
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              comments: true,
              files: true,
            },
          },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Ошибка при получении лидов' });
  }
});

// Получить лид по ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        value: true,
        description: true,
        source: true,
        deadline: true,
        nextContactDate: true,
        convertedAt: true,
        createdAt: true,
        updatedAt: true,
        clientId: true,
        managerId: true,
        creatorId: true,
        client: {
          select: {
            id: true,
            name: true,
            company: true,
            email: true,
            phone: true,
            whatsapp: true,
            address: true,
          },
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
        files: {
          select: {
            id: true,
            filename: true,
            originalName: true,
            mimeType: true,
            size: true,
            path: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }

    if (!canAccessLeadByManager(req, lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    res.json(lead);
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'Ошибка при получении лида' });
  }
});

// Создать лид
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { clientId, status, managerId, value, description, source, deadline, nextContactDate } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'Клиент обязателен' });
    }

    const lead = await prisma.lead.create({
      data: {
        clientId,
        status: status || 'NEW_LEAD',
        managerId: managerId || req.userId!,
        creatorId: req.userId!,
        value: value ? parseFloat(value) : null,
        description,
        source,
        deadline: deadline ? new Date(deadline) : null,
        nextContactDate: nextContactDate ? new Date(nextContactDate) : null,
      },
      include: {
        client: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Уведомление менеджеру
    if (managerId && managerId !== req.userId) {
      await sendNotification(
        managerId,
        'Новый лид',
        `Вам назначен новый лид от ${lead.client.name}`,
        'lead',
        `/leads/${lead.id}`
      );
    }

    broadcastLeadUpdate(lead.id, lead);

    res.status(201).json(lead);
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ error: 'Ошибка при создании лида' });
  }
});

// Обновить лид
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, managerId, value, description, source, deadline, nextContactDate, clientPhone, clientName } = req.body;

    const existingLead = await prisma.lead.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!existingLead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }

    if (!canAccessLeadByManager(req, existingLead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (managerId !== undefined) updateData.managerId = managerId;
    if (value !== undefined) updateData.value = value ? parseFloat(value) : null;
    if (description !== undefined) updateData.description = description;
    if (source !== undefined) updateData.source = source;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (nextContactDate !== undefined) updateData.nextContactDate = nextContactDate ? new Date(nextContactDate) : null;

    // Если лид переведен в заказ - НЕ создаем заказ автоматически
    // Заказ должен быть создан вручную через модальное окно на фронтенде
    // Это предотвращает дублирование заказов
    if (status === 'ORDER_PLACED' && existingLead.status !== 'ORDER_PLACED') {
      updateData.convertedAt = new Date();
      
      // Проверяем, не создан ли уже заказ для этого клиента
      // Если заказ уже существует, не создаем новый
      const existingOrder = await prisma.order.findFirst({
        where: {
          clientId: existingLead.clientId,
        },
        orderBy: { createdAt: 'desc' },
      });

      // НЕ создаем заказ автоматически - он должен быть создан вручную через модальное окно
      // Это предотвращает дублирование заказов
      // Заказ создается пользователем через модальное окно на фронтенде
    }

    // Обновляем данные клиента при переходе на MOVED_TO_WHATSAPP
    if (status === 'MOVED_TO_WHATSAPP' && (clientPhone || clientName)) {
      const clientUpdateData: any = {};
      if (clientPhone) clientUpdateData.phone = clientPhone;
      if (clientName) clientUpdateData.name = clientName;
      
      if (Object.keys(clientUpdateData).length > 0) {
        await prisma.client.update({
          where: { id: existingLead.clientId },
          data: clientUpdateData,
        });
      }
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Уведомление при смене менеджера
    if (managerId && managerId !== existingLead.managerId && managerId !== req.userId) {
      await sendNotification(
        managerId,
        'Новый лид',
        `Вам назначен лид от ${lead.client.name}`,
        'lead',
        `/leads/${lead.id}`
      );
    }

    broadcastLeadUpdate(lead.id, lead);

    res.json(lead);
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении лида' });
  }
});

// Закрыть контакт и сохранить в архив
router.post('/:id/close', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Укажите причину закрытия контакта' });
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
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

    const result = await prisma.$transaction(async (tx) => {
      const closedContact = await tx.closedContact.create({
        data: {
          leadId: lead.id,
          clientId: lead.clientId,
          managerId: lead.managerId,
          clientName: lead.client?.name || 'Неизвестный клиент',
          clientPhone: lead.client?.phone,
          source: lead.source,
          reason: reason.trim(),
          notes: lead.description || undefined,
        },
      });

      await tx.lead.delete({
        where: { id: lead.id },
      });

      return closedContact;
    });

    res.json({ success: true, closedContact: result });
  } catch (error) {
    console.error('Close lead error:', error);
    res.status(500).json({ error: 'Ошибка при закрытии контакта' });
  }
});

// Удалить лид
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const lead = await prisma.lead.findUnique({
      where: { id },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }

    if (!canDeleteLead(req)) {
      return res.status(403).json({
        error:
          'Удалять лид без архива могут только руководитель отдела продаж, администратор или уполномоченные сотрудники. Остальные могут закрыть контакт.',
      });
    }

    await prisma.lead.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'Ошибка при удалении лида' });
  }
});

// Добавить комментарий к лиду
router.post('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Содержимое комментария обязательно' });
    }

    const leadForComment = await prisma.lead.findUnique({
      where: { id },
      select: { managerId: true },
    });
    if (!leadForComment) {
      return res.status(404).json({ error: 'Лид не найден' });
    }
    if (!canAccessLeadByManager(req, leadForComment.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.userId!,
        leadId: id,
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
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Ошибка при создании комментария' });
  }
});

export default router;
