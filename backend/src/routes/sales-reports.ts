import express from 'express';
import { SalesReportChannel } from '@prisma/client';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import {
  SALES_REPORT_CHANNELS,
  SALES_REPORT_CHANNEL_LABELS,
  SALES_REPORT_PARTICIPANT_EMAILS,
  conversionPercent,
  canEditReportDate,
  formatDateOnly,
  normalizeDateOnlyString,
  parseDateOnly,
  parsePeriodMonth,
} from '../utils/sales-report-participants';

const router = express.Router();

const CHANNEL_SET = new Set<string>(SALES_REPORT_CHANNELS);

async function loadParticipants() {
  const users = await prisma.user.findMany({
    where: {
      email: { in: [...SALES_REPORT_PARTICIPANT_EMAILS] },
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });

  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  return SALES_REPORT_PARTICIPANT_EMAILS
    .map((email) => byEmail.get(email.toLowerCase()))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
}

function aggregateChannels(
  rows: Array<{
    channel: SalesReportChannel;
    applications: number;
    interested: number;
    orders: number;
  }>,
  channelFilter?: string,
) {
  const channels = channelFilter && CHANNEL_SET.has(channelFilter)
    ? [channelFilter as SalesReportChannel]
    : [...SALES_REPORT_CHANNELS];

  return channels.map((ch) => {
    const filtered = rows.filter((r) => r.channel === ch);
    const applications = filtered.reduce((s, r) => s + r.applications, 0);
    const interested = filtered.reduce((s, r) => s + r.interested, 0);
    const orders = filtered.reduce((s, r) => s + r.orders, 0);
    return {
      channel: ch,
      label: SALES_REPORT_CHANNEL_LABELS[ch],
      applications,
      interested,
      orders,
      conversionPercent: conversionPercent(applications, orders),
    };
  });
}

// Участники отчёта (фиксированный порядок)
router.get('/participants', authenticate, async (_req, res) => {
  try {
    const participants = await loadParticipants();
    res.json(participants);
  } catch (error) {
    console.error('Sales report participants error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке участников' });
  }
});

// Дашборд / сводка за месяц
router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const period = (req.query.period as string) || '';
    const managerIdFilter = req.query.managerId as string | undefined;
    const channelFilter = req.query.channel as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const range = parsePeriodMonth(period);
    if (!range) {
      return res.status(400).json({ error: 'Укажите период в формате YYYY-MM' });
    }

    let start = range.start;
    let end = range.end;
    if (dateFrom) {
      const d = parseDateOnly(dateFrom);
      if (!d) return res.status(400).json({ error: 'Некорректная dateFrom' });
      if (d > start) start = d;
    }
    if (dateTo) {
      const d = parseDateOnly(dateTo);
      if (!d) return res.status(400).json({ error: 'Некорректная dateTo' });
      d.setHours(23, 59, 59, 999);
      if (d < end) end = d;
    }

    const participants = await loadParticipants();
    const participantIds = participants.map((p) => p.id);
    const allowedIds = managerIdFilter
      ? participantIds.filter((id) => id === managerIdFilter)
      : participantIds;

    const rows = await prisma.dailySalesReport.findMany({
      where: {
        managerId: { in: allowedIds },
        date: { gte: start, lte: end },
        ...(channelFilter && CHANNEL_SET.has(channelFilter)
          ? { channel: channelFilter as SalesReportChannel }
          : {}),
      },
    });

    const normalized = rows.map((r) => ({
      managerId: r.managerId,
      date: formatDateOnly(r.date),
      channel: r.channel,
      applications: r.applications,
      interested: r.interested,
      orders: r.orders,
    }));

    const byChannel = aggregateChannels(normalized, channelFilter);
    const totalApplications = byChannel.reduce((s, c) => s + c.applications, 0);
    const totalInterested = normalized.reduce((s, r) => s + r.interested, 0);
    const totalOrders = byChannel.reduce((s, c) => s + c.orders, 0);

    const managers = participants
      .filter((p) => allowedIds.includes(p.id))
      .map((p) => {
        const managerRows = normalized.filter((r) => r.managerId === p.id);
        const dates = [...new Set(managerRows.map((r) => r.date))].sort();

        const days = dates.map((dateStr) => {
          const dayRows = managerRows.filter((r) => r.date === dateStr);
          const channels = aggregateChannels(dayRows, channelFilter);
          const applications = channels.reduce((s, c) => s + c.applications, 0);
          const interested = channels.reduce((s, c) => s + c.interested, 0);
          const orders = channels.reduce((s, c) => s + c.orders, 0);
          return {
            date: dateStr,
            channels,
            totals: {
              applications,
              interested,
              orders,
              conversionPercent: conversionPercent(applications, orders),
            },
          };
        });

        const allChannels = aggregateChannels(managerRows, channelFilter);
        const applications = allChannels.reduce((s, c) => s + c.applications, 0);
        const interested = allChannels.reduce((s, c) => s + c.interested, 0);
        const orders = allChannels.reduce((s, c) => s + c.orders, 0);

        return {
          managerId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          monthTotals: {
            applications,
            interested,
            orders,
            conversionPercent: conversionPercent(applications, orders),
          },
          days,
        };
      });

    res.json({
      period,
      summary: {
        totalApplications,
        totalInterested,
        totalOrders,
        conversionPercent: conversionPercent(totalApplications, totalOrders),
        byChannel,
      },
      managers,
    });
  } catch (error) {
    console.error('Sales report dashboard error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке статистики' });
  }
});

