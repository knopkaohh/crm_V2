# 🚀 Быстрый тест CRM без установки PostgreSQL

Для быстрого тестирования функционала CRM можно использовать **бесплатный облачный PostgreSQL**.

## Вариант 1: Supabase (Бесплатно, 30 секунд настройки)

1. Перейдите на https://supabase.com
2. Создайте бесплатный аккаунт
3. Создайте новый проект
4. После создания проекта перейдите в Settings → Database
5. Скопируйте Connection String (URI формат)
6. Обновите файл `.env` в папке `backend`:

```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

7. Примените миграции:
```bash
cd C:\backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:db seed
```

8. Запустите backend:
```bash
npm run dev
```

9. В новом терминале запустите frontend:
```bash
cd C:\frontend
npm run dev
```

10. Откройте http://localhost:3000

**Данные для входа:**
- Email: `antonfedtube@gmail.com`
- Пароль: `03282000`

## Вариант 2: Neon (Бесплатно)

1. Перейдите на https://neon.tech
2. Создайте бесплатный аккаунт
3. Создайте новый проект
4. Скопируйте Connection String
5. Обновите `.env` файл
6. Выполните шаги 7-10 из Варианта 1

## Вариант 3: Railway (Бесплатно)

1. Перейдите на https://railway.app
2. Создайте аккаунт через GitHub
3. Создайте новый PostgreSQL проект
4. Скопируйте DATABASE_URL
5. Обновите `.env` файл
6. Выполните шаги 7-10 из Варианта 1

## После настройки базы данных:

Выполните эти команды:

```bash
# В папке backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:db seed
npm run dev
```

```bash
# В папке frontend (новое окно терминала)
npm run dev
```

Система будет доступна на http://localhost:3000







