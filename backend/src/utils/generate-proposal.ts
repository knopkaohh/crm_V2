import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export interface ProposalPdfItem {
  name: string;
  detail: string;
  quantity: number;
  unitPrice: number;
}

export interface ProposalPdfData {
  clientName: string;
  companyName: string;
  productLine: string;
  subtitle: string;
  intro: string;
  termsPrice: string;
  termsPayment: string;
  termsDelivery: string;
  closingTitle: string;
  closingText: string;
  items: ProposalPdfItem[];
}

const GOLD = '#F6C64B';
const INK = '#111111';
const MUTED = '#5C5C5C';
const HAIRLINE = '#E4E4E4';
const TOTAL_BG = '#F4F4F2';
const CREAM = '#FFF8E4';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 792;

function resolveFont(fileName: string): string | null {
  const candidates = [
    path.join(__dirname, '../../fonts', fileName),
    path.join('/usr/share/fonts/truetype/dejavu', fileName),
    path.join('/usr/share/fonts/truetype/liberation', fileName === 'DejaVuSans-Bold.ttf' ? 'LiberationSans-Bold.ttf' : 'LiberationSans-Regular.ttf'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function formatGrouped(value: number, fractionDigits: number): string {
  const sign = value < 0 ? '-' : '';
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [intPart, frac] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (!fractionDigits) return `${sign}${grouped}`;
  return `${sign}${grouped},${frac}`;
}

function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const hasFraction = Math.abs(rounded - Math.trunc(rounded)) > 0.001;
  return `${formatGrouped(rounded, hasFraction ? 2 : 0)} ₽`;
}

function formatQty(value: number): string {
  return `${formatGrouped(Math.round(value), 0)} шт.`;
}

export async function generateProposalPdf(data: ProposalPdfData): Promise<Buffer> {
  const regularFont = resolveFont('DejaVuSans.ttf');
  const boldFont = resolveFont('DejaVuSans-Bold.ttf') ?? regularFont;
  if (!regularFont || !boldFont) {
    throw new Error('Не найден шрифт с кириллицей для коммерческого предложения');
  }

  const logoPath = path.join(__dirname, '../../assets/birka-wordmark.png');
  const hasLogo = fs.existsSync(logoPath);

  const totalQty = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
    });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('regular', regularFont);
    doc.registerFont('bold', boldFont);

    const cols = { num: 34, qty: 86, price: 78, sum: 96 };
    const nameWidth = CONTENT_WIDTH - cols.num - cols.qty - cols.price - cols.sum;

    let y = 22;

    const ensureSpace = (height: number) => {
      if (y + height <= CONTENT_BOTTOM) return;
      doc.addPage();
      y = MARGIN;
    };

    doc.save();
    doc.rect(0, 0, PAGE_WIDTH, 8).fill(GOLD);
    doc.restore();

    if (hasLogo) {
      doc.image(logoPath, MARGIN, 22, { width: 148 });
    } else {
      doc.font('bold').fontSize(16).fillColor(GOLD).text('БИРКА', MARGIN, 28, { lineBreak: false });
      doc.text('МАРКЕТ', MARGIN, 48, { lineBreak: false });
    }

    doc.font('bold').fontSize(8).fillColor(INK);
    doc.text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', MARGIN, 30, {
      width: CONTENT_WIDTH,
      align: 'right',
    });
    doc.font('regular').fontSize(10).fillColor(MUTED);
    doc.text(data.productLine, MARGIN, 44, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

    y = 118;
    doc.font('bold').fontSize(20).fillColor(INK);
    doc.text('Коммерческое предложение', MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 2;

    doc.font('regular').fontSize(11).fillColor(MUTED);
    doc.text(data.subtitle, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 10;

    doc.font('regular').fontSize(8).fillColor(MUTED);
    doc.text('Клиент', MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 1;
    doc.font('bold').fontSize(10).fillColor(INK);
    doc.text(data.clientName, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 1;
    if (data.companyName.trim()) {
      doc.font('regular').fontSize(10).fillColor('#333333');
      doc.text(data.companyName, MARGIN, y, { width: CONTENT_WIDTH });
      y = doc.y + 10;
    } else {
      y += 10;
    }

    doc.font('regular').fontSize(10).fillColor('#333333');
    doc.text(data.intro, MARGIN, y, { width: CONTENT_WIDTH, lineGap: 2 });
    y = doc.y + 16;

    ensureSpace(28);
    doc.font('bold').fontSize(12).fillColor(INK);
    doc.text('Спецификация заказа', MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 8;

    const drawHeader = () => {
      const headerHeight = 22;
      doc.save();
      doc.rect(MARGIN, y, CONTENT_WIDTH, headerHeight).fill(GOLD);
      doc.restore();
      doc.font('bold').fontSize(8).fillColor(INK);
      const headers: Array<{ label: string; width: number; align: 'left' | 'right' }> = [
        { label: '№', width: cols.num, align: 'left' },
        { label: 'Наименование', width: nameWidth, align: 'left' },
        { label: 'Количество', width: cols.qty, align: 'right' },
        { label: 'Цена за ед.', width: cols.price, align: 'right' },
        { label: 'Сумма', width: cols.sum, align: 'right' },
      ];
      let x = MARGIN;
      headers.forEach((header) => {
        const pad = header.align === 'right' ? 8 : 6;
        doc.text(header.label, x + (header.align === 'right' ? 0 : pad), y + 6, {
          width: header.width - pad,
          align: header.align,
          lineBreak: false,
        });
        x += header.width;
      });
      y += headerHeight;
    };

    drawHeader();

    data.items.forEach((item, index) => {
      doc.font('bold').fontSize(9);
      const nameHeight = doc.heightOfString(item.name, { width: nameWidth - 12 });
      const detailHeight = item.detail.trim() ? 12 : 0;
      const rowHeight = Math.max(30, nameHeight + detailHeight + 14);

      if (y + rowHeight > CONTENT_BOTTOM) {
        doc.addPage();
        y = MARGIN;
        drawHeader();
      }

      doc.font('regular').fontSize(9).fillColor('#8A8A8A');
      doc.text(String(index + 1).padStart(2, '0'), MARGIN + 6, y + 8, {
        width: cols.num - 10,
        lineBreak: false,
      });

      doc.font('bold').fontSize(9).fillColor(INK);
      doc.text(item.name, MARGIN + cols.num + 6, y + 8, { width: nameWidth - 12 });
      if (item.detail.trim()) {
        doc.font('regular').fontSize(8).fillColor(MUTED);
        doc.text(item.detail.trim(), MARGIN + cols.num + 6, y + 8 + nameHeight, {
          width: nameWidth - 12,
          lineBreak: false,
        });
      }

      const qtyX = MARGIN + cols.num + nameWidth;
      doc.font('regular').fontSize(9).fillColor('#333333');
      doc.text(formatQty(item.quantity), qtyX, y + 8, {
        width: cols.qty - 8,
        align: 'right',
        lineBreak: false,
      });
      doc.text(formatMoney(item.unitPrice), qtyX + cols.qty, y + 8, {
        width: cols.price - 8,
        align: 'right',
        lineBreak: false,
      });
      doc.font('bold').fillColor(INK);
      doc.text(formatMoney(item.quantity * item.unitPrice), qtyX + cols.qty + cols.price, y + 8, {
        width: cols.sum - 8,
        align: 'right',
        lineBreak: false,
      });

      y += rowHeight;
      doc.save();
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.6).strokeColor(HAIRLINE).stroke();
      doc.restore();
    });

    y += 10;
    ensureSpace(36);
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, 32).fill(TOTAL_BG);
    doc.restore();
    doc.font('bold').fontSize(10).fillColor(INK);
    doc.text('Общая стоимость заказа', MARGIN + 10, y + 10, {
      width: CONTENT_WIDTH * 0.55,
      lineBreak: false,
    });
    doc.fontSize(13).text(formatMoney(totalAmount), MARGIN, y + 8, {
      width: CONTENT_WIDTH - 10,
      align: 'right',
      lineBreak: false,
    });
    y += 40;

    doc.font('regular').fontSize(9).fillColor(MUTED);
    doc.text(`Общий объём: ${formatQty(totalQty)}`, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 16;

    ensureSpace(78);
    doc.font('bold').fontSize(12).fillColor(INK);
    doc.text('Условия заказа', MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 8;

    const terms: Array<[string, string]> = [
      ['Стоимость', data.termsPrice],
      ['Оплата и сроки', data.termsPayment],
      ['Доставка', data.termsDelivery],
    ];
    terms.forEach(([label, value]) => {
      doc.font('regular').fontSize(9);
      const valueHeight = doc.heightOfString(value, { width: CONTENT_WIDTH - 140 });
      const rowHeight = Math.max(18, valueHeight) + 6;
      ensureSpace(rowHeight);
      doc.font('bold').fontSize(9).fillColor(INK);
      doc.text(label, MARGIN, y, { width: 128, lineBreak: false });
      doc.font('regular').fontSize(9).fillColor('#333333');
      doc.text(value, MARGIN + 132, y, { width: CONTENT_WIDTH - 132 });
      y = Math.max(y + 18, doc.y + 4);
    });

    y += 8;
    doc.font('bold').fontSize(11);
    const titleHeight = doc.heightOfString(data.closingTitle, { width: CONTENT_WIDTH - 24 });
    doc.font('regular').fontSize(9);
    const textHeight = doc.heightOfString(data.closingText, { width: CONTENT_WIDTH - 24 });
    const boxHeight = titleHeight + textHeight + 22;
    ensureSpace(boxHeight + 28);

    doc.save();
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 4).fillAndStroke(CREAM, GOLD);
    doc.restore();
    doc.font('bold').fontSize(11).fillColor(INK);
    doc.text(data.closingTitle, MARGIN + 12, y + 10, { width: CONTENT_WIDTH - 24 });
    doc.font('regular').fontSize(9).fillColor(MUTED);
    doc.text(data.closingText, MARGIN + 12, doc.y + 2, { width: CONTENT_WIDTH - 24 });
    y += boxHeight + 16;

    ensureSpace(22);
    doc.font('bold').fontSize(11).fillColor(INK);
    doc.text('Бирка Маркет', MARGIN, y, { width: CONTENT_WIDTH });

    const range = doc.bufferedPageRange();
    for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc.page.margins.bottom = 0;
      const footerY = PAGE_HEIGHT - 32;
      doc.save();
      doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_WIDTH, footerY).lineWidth(0.6).strokeColor('#E7D7A4').stroke();
      doc.restore();
      doc.font('regular').fontSize(8).fillColor('#9A9A9A');
      const footerLabel = `БИРКА МАРКЕТ  •  ${data.productLine.toUpperCase()}`;
      doc.text(footerLabel, MARGIN, footerY + 8, {
        width: CONTENT_WIDTH - 24,
        lineBreak: false,
      });
      doc.text(String(pageIndex + 1), MARGIN, footerY + 8, {
        width: CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      });
    }

    doc.end();
  });
}
