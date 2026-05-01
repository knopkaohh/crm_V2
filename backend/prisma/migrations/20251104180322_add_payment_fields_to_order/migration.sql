-- AlterTable
ALTER TABLE "orders" ADD COLUMN "paymentType" TEXT,
ADD COLUMN "prepayment" DECIMAL(65,30),
ADD COLUMN "postpayment" DECIMAL(65,30);




