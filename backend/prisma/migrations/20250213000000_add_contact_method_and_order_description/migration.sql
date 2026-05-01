-- AlterTable (clients: способ связи)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "contactMethod" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "telegram" TEXT;

-- AlterTable (orders: описание заказа)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "description" TEXT;
