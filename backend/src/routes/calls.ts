import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendNotification } from '../utils/socket';
import { prisma } from '../utils/prisma';
import { normalizePhone } from '../utils/phone';
import { syncColdCallsFromGoogleSheets } from '../utils/cold-calls-sync';

const router = express.Router();

const CLOSED_REASON_BY_STATUS: Record<string, string> = {
  REPLACEMENT: 'Замена',
  NOT_OUR_CLIENT: 'Не наш клиент',
  NO_ANSWER: 'Недозвон x2',
};

const normalizeStatusForStats = (rawStatus: string): string => {
  const status = String(rawStatus || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  const aliases: Record<string, string> = {
    HOT: 'HOT_CONTACT',
    HOT_CLIENT: 'HOT_CONTACT',
    HOT_LEAD: 'HOT_CONTACT',
    ГОРЯЧИЙ_КОНТАКТ: 'HOT_CONTACT',
    ГОРЯЧИЙ: 'HOT_CONTACT',
    WILL_BUY: 'WILL_ORDER',
    ORDER_SOON: 'WILL_ORDER',
    ОФОРМИТ_ЗАКАЗ: 'WILL_ORDER',
  };

  return aliases[status] || status;
};

const toClosedContactFromCall = async (callId: string, reason: string, notes?: string | null) => {
  await prisma.$transaction(async (tx) => {
    const call = await tx.call.findUnique({
      where: { id: callId },
      include: { client: true },
    });

    if (!call) {
      throw new Error('Звонок не найден');
    }

    await tx.closedContact.create({
      data: {
        clientId: call.clientId,
        managerId: call.assignedManagerId || call.userId,
        clientName: call.client?.name || 'Холодный контакт',
        clientPhone: call.phoneNumber,
        source: call.source || null,
        reason,
        notes: notes || call.callComment || call.notes || undefined,
      },
    });

    // Keep call record for statistics/history, hide from active list via closedAt.
    await tx.call.update({
      where: { id: call.id },
      data: {
        closedAt: new Date(),
        closedReason: reason,
        callComment: notes || call.callComment || call.notes || null,
      },
    });
  });
};

const isMissingColumnError = (error: any) => {
  return error?.code === 'P2022' || String(error?.message || '').includes('does not exist in the current database');
};

// Получить все звонки
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { status, managerId, clientId, dateFrom, dateTo, source, includeClosed = 'false' } = req.query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (managerId) {
      where.assignedManagerId = managerId as string;
    }

    if (clientId) {
      where.clientId = clientId as string;
    }

    if (source && source !== 'ALL') {
      where.source = source as string;
    }

    if (dateFrom || dateTo) {
      where.phoneReceivedAt = {};
      if (dateFrom) where.phoneReceivedAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) where.phoneReceivedAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    if (includeClosed !== 'true') {
      where.closedAt = null;
    }

    if (req.userRole === 'SALES_MANAGER') {
      where.OR = [
        { assignedManagerId: req.userId },
        { assignedManagerId: null },
      ];
    }

    let calls: any[] = [];
    try {
      calls = await prisma.call.findMany({
        where,
        include: {
          client: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          assignedManager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ phoneReceivedAt: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;

      // Backward compatibility while DB migration is not applied yet
      const legacyWhere: any = {};
      if (status) legacyWhere.status = status;
      if (clientId) legacyWhere.clientId = clientId as string;
      if (req.userRole === 'SALES_MANAGER') legacyWhere.userId = req.userId;

      calls = await prisma.call.findMany({
        where: legacyWhere,
        include: {
          client: true,
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

      calls = calls.map((call) => ({
        ...call,
        assignedManagerId: call.userId,
        assignedManager: call.user,
        source: null,
        phoneReceivedAt: call.createdAt,
      }));
    }

    res.json(calls);
  } catch (error) {
    console.error('Get calls error:', error);
    res.status(500).json({ error: 'Ошибка при получении звонков' });
  }
});

// Запустить ручную синхронизацию Google Sheets
router.post('/sync/google-sheets', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!['ADMIN', 'EXECUTIVE'].includes(req.userRole || '')) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const result = await syncColdCallsFromGoogleSheets();
    res.json(result);
  } catch (error) {
    console.error('Manual Google Sheets sync error:', error);
    const message = (error as Error)?.message || 'Ошибка ручной синхронизации';
    const clientError =
      message.includes('Не настроен') ||
      message.includes('GOOGLE_') ||
      message.includes('невалидный JSON') ||
      message.includes('GOOGLE_SERVICE_ACCOUNT') ||
      message.includes('Не удалось прочитать');
    res.status(clientError ? 400 : 500).json({ error: message });
  }
});

// Явно перенести номер в закрытые из UI
router.post('/:id/move-to-closed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    const call = await prisma.call.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        assignedManagerId: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    const ownerId = call.assignedManagerId || call.userId;
    if (
      req.userRole === 'SALES_MANAGER' &&
      ownerId &&
      ownerId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    await toClosedContactFromCall(
      id,
      (reason || 'Горячий контакт').trim(),
      notes || null
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Move call to closed error:', error);
    res.status(500).json({ error: 'Ошибка при переносе номера в закрытые' });
  }
});

// Удалить звонок из теплых обзвонов без архивации
router.delete('/:id/remove', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const call = await prisma.call.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        assignedManagerId: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    const ownerId = call.assignedManagerId || call.userId;
    if (req.userRole === 'SALES_MANAGER' && ownerId && ownerId !== req.userId) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    // Soft-close call so it remains in statistics with its last business status
    // (e.g. HOT_CONTACT / WILL_ORDER), instead of rewriting to CONVERTED_TO_LEAD.
    await prisma.call.update({
      where: { id },
      data: {
        closedAt: new Date(),
        closedReason: 'Удален из теплых обзвонов',
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove call error:', error);
    res.status(500).json({ error: 'Ошибка при удалении номера' });
  }
});

// Получить звонок по ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const call = await prisma.call.findUnique({
      where: { id },
      include: {
        client: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    // Проверка прав доступа: менеджер видит свои и свободные
    if (
      req.userRole === 'SALES_MANAGER' &&
      call.assignedManagerId &&
      call.assignedManagerId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    res.json(call);
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Ошибка при получении звонка' });
  }
});

// Создать запись о звонке
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { clientId, phoneNumber, status, duration, notes, callbackAt, source, phoneReceivedAt } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Номер телефона обязателен' });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Некорректный номер телефона' });
    }

    const closedDuplicate = await prisma.closedContact.findFirst({
      where: { clientPhone: normalizedPhone },
      select: { id: true },
    });

    if (closedDuplicate) {
      return res.status(409).json({ error: 'Номер уже находится в закрытых контактах' });
    }

    const activeDuplicate = await prisma.call.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        closedAt: null,
      },
      select: { id: true },
    });

    if (activeDuplicate) {
      return res.status(409).json({ error: 'Номер уже есть в активных холодных звонках' });
    }

    const call = await prisma.call.create({
      data: {
        clientId: clientId || null,
        phoneNumber: normalizedPhone,
        status: status || 'NO_ANSWER',
        userId: req.userId!,
        duration: duration ? parseInt(duration) : null,
        notes,
        source: source || null,
        phoneReceivedAt: phoneReceivedAt ? new Date(phoneReceivedAt) : null,
        callbackAt: callbackAt ? new Date(callbackAt) : null,
      },
      include: {
        client: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.status(201).json(call);
  } catch (error) {
    console.error('Create call error:', error);
    res.status(500).json({ error: 'Ошибка при создании записи о звонке' });
  }
});