// Отчёт за конкретный день (для формы)
router.get('/day', authenticate, async (req: AuthRequest, res) => {
  try {
    const dateStr = req.query.date as string;
    const managerId = (req.query.managerId as string) || req.userId!;

    const dateNorm = normalizeDateOnlyString(dateStr || '');
    if (!dateNorm) {
      return res.status(400).json({ error: 'Укажите дату в формате YYYY-MM-DD' });
    }
    const date = parseDateOnly(dateNorm)!;

    const participants = await loadParticipants();
    if (!participants.some((p) => p.id === managerId)) {
      return res.status(400).json({ error: 'Менеджер не участвует в отчёте' });
    }

    if (managerId !== req.userId && req.userRole !== 'ADMIN' && req.userRole !== 'EXECUTIVE') {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const rows = await prisma.dailySalesReport.findMany({
      where: { managerId, date },
    });

    const byChannel = new Map(rows.map((r) => [r.channel, r]));
    const entries = SALES_REPORT_CHANNELS.map((ch) => {
      const row = byChannel.get(ch);
      return {
        channel: ch,
        label: SALES_REPORT_CHANNEL_LABELS[ch],
        applications: row?.applications ?? 0,
        interested: row?.interested ?? 0,
        orders: row?.orders ?? 0,
      };
    });

    res.json({
      date: dateNorm,
      managerId,
      exists: rows.length > 0,
      canEdit: canEditReportDate(req.userRole, date),
      entries,
    });
  } catch (error) {
    console.error('Sales report day error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке отчёта' });
  }
});

// Сохранить дневной отчёт
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { date: dateStr, entries } = req.body as {
      date?: string;
      entries?: Array<{
        channel: string;
        applications?: number;
        interested?: number;
        orders?: number;
      }>;
    };

    const managerId = req.userId!;
    const participants = await loadParticipants();
    if (!participants.some((p) => p.id === managerId)) {
      return res.status(403).json({ error: 'Вы не участвуете в отчёте по продажам' });
    }

    const dateNorm = normalizeDateOnlyString(dateStr || '');
    if (!dateNorm) {
      return res.status(400).json({ error: 'Укажите дату в формате YYYY-MM-DD' });
    }

    const date = parseDateOnly(dateNorm)!;

    if (!canEditReportDate(req.userRole, date)) {
      return res.status(403).json({
        error: 'Можно редактировать только отчёт за сегодня и последний рабочий день',
      });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Укажите данные по каналам' });
    }

    for (const entry of entries) {
      if (!CHANNEL_SET.has(entry.channel)) {
        return res.status(400).json({ error: `Недопустимый канал: ${entry.channel}` });
      }
      const applications = Math.max(0, Math.floor(Number(entry.applications ?? 0)));
      const interested = Math.max(0, Math.floor(Number(entry.interested ?? 0)));
      const orders = Math.max(0, Math.floor(Number(entry.orders ?? 0)));

      if (orders > applications) {
        return res.status(400).json({
          error: `Заказов не может быть больше заявок (${SALES_REPORT_CHANNEL_LABELS[entry.channel as SalesReportChannel]})`,
        });
      }

      await prisma.dailySalesReport.upsert({
        where: {
          managerId_date_channel: {
            managerId,
            date,
            channel: entry.channel as SalesReportChannel,
          },
        },
        create: {
          managerId,
          date,
          channel: entry.channel as SalesReportChannel,
          applications,
          interested,
          orders,
        },
        update: {
          applications,
          interested,
          orders,
        },
      });
    }

    res.json({ success: true, date: dateNorm });
  } catch (error) {
    console.error('Save sales report error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении отчёта' });
  }
});

// Удалить дневной отчёт менеджера (только администратор)
router.delete('/day', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const dateStr = req.query.date as string;
    const managerId = req.query.managerId as string;

    if (!managerId) {
      return res.status(400).json({ error: 'Укажите managerId' });
    }

    const dateNorm = normalizeDateOnlyString(dateStr || '');
    if (!dateNorm) {
      return res.status(400).json({ error: 'Укажите дату в формате YYYY-MM-DD' });
    }

    const participants = await loadParticipants();
    if (!participants.some((p) => p.id === managerId)) {
      return res.status(400).json({ error: 'Менеджер не участвует в отчёте' });
    }

    const existing = await prisma.dailySalesReport.findMany({
      where: { managerId },
      select: { id: true, date: true },
    });

    const idsToDelete = existing
      .filter((row) => formatDateOnly(row.date) === dateNorm)
      .map((row) => row.id);

    if (idsToDelete.length === 0) {
      return res.status(404).json({ error: 'Отчёт за указанную дату не найден' });
    }

    const result = await prisma.dailySalesReport.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('Delete sales report day error:', error);
    res.status(500).json({ error: 'Ошибка при удалении отчёта' });
  }
});

export default router;
