# Скрипт для применения миграции производственного календаря

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Применение миграции БД" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Переход в папку backend
Set-Location -Path "backend"

Write-Host "Применение миграции..." -ForegroundColor Yellow
npx prisma db push

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Миграция успешно применена!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Теперь перезапустите backend сервер:" -ForegroundColor Yellow
    Write-Host "  npm run dev" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Ошибка при применении миграции" -ForegroundColor Red
    Write-Host "Проверьте подключение к базе данных и переменные окружения" -ForegroundColor Yellow
}

# Возврат в корневую папку
Set-Location -Path ".."

Write-Host ""
Write-Host "Нажмите любую клавишу для выхода..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")




