-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "designChatUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "designChatType" TEXT;
