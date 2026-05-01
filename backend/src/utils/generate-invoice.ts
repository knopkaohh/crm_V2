import * as path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { execSync } from 'child_process';
import PDFDocument from 'pdfkit';
import { Order, Client, OrderItem } from '@prisma/client';

interface InvoiceData {
  order: Order & {
    client: Client;
    manager: {
      id: string;
      firstName: string;
      lastName: string;
    } | null;
    items: OrderItem[];
  };
}

/**
 * Форматирует номер телефона в формат +7 916 354-92-87
 */
function formatPhoneNumber(phone: string): string {
  // Убираем все нецифровые символы кроме +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Если начинается с +7, оставляем как есть, иначе добавляем +7
  if (!cleaned.startsWith('+7')) {
    cleaned = cleaned.startsWith('7') ? '+7' + cleaned.slice(1) : '+7' + cleaned;
  }
  
  // Форматируем: +7 916 354-92-87
  if (cleaned.length >= 12) {
    const countryCode = cleaned.slice(0, 2); // +7
    const operatorCode = cleaned.slice(2, 5); // 916
    const firstPart = cleaned.slice(5, 8); // 354
    const secondPart = cleaned.slice(8, 10); // 92
    const thirdPart = cleaned.slice(10, 12); // 87
    
    return `${countryCode} ${operatorCode} ${firstPart}-${secondPart}-${thirdPart}`;
  }
  
  return phone; // Если формат не подходит, возвращаем как есть
}

/** LibreOffice/soffice в PATH или стандартные пути Windows */
function resolveLibreOfficeExecutable(): string | null {
  const winPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  for (const p of winPaths) {
    if (fs.existsSync(p)) return p;
  }
  const whichLike = process.platform === 'win32' ? 'where' : 'which';
  for (const bin of ['libreoffice', 'soffice']) {
    try {
      const out = execSync(`${whichLike} ${bin}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (out && fs.existsSync(out)) return out;
    } catch {
      /* следующий кандидат */
    }
  }
  return null;
}

/** Шрифт с кириллицей для pdfkit (на VPS обычно есть после fonts-dejavu-core) */
export function resolveCyrillicFontPath(): string | null {
  const envFont = process.env.INVOICE_PDF_FONT?.trim();
  if (envFont && fs.existsSync(envFont)) return envFont;

  const bundled = path.join(__dirname, '../../fonts/DejaVuSans.ttf');
  if (fs.existsSync(bundled)) return bundled;

  const linuxPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  ];
  for (const p of linuxPaths) {
    if (fs.existsSync(p)) return p;
  }

  if (process.platform === 'win32') {
    for (const p of ['C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\arialuni.ttf']) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/** Для Helvetica без встроенной кириллицы — только безопасные для PDF символы */
function toAsciiPdfSafe(s: string): string {
  return (s || '').replace(/[^\x20-\x7E]/g, '?');
}

/**
 * Упрощённый счёт без Word/LibreOffice — для серверов без GUI и для fallback при ошибке шаблона.
 * Если нет TTF с кириллицей — Helvetica и ASCII-safe текст (кириллица станет «?»); лучше поставить fonts-dejavu-core или INVOICE_PDF_FONT.
 */
export async function generateInvoicePdfSimple(data: InvoiceData): Promise<Buffer> {
  const fontPath = resolveCyrillicFontPath();
  const useCyrillicFont = Boolean(fontPath);

  const order = data.order;
  const client = order.client;
  const items = order.items || [];
  const formattedPhone = client.phone ? formatPhoneNumber(client.phone) : '—';
  const today = new Date().toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const managerName = order.manager
    ? `${order.manager.firstName} ${order.manager.lastName}`
    : '—';

  const safe = (s: string) => (useCyrillicFont ? s : toAsciiPdfSafe(s));

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (useCyrillicFont) {
      doc.registerFont('inv', fontPath!);
      doc.font('inv');
    } else {
      doc.font('Helvetica');
      console.warn(
        '[invoice] pdfkit: нет шрифта с кириллицей — Helvetica + ASCII-safe (задайте INVOICE_PDF_FONT или fonts-dejavu-core)',
      );
    }

    if (useCyrillicFont) {
      doc.fontSize(16).text(`Счёт № ${order.orderNumber}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#444').text(`Дата: ${today}`, { align: 'center' });
      doc.fillColor('#000');
      doc.moveDown(1.2);

      doc.fontSize(11).text(`Клиент: ${client.name}`);
      doc.text(`Телефон: ${formattedPhone}`);
      if (client.company) doc.text(`Компания: ${client.company}`);
      doc.text(`Менеджер: ${managerName}`);
      doc.moveDown(1);

      doc.fontSize(11).text('Позиции:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      for (const it of items) {
        const line = it.name || 'Позиция';
        const qty = it.quantity;
        const sum = Number(it.price).toFixed(2);
        doc.text(`${line} — ${qty} ед. — ${sum} ₽ (сумма по строке)`);
        doc.moveDown(0.35);
      }

      doc.moveDown(0.5);
      doc.moveTo(48, doc.y).lineTo(548, doc.y).stroke('#ccc');
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Итого: ${Number(order.totalAmount).toFixed(2)} ₽`, { align: 'right' });
    } else {
      doc.fontSize(16).text(`Invoice # ${safe(String(order.orderNumber))}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#444').text(`Date: ${safe(today)}`, { align: 'center' });
      doc.fillColor('#000');
      doc.moveDown(1.2);

      doc.fontSize(11).text(`Client: ${safe(client.name)}`);
      doc.text(`Phone: ${safe(formattedPhone)}`);
      if (client.company) doc.text(`Company: ${safe(client.company)}`);
      doc.text(`Manager: ${safe(managerName)}`);
      doc.moveDown(1);

      doc.fontSize(11).text('Line items:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      for (const it of items) {
        const line = safe(it.name || 'Item');
        const qty = it.quantity;
        const sum = Number(it.price).toFixed(2);
        doc.text(`${line} — qty ${qty} — ${sum} RUB (line total)`);
        doc.moveDown(0.35);
      }

      doc.moveDown(0.5);
      doc.moveTo(48, doc.y).lineTo(548, doc.y).stroke('#ccc');
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(`Total: ${Number(order.totalAmount).toFixed(2)} RUB`, { align: 'right' });
    }

    doc.end();
  });
}

