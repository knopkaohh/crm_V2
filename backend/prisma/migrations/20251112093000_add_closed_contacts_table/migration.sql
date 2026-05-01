-- CreateTable
CREATE TABLE "closed_contacts" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "managerId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT,
    "source" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closed_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "closed_contacts_clientId_idx" ON "closed_contacts"("clientId");

-- CreateIndex
CREATE INDEX "closed_contacts_managerId_idx" ON "closed_contacts"("managerId");

-- CreateIndex
CREATE INDEX "closed_contacts_leadId_idx" ON "closed_contacts"("leadId");

-- AddForeignKey
ALTER TABLE "closed_contacts"
ADD CONSTRAINT "closed_contacts_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_contacts"
ADD CONSTRAINT "closed_contacts_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_contacts"
ADD CONSTRAINT "closed_contacts_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

