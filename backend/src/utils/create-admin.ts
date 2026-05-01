/**
 * Скрипт для создания первого администратора
 * Запуск: npx tsx src/utils/create-admin.ts
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

// Загружаем переменные окружения из .env файла
dotenv.config();

async function createAdmin() {
  const email = process.argv[2] || 'admin@birka-market.ru';
  const password = process.argv[3] || 'admin123';
  const firstName = process.argv[4] || 'Администратор';
  const lastName = process.argv[5] || 'Системы';

  try {
    // Проверяем, существует ли пользователь
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log(`Пользователь с email ${email} уже существует`);
      return;
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаем администратора
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Администратор успешно создан!');
    console.log(`Email: ${admin.email}`);
    console.log(`Имя: ${admin.firstName} ${admin.lastName}`);
    console.log(`Роль: ${admin.role}`);
    console.log('\n⚠️  Не забудьте изменить пароль после первого входа!');
  } catch (error) {
    console.error('Ошибка при создании администратора:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
