-- Роль «изолированный кабинет»: не меняет существующих пользователей.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ISOLATED';
