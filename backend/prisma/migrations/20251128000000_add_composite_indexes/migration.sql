-- Составные индексы для таблицы orders
CREATE INDEX IF NOT EXISTS "orders_status_managerId_idx" ON "orders"("status", "managerId");
CREATE INDEX IF NOT EXISTS "orders_clientId_createdAt_idx" ON "orders"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "orders_createdAt_status_idx" ON "orders"("createdAt", "status");
CREATE INDEX IF NOT EXISTS "orders_designTakenBy_status_idx" ON "orders"("designTakenBy", "status");

-- Составные индексы для таблицы leads
CREATE INDEX IF NOT EXISTS "leads_status_managerId_idx" ON "leads"("status", "managerId");
CREATE INDEX IF NOT EXISTS "leads_nextContactDate_managerId_idx" ON "leads"("nextContactDate", "managerId");
CREATE INDEX IF NOT EXISTS "leads_clientId_createdAt_idx" ON "leads"("clientId", "createdAt");

-- Составные индексы для таблицы clients
CREATE INDEX IF NOT EXISTS "clients_name_phone_idx" ON "clients"("name", "phone");
CREATE INDEX IF NOT EXISTS "clients_createdAt_idx" ON "clients"("createdAt");


