import express from 'express';
import { Prisma } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendNotification, broadcastOrderUpdate, broadcastLeadUpdate } from '../utils/socket';
import { generateInvoicePDF } from '../utils/generate-invoice';
import { prisma } from '../utils/prisma';
import { generateOrderNumber } from '../utils/order-utils';
import { notifyAllUsersAboutNewOrder } from '../utils/telegram';
import { canAccessLeadByManager } from '../utils/leads-access';

const router = express.Router();

/** Только свой заказ для менеджера продаж; остальные роли — по текущей политике заказов */
function canMutateOrder(req: AuthRequest, managerId: string): boolean {
  if (req.userRole === 'SALES_MANAGER') {
    return Boolean(req.userId && req.userId === managerId);
  }
  return true;
}

async function recalcOrderTotalAmount(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;
  const totalAmount = order.items.reduce((sum, it) => sum + Number(it.price), 0);
  await prisma.order.update({
    where: { id: orderId },
    data: { totalAmount },
  });
}

// Получить все заказы
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, managerId, clientId, search, page = '1', limit = '100' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10) || 100, 200); // Максимум 200
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // Менеджеры видят только свои заказы, технолог - все в производстве, исполнитель - все
    const authReq = req as AuthRequest;
    if (authReq.userRole === 'SALES_MANAGER') {
      where.managerId = authReq.userId;
    } else if (authReq.userRole === 'TECHNOLOGIST') {
      // Технолог видит только заказы в производстве
      where.status = {
        in: ['NEW_ORDER', 'DESIGN_APPROVAL', 'AWAITING_MATERIALS', 'IN_PRODUCTION'],
      };
    }
    // EXECUTIVE и ADMIN видят все заказы без ограничений

    // Применяем фильтры из query параметров (они могут переопределить фильтры по ролям)
    if (status) {
      // Если есть фильтр по статусу, применяем его
      // Для технолога это может сузить выборку, для остальных - просто фильтр
      if (authReq.userRole === 'TECHNOLOGIST') {
        // Для технолога проверяем, что запрашиваемый статус входит в разрешенные
        const allowedStatuses = ['NEW_ORDER', 'DESIGN_APPROVAL', 'AWAITING_MATERIALS', 'IN_PRODUCTION'];
        if (allowedStatuses.includes(status as string)) {
          where.status = status;
        }
        // Если статус не разрешен, игнорируем его (оставляем фильтр по роли)
      } else {
        where.status = status;
      }
    }

    if (managerId) {
      where.managerId = managerId as string;
    }

    if (clientId) {
      where.clientId = clientId as string;
    }

    // Поиск по номеру заказа, клиенту или менеджеру
    // Если есть поиск, добавляем OR условия через AND
    if (search) {
      const searchConditions = {
        OR: [
          { orderNumber: { contains: search as string, mode: 'insensitive' } },
          { client: { name: { contains: search as string, mode: 'insensitive' } } },
          { client: { company: { contains: search as string, mode: 'insensitive' } } },
          { manager: { firstName: { contains: search as string, mode: 'insensitive' } } },
          { manager: { lastName: { contains: search as string, mode: 'insensitive' } } },
        ],
      };

      // Если уже есть другие условия, объединяем через AND
      if (Object.keys(where).length > 0) {
        Object.assign(where, {
          AND: [
            where,
            searchConditions,
          ],
        });
      } else {
        Object.assign(where, searchConditions);
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          deadline: true,
          notes: true,
          source: true,
          paymentType: true,
          prepayment: true,
          postpayment: true,
        designTakenAt: true,
        designTakenBy: true,
        designStage: true,
        designNeedsRevision: true,
        designComments: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        clientId: true,
          managerId: true,
          creatorId: true,
          client: {
            select: {
              id: true,
              name: true,
              phone: true,
              company: true,
              contactMethod: true,
              telegram: true,
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
          items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              price: true,
              material: true,
              desiredDeadline: true,
            },
          },
          _count: {
            select: {
              comments: true,
              files: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ 
      error: 'Ошибка при получении заказов',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Генерация PDF счета (выше /:id, чтобы не перехватывалось общим маршрутом)
router.get('/:id/invoice', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        managerId: true,
        orderNumber: true,
        totalAmount: true,
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            company: true,
            address: true,
            contactMethod: true,
            telegram: true,
          },
        },
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
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    if (
      req.userRole === 'SALES_MANAGER' &&
      order.managerId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const rawTimeout = parseInt(process.env.INVOICE_GENERATION_TIMEOUT_MS || '90000', 10);
    const timeoutMs = Math.min(Math.max(Number.isFinite(rawTimeout) ? rawTimeout : 90000, 5000), 300000);

    const pdfBuffer = await Promise.race([
      generateInvoicePDF({
        order: order as any,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Генерация счёта превысила ${timeoutMs} мс (увеличьте INVOICE_GENERATION_TIMEOUT_MS или используйте INVOICE_SIMPLE_FIRST=1 / INVOICE_SIMPLE_PDF=1)`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);

    const today = new Date();
    const formattedDate = today.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const fileName = `Счёт №${order.orderNumber} от ${formattedDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Generate invoice error:', error);
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({
      error: 'Ошибка при генерации счета',
      details: error?.message || 'Неизвестная ошибка',
    });
  }
});

// Получить заказ по ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        deadline: true,
        notes: true,
        source: true,
        paymentType: true,
        prepayment: true,
        postpayment: true,
        designTakenAt: true,
        designTakenBy: true,
        designStage: true,
        designNeedsRevision: true,
        designComments: true,
        description: true,
        deliveredAt: true,
        createdAt: true,
        updatedAt: true,
        clientId: true,
        managerId: true,
        creatorId: true,
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            company: true,
            address: true,
            contactMethod: true,
            telegram: true,
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
        designTakenByUser: {
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
            notes: true,
            material: true,
            designCount: true,
            baseColor: true,
            baseColorCustom: true,
            printColor: true,
            printColorCustom: true,
            cutting: true,
            centerFold: true,
            freeEdge: true,
            postProcessing: true,
            coating: true,
            singleSidedPrint: true,
            doubleSidedPrint: true,
            density: true,
            bagColor: true,
            sliderColor: true,
            desiredDeadline: true,
            productionComments: true,
            productionStartDate: true,
            productionEndDate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
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
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      order.managerId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Ошибка при получении заказа' });
  }
});

// Создать заказ
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { clientId, managerId, items, deadline, notes, orderNumber: providedOrderNumber, paymentType, prepayment, postpayment, source, leadId, description } = req.body;

    if (!clientId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Клиент и позиции заказа обязательны' });
    }

    // Расчет общей суммы - price уже содержит итоговую стоимость позиции
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + parseFloat(item.price || 0),
      0
    );

    // Использовать переданный номер заказа или сгенерировать новый
    let orderNumber = providedOrderNumber;
    if (!orderNumber || orderNumber.trim() === '') {
      orderNumber = await generateOrderNumber();
    } else {
      // Проверить уникальность переданного номера
      const existingOrder = await prisma.order.findUnique({
        where: { orderNumber: orderNumber.trim() },
      });
      if (existingOrder) {
        // Если номер уже существует, генерируем новый уникальный номер
        orderNumber = await generateOrderNumber();
      }
    }

    const orderData: any = {
      clientId,
      managerId: managerId || req.userId!,
      creatorId: req.userId!,
      orderNumber,
      totalAmount: totalAmount,
      deadline: deadline ? new Date(deadline) : null,
      notes: notes || null,
      source: source || null,
      description: description || null,
      status: 'NEW_ORDER',
      items: {
        create: items.map((item: any) => ({
          name: item.name || 'Позиция без названия',
          quantity: parseInt(item.quantity) || 1,
          price: parseFloat(item.price) || 0, // price уже содержит итоговую стоимость позиции
          notes: item.notes || null,
          desiredDeadline: item.desiredDeadline ? new Date(item.desiredDeadline) : null,
        })),
      },
    };

    // Добавляем форму оплаты
    if (paymentType) {
      orderData.paymentType = paymentType;
      if (paymentType === 'PARTIAL') {
        if (prepayment) orderData.prepayment = parseFloat(prepayment);
        if (postpayment) orderData.postpayment = parseFloat(postpayment);
      }
    }

    const order = await prisma.order.create({
      data: orderData,
      include: {
        client: true,
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
        items: true,
      },
    });

    // Глобальное уведомление о новом заказе для всех пользователей в CRM
    const allUsers = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await Promise.all(
      allUsers.map((user) =>
        sendNotification(
          user.id,
          'Новый заказ',
          `Создан новый заказ ${order.orderNumber} от ${order.client.name}`,
          'order',
          `/orders/${order.id}`
        )
      )
    );

    // Уведомление в Telegram всем пользователям, у которых подключен Telegram
    const managerFullName = `${order.manager.firstName} ${order.manager.lastName}`;
    await notifyAllUsersAboutNewOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      managerFullName,
    });

    // Уведомления
    if (managerId && managerId !== req.userId) {
      await sendNotification(
        managerId,
        'Новый заказ',
        `Создан заказ ${orderNumber} от ${order.client.name}`,
        'order',
        `/orders/${order.id}`
      );
    }

    // Уведомление технологам
    const technologists = await prisma.user.findMany({
      where: { role: 'TECHNOLOGIST', isActive: true },
    });

    await Promise.all(
      technologists.map(tech =>
        sendNotification(
          tech.id,
          'Новый заказ в производство',
          `Поступил заказ ${orderNumber} от ${order.client.name}`,
          'order',
          `/orders/${order.id}`
        )
      )
    );

    broadcastOrderUpdate(order.id, order);

    // Если заказ создан из лида, автоматически закрываем лид
    if (leadId) {
      console.log('Attempting to close lead:', leadId, 'User role:', req.userRole, 'User ID:', req.userId);
      try {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: {
            client: true,
            manager: true,
          },
        });

        if (!lead) {
          console.error('Lead not found:', leadId);
        } else if (!canAccessLeadByManager(req, lead.managerId)) {
          console.error('Order creation: no access to close lead', leadId);
        } else {
          console.log('Lead found:', lead.id, 'Manager ID:', lead.managerId);

          await prisma.$transaction(async (tx) => {
            // Создаем запись в закрытых контактах
            const closedContact = await tx.closedContact.create({
              data: {
                leadId: lead.id,
                clientId: lead.clientId,
                managerId: lead.managerId,
                clientName: lead.client?.name || 'Неизвестный клиент',
                clientPhone: lead.client?.phone,
                source: lead.source,
                reason: 'Заказ оформлен',
                notes: lead.description || undefined,
              },
            });

            console.log('Closed contact created:', closedContact.id);

            // Удаляем лид
            await tx.lead.delete({
              where: { id: lead.id },
            });

            console.log('Lead deleted successfully:', lead.id);
          });

          // Отправляем уведомление о закрытии лида через WebSocket
          broadcastLeadUpdate(lead.id, { deleted: true, closedContact: true });
        }
      } catch (leadCloseError: any) {
        // Логируем ошибку, но не прерываем создание заказа
        console.error('Failed to close lead after order creation:', leadCloseError);
        console.error('Error details:', {
          message: leadCloseError?.message,
          code: leadCloseError?.code,
          meta: leadCloseError?.meta,
          stack: leadCloseError?.stack,
        });
      }
    } else {
      console.log('No leadId provided in order creation request');
    }

    res.status(201).json(order);
  } catch (error: any) {
    console.error('Create order error:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    res.status(500).json({ 
      error: 'Ошибка при создании заказа',
      details: error?.message || 'Неизвестная ошибка',
    });
  }
});

