-- CreateTable
CREATE TABLE "monthly_manager_plans" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "planAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_manager_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_manager_plans_period_managerId_key" ON "monthly_manager_plans"("period", "managerId");

-- CreateIndex
CREATE INDEX "monthly_manager_plans_period_idx" ON "monthly_manager_plans"("period");

-- CreateIndex
CREATE INDEX "monthly_manager_plans_managerId_idx" ON "monthly_manager_plans"("managerId");

-- AddForeignKey
ALTER TABLE "monthly_manager_plans" ADD CONSTRAINT "monthly_manager_plans_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
