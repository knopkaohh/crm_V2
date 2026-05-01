# Скрипт для применения оптимизаций CRM
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Применение оптимизаций CRM" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Переход в директорию backend
Set-Location backend

# 1. Применение миграций
Write-Host "[1/3] Применение миграций базы данных..." -ForegroundColor Yellow
try {
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        throw "Ошибка при применении миграций"
    }
    Write-Host "✓ Миграции применены успешно!" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка при применении миграций!" -ForegroundColor Red
    Write-Host "Попробуйте: npx prisma db push" -ForegroundColor Yellow
    Read-Host "Нажмите Enter для выхода"
    exit 1
}
Write-Host ""

# 2. Генерация Prisma Client
Write-Host "[2/3] Генерация Prisma Client..." -ForegroundColor Yellow
try {
    npx prisma generate
    if ($LASTEXITCODE -ne 0) {
        throw "Ошибка при генерации Prisma Client"
    }
    Write-Host "✓ Prisma Client сгенерирован!" -ForegroundColor Green
} catch {
    Write-Host "❌ Ошибка при генерации Prisma Client!" -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit 1
}
Write-Host ""

# 3. Проверка
Write-Host "[3/3] Проверка структуры БД..." -ForegroundColor Yellow
npx prisma db pull --print
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Все оптимизации применены!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Теперь запустите серверы:" -ForegroundColor Yellow
Write-Host "  Backend:  cd backend && npm run dev" -ForegroundColor White
Write-Host "  Frontend: cd frontend && npm run dev" -ForegroundColor White
Write-Host ""

# Возврат в корневую директорию
Set-Location ..

Read-Host "Нажмите Enter для выхода"


