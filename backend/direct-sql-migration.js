// Прямое подключение к NeonDB и выполнение SQL
require('dotenv').config();
const { Client } = require('pg');

async function applyMigration() {
  console.log('================================');
  console.log('🚀 Прямое применение SQL к NeonDB');
  console.log('================================\n');

  // Проверяем DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не найден в .env файле');
    process.exit(1);
  }

  console.log('✅ DATABASE_URL найден');
  console.log('📡 Подключение к NeonDB...\n');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Подключаемся
    await client.connect();
    console.log('✅ Подключено к базе данных!\n');

    // Проверяем, существуют ли уже поля
    console.log('🔍 Проверка существующих полей...');
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'order_items' 
      AND column_name IN ('productionStartDate', 'productionEndDate');
    `;
    
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length === 2) {
      console.log('✅ Поля уже существуют в базе данных!');
      console.log('   - productionStartDate ✓');
      console.log('   - productionEndDate ✓\n');
      console.log('🎉 Миграция уже применена ранее!');
      console.log('\n🔄 Перезапустите backend сервер и попробуйте снова.\n');
      await client.end();
      return;
    }

    console.log(`📊 Найдено полей: ${checkResult.rows.length} из 2\n`);

    // Применяем миграцию
    console.log('⚙️  Применение миграции...');
    const migrationQuery = `
      ALTER TABLE "order_items" 
      ADD COLUMN IF NOT EXISTS "productionStartDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "productionEndDate" TIMESTAMP(3);
    `;
    
    await client.query(migrationQuery);
    console.log('✅ SQL запрос выполнен!\n');

    // Проверяем результат
    console.log('🔍 Проверка результата...');
    const verifyResult = await client.query(checkQuery);
    
    if (verifyResult.rows.length === 2) {
      console.log('\n================================');
      console.log('✅ МИГРАЦИЯ УСПЕШНО ПРИМЕНЕНА!');
      console.log('================================\n');
      console.log('Новые поля добавлены:');
      console.log('  📅 productionStartDate');
      console.log('  📅 productionEndDate\n');
      console.log('🔄 ВАЖНО: Перезапустите backend сервер:');
      console.log('   1. Остановите (Ctrl+C)');
      console.log('   2. Запустите: npm run dev\n');
      console.log('🎉 После перезапуска календарь заработает!');
    } else {
      console.error('❌ Ошибка: поля не были добавлены');
      console.error('Проверьте права доступа к базе данных');
    }

  } catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:\n');
    console.error(error.message);
    console.error('\nВозможные причины:');
    console.error('  1. Неверный DATABASE_URL');
    console.error('  2. Нет доступа к интернету');
    console.error('  3. NeonDB база недоступна');
    console.error('  4. Недостаточно прав для изменения структуры БД\n');
  } finally {
    await client.end();
  }
}

applyMigration();




