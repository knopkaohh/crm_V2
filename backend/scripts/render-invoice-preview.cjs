/**
 * Образец нового счёта. Не подключён к оформлению заказа.
 * Запуск: node scripts/render-invoice-preview.cjs
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const YELLOW = '#edc147';
const INK = '#1A1A1A';
const MUTED = '#6E6A62';
const LINE = '#E4E0D8';
const YELLOW_INK = '#3A3114';
const YELLOW_LINE = '#C9A43A';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36;

const FONT_DIR = '/usr/share/fonts/truetype/macos';

const order = {
  number: '10421',
  date: '20 ноября 2026',
  clientName: 'Иванов Иван Иванович',
  company: 'ООО «Ромашка»',
  phone: '+7 495 120-44-18',
  items: [
    { name: 'Zip-Lock пакет', detail: '40 × 40 см', qty: 60000, price: 13.7 },
    { name: 'Zip-Lock пакет', detail: '30 × 40 см', qty: 25000, price: 9.9 },
    { name: 'Картонная навесная бирка', detail: '90 × 50 мм, soft-touch', qty: 8000, price: 6.4 },
    { name: 'Сатиновая бирка', detail: '25 × 70 мм', qty: 15000, price: 3.1 },
  ],
};

function money(value) {
  const rounded = Math.round(value * 100) / 100;
  const [intPart, frac] = rounded.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac === '00' ? `${grouped} ₽` : `${grouped},${frac} ₽`;
}

function qty(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function render() {
  const outDir = path.join(__dirname, '../samples');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'schet-novyj-dizajn.pdf');

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.registerFont('regular', path.join(FONT_DIR, 'Inter-Regular.ttf'));
  doc.registerFont('medium', path.join(FONT_DIR, 'Inter-Medium.ttf'));
  doc.registerFont('semibold', path.join(FONT_DIR, 'Inter-SemiBold.ttf'));
  doc.registerFont('bold', path.join(FONT_DIR, 'Inter-Bold.ttf'));

  doc.rect(0, 0, PAGE_W, PAGE_H).fill('#FFFFFF');

  doc.font('medium').fontSize(8).fillColor(MUTED);
  doc.text('СЧЁТ ДЛЯ', M, 34, { lineBreak: false });

  doc.font('bold').fontSize(18).fillColor(INK);
  doc.text(order.clientName, M, 50, { width: 320, lineBreak: false });

  doc.font('regular').fontSize(9).fillColor(MUTED);
  doc.text(order.company, M, 76, { lineBreak: false });

  doc.circle(M + 4, 102, 3.2).lineWidth(0.8).strokeColor(INK).stroke();
  doc.font('regular').fontSize(9).fillColor(INK);
  doc.text(order.phone, M + 14, 96, { lineBreak: false });

  const rightX = 390;
  doc.font('medium').fontSize(8).fillColor(MUTED);
  doc.text('№ СЧЁТА', rightX, 34, { width: PAGE_W - M - rightX, align: 'left', lineBreak: false });
  doc.font('semibold').fontSize(12).fillColor(INK);
  doc.text(order.number, rightX, 48, { width: PAGE_W - M - rightX, lineBreak: false });
  doc.font('medium').fontSize(8).fillColor(MUTED);
  doc.text('ДАТА', rightX, 74, { width: PAGE_W - M - rightX, lineBreak: false });
  doc.font('semibold').fontSize(11).fillColor(INK);
  doc.text(order.date, rightX, 88, { width: PAGE_W - M - rightX, lineBreak: false });

  doc.moveTo(M, 122).lineTo(PAGE_W - M, 122).lineWidth(0.7).strokeColor(LINE).stroke();

  doc.font('bold').fontSize(9).fillColor(YELLOW);
  doc.text('+', M, 132, { lineBreak: false });

  doc.font('bold').fontSize(48).fillColor(INK);
  const title = 'Счёт';
  const titleW = doc.widthOfString(title);
  doc.text(title, M, 146, { lineBreak: false });

  const pillLabel = 'БИРКА МАРКЕТ';
  doc.font('semibold').fontSize(8);
  const pillTextW = doc.widthOfString(pillLabel);
  const pillW = pillTextW + 36;
  const pillH = 26;
  const pillX = M + titleW + 18;
  const pillY = 164;
  doc.roundedRect(pillX, pillY, pillW, pillH, 13).fill(YELLOW);
  doc.font('semibold').fontSize(8).fillColor(INK);
  doc.text(pillLabel, pillX + 12, pillY + 8, { width: pillTextW + 2, lineBreak: false });
  doc.circle(pillX + pillW - 15, pillY + pillH / 2, 5).fill(INK);
  doc.circle(pillX + pillW - 15, pillY + pillH / 2, 2).fill(YELLOW);

  const boxX = Math.max(372, pillX + pillW + 16);
  doc.font('regular').fontSize(10).fillColor('#3F3F3F');
  doc.text('Бирки, упаковка и полиграфия для вашего бренда.', M, 214, {
    width: boxX - M - 18,
  });

  const boxY = 146;
  const boxW = PAGE_W - M - boxX;
  const boxH = 168;
  doc.roundedRect(boxX, boxY, boxW, boxH, 2).lineWidth(0.8).strokeColor('#D9D4CB').stroke();
  doc.font('semibold').fontSize(8).fillColor(INK);
  doc.text('КАК С НАМИ СВЯЗАТЬСЯ', boxX + 12, boxY + 12, { width: boxW - 24 });

  const contacts = [
    ['+7 495 003-88-81', 'телефон'],
    ['prod@birka-market.ru', 'почта'],
    ['birka-market.ru', 'сайт'],
    ['Москва, Строительный пр., 2с1', 'офис'],
  ];
  contacts.forEach((row, index) => {
    const y = boxY + 38 + index * 30;
    doc.circle(boxX + 18, y + 5, 3).lineWidth(0.7).strokeColor(INK).stroke();
    doc.font('medium').fontSize(8.5).fillColor(INK);
    doc.text(row[0], boxX + 28, y, { width: boxW - 40 });
  });

  doc.font('semibold').fontSize(8).fillColor(MUTED);
  doc.text('УСЛОВИЯ', M, 268, { lineBreak: false });

  const terms = [
    'Оплата без НДС: перевод на карту или по выставленному счёту.',
    'Получатель: Федотов Антон Вадимович',
    'Банк: АО «Тинькофф Банк», БИК 044525974, КПП 771301001',
    'Карта: 2200 7001 7744 6498',
    'Телефон для перевода: +7 916 354-92-87',
  ];
  let termY = 286;
  terms.forEach((line) => {
    doc.font('regular').fontSize(8.5).fillColor('#3A3A3A');
    doc.text(line, M, termY, { width: 290 });
    termY = doc.y + 5;
  });

  const bandTop = 430;
  doc.rect(0, bandTop, PAGE_W, PAGE_H - bandTop).fill(YELLOW);

  const cols = [
    { label: 'НАИМЕНОВАНИЕ', x: M, w: 250, align: 'left' },
    { label: 'ЦЕНА', x: 300, w: 80, align: 'right' },
    { label: 'КОЛ-ВО', x: 386, w: 70, align: 'right' },
    { label: 'СУММА', x: 462, w: PAGE_W - M - 462, align: 'right' },
  ];

  doc.font('semibold').fontSize(8).fillColor(YELLOW_INK);
  cols.forEach((col) => {
    doc.text(col.label, col.x, bandTop + 22, {
      width: col.w,
      align: col.align,
      lineBreak: false,
    });
  });

  doc.moveTo(M, bandTop + 42).lineTo(PAGE_W - M, bandTop + 42).lineWidth(0.6).strokeColor(YELLOW_LINE).stroke();

  let rowY = bandTop + 54;
  order.items.forEach((item) => {
    doc.font('semibold').fontSize(11).fillColor(INK);
    doc.text(item.name, M, rowY, { width: 250, lineBreak: false });
    doc.font('regular').fontSize(8).fillColor(YELLOW_INK);
    doc.text(item.detail, M, rowY + 16, { width: 250, lineBreak: false });
    doc.font('medium').fontSize(10).fillColor(INK);
    doc.text(money(item.price), 300, rowY + 4, { width: 80, align: 'right', lineBreak: false });
    doc.text(qty(item.qty), 386, rowY + 4, { width: 70, align: 'right', lineBreak: false });
    doc.text(money(item.qty * item.price), 462, rowY + 4, {
      width: PAGE_W - M - 462,
      align: 'right',
      lineBreak: false,
    });
    rowY += 48;
    doc.moveTo(M, rowY - 10).lineTo(PAGE_W - M, rowY - 10).lineWidth(0.5).strokeColor(YELLOW_LINE).stroke();
  });

  const total = order.items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);

  const drawPill = (label, value, x, y, filled) => {
    doc.font('semibold').fontSize(8);
    const labelW = doc.widthOfString(label);
    doc.font('bold').fontSize(9);
    const valueW = doc.widthOfString(value);
    const w = labelW + valueW + 28;
    const h = 24;
    if (filled) {
      doc.roundedRect(x, y, w, h, 12).fill('#FFFFFF');
      doc.fillColor(INK);
    } else {
      doc.roundedRect(x, y, w, h, 12).lineWidth(1).strokeColor(INK).stroke();
      doc.fillColor(INK);
    }
    doc.font('semibold').fontSize(8);
    doc.text(label, x + 12, y + 7, { lineBreak: false });
    doc.font('bold').fontSize(9);
    doc.text(value, x + 16 + labelW, y + 6.5, { lineBreak: false });
    return w;
  };

  const totalLabel = money(total);
  doc.font('bold').fontSize(9);
  const totalValueW = doc.widthOfString(totalLabel);
  doc.font('semibold').fontSize(8);
  const totalPillW = doc.widthOfString('ИТОГО') + totalValueW + 28;
  const pillsY = PAGE_H - 52;
  const totalX = PAGE_W - M - totalPillW;
  drawPill('ИТОГО', totalLabel, totalX, pillsY, true);

  const subLabel = money(total);
  doc.font('bold').fontSize(9);
  const subValueW = doc.widthOfString(subLabel);
  doc.font('semibold').fontSize(8);
  const subPillW = doc.widthOfString('ПОДЫТОГ') + subValueW + 28;
  drawPill('ПОДЫТОГ', subLabel, totalX - subPillW - 8, pillsY, false);

  doc.font('medium').fontSize(8).fillColor(YELLOW_INK);
  doc.text(`${qty(totalQty)} шт.`, M, pillsY + 6, { lineBreak: false });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

render()
  .then((outPath) => {
    console.log(outPath);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
