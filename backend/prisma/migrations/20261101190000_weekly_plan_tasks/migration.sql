-- Недельный планировщик отдела продаж.
-- Задачи не удаляются при смене недели: weekStart хранит понедельник, статус остаётся в строке.

CREATE TABLE "weekly_plan_tasks" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "managerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_plan_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weekly_plan_tasks_weekStart_idx" ON "weekly_plan_tasks"("weekStart");
CREATE INDEX "weekly_plan_tasks_managerId_idx" ON "weekly_plan_tasks"("managerId");
CREATE INDEX "weekly_plan_tasks_weekStart_managerId_dayOfWeek_idx" ON "weekly_plan_tasks"("weekStart", "managerId", "dayOfWeek");

ALTER TABLE "weekly_plan_tasks"
  ADD CONSTRAINT "weekly_plan_tasks_day_check" CHECK ("dayOfWeek" BETWEEN 1 AND 5);

ALTER TABLE "weekly_plan_tasks"
  ADD CONSTRAINT "weekly_plan_tasks_title_check" CHECK (char_length(btrim("title")) > 0);

ALTER TABLE "weekly_plan_tasks"
  ADD CONSTRAINT "weekly_plan_tasks_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "weekly_plan_tasks"
  ADD CONSTRAINT "weekly_plan_tasks_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
