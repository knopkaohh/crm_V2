-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "clients_createdById_idx" ON "clients"("createdById");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
