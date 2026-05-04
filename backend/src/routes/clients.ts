import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { canAccessLeadByManager } from '../utils/leads-access';

const router = express.Router();

// Получить всех клиентов
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, source, managerId, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100); // Максимум 100
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    const andConditions: any[] = [];

    // Поиск по имени, компании, телефону или номеру заказа
    if (search) {
      andConditions.push({
        OR: [
        { name: { contains: search as string, mode: 'insensitive' } },
        { company: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { orders: { some: { orderNumber: { contains: search as string, mode: 'insensitive' } } } },
        ],
      });
    }

    // Фильтр по источнику (из заметок клиента, лидов или заказов)
    if (source && source !== 'ALL') {
      const sourceValue = source as string;
      andConditions.push({
        OR: [
          { notes: { contains: `Источник: ${sourceValue}`, mode: 'insensitive' } },
          { leads: { some: { source: { equals: sourceValue, mode: 'insensitive' } } } },
          { orders: { some: { source: { equals: sourceValue, mode: 'insensitive' } } } },
        ],
      });
    }

    // Фильтр по менеджеру (по заказам клиента)
    if (managerId && managerId !== 'ALL') {
      andConditions.push({
        orders: {
          some: {
            managerId: managerId as string,
          },
        },
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
          whatsapp: true,
          contactMethod: true,
          telegram: true,
          createdAt: true,
          updatedAt: true,
          orders: {
            select: {
              id: true,
              managerId: true,
              manager: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1, // Последний заказ для даты
          },
          _count: {
            select: {
              orders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.client.count({ where }),
    ]);

    // Обработка данных для фронтенда
    const formattedClients = clients.map((client) => {
      const lastOrder = client.orders[0];
      return {
        id: client.id,
        name: client.name,
        company: client.company,
        phone: client.phone,
        email: client.email,
        whatsapp: client.whatsapp,
        contactMethod: client.contactMethod,
        telegram: client.telegram,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        ordersCount: client._count.orders,
        lastOrderDate: lastOrder?.createdAt || null,
        manager: lastOrder?.manager || null,
      };
    });

    res.json({
      data: formattedClients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Ошибка при получении клиентов' });
  }
});

// Закрытые контакты (архив)
router.get('/closed-contacts', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    const where: any = {};

    if (search) {
      where.OR = [
        { clientName: { contains: search as string, mode: 'insensitive' } },
        { clientPhone: { contains: search as string, mode: 'insensitive' } },
        { source: { contains: search as string, mode: 'insensitive' } },
        {
          manager: {
            OR: [
              { firstName: { contains: search as string, mode: 'insensitive' } },
              { lastName: { contains: search as string, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const closedContacts = await prisma.closedContact.findMany({
      where,
      include: {
        manager: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: closedContacts });
  } catch (error) {
    console.error('Failed to load closed contacts:', error);
    res.status(500).json({ error: 'Ошибка при загрузке закрытых контактов' });
  }
});

// Удалить закрытый контакт
router.delete('/closed-contacts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.closedContact.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete closed contact error:', error);
    res.status(500).json({ error: 'Не удалось удалить закрытый контакт' });
  }
});

// Закрыть клиента и перенести в архив закрытых контактов
router.post('/:id/close', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Укажите причину закрытия клиента' });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orders: true,
            leads: true,
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    if (client._count.orders > 0 || client._count.leads > 0) {
      return res.status(400).json({
        error: 'Нельзя закрыть клиента, у которого есть активные заказы или лиды',
      });
    }

    let sourceFromNotes: string | null = null;
    if (client.notes) {
      const sourceMatch = client.notes.match(/Источник:\s*(.+)/i);
      if (sourceMatch?.[1]) {
        sourceFromNotes = sourceMatch[1].trim();
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const closedContact = await tx.closedContact.create({
        data: {
          clientId: client.id,
          managerId: req.userId || null,
          clientName: client.name,
          clientPhone: client.phone || null,
          source: sourceFromNotes,
          reason: reason.trim(),
          notes: notes?.trim() || client.notes || undefined,
        },
      });

      await tx.client.delete({
        where: { id: client.id },
      });

      return closedContact;
    });

    res.json({ success: true, closedContact: result });
  } catch (error) {
    console.error('Close client error:', error);
    res.status(500).json({ error: 'Ошибка при закрытии клиента' });
  }
});

// Получить клиента по ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        phone: true,
        whatsapp: true,
        address: true,
        notes: true,
        contactMethod: true,
        telegram: true,
        createdAt: true,
        updatedAt: true,
        createdById: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            deadline: true,
            createdAt: true,
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            items: {
              select: {
                id: true,
                name: true,
                quantity: true,
                price: true,
              },
            },
            files: {
              select: {
                id: true,
                filename: true,
                originalName: true,
                mimeType: true,
                size: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            comments: {
              select: {
                id: true,
                content: true,
                createdAt: true,
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
          orderBy: { createdAt: 'desc' },
        },
        leads: {
          select: {
            id: true,
            status: true,
            value: true,
            description: true,
            source: true,
            deadline: true,
            nextContactDate: true,
            createdAt: true,
            manager: {
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
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    res.json(client);
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Ошибка при получении клиента' });
  }
});

// Добавить комментарий к клиенту
router.post('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content, orderId, leadId } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Содержимое комментария обязательно' });
    }

    // Если указан orderId или leadId, добавляем комментарий к заказу/лиду
    // Иначе создаем общий комментарий (можно расширить модель Client для комментариев)
    if (orderId) {
      const comment = await prisma.comment.create({
        data: {
          content,
          userId: req.userId!,
          orderId: orderId,
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
      return res.status(201).json(comment);
    } else if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId as string, clientId: id },
        select: { managerId: true },
      });
      if (!lead) {
        return res.status(404).json({ error: 'Лид не найден' });
      }
      if (!canAccessLeadByManager(req, lead.managerId)) {
        return res.status(403).json({ error: 'Недостаточно прав доступа' });
      }
      const comment = await prisma.comment.create({
        data: {
          content,
          userId: req.userId!,
          leadId: leadId,
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
      return res.status(201).json(comment);
    } else {
      return res.status(400).json({ error: 'Необходимо указать orderId или leadId' });
    }
  } catch (error) {
    console.error('Create client comment error:', error);
    res.status(500).json({ error: 'Ошибка при создании комментария' });
  }
});

// Создать клиента
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, company, email, phone, whatsapp, address, notes, contactMethod, telegram } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ error: 'Имя обязательно' });
    }
    const normalizedPhone =
      phone != null && String(phone).trim() !== '' ? String(phone).trim() : '';

    const client = await prisma.client.create({
      data: {
        name: trimmedName,
        company,
        email,
        phone: normalizedPhone,
        whatsapp,
        address,
        notes,
        contactMethod: contactMethod || null,
        telegram: telegram || null,
        createdById: req.userId!,
      },
    });

    res.status(201).json(client);
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Ошибка при создании клиента' });
  }
});

// Обновить клиента
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, email, phone, whatsapp, address, notes, contactMethod, telegram } = req.body;

    const client = await prisma.client.update({
      where: { id },
      data: {
        name,
        company,
        email,
        phone,
        whatsapp,
        address,
        notes,
        contactMethod: contactMethod !== undefined ? contactMethod : undefined,
        telegram: telegram !== undefined ? telegram : undefined,
      },
    });

    res.json(client);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении клиента' });
  }
});

// Удалить клиента
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.client.delete({
      where: { id },
    });

    res.json({ message: 'Клиент удален' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Ошибка при удалении клиента' });
  }
});

export default router;
