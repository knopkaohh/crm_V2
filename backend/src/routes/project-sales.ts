import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { ProjectSaleStage, UserRole } from '@prisma/client';

const router = express.Router();

const CLIENT_NOTES_SOURCE = 'Источник: Проектные продажи';

function placeholderPhone(): string {
  const n = Math.floor(1000000 + Math.random() * 8999999);
  return `+7999000${n}`;
}

/** Менеджеры для выпадающих списков: активные, с ролью продаж / клиентский менеджер */
router.get('/managers', authenticate, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { in: [UserRole.SALES_MANAGER, UserRole.CLIENT_MANAGER] } },
          { secondaryRoles: { has: UserRole.SALES_MANAGER } },
          { secondaryRoles: { has: UserRole.CLIENT_MANAGER } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json(users);
  } catch (error) {
    console.error('project-sales managers error:', error);
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

    const rows = await prisma.projectSale.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            company: true,
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
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(rows);
  } catch (error) {
    console.error('project-sales list error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке воронки' });
  }
});

router.patch('/:id/stage', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body as { stage?: string };

    if (!stage || !Object.values(ProjectSaleStage).includes(stage as ProjectSaleStage)) {
      return res.status(400).json({ error: 'Некорректный этап' });
    }

    const updated = await prisma.projectSale.update({
      where: { id },
      data: { stage: stage as ProjectSaleStage },
      include: {
        client: {
          select: { id: true, name: true, company: true, phone: true },
        },
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
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
    console.error('project-sales patch stage error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении этапа' });
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

        const sale = await tx.projectSale.create({
          data: {
            clientId: client.id,
            managerId: item.managerId,
            stage: ProjectSaleStage.NEW_BRANDS,
            createdById: req.userId ?? undefined,
          },
          include: {
            client: {
              select: { id: true, name: true, company: true, phone: true },
            },
            manager: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        });
        results.push(sale);
      }
      return results;
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('project-sales batch error:', error);
    res.status(500).json({ error: 'Ошибка при создании карточек' });
  }
});

export default router;
