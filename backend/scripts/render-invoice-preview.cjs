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
const LOGO = path.join(__dirname, '../assets/birka-logo.png');

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
  doc.text('№ СЧЁТА', rightX, 34, { width: PAGE_W - M - rightX, lineBreak: false });
  doc.font('semibold').fontSize(12).fillColor(INK);
  doc.text(order.number, rightX, 48, { width: PAGE_W - M - rightX, lineBreak: false });
  doc.font('medium').fontSize(8).fillColor(MUTED);
  doc.text('ДАТА', rightX, 74, { width: PAGE_W - M - rightX, lineBreak: false });
  doc.font('semibold').fontSize(11).fillColor(INK);
  doc.text(order.date, rightX, 88, { width: PAGE_W - M - rightX, lineBreak: false });

  doc.moveTo(M, 122).lineTo(PAGE_W - M, 122).lineWidth(0.7).strokeColor(LINE).stroke();

  const logoW = 210;
  const logoH = logoW * (114 / 261);
  doc.image(LOGO, M, 138, { width: logoW });

  const boxX = 348;
  const boxY = 138;
  const boxW = PAGE_W - M - boxX;
  const boxH = 168;
  doc.roundedRect(boxX, boxY, boxW, boxH, 2).lineWidth(0.8).strokeColor('#D9D4CB').stroke();
  doc.font('semibold').fontSize(8).fillColor(INK);
  doc.text('КАК С НАМИ СВЯЗАТЬСЯ', boxX + 12, boxY + 12, { width: boxW - 24 });

  const contacts = [
    '+7 495 003-88-81',
    'prod@birka-market.ru',
    'birka-market.ru',
    'Москва, Строительный пр., 2с1',
  ];
  contacts.forEach((line, index) => {
    const y = boxY + 40 + index * 30;
    doc.circle(boxX + 18, y + 4, 3).lineWidth(0.7).strokeColor(INK).stroke();
    doc.font('medium').fontSize(8.5).fillColor(INK);
    doc.text(line, boxX + 28, y - 2, { width: boxW - 40 });
  });

  const payY = 138 + logoH + 18;
  const payments = [
    ['Получатель платежа', 'Федотов Антон Вадимович'],
    ['Номер карты', '2200700177446498 (Т-Банк)'],
    ['Номер телефона для перевода', '+7 (916) 354-92-87 (Т-Банк)'],
  ];
  let cursor = payY;
  payments.forEach(([label, value]) => {
    doc.font('semibold').fontSize(8).fillColor(MUTED);
    doc.text(label.toUpperCase(), M, cursor, { width: 300, lineBreak: false });
    doc.font('semibold').fontSize(12).fillColor(INK);
    doc.text(value, M, cursor + 14, { width: 300, lineBreak: false });
    cursor += 40;
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
  const totalLabel = money(total);
  const pillCaption = 'СУММА ЗАКАЗА';

  doc.font('semibold').fontSize(8);
  const captionW = doc.widthOfString(pillCaption);
  doc.font('bold').fontSize(9);
  const valueW = doc.widthOfString(totalLabel);
  const pillW = captionW + valueW + 28;
  const pillH = 24;
  const pillsY = PAGE_H - 52;
  const pillX = PAGE_W - M - pillW;

  doc.roundedRect(pillX, pillsY, pillW, pillH, 12).lineWidth(1).strokeColor(INK).stroke();
  doc.fillColor(INK);
  doc.font('semibold').fontSize(8);
  doc.text(pillCaption, pillX + 12, pillsY + 7, { lineBreak: false });
  doc.font('bold').fontSize(9);
  doc.text(totalLabel, pillX + 16 + captionW, pillsY + 6.5, { lineBreak: false });

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
