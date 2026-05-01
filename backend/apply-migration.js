const { execSync } = require('child_process');
const path = require('path');

console.log('================================');
console.log('Применение миграции БД');
console.log('================================\n');

try {
  console.log('Шаг 1: Генерация Prisma Client...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: __dirname
  });
  console.log('✅ Prisma Client успешно сгенерирован!\n');

  console.log('Шаг 2: Применение миграции...');
  execSync('npx prisma db push --accept-data-loss', { 
    stdio: 'inherit',
    cwd: __dirname
  });
  console.log('\n================================');
  console.log('✅ Миграция успешно применена!');
  console.log('================================\n');
  
  console.log('Новые поля добавлены в таблицу order_items:');
  console.log('  - productionStartDate');
  console.log('  - productionEndDate\n');
  
  console.log('Теперь перезапустите backend сервер:');
  console.log('  npm run dev\n');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Ошибка при применении миграции');
  console.error('\nВозможные причины:');
  console.error('  1. База данных не запущена');
  console.error('  2. Неверный DATABASE_URL в .env');
  console.error('  3. Недостаточно прав для изменения БД\n');
  console.error('Проверьте файл backend/.env и убедитесь, что DATABASE_URL правильно настроен\n');
  process.exit(1);
}




