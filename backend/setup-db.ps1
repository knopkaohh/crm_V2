# Скрипт для автоматической настройки базы данных
Write-Host "Настройка базы данных для Birka CRM..." -ForegroundColor Cyan

# Проверяем наличие Docker
$dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerInstalled) {
    Write-Host "Docker найден" -ForegroundColor Green
    
    # Проверяем, запущен ли контейнер
    $containerRunning = docker ps --filter "name=birka-crm-db" --format "{{.Names}}" | Select-String "birka-crm-db"
    
    if (-not $containerRunning) {
        Write-Host "Запускаем PostgreSQL в Docker..." -ForegroundColor Yellow
        docker-compose up -d
        
        # Ждем, пока база данных будет готова
        Write-Host "Ожидание готовности базы данных..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        
        $maxRetries = 30
        $retry = 0
        while ($retry -lt $maxRetries) {
            $health = docker exec birka-crm-db pg_isready -U birka_admin 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "База данных готова!" -ForegroundColor Green
                break
            }
            Start-Sleep -Seconds 1
            $retry++
        }
    } else {
        Write-Host "Контейнер PostgreSQL уже запущен" -ForegroundColor Green
    }
    
    # Обновляем .env файл
    $envLines = @(
        "# Database",
        'DATABASE_URL="postgresql://birka_admin:birka_password_2024@localhost:5432/birka_crm?schema=public"',
        "",
        "# JWT Authentication",
        'JWT_SECRET="birka-jwt-secret-key-change-in-production-2024"',
        'JWT_EXPIRES_IN="7d"',
        "",
        "# Server Configuration",
        "PORT=3001",
        'FRONTEND_URL="http://localhost:3000"',
        "",
        "# File Upload",
        'UPLOAD_DIR="./uploads"',
        "MAX_FILE_SIZE=10485760"
    )
    
    Set-Content -Path ".env" -Value $envLines -Encoding UTF8
    Write-Host "Файл .env обновлен" -ForegroundColor Green
    
    # Применяем миграции
    Write-Host "Применяем миграции базы данных..." -ForegroundColor Yellow
    npm run prisma:generate
    npm run prisma:migrate
    
    Write-Host ""
    Write-Host "База данных настроена и готова к использованию!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Данные для подключения:" -ForegroundColor Cyan
    Write-Host "  Пользователь: birka_admin" -ForegroundColor White
    Write-Host "  Пароль: birka_password_2024" -ForegroundColor White
    Write-Host "  База данных: birka_crm" -ForegroundColor White
    Write-Host "  Порт: 5432" -ForegroundColor White
    
} else {
    Write-Host "Docker не найден" -ForegroundColor Red
    Write-Host ""
    Write-Host "Для автоматической настройки установите Docker Desktop:" -ForegroundColor Yellow
    Write-Host "  https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Или настройте PostgreSQL вручную и укажите данные в файле .env" -ForegroundColor Yellow
    exit 1
}
