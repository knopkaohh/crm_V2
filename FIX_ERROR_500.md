# 🔧 Исправление ошибки 500 при обновлении дат производства

## ❌ Ошибка
```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
Failed to set production dates: AxiosError
```

## ✅ Решение

Эта ошибка возникает потому, что **миграция базы данных не была применена**.

### Способ 1: Автоматический (Рекомендуется)

Запустите PowerShell скрипт в корневой папке проекта:

```powershell
.\check-and-migrate.ps1
```

Этот скрипт:
1. ✅ Сгенерирует Prisma Client
2. ✅ Применит миграцию
3. ✅ Проверит результат

### Способ 2: Вручную

**Шаг 1:** Откройте терминал в папке backend

```powershell
cd backend
```

**Шаг 2:** Примените миграцию

```powershell
npx prisma db push
```

**Шаг 3:** Проверьте, что всё работает

```powershell
npm run check-db
```

Вы должны увидеть:
```
✅ Поля productionStartDate и productionEndDate существуют в БД
✅ База данных готова к работе с производственным календарем
```

### Способ 3: Через npm скрипты

```powershell
cd backend
npm run prisma:push
npm run check-db
```

## 🔄 После применения миграции

**ВАЖНО:** Перезапустите backend сервер!

1. Остановите текущий backend (Ctrl+C)
2. Запустите снова:

```powershell
cd backend
npm run dev
```

## 🧪 Проверка

После перезапуска сервера:

1. Откройте страницу заказов: http://localhost:3000/orders
2. Перетащите любой заказ в колонку "В производстве"
3. Укажите даты в модальном окне
4. Нажмите "Сохранить и продолжить"

Если всё прошло успешно - ошибки больше не будет! ✅

## 📝 Что делает миграция?

Миграция добавляет 2 новых поля в таблицу `order_items`:

```sql
ALTER TABLE "order_items" 
ADD COLUMN "productionStartDate" TIMESTAMP(3),
ADD COLUMN "productionEndDate" TIMESTAMP(3);
```

Эти поля хранят даты начала и окончания производства для каждой позиции.

## ❓ Возможные проблемы

### Проблема: "Cannot connect to database"

**Решение:**
1. Убедитесь, что PostgreSQL запущен
2. Проверьте файл `backend/.env`:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
   ```
3. Проверьте, что учетные данные правильные

### Проблема: "Permission denied"

**Решение:**
1. Запустите PowerShell от имени администратора
2. Или измените права доступа к файлу:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

### Проблема: Миграция применена, но ошибка остается

**Решение:**
1. Остановите backend сервер (Ctrl+C)
2. Очистите кэш:
   ```powershell
   cd backend
   Remove-Item -Recurse -Force node_modules\.prisma
   npx prisma generate
   ```
3. Перезапустите сервер:
   ```powershell
   npm run dev
   ```

## 🎯 Проверочный список

Перед тем как пробовать снова, убедитесь что:

- [ ] Миграция применена (`npm run check-db` показывает ✅)
- [ ] Backend сервер перезапущен после миграции
- [ ] PostgreSQL запущен
- [ ] Нет ошибок в консоли backend при запуске
- [ ] DATABASE_URL в .env правильный

## 💡 Дополнительно

### Просмотр логов сервера

Откройте консоль где запущен backend и посмотрите на вывод при попытке сохранить даты. Теперь там будет подробная информация:

```
Update production dates request: {
  itemId: '...',
  productionStartDate: '2024-11-18',
  productionEndDate: '2024-11-21'
}
```

Если видите ошибку, текст ошибки поможет понять проблему.

### Проверка через Prisma Studio

```powershell
cd backend
npx prisma studio
```

Откроется браузер с интерфейсом БД. Проверьте таблицу `OrderItem` - там должны быть поля `productionStartDate` и `productionEndDate`.

## 📞 Всё ещё не работает?

Если после всех шагов ошибка сохраняется:

1. Покажите логи backend сервера (консоль, где запущен `npm run dev`)
2. Покажите результат команды `npm run check-db`
3. Проверьте версию Node.js: `node --version` (должна быть >= 18)
4. Проверьте версию PostgreSQL

---

**После успешного применения миграции производственный календарь будет работать полностью! 🎉**




