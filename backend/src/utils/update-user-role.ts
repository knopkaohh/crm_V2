/**
 * Скрипт для обновления роли пользователя
 * Запуск: npm run update-user-role <email> <role>
 */

import dotenv from 'dotenv';
import { UserRole } from '@prisma/client';
import { prisma } from './prisma';

// Загружаем переменные окружения из .env файла
dotenv.config();

async function updateUserRole() {
  const email = process.argv[2];
  const role = process.argv[3] as UserRole;

  if (!email || !role) {
    console.error('❌ Ошибка: Все параметры обязательны');
    console.log('\nИспользование:');
    console.log('  npm run update-user-role <email> <role>');
    console.log('\nПример:');
    console.log('  npm run update-user-role user@example.com ADMIN');
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

    if (!existing) {
      console.log(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    // Обновляем роль
    const user = await prisma.user.update({
      where: { email },
      data: { role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    console.log('✅ Роль пользователя успешно обновлена!');
    console.log(`\nДанные пользователя:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Имя: ${user.firstName} ${user.lastName}`);
    console.log(`  Роль: ${user.role}`);
  } catch (error) {
    console.error('❌ Ошибка при обновлении роли пользователя:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateUserRole();





