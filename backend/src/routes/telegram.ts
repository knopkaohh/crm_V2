import express from 'express';
import { prisma } from '../utils/prisma';
import { sendTelegramMessage } from '../utils/telegram';

const router = express.Router();

// Webhook от Telegram
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    if (!update) {
      return res.sendStatus(200);
    }

    const message = update.message;
    if (!message) {
      return res.sendStatus(200);
    }

    const chatId = String(message.chat.id);
    const text: string = message.text || '';

    // Привязка пользователя по команде /start <userId>
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const payload = parts[1];

      if (!payload) {
        await sendTelegramMessage(
          chatId,
          'Для привязки аккаунта CRM используйте ссылку из CRM или команду вида:\n/start <ID_пользователя>',
        );
        return res.sendStatus(200);
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: payload },
        });

        if (!user) {
          await sendTelegramMessage(
            chatId,
            'Пользователь с таким идентификатором не найден. Убедитесь, что вы используете корректную ссылку из CRM.',
          );
          return res.sendStatus(200);
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            telegramChatId: chatId,
            telegramUsername: message.chat.username || null,
            telegramNotificationsEnabled: true,
          },
        });

        await sendTelegramMessage(
          chatId,
          `Аккаунт CRM успешно привязан.\nИмя: ${user.firstName} ${user.lastName}`,
        );
      } catch (error) {
        console.error('[Telegram webhook] Failed to link user:', error);
        await sendTelegramMessage(
          chatId,
          'Произошла ошибка при привязке аккаунта. Попробуйте позже или обратитесь к администратору.',
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[Telegram webhook] Error handling update:', error);
    res.sendStatus(200);
  }
});

export default router;