/**
 * Конвертирует Word документ в PDF используя LibreOffice в фоновом режиме (без показа окна/терминала)
 */
async function convertWordToPDF(wordPath: string, pdfPath: string): Promise<void> {
  const { spawn } = require('child_process');

  const libreOfficePath = resolveLibreOfficeExecutable();
  if (!libreOfficePath) {
    throw new Error(
      'LibreOffice не найден в PATH (проверьте: which libreoffice / which soffice). ' +
        'На Debian/Ubuntu: sudo apt-get install -y libreoffice-writer-nogui',
    );
  }
  
  const outputDir = path.dirname(pdfPath);
  const baseName = path.basename(wordPath, path.extname(wordPath));
  const generatedPdfPath = path.join(outputDir, `${baseName}.pdf`);
  
  console.log('Начинаем конвертацию Word в PDF через LibreOffice (фоновый режим)...');
  
  // Используем spawn вместо exec для более тихого запуска
  // Флаги: --headless (без GUI), --invisible (невидимый), --nodefault (без окна по умолчанию)
  // --nolockcheck (не проверять блокировки), --norestore (не восстанавливать окна)
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--invisible',
      '--nodefault',
      '--nolockcheck',
      '--norestore',
      '--convert-to', 'pdf',
      '--outdir', outputDir,
      wordPath
    ];
    
    // Запускаем процесс в фоне с минимальным выводом
    const process = spawn(libreOfficePath, args, {
      stdio: ['ignore', 'ignore', 'pipe'], // stdin, stdout игнорируем, stderr в pipe для ошибок
      windowsHide: true, // Скрываем окно в Windows
      detached: false, // Не отсоединяем процесс
    });
    
    let errorOutput = '';
    
    process.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    process.on('close', async (code: number) => {
      // Ждем немного, чтобы файл точно создался
      setTimeout(async () => {
        try {
          await fsPromises.access(generatedPdfPath);
          if (generatedPdfPath !== pdfPath) {
            await fsPromises.rename(generatedPdfPath, pdfPath);
          }
          console.log('PDF файл успешно создан:', pdfPath);
          resolve();
        } catch {
          // Пробуем альтернативные пути
          const altPath = wordPath.replace(/\.docx?$/i, '.pdf');
          try {
            await fsPromises.access(altPath);
            await fsPromises.rename(altPath, pdfPath);
            console.log('PDF файл найден по альтернативному пути:', pdfPath);
            resolve();
          } catch {
            reject(new Error(`PDF файл не был создан. Код выхода: ${code}. Ошибки: ${errorOutput || 'нет'}`));
          }
        }
      }, 1500); // Увеличиваем время ожидания до 1.5 секунд
    });
    
    process.on('error', (error: Error) => {
      reject(new Error(`Ошибка запуска LibreOffice: ${error.message}`));
    });
    
    // Таймаут на случай зависания
    setTimeout(() => {
      if (!process.killed) {
        process.kill();
        reject(new Error('Конвертация превысила таймаут (30 секунд)'));
      }
    }, 30000);
  });
}

