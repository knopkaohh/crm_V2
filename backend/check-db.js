// Скрипт для проверки наличия полей в БД
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Проверка структуры базы данных...\n');

    // Пытаемся получить одну позицию заказа
    const orderItem = await prisma.orderItem.findFirst({
      select: {
        id: true,
        productionStartDate: true,
        productionEndDate: true,
      }
    });

    console.log('✅ Поля productionStartDate и productionEndDate существуют в БД');
    console.log('✅ База данных готова к работе с производственным календарем\n');
    
    if (orderItem) {
      console.log('Пример позиции:');
      console.log('  ID:', orderItem.id);
      console.log('  Дата начала:', orderItem.productionStartDate || 'не указана');
      console.log('  Дата окончания:', orderItem.productionEndDate || 'не указана');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при проверке базы данных:');
    console.error('  ', error.message);
    console.log('\n📝 Рекомендации:');
    
    if (error.message.includes('productionStartDate') || error.message.includes('productionEndDate')) {
      console.log('  1. Миграция не применена!');
      console.log('  2. Запустите: npm run prisma:push');
      console.log('  3. Или используйте скрипт: .\\check-and-migrate.ps1\n');
    } else if (error.message.includes('connect')) {
      console.log('  1. Убедитесь, что база данных запущена');
      console.log('  2. Проверьте DATABASE_URL в файле .env');
      console.log('  3. Проверьте права доступа к БД\n');
    } else {
      console.log('  1. Проверьте логи выше');
      console.log('  2. Убедитесь, что Prisma Client сгенерирован: npx prisma generate\n');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();




