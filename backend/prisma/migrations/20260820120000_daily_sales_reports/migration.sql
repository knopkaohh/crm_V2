-- CreateEnum
CREATE TYPE "SalesReportChannel" AS ENUM (
  'AVITO',
  'SITE',
  'REFERRAL_SOCIAL',
  'PROJECT_SALES',
  'CLIENT_BASE_NEW',
  'CLIENT_BASE_REGULAR',
  'CLIENT_BASE_LOST',
  'CLIENT_BASE_CROSS_SELL'
);

-- CreateTable
CREATE TABLE "daily_sales_reports" (
  "id" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "channel" "SalesReportChannel" NOT NULL,
  "applications" INTEGER NOT NULL DEFAULT 0,
  "interested" INTEGER NOT NULL DEFAULT 0,
  "orders" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "daily_sales_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_sales_reports_date_idx" ON "daily_sales_reports"("date");

-- CreateIndex
CREATE INDEX "daily_sales_reports_managerId_idx" ON "daily_sales_reports"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_sales_reports_managerId_date_channel_key" ON "daily_sales_reports"("managerId", "date", "channel");

-- AddForeignKey
ALTER TABLE "daily_sales_reports" ADD CONSTRAINT "daily_sales_reports_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
