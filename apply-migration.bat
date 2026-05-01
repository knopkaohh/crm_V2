@echo off
echo ================================
echo Применение миграции БД
echo ================================
echo.

cd backend

echo Шаг 1: Генерация Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo Ошибка при генерации Prisma Client
    cd ..
    pause
    exit /b 1
)
echo Prisma Client успешно сгенерирован!
echo.

echo Шаг 2: Применение миграции...
call npx prisma db push --accept-data-loss
if errorlevel 1 (
    echo Ошибка при применении миграции
    echo Проверьте подключение к БД и DATABASE_URL в .env
    cd ..
    pause
    exit /b 1
)
echo.
echo ================================
echo Миграция успешно применена!
echo ================================
echo.
echo Теперь перезапустите backend сервер:
echo   cd backend
echo   npm run dev
echo.

cd ..
pause




