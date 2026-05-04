import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { canAccessLeadByManager } from '../utils/leads-access';

const router = express.Router();

// Настройка multer для загрузки файлов
const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Инициализация директории при старте (синхронно допустимо, т.к. выполняется один раз)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB по умолчанию
  },
  fileFilter: (req, file, cb) => {
    // Разрешаем изображения, документы и распространенные форматы макетов.
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
      'application/postscript', // .ai / .eps
      'application/vnd.adobe.photoshop', // .psd
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/octet-stream', // некоторые десктоп-редакторы отправляют макеты как octet-stream
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

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)}KB`;
  return `${mb.toFixed(0)}MB`;
}

// Получить файлы
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { leadId, orderId } = req.query;

    const where: any = {};

    if (leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId as string },
        select: { managerId: true },
      });
      if (!lead) {
        return res.json([]);
      }
      if (!canAccessLeadByManager(req, lead.managerId)) {
        return res.status(403).json({ error: 'Недостаточно прав доступа' });
      }
      where.leadId = leadId as string;
    }

    if (orderId) {
      where.orderId = orderId as string;
    }

    const files = await prisma.file.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(files);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Ошибка при получении файлов' });
  }
});

// Загрузить файл
router.post('/upload', authenticate, (req: AuthRequest, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const limit = parseInt(process.env.MAX_FILE_SIZE || '52428800');
          return res.status(400).json({ error: `Файл слишком большой. Лимит: ${formatBytes(limit)}` });
        }
        return res.status(400).json({ error: `Ошибка загрузки файла: ${err.code}` });
      }
      return res.status(400).json({ error: err?.message || 'Ошибка при загрузке файла' });
    }

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { leadId, orderId } = req.body;

    if (!leadId && !orderId) {
      // Удаляем загруженный файл, если нет связи
      try {
        await fsPromises.unlink(req.file.path);
      } catch (error) {
        console.warn('Failed to delete uploaded file:', error);
      }
      return res.status(400).json({ error: 'Необходимо указать leadId или orderId' });
    }

    if (leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId as string },
        select: { managerId: true },
      });
      if (!lead) {
        try {
          await fsPromises.unlink(req.file.path);
        } catch {
          /* noop */
        }
        return res.status(404).json({ error: 'Лид не найден' });
      }
      if (!canAccessLeadByManager(req as AuthRequest, lead.managerId)) {
        try {
          await fsPromises.unlink(req.file.path);
        } catch {
          /* noop */
        }
        return res.status(403).json({ error: 'Недостаточно прав доступа' });
      }
    }

    const file = await prisma.file.create({
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        leadId: leadId || null,
        orderId: orderId || null,
        uploadedBy: req.userId!,
      },
    });

    res.status(201).json(file);
  } catch (error) {
    console.error('Upload file error:', error);
    if (req.file) {
      try {
        await fsPromises.access(req.file.path);
        await fsPromises.unlink(req.file.path);
      } catch {
        // Файл уже не существует или ошибка доступа
      }
    }
    res.status(500).json({ error: 'Ошибка при загрузке файла' });
  }
  });
});

// Скачать файл
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        lead: { select: { managerId: true } },
        order: { select: { managerId: true } },
      },
    });

    if (!file) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    if (file.leadId && file.lead && !canAccessLeadByManager(req as AuthRequest, file.lead.managerId)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    const authReq = req as AuthRequest;
    if (file.orderId) {
      if (!file.order) {
        return res.status(404).json({ error: 'Файл не найден' });
      }
      if (authReq.userRole === 'SALES_MANAGER' && file.order.managerId !== authReq.userId) {
        return res.status(403).json({ error: 'Недостаточно прав доступа' });
      }
    }

    try {
      await fsPromises.access(file.path);
    } catch {
      return res.status(404).json({ error: 'Файл не найден на сервере' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimeType);
    res.sendFile(path.resolve(file.path));
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Ошибка при скачивании файла' });
  }
});

// Удалить файл
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    // Проверка прав доступа (только загрузивший или админ)
    if (file.uploadedBy !== req.userId && req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }

    // Удаляем файл с диска
    try {
      await fsPromises.unlink(file.path);
    } catch (error) {
      console.warn('Failed to delete file from disk:', error);
      // Продолжаем удаление из БД даже если файл не найден на диске
    }

    // Удаляем запись из БД
    await prisma.file.delete({
      where: { id },
    });

    res.json({ message: 'Файл удален' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Ошибка при удалении файла' });
  }
});

export default router;
