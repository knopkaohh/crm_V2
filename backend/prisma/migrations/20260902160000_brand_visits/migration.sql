-- CreateEnum
CREATE TYPE "BrandVisitStage" AS ENUM ('NEW_BRANDS', 'MEETING_SCHEDULED', 'MEETING_COMPLETED', 'MEETING_FAILED');

-- CreateTable
CREATE TABLE "brand_visits" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "stage" "BrandVisitStage" NOT NULL DEFAULT 'NEW_BRANDS',
    "createdById" TEXT,
    "failureReason" TEXT,
    "meetingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_visits_managerId_idx" ON "brand_visits"("managerId");

-- CreateIndex
CREATE INDEX "brand_visits_stage_idx" ON "brand_visits"("stage");

-- CreateIndex
CREATE INDEX "brand_visits_clientId_idx" ON "brand_visits"("clientId");

-- CreateIndex
CREATE INDEX "brand_visits_createdAt_idx" ON "brand_visits"("createdAt");

-- AddForeignKey
ALTER TABLE "brand_visits" ADD CONSTRAINT "brand_visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_visits" ADD CONSTRAINT "brand_visits_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_visits" ADD CONSTRAINT "brand_visits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
