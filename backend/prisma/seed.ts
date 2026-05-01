import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Заполнение базы данных тестовыми данными...');

  // Создаем тестового администратора, если его еще нет
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'antonfedtube@gmail.com' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('03282000', 10);
    
    const admin = await prisma.user.create({
      data: {
        email: 'antonfedtube@gmail.com',
        password: hashedPassword,
        firstName: 'Антон',
        lastName: 'Федотов',
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('✅ Тестовый администратор создан:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Пароль: 03282000`);
    console.log(`   Роль: ${admin.role}`);
  } else {
    console.log('ℹ️  Пользователь уже существует');
  }
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при заполнении базы данных:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });







