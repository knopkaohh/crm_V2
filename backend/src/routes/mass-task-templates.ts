import express from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import {
  DEFAULT_WEEKDAYS_MON_FRI,
  seedMassTaskTemplatesIfEmpty,
  WEEKDAY_BITS,
} from '../utils/mass-task-generator';
import { getTaskBoardManagers } from '../utils/task-board-managers';

const router = express.Router();

router.get('/', authenticate, requireRole('ADMIN', 'EXECUTIVE'), async (req: AuthRequest, res) => {
  try {
    await seedMassTaskTemplatesIfEmpty(req.userId!);

    const templates = await prisma.massTaskTemplate.findMany({
      orderBy: { title: 'asc' },
      include: {
        managers: {
          select: { managerId: true },
        },
      },
    });

    res.json(
      templates.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        systemKey: t.systemKey,
        weekdays: t.weekdays,
        isActive: t.isActive,
        linkPath: t.linkPath,
        managerIds: t.managers.map((m) => m.managerId),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    );
  } catch (error) {
    console.error('List mass task templates error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке массовых задач' });
  }
});

router.post('/', authenticate, requireRole('ADMIN', 'EXECUTIVE'), async (req: AuthRequest, res) => {
  try {
    const {
      title,
      description,
      priority,
      systemKey,
      weekdays,
      isActive,
      linkPath,
      managerIds,
    } = req.body as {
      title?: string;
      description?: string;
      priority?: number;
      systemKey?: string;
      weekdays?: number;
      isActive?: boolean;
      linkPath?: string | null;
      managerIds?: string[];
    };

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Укажите название задачи' });
    }
    if (!systemKey?.trim()) {
      return res.status(400).json({ error: 'Укажите системный ключ' });
    }
    if (!Array.isArray(managerIds) || managerIds.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы одного менеджера' });
    }

    const allowedManagers = await getTaskBoardManagers();
    const allowedIds = new Set(allowedManagers.map((m) => m.id));
    const validManagerIds = managerIds.filter((id) => allowedIds.has(id));
    if (validManagerIds.length === 0) {
      return res.status(400).json({ error: 'Некорректный список менеджеров' });
    }

    const template = await prisma.massTaskTemplate.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        priority: Math.min(2, Math.max(0, Number(priority ?? 1))),
        systemKey: systemKey.trim(),
        weekdays: Number(weekdays ?? DEFAULT_WEEKDAYS_MON_FRI),
        isActive: isActive ?? true,
        linkPath: linkPath?.trim() || null,
        createdById: req.userId!,
        managers: {
          create: validManagerIds.map((managerId) => ({ managerId })),
        },
      },
      include: { managers: true },
    });

    res.status(201).json({
      id: template.id,
      title: template.title,
      description: template.description,
      priority: template.priority,
      systemKey: template.systemKey,
      weekdays: template.weekdays,
      isActive: template.isActive,
      linkPath: template.linkPath,
      managerIds: template.managers.map((m) => m.managerId),
    });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e.code === 'P2002') {
      return res.status(400).json({ error: 'Системный ключ уже используется' });
    }
    console.error('Create mass task template error:', error);
    res.status(500).json({ error: 'Ошибка при создании шаблона' });
  }
});

router.put('/:id', authenticate, requireRole('ADMIN', 'EXECUTIVE'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      priority,
      weekdays,
      isActive,
      linkPath,
      managerIds,
    } = req.body as {
      title?: string;
      description?: string;
      priority?: number;
      weekdays?: number;
      isActive?: boolean;
      linkPath?: string | null;
      managerIds?: string[];
    };

    const existing = await prisma.massTaskTemplate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Шаблон не найден' });
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (priority !== undefined) data.priority = Math.min(2, Math.max(0, Number(priority)));
    if (weekdays !== undefined) data.weekdays = Number(weekdays);
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (linkPath !== undefined) data.linkPath = linkPath?.trim() || null;

    await prisma.massTaskTemplate.update({
      where: { id },
      data,
    });

    if (Array.isArray(managerIds)) {
      const allowedManagers = await getTaskBoardManagers();
      const allowedIds = new Set(allowedManagers.map((m) => m.id));
      const validManagerIds = managerIds.filter((mid) => allowedIds.has(mid));

      await prisma.massTaskTemplateManager.deleteMany({ where: { templateId: id } });
      if (validManagerIds.length > 0) {
        await prisma.massTaskTemplateManager.createMany({
          data: validManagerIds.map((managerId) => ({ templateId: id, managerId })),
        });
      }
    }

    const template = await prisma.massTaskTemplate.findUnique({
      where: { id },
      include: { managers: true },
    });

    res.json({
      id: template!.id,
      title: template!.title,
      description: template!.description,
      priority: template!.priority,
      systemKey: template!.systemKey,
      weekdays: template!.weekdays,
      isActive: template!.isActive,
      linkPath: template!.linkPath,
      managerIds: template!.managers.map((m) => m.managerId),
    });
  } catch (error) {
    console.error('Update mass task template error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении шаблона' });
  }
});

router.delete('/:id', authenticate, requireRole('ADMIN', 'EXECUTIVE'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.massTaskTemplate.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Шаблон не найден' });
    }

    await prisma.massTaskTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete mass task template error:', error);
    res.status(500).json({ error: 'Ошибка при удалении шаблона' });
  }
});

router.get('/weekdays', authenticate, requireRole('ADMIN', 'EXECUTIVE'), (_req, res) => {
  res.json(WEEKDAY_BITS);
});

export default router;
