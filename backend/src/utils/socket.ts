import { io } from '../server';
import { prisma } from './prisma';
import { sendTelegramToUsers } from './telegram';
import { UserRole } from '@prisma/client';

export const sendNotification = async (
  userId: string,
  title: string,
  message: string,
  type: string,
  link?: string
) => {
  // Сохранить в БД
  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type,
      link,
    },
  });

  // Отправить через Socket.io
  io.to(`user-${userId}`).emit('notification', notification);

  return notification;
};

/** Список ID активных пользователей по ролям (например, только менеджеры). */
export const getActiveUserIdsByRoles = async (roles: UserRole[]): Promise<string[]> => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: roles } },
    select: { id: true },
  });
  return users.map((u) => u.id);
};

/** Все активные пользователи. */
export const getAllActiveUserIds = async (): Promise<string[]> => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
};

/**
 * Уведомление в CRM + Telegram для нескольких пользователей или для всех.
 * Используй для общих уведомлений (всем/всем менеджерам) и для выбранных пользователей.
 *
 * @param params.userIds — массив userId или 'all' (всем активным)
 * @param params.title — заголовок (CRM)
 * @param params.message — текст (CRM)
 * @param params.type — тип: 'order' | 'task' | 'lead' | 'general'
 * @param params.link — опциональная ссылка в CRM
 * @param params.telegramText — текст для Telegram (HTML). Если не указан, в Telegram не шлём.
 */
export const sendNotificationToUsers = async (params: {
  userIds: string[] | 'all';
  title: string;
  message: string;
  type: string;
  link?: string;
  telegramText?: string;
}): Promise<void> => {
  const { title, message, type, link, telegramText } = params;
  let userIds: string[] =
    params.userIds === 'all'
      ? await getAllActiveUserIds()
      : params.userIds;

  await Promise.all(
    userIds.map((userId) => sendNotification(userId, title, message, type, link))
  );

  if (telegramText && userIds.length) {
    await sendTelegramToUsers(userIds, telegramText);
  }
};

export const broadcastOrderUpdate = (orderId: string, data: any) => {
  io.emit('order-update', { orderId, ...data });
};

export const broadcastLeadUpdate = (leadId: string, data: any) => {
  io.emit('lead-update', { leadId, ...data });
};
