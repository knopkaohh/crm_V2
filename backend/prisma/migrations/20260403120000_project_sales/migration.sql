-- CreateEnum
CREATE TYPE "ProjectSaleStage" AS ENUM ('NEW_BRANDS', 'IN_PROGRESS', 'INTERESTED', 'NOT_OUR_CLIENT', 'ORDER_PLACED');

-- CreateTable
CREATE TABLE "project_sales" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "stage" "ProjectSaleStage" NOT NULL DEFAULT 'NEW_BRANDS',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_sales_managerId_idx" ON "project_sales"("managerId");

-- CreateIndex
CREATE INDEX "project_sales_stage_idx" ON "project_sales"("stage");

-- CreateIndex
CREATE INDEX "project_sales_clientId_idx" ON "project_sales"("clientId");

-- CreateIndex
CREATE INDEX "project_sales_createdAt_idx" ON "project_sales"("createdAt");

-- AddForeignKey
ALTER TABLE "project_sales" ADD CONSTRAINT "project_sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sales" ADD CONSTRAINT "project_sales_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sales" ADD CONSTRAINT "project_sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