// Обновить заказ
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      deadline,
      notes,
      designComments,
      takeDesign,
      designApproved,
      sendForApproval,
      description,
      source,
      designStage,
      designNeedsRevision,
      items: itemsPayload,
      orderNumber: bodyOrderNumber,
    } = req.body;

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      include: { manager: true, client: true },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    // Проверка прав доступа
    if (
      req.userRole === 'SALES_MANAGER' &&
      existingOrder.managerId !== req.userId
    ) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (designComments !== undefined) updateData.designComments = designComments;
    if (description !== undefined) updateData.description = description;
    if (source !== undefined) updateData.source = source;
    if (designStage !== undefined) updateData.designStage = designStage;
    if (designNeedsRevision !== undefined) updateData.designNeedsRevision = Boolean(designNeedsRevision);

    if (bodyOrderNumber !== undefined && bodyOrderNumber !== null) {
      const nextNum = String(bodyOrderNumber).trim();
      if (!nextNum) {
        return res.status(400).json({ error: 'Номер заказа не может быть пустым' });
      }
      if (nextNum !== existingOrder.orderNumber) {
        const taken = await prisma.order.findFirst({
          where: { orderNumber: nextNum, id: { not: id } },
          select: { id: true },
        });
        if (taken) {
          return res.status(409).json({
            error: 'Заказ с таким номером уже есть',
            details: nextNum,
          });
        }
        updateData.orderNumber = nextNum;
      }
    }

    // Обработка "Взять в работу"
    if (takeDesign === true) {
      updateData.designTakenAt = new Date();
      updateData.designTakenBy = req.userId;
    }
    
    // Обработка "Макет утвержден" - заказ остается на том же этапе
    if (designApproved === true) {
      // Можно добавить поле designApprovedAt в будущем, но сейчас просто обрабатываем запрос
      // Статус не меняем, заказ остается на этапе DESIGN_APPROVAL
    }
    
    // Обработка "Отправить на согласование"
    if (sendForApproval === true && existingOrder.status === 'DESIGN_APPROVAL') {
      updateData.designStage = 'ON_APPROVAL';
      updateData.designNeedsRevision = false;
      // Сохраняем комментарии, статус остается DESIGN_APPROVAL
      // Уведомление менеджеру о том, что макет отправлен на согласование
      await sendNotification(
        existingOrder.managerId,
        'Макет отправлен на согласование',
        `Макет для заказа ${existingOrder.orderNumber} отправлен клиенту ${existingOrder.client.name} на согласование`,
        'order',
        `/orders/${existingOrder.id}`
      );
    }

    // Если заказ готов или доставлен
    if (status === 'ORDER_READY') {
      updateData.deliveredAt = null; // Сброс, т.к. еще не доставлен
      // Уведомление менеджеру
      await sendNotification(
        existingOrder.managerId,
        'Заказ готов',
        `Заказ ${existingOrder.orderNumber} готов к отгрузке`,
        'order',
        `/orders/${existingOrder.id}`
      );
    } else if (status === 'ORDER_DELIVERED') {
      updateData.deliveredAt = new Date();
      await sendNotification(
        existingOrder.managerId,
        'Заказ доставлен',
        `Заказ ${existingOrder.orderNumber} доставлен клиенту`,
        'order',
        `/orders/${existingOrder.id}`
      );
    }
    if (designApproved === true) {
      updateData.designNeedsRevision = false;
      if (existingOrder.status === 'DESIGN_APPROVAL' && status === undefined) {
        updateData.status = 'AWAITING_MATERIALS';
      }
    }

    if (Array.isArray(itemsPayload)) {
      if (itemsPayload.length === 0) {
        return res.status(400).json({ error: 'Нужна хотя бы одна позиция заказа' });
      }

      let syncedTotal: number;
      try {
        syncedTotal = await prisma.$transaction(async (tx) => {
          const existingRows = await tx.orderItem.findMany({
            where: { orderId: id },
            select: { id: true },
          });
          const existingIds = new Set(existingRows.map((r) => r.id));

          for (const raw of itemsPayload) {
            const rid = raw?.id ? String(raw.id) : '';
            if (rid && !existingIds.has(rid)) {
              throw new Error('BAD_ITEM_ID');
            }
          }

          const incomingIds = new Set(
            itemsPayload.filter((i: any) => i?.id).map((i: any) => String(i.id)),
          );
          const toRemove = [...existingIds].filter((eid) => !incomingIds.has(eid));
          if (toRemove.length > 0) {
            await tx.orderItem.deleteMany({
              where: { orderId: id, id: { in: toRemove } },
            });
          }

          for (const raw of itemsPayload) {
            const name = String(raw.name ?? '').trim() || 'Позиция';
            const quantity = Math.max(1, parseInt(String(raw.quantity ?? 1), 10) || 1);
            const price = parseFloat(String(raw.price ?? 0)) || 0;
            const material =
              raw.material !== undefined && raw.material !== null
                ? String(raw.material).trim() || null
                : null;
            let notesVal: string | null = null;
            if (raw.notes !== undefined && raw.notes !== null) {
              const n = String(raw.notes).trim();
              notesVal = n.length ? n : null;
            }

            const rowId = raw?.id ? String(raw.id) : '';

            if (rowId && existingIds.has(rowId)) {
              const itemUpdate: any = { name, quantity, price, material };
              if (raw.notes !== undefined) itemUpdate.notes = notesVal;
              await tx.orderItem.update({
                where: { id: rowId },
                data: itemUpdate,
              });
            } else {
              await tx.orderItem.create({
                data: {
                  orderId: id,
                  name,
                  quantity,
                  price,
                  material,
                  notes: notesVal,
                },
              });
            }
          }

          const allItems = await tx.orderItem.findMany({ where: { orderId: id } });
          return allItems.reduce((sum, it) => sum + Number(it.price), 0);
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'BAD_ITEM_ID') {
          return res.status(400).json({ error: 'Указан неизвестный id позиции' });
        }
        console.error('Sync order items error:', e);
        return res.status(500).json({ error: 'Ошибка при сохранении позиций заказа' });
      }

      updateData.totalAmount = syncedTotal;
    }

    const order = await prisma.order.update({
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
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        designTakenByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        items: true,
      },
    });

    broadcastOrderUpdate(order.id, order);

    res.json(order);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Этот номер заказа уже занят' });
    }
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении заказа' });
  }
});

