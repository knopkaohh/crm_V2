import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = express.Router();

// Получить данные для производственного календаря
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, ourProduction } = req.query;

    // Получаем все позиции заказов в статусе "В производстве"
    const where: any = {
      order: {
        status: 'IN_PRODUCTION'
      },
      productionStartDate: { not: null },
      productionEndDate: { not: null }
    };

    // Фильтр по датам
    if (startDate && endDate) {
      where.OR = [
        {
          // Позиция начинается в заданном периоде
          productionStartDate: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        },
        {
          // Позиция заканчивается в заданном периоде
          productionEndDate: {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string)
          }
        },
        {
          // Позиция охватывает весь период
          AND: [
            { productionStartDate: { lte: new Date(startDate as string) } },
            { productionEndDate: { gte: new Date(endDate as string) } }
          ]
        }
      ];
    }

    // Фильтр "Наше производство" - только Сатин классический, Сатин премиум, Силикон, Нейлон
    if (ourProduction === 'true') {
      where.material = {
        in: ['Сатин классический', 'Сатин премиум', 'Силикон', 'Нейлон']
      };
    }

    const orderItems = await prisma.orderItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        quantity: true,
        material: true,
        productionStartDate: true,
        productionEndDate: true,
        productionComments: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            client: {
              select: {
                id: true,
                name: true,
                company: true
              }
            },
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: {
        productionStartDate: 'asc'
      }
    });

    res.json(orderItems);
  } catch (error) {
    console.error('Get production calendar error:', error);
    res.status(500).json({ error: 'Ошибка при получении данных календаря' });
  }
});

// Получить позиции для конкретной даты
router.get('/day/:date', authenticate, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { ourProduction } = req.query;
    
    const targetDate = new Date(date);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const where: any = {
      order: {
        status: 'IN_PRODUCTION'
      },
      productionStartDate: { not: null },
      productionEndDate: { not: null },
      AND: [
        { productionStartDate: { lte: nextDay } },
        { productionEndDate: { gte: targetDate } }
      ]
    };

    // Фильтр "Наше производство"
    if (ourProduction === 'true') {
      where.material = {
        in: ['Сатин классический', 'Сатин премиум', 'Силикон', 'Нейлон']
      };
    }

    const orderItems = await prisma.orderItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        quantity: true,
        material: true,
        productionStartDate: true,
        productionEndDate: true,
        productionComments: true,
        baseColor: true,
        printColor: true,
        cutting: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            client: {
              select: {
                id: true,
                name: true,
                company: true,
                phone: true
              }
            },
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: {
        productionStartDate: 'asc'
      }
    });

    res.json(orderItems);
  } catch (error) {
    console.error('Get production calendar day error:', error);
    res.status(500).json({ error: 'Ошибка при получении данных за день' });
  }
});

// Обновить даты производства для позиции
router.put('/item/:itemId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { itemId } = req.params;
    const { productionStartDate, productionEndDate } = req.body;

    console.log('Update production dates request:', {
      itemId,
      productionStartDate,
      productionEndDate,
      body: req.body
    });

    if (!productionStartDate || !productionEndDate) {
      return res.status(400).json({ 
        error: 'Даты начала и окончания производства обязательны' 
      });
    }

    // Проверяем, что позиция существует
    const existingItem = await prisma.orderItem.findUnique({
      where: { id: itemId }
    });

    if (!existingItem) {
      return res.status(404).json({ error: 'Позиция заказа не найдена' });
    }

    const item = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        productionStartDate: new Date(productionStartDate),
        productionEndDate: new Date(productionEndDate)
      },
      include: {
        order: {
          include: {
            client: true,
            manager: true
          }
        }
      }
    });

    console.log('Production dates updated successfully:', item.id);
    res.json(item);
  } catch (error: any) {
    console.error('Update production dates error:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack
    });
    res.status(500).json({ 
      error: 'Ошибка при обновлении дат производства',
      details: error?.message || 'Неизвестная ошибка'
    });
  }
});

export default router;

