-- Параметры новых позиций: бумажные пакеты, пуллеры и стикеры.
ALTER TABLE "order_items" ADD COLUMN "foiling" TEXT;
ALTER TABLE "order_items" ADD COLUMN "handles" TEXT;
ALTER TABLE "order_items" ADD COLUMN "productBase" TEXT;
ALTER TABLE "order_items" ADD COLUMN "stickerShape" TEXT;
ALTER TABLE "order_items" ADD COLUMN "lamination" TEXT;
