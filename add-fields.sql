-- Добавление полей для производственного календаря
-- Выполните этот файл в вашей PostgreSQL базе данных

-- Добавляем поля, если их еще нет
ALTER TABLE "order_items" 
ADD COLUMN IF NOT EXISTS "productionStartDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "productionEndDate" TIMESTAMP(3);

-- Проверка: показать все поля таблицы order_items
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order_items'
ORDER BY ordinal_position;

-- Если все прошло успешно, вы должны увидеть productionStartDate и productionEndDate в списке




