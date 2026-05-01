@echo off
echo ========================================
echo Применение оптимизаций CRM
echo ========================================
echo.

echo [1/3] Применение миграций базы данных...
cd backend
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo Ошибка при применении миграций!
    echo Попробуйте: npx prisma db push
    pause
    exit /b 1
)
echo ✓ Миграции применены успешно!
echo.

echo [2/3] Генерация Prisma Client...
call npx prisma generate
if %errorlevel% neq 0 (
    echo Ошибка при генерации Prisma Client!
    pause
    exit /b 1
)
echo ✓ Prisma Client сгенерирован!
echo.

echo [3/3] Проверка структуры БД...
call npx prisma db pull --print
echo.

echo ========================================
echo ✓ Все оптимизации применены!
echo ========================================
echo.
echo Теперь запустите серверы:
echo   Backend:  cd backend && npm run dev
echo   Frontend: cd frontend && npm run dev
echo.
pause


