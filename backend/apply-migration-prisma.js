// Применение миграции через Prisma Raw SQL
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function applyMigration() {
  console.log('================================');
  console.log('🚀 Применение миграции к NeonDB');
  console.log('================================\n');

  try {
    console.log('📡 Подключение к базе данных...\n');

    // Проверяем подключение
    await prisma.$connect();
    console.log('✅ Подключено к базе данных!\n');

    // Проверяем существующие поля
    console.log('🔍 Проверка существующих полей...');
    const checkResult = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'order_items' 
      AND column_name IN ('productionStartDate', 'productionEndDate')
    `;

    const existingFields = checkResult.length;
    console.log(`📊 Найдено полей: ${existingFields} из 2\n`);

    if (existingFields === 2) {
      console.log('✅ Поля уже существуют в базе данных!');
      console.log('   - productionStartDate ✓');
      console.log('   - productionEndDate ✓\n');
      console.log('🎉 Миграция уже применена!\n');
      console.log('🔄 Перезапустите backend сервер (Ctrl+C, затем npm run dev)');
      console.log('   и попробуйте снова.\n');
      return;
    }

    // Применяем миграцию
    console.log('⚙️  Применение миграции...');
    await prisma.$executeRaw`
      ALTER TABLE "order_items" 
      ADD COLUMN IF NOT EXISTS "productionStartDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "productionEndDate" TIMESTAMP(3)
    `;
    console.log('✅ SQL запрос выполнен!\n');

    // Проверяем результат
    console.log('🔍 Проверка результата...');
    const verifyResult = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'order_items' 
      AND column_name IN ('productionStartDate', 'productionEndDate')
    `;

    if (verifyResult.length === 2) {
      console.log('\n================================');
      console.log('✅ МИГРАЦИЯ УСПЕШНО ПРИМЕНЕНА!');
      console.log('================================\n');
      console.log('Новые поля добавлены в таблицу order_items:');
      console.log('  📅 productionStartDate');
      console.log('  📅 productionEndDate\n');
      console.log('🔄 ВАЖНО: Теперь перезапустите backend сервер:');
      console.log('   1. Остановите текущий сервер (Ctrl+C)');
      console.log('   2. Запустите заново: npm run dev\n');
      console.log('🎉 После перезапуска ошибка 500 исчезнет!');
      console.log('   Календарь будет работать полностью!\n');
    } else {
      console.error('❌ Ошибка: поля не были добавлены');
      console.error(`Найдено только ${verifyResult.length} полей из 2`);
    }

  } catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:\n');
    console.error('Детали ошибки:', error.message);
    
    if (error.message.includes('connect')) {
      console.error('\n❌ Проблема с подключением к базе данных');
      console.error('Проверьте:');
      console.error('  1. DATABASE_URL в файле backend/.env');
      console.error('  2. Доступ к интернету');
      console.error('  3. NeonDB проект активен и доступен\n');
    } else if (error.message.includes('permission')) {
      console.error('\n❌ Недостаточно прав для изменения структуры БД');
      console.error('Проверьте права пользователя в NeonDB\n');
    } else {
      console.error('\nПолная ошибка:', error);
      console.error('\nПопробуйте выполнить SQL вручную через NeonDB консоль:');
      console.error('https://console.neon.tech/\n');
      console.error('SQL запрос:');
      console.error('ALTER TABLE "order_items"');
      console.error('ADD COLUMN IF NOT EXISTS "productionStartDate" TIMESTAMP(3),');
      console.error('ADD COLUMN IF NOT EXISTS "productionEndDate" TIMESTAMP(3);\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();




