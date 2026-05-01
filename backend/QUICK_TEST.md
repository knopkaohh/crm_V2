# ⚡ Быстрый тест CRM (5 минут)

Для тестирования функционала без установки PostgreSQL используйте **бесплатный облачный PostgreSQL**.

## Шаг 1: Получите бесплатную базу данных (2 минуты)

### Вариант A: Supabase (самый простой)
1. Откройте https://supabase.com
2. Нажмите "Start your project"
3. Войдите через GitHub/Google
4. Нажмите "New Project"
5. Заполните:
   - **Name**: birka-crm
   - **Database Password**: придумайте пароль (запомните его!)
   - **Region**: выберите ближайший
6. Дождитесь создания проекта (~2 минуты)

### После создания проекта:
1. В боковом меню выберите **Settings** → **Database**
2. Прокрутите до секции **Connection string**
3. Выберите **URI**
4. Скопируйте строку подключения (она выглядит примерно так):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. Замените `[YOUR-PASSWORD]` на ваш пароль

## Шаг 2: Настройте проект (2 минуты)

Откройте файл `C:\backend\.env` и замените `DATABASE_URL`:

```env
DATABASE_URL="postgresql://postgres:ВАШ_ПАРОЛЬ@db.xxxxx.supabase.co:5432/postgres"
JWT_SECRET=birka-jwt-secret-key-change-in-production-2024
JWT_EXPIRES_IN=7d
PORT=3001
FRONTEND_URL=http://localhost:3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

## Шаг 3: Инициализируйте базу данных (1 минута)

В терминале выполните:

```bash
cd C:\backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Шаг 4: Запустите проект

**Терминал 1 - Backend:**
```bash
cd C:\backend
npm run dev
```

**Терминал 2 - Frontend:**
```bash
cd C:\frontend
npm run dev
```

## Шаг 5: Войдите в систему

Откройте http://localhost:3000

**Данные для входа:**
- **Email**: `antonfedtube@gmail.com`
- **Пароль**: `03282000`

---

## Альтернатива: Neon.tech

Если Supabase не подходит:
1. Перейдите на https://neon.tech
2. Создайте проект
3. Скопируйте Connection String
4. Обновите `.env` файл
5. Выполните Шаги 3-5 выше