// Обновить звонок
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, duration, notes, callbackAt, convertedToLeadId, source, callComment, phoneReceivedAt } = req.body;

    const existingCall = await prisma.call.findUnique({
      where: { id },
    });

    if (!existingCall) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      existingCall.assignedManagerId &&
      existingCall.assignedManagerId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (duration !== undefined) updateData.duration = duration ? parseInt(duration) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (callbackAt !== undefined) updateData.callbackAt = callbackAt ? new Date(callbackAt) : null;
    if (convertedToLeadId !== undefined) updateData.convertedToLeadId = convertedToLeadId;
    if (source !== undefined) updateData.source = source;
    if (callComment !== undefined) updateData.callComment = callComment;
    if (phoneReceivedAt !== undefined) updateData.phoneReceivedAt = phoneReceivedAt ? new Date(phoneReceivedAt) : null;

    const call = await prisma.call.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Если звонок переведен в лид
    if (convertedToLeadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: convertedToLeadId },
        include: { client: true },
      });

      if (lead) {
        await sendNotification(
          lead.managerId,
          'Новый лид из звонка',
          `Лид создан из холодного звонка: ${lead.client.name}`,
          'lead',
          `/leads/${lead.id}`
        );
      }
    }

    res.json(call);
  } catch (error) {
    console.error('Update call error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении звонка' });
  }
});

