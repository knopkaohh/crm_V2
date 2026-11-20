import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendNotification, broadcastLeadUpdate, broadcastOrderUpdate } from '../utils/socket';
import {
  isLeadContactDueTodayOrOverdue,
  sendLeadCallDueNotification,
} from '../utils/lead-call-notifications';
import { prisma } from '../utils/prisma';
import { generateOrderNumber } from '../utils/order-utils';
import { generateProposalPdf, ProposalPdfItem } from '../utils/generate-proposal';
import { canViewAllLeads, canDeleteLead, canAccessLeadByManager } from '../utils/leads-access';
import {
  andWhere,
  isIsolatedRole,
  ISOLATED_ROLE,
  leadListScope,
  rejectIfClientHidden,
  rejectIfLeadHidden,
} from '../utils/isolated-access';

const router = express.Router();

const LEAD_FUNNEL_STAGES = [
  'NEW_LEAD',
  'NO_CONTACT',
  'IN_DIALOGUE',
  'PREPARING_KP',
  'WAITING_CLIENT',
] as const;

function clipText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseProposalPayload(body: any): {
  error?: string;
  clientName: string;
  companyName: string;
  productLine: string;
  subtitle: string;
  intro: string;
  termsPrice: string;
  termsPayment: string;
  termsDelivery: string;
  closingTitle: string;
  closingText: string;
  moveToWaiting: boolean;
  items: ProposalPdfItem[];
} {
  const clientName = clipText(body?.clientName, 160);
  const companyName = clipText(body?.companyName, 160);
  const productLine = clipText(body?.productLine, 80);
  const subtitle = clipText(body?.subtitle, 240);
  const intro = String(body?.intro ?? '').trim().slice(0, 1200);
  const termsPrice = clipText(body?.termsPrice, 400);
  const termsPayment = clipText(body?.termsPayment, 400);
  const termsDelivery = clipText(body?.termsDelivery, 400);
  const closingTitle = clipText(body?.closingTitle, 160) || 'Будем рады сотрудничеству!';
  const closingText = clipText(body?.closingText, 400) || 'Готовы уточнить детали заказа и согласовать удобные условия поставки.';
  const moveToWaiting = Boolean(body?.moveToWaiting);
  const base = {
    clientName,
    companyName,
    productLine,
    subtitle,
    intro,
    termsPrice,
    termsPayment,
    termsDelivery,
    closingTitle,
    closingText,
    moveToWaiting,
    items: [] as ProposalPdfItem[],
  };

  if (!clientName) {
    return { ...base, error: 'Укажите ФИО клиента' };
  }
  if (!companyName) {
    return { ...base, error: 'Укажите название компании' };
  }
  if (!productLine) {
    return { ...base, error: 'Укажите линейку, например «Упаковка Zip-Lock»' };
  }
  if (!subtitle || !intro) {
    return { ...base, error: 'Заполните подзаголовок и абзац' };
  }
  if (!termsPrice || !termsPayment || !termsDelivery) {
    return { ...base, error: 'Заполните условия заказа' };
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0 || rawItems.length > 20) {
    return { ...base, error: 'Добавьте от 1 до 20 позиций' };
  }

  const items: ProposalPdfItem[] = [];
  for (const raw of rawItems) {
    const name = clipText(raw?.name, 160);
    const detail = clipText(raw?.detail, 120);
    const quantity = Number(raw?.quantity);
    const unitPrice = Number(String(raw?.unitPrice ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!name || !Number.isFinite(quantity) || quantity < 1 || quantity > 100_000_000 || !Number.isInteger(quantity)) {
      return { ...base, error: 'Проверьте наименование и количество в спецификации' };
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100_000_000) {
      return { ...base, error: 'Проверьте цену за единицу' };
    }
    items.push({ name, detail, quantity, unitPrice: Math.round(unitPrice * 100) / 100 });
  }

  return { ...base, items };
}

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

    const scopedWhere = andWhere(where, await leadListScope(authReq));

    // Определяем порядок сортировки
    let orderBy: any = { createdAt: 'desc' };
    if (contactDateFilter === 'future') {
      orderBy = { nextContactDate: 'asc' }; // Ближайшие даты сверху
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where: scopedWhere,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              phone: true,
              company: true,
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
      prisma.lead.count({ where: scopedWhere }),
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

/** Список пользователей для фильтра «Менеджер» на вкладке Контакты */
router.get('/managers', authenticate, async (req: AuthRequest, res) => {
  try {
    if (isIsolatedRole(req.userRole)) {
      const me = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });
      return res.json(me ? [me] : []);
    }

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json(users.filter((user) => user.role !== ISOLATED_ROLE));
  } catch (error) {
    console.error('Get lead managers error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке списка менеджеров' });
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

    if (await rejectIfLeadHidden(req, res, lead)) return;

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

    if (await rejectIfClientHidden(req, res, clientId)) return;
    const resolvedManagerId = isIsolatedRole(req.userRole) ? req.userId! : (managerId || req.userId!);

    const lead = await prisma.lead.create({
      data: {
        clientId,
        status: status || 'NEW_LEAD',
        managerId: resolvedManagerId,
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
    if (!isIsolatedRole(req.userRole) && resolvedManagerId && resolvedManagerId !== req.userId) {
      await sendNotification(
        resolvedManagerId,
        'Новый лид',
        `Вам назначен новый лид от ${lead.client.name}`,
        'lead',
        `/leads/${lead.id}`
      );
    }

    if (
      lead.managerId &&
      lead.nextContactDate &&
      isLeadContactDueTodayOrOverdue(lead.nextContactDate)
    ) {
      await sendLeadCallDueNotification({
        leadId: lead.id,
        managerId: lead.managerId,
        clientName: lead.client.name,
        description: lead.description,
      });
    }

    if (!isIsolatedRole(req.userRole)) {
      broadcastLeadUpdate(lead.id, lead);
    }

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
    const { status, managerId, value, description, source, deadline, nextContactDate, clientPhone, clientName, funnelStage } = req.body;

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

    if (await rejectIfLeadHidden(req, res, existingLead)) return;

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (funnelStage !== undefined) {
      if (!LEAD_FUNNEL_STAGES.includes(funnelStage)) {
        return res.status(400).json({ error: 'Неизвестный этап воронки' });
      }
      updateData.funnelStage = funnelStage;
    }
    if (managerId !== undefined && !isIsolatedRole(req.userRole)) updateData.managerId = managerId;
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
    if (!isIsolatedRole(req.userRole) && managerId && managerId !== existingLead.managerId && managerId !== req.userId) {
      await sendNotification(
        managerId,
        'Новый лид',
        `Вам назначен лид от ${lead.client.name}`,
        'lead',
        `/leads/${lead.id}`
      );
    }

    const nextContact =
      lead.nextContactDate ?? existingLead.nextContactDate;
    const contactDateChanged =
      nextContactDate !== undefined &&
      (existingLead.nextContactDate?.getTime() !==
        lead.nextContactDate?.getTime() ||
        (!existingLead.nextContactDate && lead.nextContactDate));

    if (
      lead.managerId &&
      nextContact &&
      isLeadContactDueTodayOrOverdue(nextContact) &&
      (contactDateChanged ||
        (managerId !== undefined && managerId !== existingLead.managerId))
    ) {
      await sendLeadCallDueNotification({
        leadId: lead.id,
        managerId: lead.managerId,
        clientName: lead.client.name,
        description: lead.description,
      });
    }

    if (!isIsolatedRole(req.userRole)) {
      broadcastLeadUpdate(lead.id, lead);
    }

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

    if (await rejectIfLeadHidden(req, res, lead)) return;

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
    if (await rejectIfLeadHidden(req, res, leadForComment)) return;

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

router.get('/:id/proposal', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, managerId: true },
    });
    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }
    if (!canAccessLeadByManager(req, lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }
    if (await rejectIfLeadHidden(req, res, lead)) return;

    const proposal = await prisma.commercialProposal.findFirst({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    if (!proposal) {
      return res.json({ proposal: null });
    }

    res.json({
      proposal: {
        clientName: proposal.clientName,
        companyName: proposal.companyName,
        productLine: proposal.productLine,
        subtitle: proposal.subtitle,
        intro: proposal.intro,
        termsPrice: proposal.termsPrice,
        termsPayment: proposal.termsPayment,
        termsDelivery: proposal.termsDelivery,
        closingTitle: proposal.closingTitle,
        closingText: proposal.closingText,
        items: proposal.items.map((item) => ({
          name: item.name,
          detail: item.detail,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
      },
    });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке коммерческого предложения' });
  }
});

router.post('/proposal-file', authenticate, async (req: AuthRequest, res) => {
  try {
    const parsed = parseProposalPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const leadId = typeof req.body?.leadId === 'string' ? req.body.leadId : '';
    if (leadId && parsed.moveToWaiting) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, managerId: true },
      });
      if (lead && canAccessLeadByManager(req, lead.managerId)) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { funnelStage: 'WAITING_CLIENT' },
        });
      }
    }

    const pdf = await generateProposalPdf(parsed);
    const fileName = `КП ${parsed.productLine}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposal.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.send(pdf);
  } catch (error) {
    console.error('Create standalone proposal error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка при формировании коммерческого предложения' });
    }
  }
});

router.post('/:id/proposal', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const parsed = parseProposalPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, managerId: true },
    });
    if (!lead) {
      return res.status(404).json({ error: 'Лид не найден' });
    }
    if (!canAccessLeadByManager(req, lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }
    if (await rejectIfLeadHidden(req, res, lead)) return;

    await prisma.commercialProposal.create({
      data: {
        leadId: id,
        clientName: parsed.clientName,
        companyName: parsed.companyName,
        productLine: parsed.productLine,
        subtitle: parsed.subtitle,
        intro: parsed.intro,
        termsPrice: parsed.termsPrice,
        termsPayment: parsed.termsPayment,
        termsDelivery: parsed.termsDelivery,
        closingTitle: parsed.closingTitle,
        closingText: parsed.closingText,
        createdById: req.userId!,
        items: {
          create: parsed.items.map((item, index) => ({
            position: index + 1,
            name: item.name,
            detail: item.detail,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toFixed(2),
          })),
        },
      },
    });

    if (parsed.moveToWaiting) {
      await prisma.lead.update({
        where: { id },
        data: { funnelStage: 'WAITING_CLIENT' },
      });
    }

    const pdf = await generateProposalPdf(parsed);
    const fileName = `КП ${parsed.productLine}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposal.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.send(pdf);
  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({ error: 'Ошибка при формировании коммерческого предложения' });
  }
});

export default router;