/**
 * Генерирует PDF счет на основе Word шаблона (с fallback без LibreOffice).
 * INVOICE_SIMPLE_PDF=1 — только упрощённый pdfkit-PDF (удобно для VPS без LibreOffice).
 */
export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  const simpleFlag = String(process.env.INVOICE_SIMPLE_PDF || '').toLowerCase();
  if (['1', 'true', 'yes'].includes(simpleFlag)) {
    return generateInvoicePdfSimple(data);
  }

  const simpleFirst = String(process.env.INVOICE_SIMPLE_FIRST || '').toLowerCase();
  if (['1', 'true', 'yes'].includes(simpleFirst)) {
    try {
      return await generateInvoicePdfSimple(data);
    } catch (e: any) {
      console.warn('[invoice] INVOICE_SIMPLE_FIRST: упрощённый PDF не удался, пробуем DOCX:', e?.message || e);
    }
  }

  const tempDir = path.join(__dirname, '../../temp');
  try {
    await fsPromises.access(tempDir);
  } catch {
    await fsPromises.mkdir(tempDir, { recursive: true });
  }
  
  let tempWordPath = '';
  let tempPdfPath = '';
  
  try {
    console.log('Начинаем генерацию PDF счета...');
    
    // Путь к шаблону Word
    const projectRoot = path.resolve(__dirname, '../..');
    let templatePath = path.join(projectRoot, 'templates', 'Форма Заявки Шаблон.docx');
    console.log('Путь к шаблону:', templatePath);
    
    // Проверяем существование файла
    try {
      await fsPromises.access(templatePath);
    } catch {
      // Пробуем найти файл по маске
      try {
        const templatesDir = path.join(projectRoot, 'templates');
        await fsPromises.access(templatesDir);
        const files = await fsPromises.readdir(templatesDir);
        console.log('Файлы в папке templates:', files);
        const docxFile = files.find((f: string) => f.toLowerCase().endsWith('.docx'));
        if (docxFile) {
          templatePath = path.join(templatesDir, docxFile);
          console.log('Найден DOCX файл:', templatePath);
        }
      } catch (dirError) {
        console.warn('Ошибка при чтении папки templates:', dirError);
      }
      
      try {
        await fsPromises.access(templatePath);
      } catch {
        throw new Error(`Шаблон не найден: ${templatePath}`);
      }
    }
    
    // Читаем шаблон Word
    console.log('Читаем шаблон Word...');
    const templateContent = await fsPromises.readFile(templatePath);
    console.log('Шаблон прочитан, размер:', templateContent.length, 'байт');
    
    // Подготовка данных
    const order = data.order;
    const client = order.client;
    const items = order.items;
    
    // Форматируем дату
    const today = new Date();
    const formattedDate = today.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Форматируем телефон
    const formattedPhone = client.phone ? formatPhoneNumber(client.phone) : '';
    
    // Рассчитываем итоги
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = Number(order.totalAmount);
    
    // Подготавливаем данные для заполнения шаблона
    // В шаблоне используются индексированные поля: {Материал и размер_1}, {Количество_1}, {Сумма позиции_1} и т.д.
    
    // Основные данные шаблона
    const templateData: any = {
      'Сегодняшняя дата': formattedDate,
      'Имя Фамилия клиента': client.name,
      'Номер телефона клиента': formattedPhone,
      'Номер заказа': order.orderNumber,
      // Добавляем "ед." к итоговому количеству и "₽" к итоговой сумме
      'Итоговое количество': `${totalQuantity.toString()} ед.`,
      'Итоговая Сумма позиции': `${totalAmount.toFixed(2)} ₽`,
    };
    
    // Заполняем позиции заказа с индексами (максимум 4 позиции, но добавляем до 5 на случай если в шаблоне есть поле _5)
    // Если позиций меньше 4, остальные строки будут пустыми
    // Добавляем "ед." к количеству и "₽" к сумме позиции
    for (let i = 0; i < 5; i++) {
      if (i < items.length) {
        // Заполняем данные позиции
        const item = items[i];
        const itemPrice = Number(item.price);
        templateData[`Материал и размер_${i + 1}`] = item.name;
        // Добавляем "ед." к количеству
        templateData[`Количество_${i + 1}`] = `${item.quantity.toString()} ед.`;
        // Добавляем "₽" к сумме позиции
        templateData[`Сумма позиции_${i + 1}`] = `${itemPrice.toFixed(2)} ₽`;
      } else {
        // Заполняем пустыми строками для незаполненных позиций
        templateData[`Материал и размер_${i + 1}`] = '';
        templateData[`Количество_${i + 1}`] = '';
        templateData[`Сумма позиции_${i + 1}`] = '';
      }
    }
    
    console.log('Заполняем шаблон данными:', JSON.stringify(templateData, null, 2));
    
    // Генерируем Word документ из шаблона используя docxtemplater
    console.log('Генерируем Word документ из шаблона...');
    console.log('Количество позиций для заполнения:', items.length);
    let wordBuffer: Buffer;
    
    try {
      // Загружаем шаблон как ZIP архив (DOCX это ZIP архив)
      const PizZipClass = require('pizzip');
      const zip = new PizZipClass(templateContent);
      
      // Создаем экземпляр Docxtemplater
      const DocxtemplaterClass = require('docxtemplater');
      const doc = new DocxtemplaterClass(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: (part: any) => {
          // Если поле не найдено, возвращаем пустую строку вместо undefined
          console.warn('Поле не найдено в шаблоне:', part);
          return '';
        },
      });
      
      // Заполняем шаблон данными (новый API docxtemplater)
      doc.render(templateData);
      
      // Получаем результат как Buffer
      wordBuffer = doc.getZip().generate({ 
        type: 'nodebuffer',
        compression: 'DEFLATE'
      }) as Buffer;
      
      console.log('Word документ сгенерирован, размер:', wordBuffer.length, 'байт');
      
      if (!wordBuffer || wordBuffer.length === 0) {
        throw new Error('Сгенерированный Word документ пуст');
      }
    } catch (templateError: any) {
      console.error('Ошибка при генерации Word из шаблона:', templateError);
      console.error('Тип ошибки:', templateError?.constructor?.name);
      console.error('Сообщение ошибки:', templateError?.message);
      console.error('Stack:', templateError?.stack);
      
      // Дополнительная информация для docxtemplater
      let errorMessage = `Ошибка при заполнении шаблона: ${templateError.message || templateError}`;
      
      if (templateError.properties) {
        console.error('Свойства ошибки:', JSON.stringify(templateError.properties, null, 2));
        
        // Проверяем на ошибку незакрытого тега
        if (templateError.properties.id === 'unclosed_tag' || templateError.properties.xtag) {
          const problemTag = templateError.properties.xtag || templateError.properties.context || '';
          errorMessage = `Ошибка в шаблоне Word: незакрытый тег "{${problemTag}". Проверьте шаблон - все поля должны быть закрыты фигурными скобками, например: {Количество_5} (не {Количество_5).`;
          console.error('Проблемный тег:', problemTag);
          console.error('Контекст:', templateError.properties.context);
        }
        
        if (templateError.properties.explanation) {
          console.error('Пояснение ошибки:', templateError.properties.explanation);
          errorMessage += `\n${templateError.properties.explanation}`;
        }
        
        // Обработка множественных ошибок
        if (templateError.properties.errors && Array.isArray(templateError.properties.errors)) {
          const errorsList = templateError.properties.errors.map((err: any) => {
            if (err.properties && err.properties.xtag) {
              return `Незакрытый тег: {${err.properties.xtag}`;
            }
            return err.message || err.toString();
          }).join('; ');
          errorMessage += `\nОшибки: ${errorsList}`;
        }
      }
      
      throw new Error(errorMessage);
    }
    
    // Сохраняем временный Word файл
    tempWordPath = path.join(tempDir, `invoice-${order.orderNumber}-${Date.now()}.docx`);
    console.log('Сохраняем временный Word файл:', tempWordPath);
    await fsPromises.writeFile(tempWordPath, wordBuffer);
    console.log('Word файл сохранен');
    
    // Конвертируем Word в PDF
    tempPdfPath = path.join(tempDir, `invoice-${order.orderNumber}-${Date.now()}.pdf`);
    console.log('Начинаем конвертацию Word в PDF...');
    
    try {
      await convertWordToPDF(tempWordPath, tempPdfPath);
    } catch (error) {
      console.warn('Не удалось конвертировать через LibreOffice, пробуем альтернативный метод:', error);
      
      // Альтернативный метод: используем docx-pdf если установлен
      try {
        const docxPdf = require('docx-pdf');
        await new Promise<void>((resolve, reject) => {
          docxPdf(tempWordPath, tempPdfPath, (err: Error) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (docxPdfError) {
        console.error('Ошибка при конвертации через docx-pdf:', docxPdfError);
        throw new Error('Не удалось конвертировать Word в PDF. Установите LibreOffice и добавьте его в PATH.');
      }
    }
    
    // Проверяем, что PDF файл создан
    try {
      await fsPromises.access(tempPdfPath);
    } catch {
      throw new Error(`PDF файл не был создан: ${tempPdfPath}`);
    }
    
    console.log('PDF файл создан успешно:', tempPdfPath);
    
    // Читаем PDF файл
    const pdfBuffer = await fsPromises.readFile(tempPdfPath);
    console.log('PDF файл прочитан, размер:', pdfBuffer.length, 'байт');
    
    // Удаляем временные файлы
    try {
      if (tempWordPath) {
        await fsPromises.unlink(tempWordPath);
        console.log('Временный Word файл удален');
      }
      if (tempPdfPath) {
        await fsPromises.unlink(tempPdfPath);
        console.log('Временный PDF файл удален');
      }
    } catch (cleanupError) {
      console.warn('Ошибка при удалении временных файлов:', cleanupError);
    }
    
    console.log('Генерация PDF завершена успешно');
    return pdfBuffer;
    
  } catch (error: any) {
    console.error('Ошибка при генерации PDF (основной сценарий):', error);
    console.error('Детали ошибки:', {
      message: error?.message,
      stack: error?.stack,
    });

    try {
      if (tempWordPath) {
        await fsPromises.unlink(tempWordPath);
      }
      if (tempPdfPath) {
        await fsPromises.unlink(tempPdfPath);
      }
    } catch {
      /* очистка */
    }

    console.warn('[invoice] пробуем упрощённый PDF (pdfkit)...');
    try {
      return await generateInvoicePdfSimple(data);
    } catch (fallbackErr: any) {
      console.error('[invoice] упрощённый PDF не удался:', fallbackErr?.message || fallbackErr);
      throw error;
    }
  }
}

