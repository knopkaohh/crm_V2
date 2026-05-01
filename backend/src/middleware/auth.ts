import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
}

// Встроенный кэш пользователей (Map с TTL)
interface CachedUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  cachedAt: number;
}

const userCache = new Map<string, CachedUser>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Очистка устаревших записей каждые 10 минут
setInterval(() => {
  const now = Date.now();
  for (const [userId, cachedUser] of userCache.entries()) {
    if (now - cachedUser.cachedAt > CACHE_TTL) {
      userCache.delete(userId);
    }
  }
}, 10 * 60 * 1000);

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
      userId: string;
      email: string;
    };

    // Проверяем кэш
    const cached = userCache.get(decoded.userId);
    const now = Date.now();
    
    let user: CachedUser | null;
    
    if (cached && (now - cached.cachedAt) < CACHE_TTL) {
      // Используем кэшированные данные
      user = cached;
    } else {
      // Загружаем из БД и кэшируем
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!dbUser) {
        userCache.delete(decoded.userId);
        return res.status(401).json({ error: 'Пользователь не найден' });
      }

      user = {
        ...dbUser,
        cachedAt: now,
      };
      
      userCache.set(decoded.userId, user);
    }

    if (!user.isActive) {
      userCache.delete(decoded.userId);
      return res.status(401).json({ error: 'Пользователь неактивен' });
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.userEmail = user.email;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
};

// Функция для очистки кэша пользователя (например, при обновлении роли)
export const clearUserCache = (userId: string) => {
  userCache.delete(userId);
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Недостаточно прав доступа' });
    }
    next();
  };
};
