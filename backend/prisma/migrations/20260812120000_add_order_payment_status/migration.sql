-- Статус оплаты заказа для учёта: UNPAID (по умолчанию), PARTIAL, PAID
ALTER TABLE "orders" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID';