// Добавить позицию к заказу
router.post('/:id/items', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, quantity, price, notes } = req.body;

    if (!name || !quantity || !price) {
      return res.status(400).json({ error: 'Название, количество и цена обязательны' });
    }

    const parentOrder = await prisma.order.findUnique({
      where: { id },
      select: { id: true, managerId: true },
    });
    if (!parentOrder) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    if (!canMutateOrder(req, parentOrder.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const item = await prisma.orderItem.create({
      data: {
        orderId: id,
        name,
        quantity: parseInt(quantity),
        price: parseFloat(price),
        notes,
      },
    });

    // Пересчет общей суммы заказа - price уже содержит итоговую стоимость позиции
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (order) {
      const totalAmount = order.items.reduce(
        (sum, item) => sum + Number(item.price),
        0
      );

      await prisma.order.update({
        where: { id },
        data: { totalAmount },
      });
    }

    res.status(201).json(item);
  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({ error: 'Ошибка при добавлении позиции' });
  }
});

// Обновить позицию заказа
router.put('/:orderId/items/:itemId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId, itemId } = req.params;
    const updateData = req.body;

    console.log('Update item request:', { orderId, itemId, updateData });

    // Проверяем, что позиция принадлежит заказу
    const existingItem = await prisma.orderItem.findUnique({
      where: { id: itemId },
      include: { order: true },
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Позиция заказа не найдена' });
    }

    if (existingItem.orderId !== orderId) {
      return res.status(400).json({ error: 'Позиция не принадлежит указанному заказу' });
    }

    if (!canMutateOrder(req, existingItem.order.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    // Преобразуем дату, если она есть
    if (updateData.desiredDeadline) {
      updateData.desiredDeadline = new Date(updateData.desiredDeadline);
    } else if (updateData.desiredDeadline === null || updateData.desiredDeadline === '') {
      updateData.desiredDeadline = null;
    }

    // Удаляем undefined значения и пустые строки для опциональных полей
    const cleanedData: any = {};
    Object.keys(updateData).forEach(key => {
      const value = updateData[key];
      // Пропускаем undefined, но сохраняем null, false, 0, и пустые строки для некоторых полей
      if (value !== undefined) {
        // Для boolean полей, если значение null, оставляем null (для опциональных полей)
        if (key === 'singleSidedPrint' || key === 'doubleSidedPrint') {
          // Boolean поля могут быть true, false или null
          cleanedData[key] = value === null ? null : Boolean(value);
        }
        // Для строковых полей, которые могут быть null, преобразуем пустые строки в null
        else if (typeof value === 'string' && value === '' && 
            ['material', 'baseColor', 'printColor', 'cutting', 'centerFold', 'freeEdge', 
             'postProcessing', 'coating', 'density', 'bagColor', 'sliderColor', 
             'baseColorCustom', 'printColorCustom', 'productionComments'].includes(key)) {
          cleanedData[key] = null;
        } else {
          cleanedData[key] = value;
        }
      }
    });

    console.log('Cleaned update data:', cleanedData);

    const item = await prisma.orderItem.update({
      where: { id: itemId },
      data: cleanedData,
    });

    await recalcOrderTotalAmount(orderId);

    res.json(item);
  } catch (error: any) {
    console.error('Update item error:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    res.status(500).json({ 
      error: 'Ошибка при обновлении позиции',
      details: error?.message || 'Неизвестная ошибка',
    });
  }
});

// Добавить комментарий к заказу
router.post('/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Содержимое комментария обязательно' });
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.userId!,
        orderId: id,
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

// Удалить заказ
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingOrder = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        managerId: true,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    if (req.userRole === 'SALES_MANAGER' && existingOrder.managerId !== req.userId) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    await prisma.order.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: 'Ошибка при удалении заказа' });
  }
});

export default router;
