// Скрипт для применения миграции к NeonDB
require('dotenv').config();
const { execSync } = require('child_process');

console.log('================================');
console.log('🚀 Применение миграции к NeonDB');
console.log('================================\n');

// Проверяем наличие DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ Ошибка: DATABASE_URL не найден в .env файле');
  console.error('Убедитесь, что файл backend/.env содержит строку DATABASE_URL\n');
  process.exit(1);
}

// Проверяем, что это NeonDB
if (!process.env.DATABASE_URL.includes('neon.tech') && !process.env.DATABASE_URL.includes('neon')) {
  console.warn('⚠️  Предупреждение: похоже, это не NeonDB');
  console.warn('Продолжаем миграцию...\n');
}

console.log('✅ DATABASE_URL найден');
console.log('📡 Подключение к NeonDB...\n');

try {
  console.log('Шаг 1: Генерация Prisma Client...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env
  });
  console.log('✅ Prisma Client сгенерирован!\n');

  console.log('Шаг 2: Применение миграции к облачной БД...');
  console.log('(Это может занять несколько секунд)\n');
  
  execSync('npx prisma db push', { 
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env
  });
  
  console.log('\n================================');
  console.log('✅ МИГРАЦИЯ УСПЕШНО ПРИМЕНЕНА!');
  console.log('================================\n');
  
  console.log('Новые поля добавлены в таблицу order_items:');
  console.log('  📅 productionStartDate');
  console.log('  📅 productionEndDate\n');
  
  console.log('🔄 Теперь ПЕРЕЗАПУСТИТЕ backend сервер:');
  console.log('  1. Остановите текущий сервер (Ctrl+C)');
  console.log('  2. Запустите: npm run dev\n');
  
  console.log('🎉 После перезапуска календарь заработает!');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Ошибка при применении миграции\n');
  console.error('Возможные причины:');
  console.error('  1. Нет подключения к интернету');
  console.error('  2. NeonDB база недоступна');
  console.error('  3. Неверный DATABASE_URL в .env');
  console.error('  4. Недостаточно прав в NeonDB\n');
  
  console.error('Проверьте:');
  console.error('  - Файл backend/.env содержит правильный DATABASE_URL');
  console.error('  - NeonDB проект активен и доступен');
  console.error('  - У вас есть интернет соединение\n');
  
  process.exit(1);
}




