-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "secondaryRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];
