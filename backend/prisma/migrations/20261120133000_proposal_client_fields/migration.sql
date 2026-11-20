ALTER TABLE "commercial_proposals" ADD COLUMN "clientName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "commercial_proposals" ADD COLUMN "companyName" TEXT NOT NULL DEFAULT '';

ALTER TABLE "commercial_proposals" ALTER COLUMN "clientName" DROP DEFAULT;
ALTER TABLE "commercial_proposals" ALTER COLUMN "companyName" DROP DEFAULT;
