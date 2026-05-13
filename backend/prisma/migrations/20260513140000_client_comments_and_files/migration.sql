-- AlterTable
ALTER TABLE "comments" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "comments_clientId_idx" ON "comments"("clientId");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "files" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "files_clientId_idx" ON "files"("clientId");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
