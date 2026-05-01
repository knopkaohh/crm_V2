import { google } from 'googleapis';
import { prisma } from './prisma';
import { normalizePhone } from './phone';
import fs from 'fs';

const LAST_ROW_KEY = 'cold_calls:last_processed_row';
const SHEET_NAME = process.env.GOOGLE_SHEETS_CONTACTS_TAB || 'Контакты';

export const getColdCallsSyncConfigError = (): string | null => {
  const hasJson = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const hasFile = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
  if (!hasJson && !hasFile) {
    return 'Не настроен сервисный аккаунт Google (GOOGLE_SERVICE_ACCOUNT_JSON или GOOGLE_SERVICE_ACCOUNT_FILE).';
  }
  if (!process.env.GOOGLE_SHEETS_ID) {
    return 'Не указан GOOGLE_SHEETS_ID.';
  }
  return null;
};

const parseDate = (raw?: string): Date | null => {
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date;
  return null;
};

const getServiceAccountCredentials = () => {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();

  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON: невалидный JSON. Проверьте кавычки и экранирование в .env на сервере.',
      );
    }
  }

  if (filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Не удалось прочитать или распарсить GOOGLE_SERVICE_ACCOUNT_FILE (${filePath}): ${msg}`,
      );
    }
  }

  throw new Error('Missing Google service account credentials');
};

const getDefaultImportUserId = async (): Promise<string> => {
  if (process.env.COLD_CALLS_DEFAULT_USER_ID) {
    return process.env.COLD_CALLS_DEFAULT_USER_ID;
  }

  const fallbackUser = await prisma.user.findFirst({
    where: {
      isActive: true,
      role: { in: ['ADMIN', 'EXECUTIVE'] },
    },
    select: { id: true },
  });

  if (!fallbackUser) {
    throw new Error('No active ADMIN/EXECUTIVE user for cold calls import');
  }
  return fallbackUser.id;
};

const getLastProcessedRow = async (): Promise<number> => {
  const setting = await prisma.appSetting.findUnique({
    where: { key: LAST_ROW_KEY },
  });
  return setting ? Number(setting.value) : 1;
};

const saveLastProcessedRow = async (row: number) => {
  await prisma.appSetting.upsert({
    where: { key: LAST_ROW_KEY },
    update: { value: String(row) },
    create: { key: LAST_ROW_KEY, value: String(row) },
  });
};

export const syncColdCallsFromGoogleSheets = async () => {
  const configError = getColdCallsSyncConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const credentials = getServiceAccountCredentials();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error('Не указан GOOGLE_SHEETS_ID.');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const lastProcessedRow = await getLastProcessedRow();
  const startRow = Math.max(2, lastProcessedRow + 1);
  const range = `${SHEET_NAME}!A${startRow}:E`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  if (!rows.length) {
    return { imported: 0, skipped: 0, lastProcessedRow };
  }

  const importUserId = await getDefaultImportUserId();
  let imported = 0;
  let skipped = 0;
  let currentRow = startRow;

  for (const row of rows) {
    const receivedAt = parseDate(row[0]);
    const phone = normalizePhone(row[2]);
    const source = (row[4] || '').trim() || null;

    if (!phone) {
      skipped += 1;
      currentRow += 1;
      continue;
    }

    const [activeDuplicate, closedDuplicate] = await Promise.all([
      prisma.call.findFirst({
        where: {
          phoneNumber: phone,
          closedAt: null,
        },
        select: { id: true },
      }),
      prisma.closedContact.findFirst({
        where: { clientPhone: phone },
        select: { id: true },
      }),
    ]);

    if (activeDuplicate || closedDuplicate) {
      skipped += 1;
      currentRow += 1;
      continue;
    }

    await prisma.call.create({
      data: {
        phoneNumber: phone,
        source,
        phoneReceivedAt: receivedAt,
        userId: importUserId,
        status: 'NO_ANSWER',
      },
    });

    imported += 1;
    currentRow += 1;
  }

  const newLastProcessedRow = currentRow - 1;
  await saveLastProcessedRow(newLastProcessedRow);

  return {
    imported,
    skipped,
    lastProcessedRow: newLastProcessedRow,
  };
};