// Нажать "Позвонить" и закрепить номер за менеджером
router.post('/:id/start', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const call = await prisma.call.findUnique({ where: { id } });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    if (call.assignedManagerId && call.assignedManagerId !== req.userId) {
      return res.status(409).json({ error: 'Контакт уже закреплен за другим менеджером' });
    }

    const updated = await prisma.call.update({
      where: { id },
      data: {
        assignedManagerId: req.userId!,
        lastStatusAt: new Date(),
      },
      include: {
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Start call error:', error);
    res.status(500).json({ error: 'Ошибка при старте звонка' });
  }
});

// Завершить звонок со статусом и комментарием
router.post('/:id/finish', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Статус обязателен' });
    }

    if (status === 'NOT_OUR_CLIENT' && !comment?.trim()) {
      return res.status(400).json({ error: 'Для статуса "Не наш клиент" нужен комментарий' });
    }

    const call = await prisma.call.findUnique({
      where: { id },
      include: {
        assignedManager: true,
      },
    });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    if (req.userRole === 'SALES_MANAGER' && call.assignedManagerId !== req.userId) {
      return res.status(403).json({ error: 'Позвонить может только закрепленный менеджер' });
    }

    if (status === 'NO_ANSWER') {
      const nextNoAnswerCount = (call.noAnswerCount || 0) + 1;
      if (nextNoAnswerCount >= 2) {
        await prisma.call.update({
          where: { id },
          data: {
            status: 'NO_ANSWER',
            noAnswerCount: nextNoAnswerCount,
            callComment: comment || null,
            lastStatusAt: new Date(),
            assignedManagerId: req.userId!,
            closedAt: new Date(),
            closedReason: CLOSED_REASON_BY_STATUS.NO_ANSWER,
          },
        });
        return res.json({
          movedToClosed: true,
          reason: CLOSED_REASON_BY_STATUS.NO_ANSWER,
          callId: call.id,
        });
      }

      const nextDay = new Date();
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(9, 0, 0, 0);

      const updated = await prisma.call.update({
        where: { id },
        data: {
          status: 'NO_ANSWER',
          noAnswerCount: nextNoAnswerCount,
          callbackAt: nextDay,
          // Дата поступления в списке обзвонов — следующий день (когда перезваниваем)
          phoneReceivedAt: nextDay,
          callComment: comment || null,
          lastStatusAt: new Date(),
          assignedManagerId: req.userId!,
        },
      });

      return res.json({
        movedToClosed: false,
        call: updated,
        action: 'CALL_TOMORROW',
      });
    }

    if (status === 'REPLACEMENT' || status === 'NOT_OUR_CLIENT') {
      const updated = await prisma.call.update({
        where: { id },
        data: {
          status,
          callComment: comment || null,
          lastStatusAt: new Date(),
          assignedManagerId: req.userId!,
          closedAt: new Date(),
          closedReason: CLOSED_REASON_BY_STATUS[status],
        },
      });

      if (status === 'NOT_OUR_CLIENT') {
        await toClosedContactFromCall(updated.id, CLOSED_REASON_BY_STATUS[status], comment);
      }
      return res.json({
        movedToClosed: true,
        reason: CLOSED_REASON_BY_STATUS[status],
        callId: call.id,
      });
    }

    const updated = await prisma.call.update({
      where: { id },
      data: {
        status,
        callComment: comment || null,
        noAnswerCount: status === 'NO_ANSWER' ? call.noAnswerCount : 0,
        lastStatusAt: new Date(),
        assignedManagerId: req.userId!,
      },
      include: {
        client: true,
        assignedManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json({
      movedToClosed: false,
      call: updated,
      canCreateOrder: status === 'WILL_ORDER',
      canCreateLead: status === 'HOT_CONTACT',
    });
  } catch (error) {
    console.error('Finish call error:', error);
    res.status(500).json({ error: 'Ошибка при завершении звонка' });
  }
});

// Статистика по холодным обзвонам
router.get('/stats/summary', authenticate, async (req: AuthRequest, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where: any = {};
    const andFilters: any[] = [];

    if (dateFrom || dateTo) {
      const dateRange: any = {};
      if (dateFrom) dateRange.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) dateRange.lte = new Date(`${dateTo}T23:59:59.999Z`);

      // Prefer status update time. If it is absent, fall back to createdAt.
      andFilters.push({
        OR: [
          { lastStatusAt: dateRange },
          {
            AND: [
              { lastStatusAt: null },
              { createdAt: dateRange },
            ],
          },
        ],
      });
    }

    if (req.userRole === 'SALES_MANAGER') {
      // Backward compatibility: old rows can have only userId without assignedManagerId.
      andFilters.push({
        OR: [{ assignedManagerId: req.userId }, { userId: req.userId }],
      });
    }

    if (andFilters.length === 1) {
      Object.assign(where, andFilters[0]);
    } else if (andFilters.length > 1) {
      where.AND = andFilters;
    }

    let grouped: Array<{ assignedManagerId: string | null; userId: string; status: string; _count: { _all: number } }> = [];
    try {
      grouped = await prisma.call.groupBy({
        by: ['assignedManagerId', 'userId', 'status'],
        where,
        _count: {
          _all: true,
        },
      }) as any;
    } catch (error: any) {
      if (!isMissingColumnError(error)) throw error;

      const legacyWhere: any = {};
      if (dateFrom || dateTo) {
        legacyWhere.createdAt = {};
        if (dateFrom) legacyWhere.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
        if (dateTo) legacyWhere.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
      if (req.userRole === 'SALES_MANAGER') {
        legacyWhere.userId = req.userId;
      }

      const legacyGrouped = await prisma.call.groupBy({
        by: ['userId', 'status'],
        where: legacyWhere,
        _count: { _all: true },
      });

      grouped = legacyGrouped.map((row: any) => ({
        assignedManagerId: row.userId,
        userId: row.userId,
        status: row.status,
        _count: row._count,
      }));
    }

    const managerIds = [
      ...new Set(
        grouped
          .map((g) => g.assignedManagerId || g.userId)
          .filter(Boolean)
      ),
    ] as string[];
    const managers = managerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: managerIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        })
      : [];
    const managerMap = new Map(managers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));

    const data: Record<string, any> = {};
    for (const row of grouped) {
      const managerId = row.assignedManagerId || row.userId || 'unassigned';
      if (!data[managerId]) {
        data[managerId] = {
          managerId,
          managerName: managerId === 'unassigned' ? 'Без менеджера' : managerMap.get(managerId) || 'Неизвестный',
          total: 0,
          WILL_ORDER: 0,
          HOT_CONTACT: 0,
          NO_ANSWER: 0,
          REPLACEMENT: 0,
          NOT_OUR_CLIENT: 0,
          CONVERTED_TO_LEAD: 0,
        };
      }

      const normalizedStatus = normalizeStatusForStats(row.status);
      if (normalizedStatus in data[managerId]) {
        data[managerId][normalizedStatus] += row._count._all;
      }
      data[managerId].total += row._count._all;
    }

    res.json({ data: Object.values(data) });
  } catch (error) {
    console.error('Call stats error:', error);
    res.status(500).json({ error: 'Ошибка при расчете статистики' });
  }
});

