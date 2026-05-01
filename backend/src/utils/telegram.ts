import axios from 'axios';
import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

const getBotToken = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN is not set. Telegram notifications are disabled.');
  }
  return token;
};

export const sendTelegramMessage = async (chatId: string, text: string) => {
  const token = getBotToken();
  if (!token) return;

  try {
    await axios.post(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (error) {
    console.error('[Telegram] Failed to send message:', {
      chatId,
      error: error instanceof Error ? error.message : error,
    });
  }
};

interface NewOrderNotificationPayload {
  orderId: string;
  orderNumber: string;
  totalAmount: number | string;
  managerFullName: string;
}

/**
 * Отправка уведомления о новом заказе всем пользователям,
 * у которых настроен Telegram и включены уведомления.
 */
export const notifyAllUsersAboutNewOrder = async (payload: NewOrderNotificationPayload) => {
  const token = getBotToken();
  if (!token) return;

  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        telegramChatId: {
          not: null,
        },
        telegramNotificationsEnabled: true,
      },
      select: {
        telegramChatId: true,
      },
    });

    if (!users.length) {
      console.log('[Telegram] No users with telegramChatId to notify about new order');
      return;
    }

    const textLines = [
      '<b>Новый заказ!</b>',
      `Номер заказа: <b>${payload.orderNumber}</b>`,
      `Менеджер: <b>${payload.managerFullName}</b>`,
      `Сумма заказа: <b>${payload.totalAmount}</b>`,
    ];

    const text = textLines.join('\n');

    await Promise.all(
      users
        .filter((u) => !!u.telegramChatId)
        .map((u) => sendTelegramMessage(u.telegramChatId as string, text)),
    );
  } catch (error) {
    console.error('[Telegram] Failed to broadcast new order notification:', {
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Отправить сообщение в Telegram списку пользователей или всем.
 * @param target — массив userId или 'all' (все активные с подключённым Telegram)
 * @param text — текст сообщения (поддерживает HTML: <b>, <i> и т.д.)
 */
export const sendTelegramToUsers = async (
  target: string[] | 'all',
  text: string
): Promise<void> => {
  const token = getBotToken();
  if (!token) return;

  try {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      telegramChatId: { not: null },
      telegramNotificationsEnabled: true,
    };

    const users = await prisma.user.findMany({
      where: target === 'all' ? where : { ...where, id: { in: target } },
      select: { telegramChatId: true },
    });

    const chatIds = users
      .map((u) => u.telegramChatId)
      .filter((id): id is string => !!id);

    if (!chatIds.length) return;

    await Promise.all(chatIds.map((chatId) => sendTelegramMessage(chatId, text)));
  } catch (error) {
    console.error('[Telegram] sendTelegramToUsers failed:', error instanceof Error ? error.message : error);
  }
};

