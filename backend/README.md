# Birka CRM Backend

Backend API для CRM системы Birka Market, построенный на Node.js, Express и PostgreSQL.

## Требования

- Node.js 18+ 
- PostgreSQL 12+
- npm или yarn

## Установка и запуск

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка базы данных

Создайте файл `.env` в корне проекта `backend`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/birka_crm?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRES_IN="7d"
PORT=3001
FRONTEND_URL="http://localhost:3000"
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE="10485760"
```

Замените `username`, `password` и `birka_crm` на ваши реальные данные базы данных.

### 3. Инициализация базы данных

Выполните миграции Prisma:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Создание пользователей

**Создание администратора (быстрый способ):**

```bash
npm run create-admin
```

Создаст администратора с данными по умолчанию:
- Email: `admin@birka-market.ru`
- Пароль: `admin123`
- Имя: `Администратор Системы`

**Создание пользователя с любой ролью:**

```bash
npm run create-user <email> <password> <firstName> <lastName> <role> [phone]
```

**Примеры:**

```bash
# Создать администратора
npm run create-user admin@example.com admin123 Иван Иванов ADMIN

# Создать менеджера по продажам
npm run create-user manager@example.com password123 Петр Петров SALES_MANAGER +79991234567

# Создать технолога
npm run create-user tech@example.com password123 Мария Сидорова TECHNOLOGIST

# Создать руководителя
npm run create-user exec@example.com password123 Ольга Козлова EXECUTIVE
```

**Доступные роли:**
- `ADMIN` - Администратор
- `SALES_MANAGER` - Менеджер по продажам
- `TECHNOLOGIST` - Технолог
- `EXECUTIVE` - Руководитель

### 5. Запуск проекта

**Режим разработки (с автоперезагрузкой):**
```bash
npm run dev
```

**Production режим:**
```bash
# Сначала соберите проект
npm run build

# Затем запустите
npm start
```

Сервер будет доступен на `http://localhost:3001` (или порт, указанный в .env).

## Доступные скрипты

- `npm run dev` - Запуск в режиме разработки с автоперезагрузкой
- `npm run build` - Сборка TypeScript в JavaScript
- `npm start` - Запуск собранного проекта
- `npm run prisma:generate` - Генерация Prisma Client
- `npm run prisma:migrate` - Применение миграций базы данных
- `npm run prisma:studio` - Открыть Prisma Studio для просмотра данных
- `npm run create-user` - Создать пользователя с указанной ролью
- `npm run create-admin` - Создать администратора (быстрый способ)

## API Endpoints

- `POST /api/auth/login` - Авторизация
- `POST /api/auth/register` - Регистрация
- `GET /api/users` - Список пользователей
- `GET /api/clients` - Список клиентов
- `GET /api/leads` - Список лидов
- `GET /api/orders` - Список заказов
- `GET /api/tasks` - Список задач
- `GET /api/calls` - Список звонков
- `GET /health` - Проверка работоспособности

## Структура проекта

```
backend/
├── src/
│   ├── middleware/    # Промежуточное ПО (аутентификация и т.д.)
│   ├── routes/        # API маршруты
│   ├── utils/         # Утилиты
│   └── server.ts      # Точка входа
├── prisma/
│   └── schema.prisma  # Схема базы данных
└── dist/              # Собранные файлы (создается после build)
```

## Технологии

- Express.js - веб-фреймворк
- Prisma - ORM для работы с БД
- PostgreSQL - база данных
- Socket.io - WebSocket для реального времени
- TypeScript - типизированный JavaScript
- JWT - аутентификация

## Примечания

- Убедитесь, что PostgreSQL запущен перед запуском приложения
- В production обязательно измените `JWT_SECRET` на надежный ключ
- Папка `uploads` будет создана автоматически для хранения загруженных файлов