// Преобразовать звонок в лид
router.post('/:id/convert-to-lead', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { managerId, value, description, source } = req.body;

    const call = await prisma.call.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!call) {
      return res.status(404).json({ error: 'Звонок не найден' });
    }

    // Если клиента нет, создаем его
    let clientId = call.clientId;
    if (!clientId) {
      const client = await prisma.client.create({
        data: {
          name: 'Новый клиент',
          phone: call.phoneNumber,
          createdById: req.userId!,
        },
      });
      clientId = client.id;
    }

    // Создаем лид
    const lead = await prisma.lead.create({
      data: {
        clientId,
        status: 'NEW_LEAD',
        managerId: managerId || call.assignedManagerId || req.userId!,
        creatorId: req.userId!,
        value: value ? parseFloat(value) : null,
        description: description || `Создан из холодного обзвона: ${call.callComment || call.notes || ''}`,
        source: source || call.source || 'Cold Call',
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

    // Обновляем звонок
    await prisma.call.update({
      where: { id },
      data: {
        status: 'CONVERTED_TO_LEAD',
        convertedToLeadId: lead.id,
        assignedManagerId: managerId || call.assignedManagerId || req.userId!,
        lastStatusAt: new Date(),
      },
    });

    // Уведомление менеджеру
    if (managerId && managerId !== req.userId) {
      await sendNotification(
        managerId,
        'Новый лид из звонка',
        `Лид создан из холодного звонка: ${lead.client.name}`,
        'lead',
        `/leads/${lead.id}`
      );
    }

    res.status(201).json(lead);
  } catch (error) {
    console.error('Convert call to lead error:', error);
    res.status(500).json({ error: 'Ошибка при преобразовании звонка в лид' });
  }
});

export default router;
