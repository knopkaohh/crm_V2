import { prisma } from './prisma';

/**
 * Генерирует уникальный номер заказа в формате ORD-YYYY-NNNNN
 */
export const generateOrderNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const count = await prisma.order.count({
    where: {
      createdAt: {
        gte: new Date(`${year}-01-01`),
      },
    },
  });
  return `ORD-${year}-${String(count + 1).padStart(5, '0')}`;
};



