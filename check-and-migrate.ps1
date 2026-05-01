# Скрипт для проверки и применения миграции

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Проверка и миграция БД" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Переход в папку backend
Set-Location -Path "backend"

Write-Host "Шаг 1: Генерация Prisma Client..." -ForegroundColor Yellow
npx prisma generate

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma Client сгенерирован" -ForegroundColor Green
} else {
    Write-Host "❌ Ошибка генерации Prisma Client" -ForegroundColor Red
    Set-Location -Path ".."
    Write-Host ""
    Write-Host "Нажмите любую клавишу для выхода..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "Шаг 2: Применение миграции..." -ForegroundColor Yellow
npx prisma db push --accept-data-loss

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Миграция успешно применена!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Новые поля добавлены в таблицу order_items:" -ForegroundColor Green
    Write-Host "  - productionStartDate" -ForegroundColor Cyan
    Write-Host "  - productionEndDate" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Теперь перезапустите backend сервер:" -ForegroundColor Yellow
    Write-Host "  cd backend" -ForegroundColor Cyan
    Write-Host "  npm run dev" -ForegroundColor Cyan
} else {
    Write-Host "❌ Ошибка при применении миграции" -ForegroundColor Red
    Write-Host ""
    Write-Host "Возможные причины:" -ForegroundColor Yellow
    Write-Host "  1. База данных не запущена" -ForegroundColor Gray
    Write-Host "  2. Неверный DATABASE_URL в .env" -ForegroundColor Gray
    Write-Host "  3. Недостаточно прав для изменения БД" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Проверьте файл backend/.env и убедитесь, что:" -ForegroundColor Yellow
    Write-Host "  DATABASE_URL правильно настроен" -ForegroundColor Gray
}

# Возврат в корневую папку
Set-Location -Path ".."

Write-Host ""
Write-Host "Нажмите любую клавишу для выхода..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")




