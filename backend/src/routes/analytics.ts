import express from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const router = express.Router();

/** Кто может быть в планах продаж и в блоке выручки (как в project-sales / заказы). */
function salesFacingUserWhereClause(): {
  isActive: boolean;
  OR: Array<
    | { role: { in: UserRole[] } }
    | { secondaryRoles: { has: UserRole } }
  >;
} {
  return {
    isActive: true,
    OR: [
      { role: { in: [UserRole.SALES_MANAGER, UserRole.CLIENT_MANAGER] } },
      { secondaryRoles: { has: UserRole.SALES_MANAGER } },
      { secondaryRoles: { has: UserRole.CLIENT_MANAGER } },
    ],
  };
}
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const getValidatedPeriod = (raw: unknown) => {
  if (typeof raw !== 'string' || !PERIOD_REGEX.test(raw)) return null;
  return raw;
};

// Получить метрики для дашборда
router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole!;

    const whereManager = userRole === 'SALES_MANAGER' ? { managerId: userId } : {};
    const whereCreator = userRole === 'SALES_MANAGER' ? { creatorId: userId } : {};
    const whereAssignee = userRole === 'SALES_MANAGER' ? { assigneeId: userId } : {};
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Оптимизация: выполняем все запросы параллельно
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalLeads,
      newLeads,
      convertedLeads,
      totalOrders,
      newOrders,
      inProductionOrders,
      readyOrders,
      todayTasks,
      overdueTasks,
      totalRevenue,
      currentMonthOrders,
      currentMonthOrderStats,
      currentMonthProducedUnits,
      currentMonthLeads,
      currentMonthOrdersWithItems,
      salesManagers,
    ] = await Promise.all([
      prisma.lead.count({ where: whereManager }),
      prisma.lead.count({ where: { ...whereManager, status: 'NEW_LEAD' } }),
      prisma.lead.count({ where: { ...whereManager, status: 'ORDER_PLACED' } }),
      prisma.order.count({ where: whereManager }),
      prisma.order.count({ where: { ...whereManager, status: 'NEW_ORDER' } }),
      prisma.order.count({ where: { ...whereManager, status: 'IN_PRODUCTION' } }),
      prisma.order.count({ where: { ...whereManager, status: 'ORDER_READY' } }),
      prisma.task.count({
        where: {
          ...whereAssignee,
          dueDate: { gte: today, lt: tomorrow },
          status: { not: 'COMPLETED' },
        },
      }),
      prisma.task.count({
        where: {
          ...whereAssignee,
          dueDate: { lt: today },
          status: { not: 'COMPLETED' },
        },
      }),
      prisma.order.aggregate({
        where: {
          ...whereManager,
          status: 'ORDER_DELIVERED',
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.count({
        where: {
          ...whereManager,
          createdAt: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
      }),
      prisma.order.aggregate({
        where: {
          ...whereManager,
          createdAt: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
        _sum: {
          totalAmount: true,
        },
        _avg: {
          totalAmount: true,
        },
      }),
      prisma.orderItem.aggregate({
        where: {
          order: {
            ...whereManager,
            createdAt: {
              gte: currentMonthStart,
              lt: nextMonthStart,
            },
          },
        },
        _sum: {
          quantity: true,
        },
      }),
      prisma.lead.findMany({
        where: {
          ...whereManager,
          createdAt: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
        select: {
          source: true,
        },
      }),
      prisma.order.findMany({
        where: {
          ...whereManager,
          createdAt: {
            gte: currentMonthStart,
            lt: nextMonthStart,
          },
        },
        select: {
          managerId: true,
          totalAmount: true,
          manager: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          items: {
            select: {
              name: true,
              price: true,
            },
          },
        },
      }),
      prisma.user.findMany({
        where:
          userRole === 'SALES_MANAGER'
            ? { id: userId, isActive: true }
            : salesFacingUserWhereClause(),
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);

    const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
    const currentMonthLeadBySource = currentMonthLeads.reduce(
      (acc, lead) => {
        const source = normalize(lead.source);
        if (!source) return acc;

        if (source.includes('avito') || source.includes('авито')) {
          acc.avito += 1;
        } else if (source.includes('сайт') || source.includes('site')) {
          acc.site += 1;
        } else if (source.includes('обзвон')) {
          acc.calls += 1;
        } else if (source.includes('проект')) {
          acc.projectSales += 1;
        }
        return acc;
      },
      {
        site: 0,
        avito: 0,
        calls: 0,
        projectSales: 0,
      }
    );

    // Конверсия лидов
    const conversionRate =
      totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';

    const managerRevenueMap = salesManagers.reduce(
      (acc, manager) => {
        acc[manager.id] = {
          managerId: manager.id,
          name: `${manager.firstName} ${manager.lastName}`.trim(),
          assemblyRevenue: 0,
          packageRevenue: 0,
        };
        return acc;
      },
      {} as Record<
        string,
        { managerId: string; name: string; assemblyRevenue: number; packageRevenue: number }
      >
    );

    const isPackageItem = (name: string | null | undefined) => {
      const normalized = (name ?? '').trim().toLowerCase();
      return normalized.includes('zip-lock') || normalized.includes('zip lock') || normalized.includes('пакет');
    };

    currentMonthOrdersWithItems.forEach((order) => {
      const managerNameFromOrder = `${order.manager.firstName} ${order.manager.lastName}`.trim();
      const managerBucket =
        managerRevenueMap[order.managerId] ??
        (managerRevenueMap[order.managerId] = {
          managerId: order.managerId,
          name: managerNameFromOrder || 'Менеджер',
          assemblyRevenue: 0,
          packageRevenue: 0,
        });

      const packageItemsRevenue = order.items.reduce((sum, item) => {
        if (!isPackageItem(item.name)) return sum;
        return sum + Number(item.price || 0);
      }, 0);
      const itemsTotalRevenue = order.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const orderTotalRevenue = Number(order.totalAmount || 0);
      const hasItemsBreakdown = itemsTotalRevenue > 0;

      if (!hasItemsBreakdown) {
        managerBucket.assemblyRevenue += orderTotalRevenue;
        return;
      }

      const clampedPackageRevenue = Math.max(0, Math.min(packageItemsRevenue, itemsTotalRevenue));
      const packageShare = itemsTotalRevenue > 0 ? clampedPackageRevenue / itemsTotalRevenue : 0;
      const packageRevenue = orderTotalRevenue * packageShare;
      const assemblyRevenue = orderTotalRevenue - packageRevenue;

      managerBucket.packageRevenue += packageRevenue;
      managerBucket.assemblyRevenue += assemblyRevenue;
    });

    const managerRevenue = Object.values(managerRevenueMap).map((manager) => ({
      ...manager,
      assemblyRevenue: Number(manager.assemblyRevenue.toFixed(2)),
      packageRevenue: Number(manager.packageRevenue.toFixed(2)),
    }));

    /** Текущий список активных менеджеров продаж (те же границы доступа, что у блока выручки) — для планов и клиентов без угадывания ФИО */
    const salesManagersPayload = salesManagers.map((m) => ({
      managerId: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
    }));

    res.json({
      leads: {
        total: totalLeads,
        new: newLeads,
        converted: convertedLeads,
        conversionRate: `${conversionRate}%`,
      },
      orders: {
        total: totalOrders,
        new: newOrders,
        inProduction: inProductionOrders,
        ready: readyOrders,
      },
      tasks: {
        today: todayTasks,
        overdue: overdueTasks,
      },
      revenue: {
        total: Number(totalRevenue._sum.totalAmount || 0),
      },
      salesManagers: salesManagersPayload,
      currentMonth: {
        ordersTotal: currentMonthOrders,
        revenueTotal: Number(currentMonthOrderStats._sum.totalAmount || 0),
        averageCheck: Number(currentMonthOrderStats._avg.totalAmount || 0),
        producedUnitsTotal: Number(currentMonthProducedUnits._sum.quantity || 0),
        leadsTotal: currentMonthLeads.length,
        leadsBySource: currentMonthLeadBySource,
        managerRevenue,
      },
    });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({ error: 'Ошибка при получении аналитики' });
  }
});

router.get('/manager-plans', authenticate, async (req: AuthRequest, res) => {
  try {
    const period = getValidatedPeriod(req.query.period);
    if (!period) {
      return res.status(400).json({ error: 'Некорректный период. Используйте формат YYYY-MM' });
    }

    const plans = await prisma.monthlyManagerPlan.findMany({
      where: {
        period,
      },
      select: {
        managerId: true,
        planAmount: true,
      },
    });

    res.json({
      period,
      plans: plans.map((plan) => ({
        managerId: plan.managerId,
        planAmount: Number(plan.planAmount),
      })),
    });
  } catch (error) {
    console.error('Get manager plans error:', error);
    res.status(500).json({ error: 'Ошибка при получении планов менеджеров' });
  }
});

router.post('/manager-plans', authenticate, requireRole('EXECUTIVE', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const period = getValidatedPeriod(req.body?.period);
    const plans = Array.isArray(req.body?.plans) ? req.body.plans : null;
    if (!period || !plans) {
      return res.status(400).json({ error: 'Передайте period (YYYY-MM) и массив plans' });
    }

    const rawPlans = plans
      .map((plan: any) => ({
        managerId: typeof plan?.managerId === 'string' ? plan.managerId.trim() : '',
        planAmount: Number(plan?.planAmount ?? 0),
      }))
      .filter((plan: { managerId: string; planAmount: number }) =>
        Boolean(plan.managerId) && Number.isFinite(plan.planAmount) && plan.planAmount >= 0
      );

    const planByManager = new Map<string, number>();
    for (const row of rawPlans) {
      planByManager.set(row.managerId, row.planAmount);
    }
    const normalizedPlans = [...planByManager.entries()].map(([managerId, planAmount]) => ({
      managerId,
      planAmount,
    }));

    const managerIds = normalizedPlans.map((p) => p.managerId);
    if (managerIds.length > 0) {
      const existing = await prisma.user.findMany({
        where: { id: { in: managerIds } },
        select: { id: true },
      });
      const allowed = new Set(existing.map((u) => u.id));
      const unknown = managerIds.filter((id) => !allowed.has(id));
      if (unknown.length > 0) {
        console.warn('POST /manager-plans: unknown user ids', unknown);
        return res.status(400).json({ error: 'В плане указаны несуществующие пользователи (id)' });
      }
    }

    await prisma.$transaction([
      prisma.monthlyManagerPlan.deleteMany({ where: { period } }),
      ...(normalizedPlans.length > 0
        ? [
            prisma.monthlyManagerPlan.createMany({
              data: normalizedPlans.map((plan: { managerId: string; planAmount: number }) => ({
                period,
                managerId: plan.managerId,
                planAmount: plan.planAmount,
              })),
            }),
          ]
        : []),
    ]);

    res.json({
      period,
      plans: normalizedPlans,
    });
  } catch (error) {
    console.error('Save manager plans error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении планов менеджеров' });
  }
});

// Отчет по менеджерам (только для исполнителей и админов)
router.get('/managers', authenticate, requireRole('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate as string);
    }

    const managers = await prisma.user.findMany({
      where: {
        role: 'SALES_MANAGER',
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const report = await Promise.all(
      managers.map(async (manager) => {
        const leads = await prisma.lead.count({
          where: {
            managerId: manager.id,
            ...dateFilter,
          },
        });

        const convertedLeads = await prisma.lead.count({
          where: {
            managerId: manager.id,
            status: 'ORDER_PLACED',
            ...dateFilter,
          },
        });

        const orders = await prisma.order.count({
          where: {
            managerId: manager.id,
            ...dateFilter,
          },
        });

        const revenue = await prisma.order.aggregate({
          where: {
            managerId: manager.id,
            status: 'ORDER_DELIVERED',
            ...dateFilter,
          },
          _sum: {
            totalAmount: true,
          },
        });

        return {
          manager,
          leads,
          convertedLeads,
          conversionRate: leads > 0 ? ((convertedLeads / leads) * 100).toFixed(1) : '0',
          orders,
          revenue: Number(revenue._sum.totalAmount || 0),
        };
      })
    );

    res.json(report);
  } catch (error) {
    console.error('Get managers report error:', error);
    res.status(500).json({ error: 'Ошибка при получении отчета по менеджерам' });
  }
});

// Экспорт в Excel
router.get('/export/excel', authenticate, requireRole('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate as string);
    }

    let data: any[] = [];
    let filename = 'report.xlsx';

    if (type === 'leads') {
      const leads = await prisma.lead.findMany({
        where: dateFilter,
        include: {
          client: true,
          manager: true,
        },
      });

      data = leads.map((lead) => ({
        'ID': lead.id,
        'Клиент': lead.client.name,
        'Менеджер': `${lead.manager.firstName} ${lead.manager.lastName}`,
        'Статус': lead.status,
        'Сумма': lead.value || 0,
        'Дата создания': lead.createdAt.toISOString().split('T')[0],
      }));

      filename = 'leads.xlsx';
    } else if (type === 'orders') {
      const orders = await prisma.order.findMany({
        where: dateFilter,
        include: {
          client: true,
          manager: true,
        },
      });

      data = orders.map((order) => ({
        'Номер заказа': order.orderNumber,
        'Клиент': order.client.name,
        'Менеджер': `${order.manager.firstName} ${order.manager.lastName}`,
        'Статус': order.status,
        'Сумма': Number(order.totalAmount),
        'Дата создания': order.createdAt.toISOString().split('T')[0],
        'Срок': order.deadline ? order.deadline.toISOString().split('T')[0] : '',
      }));

      filename = 'orders.xlsx';
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Данные');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({ error: 'Ошибка при экспорте в Excel' });
  }
});

// Экспорт в CSV
router.get('/export/csv', authenticate, requireRole('EXECUTIVE', 'ADMIN'), async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate as string);
    }

    let data: any[] = [];
    let filename = 'report.csv';

    if (type === 'leads') {
      const leads = await prisma.lead.findMany({
        where: dateFilter,
        include: {
          client: true,
          manager: true,
        },
      });

      data = leads.map((lead) => ({
        'ID': lead.id,
        'Клиент': lead.client.name,
        'Менеджер': `${lead.manager.firstName} ${lead.manager.lastName}`,
        'Статус': lead.status,
        'Сумма': lead.value || 0,
        'Дата создания': lead.createdAt.toISOString().split('T')[0],
      }));

      filename = 'leads.csv';
    } else if (type === 'orders') {
      const orders = await prisma.order.findMany({
        where: dateFilter,
        include: {
          client: true,
          manager: true,
        },
      });

      data = orders.map((order) => ({
        'Номер заказа': order.orderNumber,
        'Клиент': order.client.name,
        'Менеджер': `${order.manager.firstName} ${order.manager.lastName}`,
        'Статус': order.status,
        'Сумма': Number(order.totalAmount),
        'Дата создания': order.createdAt.toISOString().split('T')[0],
        'Срок': order.deadline ? order.deadline.toISOString().split('T')[0] : '',
      }));

      filename = 'orders.csv';
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csv); // BOM для корректного отображения кириллицы в Excel
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ error: 'Ошибка при экспорте в CSV' });
  }
});

export default router;
