-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "massTemplateId" TEXT;

-- CreateTable
CREATE TABLE "mass_task_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "systemKey" TEXT NOT NULL,
    "weekdays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "linkPath" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mass_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mass_task_template_managers" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,

    CONSTRAINT "mass_task_template_managers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mass_task_templates_systemKey_key" ON "mass_task_templates"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "mass_task_template_managers_templateId_managerId_key" ON "mass_task_template_managers"("templateId", "managerId");

-- CreateIndex
CREATE INDEX "mass_task_template_managers_managerId_idx" ON "mass_task_template_managers"("managerId");

-- CreateIndex
CREATE INDEX "tasks_closedAt_idx" ON "tasks"("closedAt");

-- CreateIndex
CREATE INDEX "tasks_massTemplateId_idx" ON "tasks"("massTemplateId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_massTemplateId_fkey" FOREIGN KEY ("massTemplateId") REFERENCES "mass_task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_task_templates" ADD CONSTRAINT "mass_task_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_task_template_managers" ADD CONSTRAINT "mass_task_template_managers_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "mass_task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mass_task_template_managers" ADD CONSTRAINT "mass_task_template_managers_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill closedAt for existing closed tasks
UPDATE "tasks" SET "closedAt" = "updatedAt" WHERE "status" IN ('COMPLETED', 'CANCELLED') AND "closedAt" IS NULL;
