import express from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const router = express.Router();

// Получить метрики для дашборда
router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole!;

    const whereManager = userRole === 'SALES_MANAGER' ? { managerId: userId } : {};
    const whereCreator = userRole === 'SALES_MANAGER' ? { creatorId: userId } : {};
    const whereAssignee = userRole === 'SALES_MANAGER' ? { assigneeId: userId } : {};

    // Оптимизация: выполняем все запросы параллельно
    const today = new Date();
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
    ]);

    // Конверсия лидов
    const conversionRate =
      totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';

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
    });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({ error: 'Ошибка при получении аналитики' });
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
