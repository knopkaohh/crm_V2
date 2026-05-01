import { prisma } from './prisma';

/**
 * Очистка всей базы данных от клиентов и связанных данных
 * ВНИМАНИЕ: Это удалит ВСЕ клиентов, лиды, заказы и связанные данные!
 */
async function clearAllClients() {
  try {
    console.log('Начинаем очистку базы данных...');

    // Удаляем все задачи, связанные с лидами (чтобы избежать проблем с внешними ключами)
    const tasksDeleted = await prisma.task.deleteMany({
      where: {
        leadId: { not: null },
      },
    });
    console.log(`Удалено задач, связанных с лидами: ${tasksDeleted.count}`);

    // Удаляем все задачи, связанные с заказами
    const tasksWithOrdersDeleted = await prisma.task.deleteMany({
      where: {
        orderId: { not: null },
      },
    });
    console.log(`Удалено задач, связанных с заказами: ${tasksWithOrdersDeleted.count}`);

    // Удаляем все клиентов (каскадно удалятся лиды, заказы, комментарии, файлы)
    const clientsDeleted = await prisma.client.deleteMany({});
    console.log(`Удалено клиентов: ${clientsDeleted.count}`);

    // Удаляем звонки, которые могли остаться без клиента
    const callsDeleted = await prisma.call.deleteMany({
      where: {
        clientId: null,
      },
    });
    console.log(`Удалено звонков без клиента: ${callsDeleted.count}`);

    // Удаляем чаты, которые могли остаться без клиента
    const chatsDeleted = await prisma.chat.deleteMany({
      where: {
        clientId: null,
      },
    });
    console.log(`Удалено чатов без клиента: ${chatsDeleted.count}`);

    console.log('✅ Очистка базы данных завершена успешно!');
  } catch (error) {
    console.error('❌ Ошибка при очистке базы данных:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск скрипта
if (require.main === module) {
  clearAllClients()
    .then(() => {
      console.log('Скрипт завершен');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ошибка выполнения скрипта:', error);
      process.exit(1);
    });
}

export { clearAllClients };

