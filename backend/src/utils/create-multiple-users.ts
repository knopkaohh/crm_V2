/**
 * Скрипт для массового создания пользователей
 * Запуск: npm run create-multiple-users
 */

import dotenv from 'dotenv';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

// Загружаем переменные окружения из .env файла
dotenv.config();

interface UserData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
}

const users: UserData[] = [
  {
    firstName: 'Георгий',
    lastName: 'Мониава',
    email: 'gmoniava15@gmail.com',
    password: '15052000Gg.',
    role: 'SALES_MANAGER',
  },
  {
    firstName: 'Гинтарас',
    lastName: 'Палтарацкас',
    email: 'gintar+lera@mail.ru',
    password: 'gintar123',
    role: 'CLIENT_MANAGER',
  },
  {
    firstName: 'Никита',
    lastName: 'Царьков',
    email: 'hnikita@gmail.com',
    password: 'nikita0000',
    role: 'TECHNOLOGIST',
  },
  {
    firstName: 'Роман',
    lastName: 'Хрусталёв',
    email: 'hrystalb@bk.ru',
    password: 'Aa33003501.',
    role: 'EXECUTIVE',
  },
  {
    firstName: 'Нариман',
    lastName: 'Алескеров',
    email: 'aleskerov98@mail.ru',
    password: 'nariman',
    role: 'SALES_MANAGER',
  },
  {
    firstName: 'Алексей',
    lastName: 'Юрков',
    email: 'yurkov@birka-market.ru',
    password: 'alexey123',
    role: 'EXECUTIVE',
  },
  {
    firstName: 'Кристина',
    lastName: 'Хрусталёва',
    email: 'kristina@birka-market.ru',
    password: 'bulka123',
    role: 'EXECUTIVE',
  },
];

async function createMultipleUsers() {
  console.log('🚀 Начинаем создание пользователей...\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // 1. Удаляем Камиллу Салихджанову (перераспределяем лиды и заказы на Антона)
  try {
    const kamilla = await prisma.user.findUnique({
      where: { email: 'kamilawomen@gmail.com' },
      include: { assignedLeads: true, assignedOrders: true },
    });
    if (kamilla) {
      const anton = await prisma.user.findFirst({
        where: { email: 'antonfedtube@gmail.com' },
      });
      const fallbackManager = anton ?? (await prisma.user.findFirst({ where: { role: 'ADMIN' } }));
      if (fallbackManager) {
        await prisma.lead.updateMany({ where: { managerId: kamilla.id }, data: { managerId: fallbackManager.id } });
        await prisma.order.updateMany({ where: { managerId: kamilla.id }, data: { managerId: fallbackManager.id } });
        await prisma.user.delete({ where: { id: kamilla.id } });
        console.log('🗑️  Удалена: Камилла Салихджанова (kamilawomen@gmail.com)');
      } else {
        console.log('⚠️  Невозможно удалить Камиллу: нет другого менеджера для перераспределения лидов/заказов');
      }
    }
  } catch (error) {
    console.error('❌ Ошибка при удалении Камиллы Салихджановой:', error);
  }

  for (const userData of users) {
    try {
      // Проверяем, существует ли пользователь
      const existing = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existing) {
        console.log(`⏭️  Пользователь ${userData.email} уже существует, пропускаем`);
        skipped++;
        continue;
      }

      // Хешируем пароль
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Создаем пользователя
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone || null,
          role: userData.role,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
        },
      });

      console.log(`✅ Создан: ${user.firstName} ${user.lastName} (${user.email}) - ${user.role}`);
      created++;
    } catch (error) {
      console.error(`❌ Ошибка при создании пользователя ${userData.email}:`, error);
    }
  }

  // Добавляем дополнительную роль "Менеджер по продажам" Гинтарасу, Никите и Антону
  const usersToAddSalesManager: string[] = [
    'gintar+lera@mail.ru',
    'hnikita@gmail.com',
    'antonfedtube@gmail.com',
  ];
  for (const email of usersToAddSalesManager) {
    try {
      const u = await prisma.user.findUnique({ where: { email } });
      if (u) {
        const current: string[] = Array.isArray((u as { secondaryRoles?: string[] }).secondaryRoles)
          ? (u as { secondaryRoles: string[] }).secondaryRoles
          : [];
        if (!current.includes('SALES_MANAGER')) {
          const newRoles = [...current, 'SALES_MANAGER'] as ('SALES_MANAGER' | 'CLIENT_MANAGER' | 'TECHNOLOGIST' | 'EXECUTIVE' | 'ADMIN')[];
          await prisma.user.update({
            where: { email },
            data: { secondaryRoles: newRoles },
          });
          console.log(`✅ Добавлена роль Менеджер по продажам для ${u.firstName} ${u.lastName}`);
          updated++;
        }
      }
    } catch (e) {
      console.error(`❌ Ошибка при добавлении SALES_MANAGER для ${email}:`, e);
    }
  }

  // Добавляем роль "Жан-Клод-Ван Дам Терминатор" Никите
  try {
    const affected = await prisma.$executeRaw`
      UPDATE users
      SET "secondaryRoles" = array_cat(COALESCE("secondaryRoles", ARRAY[]::"UserRole"[]), ARRAY['VAN_DAM_TERMINATOR']::"UserRole"[])
      WHERE email = 'hnikita@gmail.com'
        AND (NOT ("secondaryRoles" @> ARRAY['VAN_DAM_TERMINATOR']::"UserRole"[]) OR "secondaryRoles" IS NULL)
    `;
    if (affected > 0) {
      console.log(`✅ Добавлена роль Жан-Клод-Ван Дам Терминатор для Никиты Царькова`);
      updated++;
    }
  } catch (e) {
    console.error(`❌ Ошибка при добавлении VAN_DAM_TERMINATOR для Никиты:`, e);
  }

  // Обновляем роль для Гинтараса Палтарацкаса → CLIENT_MANAGER
  try {
    const gintaras = await prisma.user.findUnique({
      where: { email: 'gintar+lera@mail.ru' },
    });
    if (gintaras && gintaras.role !== 'CLIENT_MANAGER') {
      await prisma.user.update({
        where: { email: 'gintar+lera@mail.ru' },
        data: { role: 'CLIENT_MANAGER' },
      });
      console.log(`✅ Обновлена роль для Гинтараса Палтарацкаса: ${gintaras.role} → CLIENT_MANAGER`);
      updated++;
    } else if (gintaras) {
      console.log(`ℹ️  Роль Гинтараса Палтарацкаса уже установлена как CLIENT_MANAGER`);
    }
  } catch (error) {
    console.error(`❌ Ошибка при обновлении роли Гинтараса Палтарацкаса:`, error);
  }

  console.log('\n📊 Итоги:');
  console.log(`   ✅ Создано: ${created}`);
  console.log(`   🔄 Обновлено: ${updated}`);
  console.log(`   ⏭️  Пропущено: ${skipped}`);
  console.log('\n⚠️  Не забудьте изменить пароли после первого входа!');
}

createMultipleUsers()
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });





