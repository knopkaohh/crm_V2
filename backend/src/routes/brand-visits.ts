import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { BrandVisitStage } from '@prisma/client';
import { sortFunnelManagers } from '../utils/funnel-managers';

const router = express.Router();

const CLIENT_NOTES_SOURCE = 'Источник: Бренды на выезд';

function placeholderPhone(): string {
  const n = Math.floor(1000000 + Math.random() * 8999999);
  return `+7999000${n}`;
}

function appendClientNotes(existing: string | null | undefined, block: string): string {
  const base = (existing ?? '').trim();
  if (!base) return block.trim();
  return `${base}\n\n${block.trim()}`;
}

function canManageBrandVisit(req: AuthRequest, managerId: string): boolean {
  if (req.userRole === 'ADMIN') return true;
  return req.userId === managerId;
}

const visitInclude = {
  client: {
    select: { id: true, name: true, company: true, phone: true, notes: true },
  },
  manager: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;

router.get('/managers', authenticate, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });
    res.json(sortFunnelManagers(users));
  } catch (error) {
    console.error('brand-visits managers error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке менеджеров' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { managerId } = req.query;

    const where: { managerId?: string } = {};
    if (managerId && typeof managerId === 'string' && managerId !== 'ALL') {
      where.managerId = managerId;
    }

    const rows = await prisma.brandVisit.findMany({
      where,
      include: visitInclude,
      orderBy: { createdAt: 'desc' },
    });

    res.json(rows);
  } catch (error) {
    console.error('brand-visits list error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке воронки' });
  }
});

router.patch('/:id/stage', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body as { stage?: string };

    if (!stage || !Object.values(BrandVisitStage).includes(stage as BrandVisitStage)) {
      return res.status(400).json({ error: 'Некорректный этап' });
    }

    const existing = await prisma.brandVisit.findUnique({
      where: { id },
      select: { managerId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageBrandVisit(req, existing.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const updated = await prisma.brandVisit.update({
      where: { id },
      data: { stage: stage as BrandVisitStage },
      include: visitInclude,
    });

    res.json(updated);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    console.error('brand-visits patch stage error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении этапа' });
  }
});

/** Новые бренды → договорился о встрече: контакт в карточку клиента */
router.post('/:id/take-in-work', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const body = req.body as {
      fullName?: string;
      phone?: string;
      position?: string;
      notes?: string;
    };

    const fullName = (body.fullName ?? '').trim();
    const phone = (body.phone ?? '').trim();
    const position = (body.position ?? '').trim();
    const notes = (body.notes ?? '').trim();

    if (!fullName) {
      return res.status(400).json({ error: 'Укажите ФИО' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Укажите номер телефона' });
    }

    const visit = await prisma.brandVisit.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!visit) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageBrandVisit(req, visit.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (visit.stage !== BrandVisitStage.NEW_BRANDS) {
      return res.status(400).json({ error: 'Действие доступно только на этапе «Новые бренды»' });
    }

    const noteLines: string[] = ['Бренды на выезд — договорились о встрече'];
    if (position) noteLines.push(`Должность: ${position}`);
    if (notes) noteLines.push(`Заметки: ${notes}`);
    const noteBlock = noteLines.join('\n');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: visit.clientId },
        data: {
          name: fullName,
          phone,
          notes: appendClientNotes(visit.client.notes, noteBlock),
        },
      });

      return tx.brandVisit.update({
        where: { id },
        data: {
          stage: BrandVisitStage.MEETING_SCHEDULED,
          meetingNotes: notes || null,
        },
        include: visitInclude,
      });
    });

    res.json(updated);
  } catch (error) {
    console.error('brand-visits take-in-work error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении' });
  }
});

router.post('/:id/meeting-completed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const notes = ((req.body as { notes?: string }).notes ?? '').trim();

    const visit = await prisma.brandVisit.findUnique({ where: { id } });
    if (!visit) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageBrandVisit(req, visit.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (visit.stage !== BrandVisitStage.MEETING_SCHEDULED) {
      return res.status(400).json({ error: 'Действие доступно только на этапе «Договорился о встрече»' });
    }

    const updated = await prisma.brandVisit.update({
      where: { id },
      data: {
        stage: BrandVisitStage.MEETING_COMPLETED,
        meetingNotes: notes || visit.meetingNotes,
      },
      include: visitInclude,
    });

    res.json(updated);
  } catch (error) {
    console.error('brand-visits meeting-completed error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении' });
  }
});

router.post('/:id/meeting-failed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const reason = ((req.body as { reason?: string }).reason ?? '').trim();

    if (!reason) {
      return res.status(400).json({ error: 'Укажите причину' });
    }

    const visit = await prisma.brandVisit.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!visit) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageBrandVisit(req, visit.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (visit.stage !== BrandVisitStage.MEETING_SCHEDULED) {
      return res.status(400).json({ error: 'Действие доступно только на этапе «Договорился о встрече»' });
    }

    const noteBlock = `Бренды на выезд — встреча не состоялась\nПричина: ${reason}`;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: visit.clientId },
        data: {
          notes: appendClientNotes(visit.client.notes, noteBlock),
        },
      });

      return tx.brandVisit.update({
        where: { id },
        data: {
          stage: BrandVisitStage.MEETING_FAILED,
          failureReason: reason,
        },
        include: visitInclude,
      });
    });

    res.json(updated);
  } catch (error) {
    console.error('brand-visits meeting-failed error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении' });
  }
});

type BatchItem = { brandName: string; managerId: string };

router.post('/batch', authenticate, async (req: AuthRequest, res) => {
  try {
    const { items } = req.body as { items?: BatchItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Нет строк для сохранения' });
    }

    const cleaned: BatchItem[] = items
      .map((row) => ({
        brandName: (row.brandName || '').trim(),
        managerId: (row.managerId || '').trim(),
      }))
      .filter((row) => row.brandName.length > 0 && row.managerId.length > 0);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'Заполните название бренда и менеджера хотя бы в одной строке' });
    }

    const managerIds = [...new Set(cleaned.map((i) => i.managerId))];
    const managers = await prisma.user.findMany({
      where: { id: { in: managerIds }, isActive: true },
      select: { id: true },
    });
    if (managers.length !== managerIds.length) {
      return res.status(400).json({ error: 'Указан неизвестный или неактивный менеджер' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of cleaned) {
        const client = await tx.client.create({
          data: {
            name: item.brandName,
            company: item.brandName,
            phone: placeholderPhone(),
            notes: CLIENT_NOTES_SOURCE,
            createdById: req.userId ?? undefined,
          },
        });

        const visit = await tx.brandVisit.create({
          data: {
            clientId: client.id,
            managerId: item.managerId,
            stage: BrandVisitStage.NEW_BRANDS,
            createdById: req.userId ?? undefined,
          },
          include: visitInclude,
        });
        results.push(visit);
      }
      return results;
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('brand-visits batch error:', error);
    res.status(500).json({ error: 'Ошибка при создании карточек' });
  }
});

export default router;
