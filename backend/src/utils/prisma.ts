import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

// В dev / tsx watch нельзя кэшировать Prisma в globalThis: после `prisma generate`
// старый клиент остаётся без новых моделей (prisma.projectSale === undefined).
export const prisma =
  process.env.NODE_ENV === 'production'
    ? (globalForPrisma.prisma ??= createPrismaClient())
    : createPrismaClient();

// Graceful shutdown - закрываем соединения при остановке сервера
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});



