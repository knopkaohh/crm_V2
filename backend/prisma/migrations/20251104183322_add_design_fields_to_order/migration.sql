-- AlterTable
ALTER TABLE "orders" ADD COLUMN "designTakenAt" TIMESTAMP(3),
ADD COLUMN "designTakenBy" TEXT,
ADD COLUMN "designComments" TEXT,
ADD COLUMN "source" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_designTakenBy_fkey" FOREIGN KEY ("designTakenBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "orders_designTakenBy_idx" ON "orders"("designTakenBy");




