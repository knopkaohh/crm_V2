/**
 * Скрипт для создания пользователя
 * Запуск: npm run create-user <email> <password> <firstName> <lastName> <role> [phone]
 * Пример: npm run create-user user@example.com password123 Иван Иванов SALES_MANAGER +79991234567
 * 
 * Доступные роли: ADMIN, SALES_MANAGER, TECHNOLOGIST, EXECUTIVE
 */

import dotenv from 'dotenv';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

// Загружаем переменные окружения из .env файла
dotenv.config();

async function createUser() {
  const email = process.argv[2];
  const password = process.argv[3];
  const firstName = process.argv[4];
  const lastName = process.argv[5];
  const role = process.argv[6] as UserRole;
  const phone = process.argv[7];

  if (!email || !password || !firstName || !lastName || !role) {
    console.error('❌ Ошибка: Все параметры обязательны');
    console.log('\nИспользование:');
    console.log('  npm run create-user <email> <password> <firstName> <lastName> <role> [phone]');
    console.log('\nПример:');
    console.log('  npm run create-user admin@example.com admin123 Иван Иванов ADMIN');
    console.log('\nДоступные роли:');
    console.log('  - ADMIN');
    console.log('  - SALES_MANAGER');
    console.log('  - TECHNOLOGIST');
    console.log('  - EXECUTIVE');
    process.exit(1);
  }

  const validRoles: UserRole[] = ['ADMIN', 'SALES_MANAGER', 'TECHNOLOGIST', 'EXECUTIVE'];
  if (!validRoles.includes(role)) {
    console.error(`❌ Ошибка: Недопустимая роль "${role}"`);
    console.log('Доступные роли:', validRoles.join(', '));
    process.exit(1);
  }

  try {
    // Проверяем, существует ли пользователь
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log(`❌ Пользователь с email ${email} уже существует`);
      process.exit(1);
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаем пользователя
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: phone || null,
        role,
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

    console.log('✅ Пользователь успешно создан!');
    console.log(`\nДанные пользователя:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Имя: ${user.firstName} ${user.lastName}`);
    console.log(`  Телефон: ${user.phone || 'не указан'}`);
    console.log(`  Роль: ${user.role}`);
    console.log(`  Активен: ${user.isActive ? 'Да' : 'Нет'}`);
    console.log('\n⚠️  Не забудьте изменить пароль после первого входа!');
  } catch (error) {
    console.error('❌ Ошибка при создании пользователя:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createUser();

