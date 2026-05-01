// Скрипт для прямого применения индексов к БД
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function applyIndexes() {
  console.log('🚀 Применение составных индексов...\n');

  try {
    // Составные индексы для orders
    console.log('📊 Создание индексов для таблицы orders...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_status_managerId_idx" ON "orders"("status", "managerId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_clientId_createdAt_idx" ON "orders"("clientId", "createdAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_createdAt_status_idx" ON "orders"("createdAt", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "orders_designTakenBy_status_idx" ON "orders"("designTakenBy", "status");
    `);
    console.log('✅ Индексы для orders созданы!\n');

    // Составные индексы для leads
    console.log('📊 Создание индексов для таблицы leads...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "leads_status_managerId_idx" ON "leads"("status", "managerId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "leads_nextContactDate_managerId_idx" ON "leads"("nextContactDate", "managerId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "leads_clientId_createdAt_idx" ON "leads"("clientId", "createdAt");
    `);
    console.log('✅ Индексы для leads созданы!\n');

    // Составные индексы для clients
    console.log('📊 Создание индексов для таблицы clients...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "clients_name_phone_idx" ON "clients"("name", "phone");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "clients_createdAt_idx" ON "clients"("createdAt");
    `);
    console.log('✅ Индексы для clients созданы!\n');

    console.log('🎉 Все индексы успешно созданы!');
    console.log('📈 Ожидаемое ускорение запросов: 3-5x\n');

  } catch (error) {
    console.error('❌ Ошибка при создании индексов:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyIndexes()
  .then(() => {
    console.log('✓ Готово! Перезапустите сервер для применения изменений.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });


