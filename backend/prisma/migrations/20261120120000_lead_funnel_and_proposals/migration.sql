-- Этап воронки контактов. Старый LeadStatus не меняется.
CREATE TYPE "LeadFunnelStage" AS ENUM (
  'NEW_LEAD',
  'NO_CONTACT',
  'IN_DIALOGUE',
  'PREPARING_KP',
  'WAITING_CLIENT'
);

ALTER TABLE "leads" ADD COLUMN "funnelStage" "LeadFunnelStage" NOT NULL DEFAULT 'NEW_LEAD';

-- Уже начатые контакты не выглядят как только что созданные.
UPDATE "leads"
SET "funnelStage" = 'IN_DIALOGUE'
WHERE "status" IN ('CONSIDERING', 'MOVED_TO_WHATSAPP', 'ORDER_PLACED', 'NOT_OUR_CLIENT');

CREATE INDEX "leads_funnelStage_idx" ON "leads"("funnelStage");

CREATE TABLE "commercial_proposals" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "productLine" TEXT NOT NULL,
  "subtitle" TEXT NOT NULL,
  "intro" TEXT NOT NULL,
  "termsPrice" TEXT NOT NULL,
  "termsPayment" TEXT NOT NULL,
  "termsDelivery" TEXT NOT NULL,
  "closingTitle" TEXT NOT NULL,
  "closingText" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_proposal_items" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "commercial_proposal_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commercial_proposals_leadId_createdAt_idx" ON "commercial_proposals"("leadId", "createdAt");
CREATE INDEX "commercial_proposal_items_proposalId_idx" ON "commercial_proposal_items"("proposalId");

ALTER TABLE "commercial_proposals"
  ADD CONSTRAINT "commercial_proposals_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_proposal_items"
  ADD CONSTRAINT "commercial_proposal_items_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "commercial_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
