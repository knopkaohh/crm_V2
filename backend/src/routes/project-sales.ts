import express, { Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { ProjectSaleOrderKind, ProjectSaleStage, UserRole } from '@prisma/client';

const router = express.Router();

const CLIENT_NOTES_SOURCE = 'Источник: Проектные продажи';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const projectSaleUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'),
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/svg+xml',
      'image/heic',
      'image/heif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/postscript',
      'application/vnd.adobe.photoshop',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/octet-stream',
    ];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExtensions = new Set([
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tif', '.tiff', '.svg', '.heic', '.heif',
      '.pdf', '.doc', '.docx', '.ai', '.eps', '.cdr', '.psd', '.zip', '.rar',
    ]);
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Неподдерживаемый тип файла: ${file.originalname}`));
    }
  },
});

function placeholderPhone(): string {
  const n = Math.floor(1000000 + Math.random() * 8999999);
  return `+7999000${n}`;
}

function appendClientNotes(existing: string | null | undefined, block: string): string {
  const base = (existing ?? '').trim();
  if (!base) return block.trim();
  return `${base}\n\n${block.trim()}`;
}

function canManageProjectSale(req: AuthRequest, managerId: string): boolean {
  if (req.userRole === 'ADMIN') return true;
  return req.userId === managerId;
}

/** Нормализация «Имя Фамилия» для сопоставления с белым списком менеджеров воронки */
function normalizeManagerKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

/**
 * Только эти менеджеры попадают в списки назначения (проектные продажи, передача клиента).
 * Порядок — как у заказчика. Лишние роли (например, другие руководители) не показываем.
 */
const PROJECT_SALES_MANAGER_ORDER: string[] = [
  'гинтарас палтарацкас',
  'нариман алескеров',
  'максим шалагинов',
  'антон федотов',
  'георгий мониава',
  'роман хрусталев',
  'никита царьков',
];

/** Варианты написания в БД → канонический ключ из PROJECT_SALES_MANAGER_ORDER */
const MANAGER_KEY_ALIASES: Record<string, string> = {
  'палтарацкас гинтарас': 'гинтарас палтарацкас',
  'нариман аляскеров': 'нариман алескеров',
};

function canonicalProjectSalesManagerKey(firstName: string, lastName: string): string | null {
  const raw = normalizeManagerKey(firstName, lastName);
  const key = MANAGER_KEY_ALIASES[raw] ?? raw;
  const allowed = new Set(PROJECT_SALES_MANAGER_ORDER);
  return allowed.has(key) ? key : null;
}

function filterAndSortProjectSalesManagers<T extends { firstName: string; lastName: string }>(
  users: T[]
): T[] {
  const decorated = users
    .map((u) => ({ u, key: canonicalProjectSalesManagerKey(u.firstName, u.lastName) }))
    .filter((x): x is { u: T; key: string } => x.key !== null);
  decorated.sort(
    (a, b) => PROJECT_SALES_MANAGER_ORDER.indexOf(a.key) - PROJECT_SALES_MANAGER_ORDER.indexOf(b.key)
  );
  return decorated.map((x) => x.u);
}

const saleInclude = {
  client: {
    select: { id: true, name: true, company: true, phone: true, notes: true },
  },
  manager: {
    select: { id: true, firstName: true, lastName: true },
  },
  files: {
    select: { id: true, originalName: true, size: true, mimeType: true },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

/** Менеджеры для выпадающих списков: активные, с ролью продаж / клиентский менеджер */
router.get('/managers', authenticate, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          {
            role: {
              in: [UserRole.SALES_MANAGER, UserRole.CLIENT_MANAGER, UserRole.EXECUTIVE],
            },
          },
          { secondaryRoles: { has: UserRole.SALES_MANAGER } },
          { secondaryRoles: { has: UserRole.CLIENT_MANAGER } },
          { secondaryRoles: { has: UserRole.EXECUTIVE } },
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
    res.json(filterAndSortProjectSalesManagers(users));
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
      include: saleInclude,
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

    const existing = await prisma.projectSale.findUnique({
      where: { id },
      select: { managerId: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageProjectSale(req, existing.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const updated = await prisma.projectSale.update({
      where: { id },
      data: { stage: stage as ProjectSaleStage },
      include: saleInclude,
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

/** Взять в работу: контакт в карточку клиента, этап → бренды в работе */
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

    const sale = await prisma.projectSale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageProjectSale(req, sale.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (sale.stage !== ProjectSaleStage.NEW_BRANDS) {
      return res.status(400).json({ error: 'Действие доступно только на этапе «Новые бренды»' });
    }

    const noteLines: string[] = ['Проектные продажи — взято в работе'];
    if (position) noteLines.push(`Должность: ${position}`);
    if (notes) noteLines.push(`Заметки: ${notes}`);
    const noteBlock = noteLines.join('\n');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: sale.clientId },
        data: {
          name: fullName,
          phone,
          notes: appendClientNotes(sale.client.notes, noteBlock),
        },
      });

      return tx.projectSale.update({
        where: { id },
        data: { stage: ProjectSaleStage.IN_PROGRESS },
        include: saleInclude,
      });
    });

    res.json(updated);
  } catch (error) {
    console.error('project-sales take-in-work error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении' });
  }
});

/** С этапа «Бренды в работе» → заинтересованные */
router.post('/:id/interested', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const sale = await prisma.projectSale.findUnique({
      where: { id },
      select: { managerId: true, stage: true },
    });
    if (!sale) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageProjectSale(req, sale.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (sale.stage !== ProjectSaleStage.IN_PROGRESS) {
      return res.status(400).json({ error: 'Действие доступно только на этапе «Бренды в работе»' });
    }

    const updated = await prisma.projectSale.update({
      where: { id },
      data: { stage: ProjectSaleStage.INTERESTED },
      include: saleInclude,
    });
    res.json(updated);
  } catch (error) {
    console.error('project-sales interested error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении этапа' });
  }
});

/** Не наш клиент: причина + этап */
router.post('/:id/not-our-client', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const reason = ((req.body as { reason?: string }).reason ?? '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Укажите причину' });
    }

    const sale = await prisma.projectSale.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!sale) {
      return res.status(404).json({ error: 'Карточка не найдена' });
    }
    if (!canManageProjectSale(req, sale.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    if (sale.stage !== ProjectSaleStage.IN_PROGRESS) {
      return res.status(400).json({ error: 'Действие доступно только на этапе «Бренды в работе»' });
    }

    const noteBlock = `Проектные продажи — не наш клиент\nПричина: ${reason}`;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: sale.clientId },
        data: {
          notes: appendClientNotes(sale.client.notes, noteBlock),
        },
      });

      return tx.projectSale.update({
        where: { id },
        data: {
          stage: ProjectSaleStage.NOT_OUR_CLIENT,
          rejectionReason: reason,
        },
        include: saleInclude,
      });
    });

    res.json(updated);
  } catch (error) {
    console.error('project-sales not-our-client error:', error);
    res.status(500).json({ error: 'Ошибка при сохранении' });
  }
});

/** Заинтересованные → оформили заказ/образец: ТЗ, вложения, этап */
router.post(
  '/:id/order-placement',
  authenticate,
  (req: AuthRequest, res, next) => {
    projectSaleUpload.array('files', 25)(req as express.Request, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Один из файлов слишком большой' });
          }
          return res.status(400).json({ error: `Ошибка загрузки файла: ${err.code}` });
        }
        const msg = err instanceof Error ? err.message : 'Ошибка при загрузке файла';
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const files = ((req as Request).files as Express.Multer.File[] | undefined) ?? [];

    try {
      const orderKindRaw = (req.body as { orderKind?: string }).orderKind;
      const brief = ((req.body as { brief?: string }).brief ?? '').trim();

      if (!brief) {
        for (const f of files) {
          try {
            await fsPromises.unlink(f.path);
          } catch {
            /* noop */
          }
        }
        return res.status(400).json({ error: 'Заполните техническое задание' });
      }

      if (orderKindRaw !== 'SAMPLES' && orderKindRaw !== 'ORDER') {
        for (const f of files) {
          try {
            await fsPromises.unlink(f.path);
          } catch {
            /* noop */
          }
        }
        return res.status(400).json({ error: 'Укажите тип: образцы или заказ' });
      }

      const orderKind =
        orderKindRaw === 'SAMPLES' ? ProjectSaleOrderKind.SAMPLES : ProjectSaleOrderKind.ORDER;

      const sale = await prisma.projectSale.findUnique({
        where: { id },
        include: { client: true },
      });
      if (!sale) {
        for (const f of files) {
          try {
            await fsPromises.unlink(f.path);
          } catch {
            /* noop */
          }
        }
        return res.status(404).json({ error: 'Карточка не найдена' });
      }
      if (!canManageProjectSale(req, sale.managerId)) {
        for (const f of files) {
          try {
            await fsPromises.unlink(f.path);
          } catch {
            /* noop */
          }
        }
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
      if (sale.stage !== ProjectSaleStage.INTERESTED) {
        for (const f of files) {
          try {
            await fsPromises.unlink(f.path);
          } catch {
            /* noop */
          }
        }
        return res.status(400).json({ error: 'Действие доступно только на этапе «Заинтересованные»' });
      }

      const kindLabel = orderKind === ProjectSaleOrderKind.SAMPLES ? 'Образцы' : 'Заказ';
      const noteBlock = [
        `Проектные продажи — оформление (${kindLabel})`,
        `ТЗ:\n${brief}`,
        files.length ? `Прикреплено файлов: ${files.length}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const updated = await prisma.$transaction(async (tx) => {
        await tx.client.update({
          where: { id: sale.clientId },
          data: {
            notes: appendClientNotes(sale.client.notes, noteBlock),
          },
        });

        for (const f of files) {
          await tx.file.create({
            data: {
              filename: f.filename,
              originalName: f.originalname,
              mimeType: f.mimetype,
              size: f.size,
              path: f.path,
              projectSaleId: id,
              uploadedBy: req.userId!,
            },
          });
        }

        return tx.projectSale.update({
          where: { id },
          data: {
            stage: ProjectSaleStage.ORDER_PLACED,
            orderBrief: brief,
            orderKind,
          },
          include: saleInclude,
        });
      });

      res.json(updated);
    } catch (error) {
      console.error('project-sales order-placement error:', error);
      for (const f of files) {
        try {
          await fsPromises.unlink(f.path);
        } catch {
          /* noop */
        }
      }
      res.status(500).json({ error: 'Ошибка при сохранении' });
    }
  }
);

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
      select: { id: true, firstName: true, lastName: true },
    });
    if (managers.length !== managerIds.length) {
      return res.status(400).json({ error: 'Указан неизвестный или неактивный менеджер' });
    }
    for (const u of managers) {
      if (canonicalProjectSalesManagerKey(u.firstName, u.lastName) === null) {
        return res.status(400).json({
          error: `Менеджер ${u.firstName} ${u.lastName} не входит в список назначения проектных продаж`,
        });
      }
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
          include: saleInclude,
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
