-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "systemKey" TEXT;

-- CreateIndex
CREATE INDEX "tasks_systemKey_idx" ON "tasks"("systemKey");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_systemKey_idx" ON "tasks"("assigneeId", "systemKey");
