-- CreateEnum
CREATE TYPE "ProjectSaleOrderKind" AS ENUM ('SAMPLES', 'ORDER');

-- AlterTable
ALTER TABLE "project_sales" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "orderBrief" TEXT,
ADD COLUMN     "orderKind" "ProjectSaleOrderKind";

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "projectSaleId" TEXT;

-- CreateIndex
CREATE INDEX "files_projectSaleId_idx" ON "files"("projectSaleId");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_projectSaleId_fkey" FOREIGN KEY ("projectSaleId") REFERENCES "project_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
