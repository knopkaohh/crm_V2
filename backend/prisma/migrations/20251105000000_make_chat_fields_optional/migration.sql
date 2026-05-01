-- AlterTable
ALTER TABLE "chats" ALTER COLUMN "avitoAccountId" DROP NOT NULL;
ALTER TABLE "chats" ALTER COLUMN "avitoChatId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "chat_messages" ALTER COLUMN "messageId" DROP NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "chats_avitoAccountId_avitoChatId_key";

