# Быстрый старт - Создание пользователя

## Если у вас установлен Docker:

1. Запустите базу данных:
```bash
docker-compose up -d
```

2. Дождитесь готовности базы (10-15 секунд)

3. Примените миграции:
```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Создайте пользователя:
```bash
npm run create-user antonfedtube@gmail.com 03282000 Anton Fedotov ADMIN
```

## Если у вас установлен PostgreSQL локально:

1. Создайте базу данных:
```sql
CREATE DATABASE birka_crm;
```

2. Обновите `.env` файл с вашими данными:
```
DATABASE_URL="postgresql://ваш_пользователь:ваш_пароль@localhost:5432/birka_crm?schema=public"
```

3. Примените миграции:
```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Создайте пользователя:
```bash
npm run create-user antonfedtube@gmail.com 03282000 Anton Fedotov ADMIN
```

## Установка Docker Desktop:

1. Скачайте с https://www.docker.com/products/docker-desktop
2. Установите и перезапустите компьютер
3. Запустите Docker Desktop
4. Выполните команды из "Вариант 1" выше







