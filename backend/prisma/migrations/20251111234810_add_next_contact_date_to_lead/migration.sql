-- AlterTable
ALTER TABLE "leads" ADD COLUMN "nextContactDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_nextContactDate_idx" ON "leads"("nextContactDate");


