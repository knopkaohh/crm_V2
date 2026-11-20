/**
 * Образец нового счёта. Не подключён к оформлению заказа.
 * Запуск: node scripts/render-invoice-preview.cjs
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const YELLOW = '#edc147';
const INK = '#1A1A1A';
const MUTED = '#5C574E';
const LINE = '#E4E0D8';
const YELLOW_INK = '#3A3114';
const YELLOW_LINE = '#C9A43A';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;

const FONT_DIR = '/usr/share/fonts/truetype/macos';

const order = {
  number: 'AF-0720',
  date: '20.11.2026',
  clientName: 'Полина Нетреба',
  phone: '+7 915 234-43-31',
  payee: 'Федотов Антон Вадимович',
  card: '2200 7001 7744 6498',
  transferPhone: '+7 916 354-92-87',
  items: [
    { name: 'ZIP-Lock пакет 35×45 см', qty: 300, sum: 10365 },
    { name: 'Стикеры 20×20 мм', qty: 312, sum: 1201.2 },
    { name: 'Картонная навесная бирка', qty: 300, sum: 9180 },
  ],
};

function money(value) {
  const rounded = Math.round(value * 100) / 100;
  const [intPart, frac] = rounded.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${frac} ₽`;
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

  doc.font('bold').fontSize(26).fillColor(INK);
  doc.text(order.clientName, M, 40, { width: 330, lineBreak: false });
  doc.font('regular').fontSize(15).fillColor(INK);
  doc.text(order.phone, M, 76, { lineBreak: false });

  doc.font('bold').fontSize(22).fillColor(INK);
  doc.text(order.number, 360, 40, { width: PAGE_W - M - 360, align: 'right', lineBreak: false });
  doc.font('regular').fontSize(15).fillColor(MUTED);
  doc.text(order.date, 360, 72, { width: PAGE_W - M - 360, align: 'right', lineBreak: false });

  doc.moveTo(M, 112).lineTo(PAGE_W - M, 112).lineWidth(1).strokeColor(LINE).stroke();

  doc.font('bold').fontSize(48).fillColor(INK);
  const title = 'Счёт';
  const titleW = doc.widthOfString(title);
  doc.text(title, M, 132, { lineBreak: false });

  const pillLabel = 'БИРКА МАРКЕТ';
  doc.font('semibold').fontSize(12);
  const pillTextW = doc.widthOfString(pillLabel);
  const pillW = pillTextW + 28;
  const pillH = 32;
  const pillX = M + titleW + 18;
  const pillY = 148;
  doc.roundedRect(pillX, pillY, pillW, pillH, 16).fill(YELLOW);
  doc.fillColor(INK).text(pillLabel, pillX + 14, pillY + 9, { width: pillTextW + 2, lineBreak: false });

  const colW = 250;
  const payY = 214;
  doc.font('semibold').fontSize(12).fillColor(MUTED);
  doc.text('ПОЛУЧАТЕЛЬ', M, payY, { lineBreak: false });
  doc.font('bold').fontSize(16).fillColor(INK);
  doc.text(order.payee, M, payY + 20, { width: colW });

  doc.font('semibold').fontSize(12).fillColor(MUTED);
  doc.text('КАРТА, Т-БАНК', M + 280, payY, { lineBreak: false });
  doc.font('bold').fontSize(16).fillColor(INK);
  doc.text(order.card, M + 280, payY + 20, { width: 240, lineBreak: false });

  doc.font('semibold').fontSize(12).fillColor(MUTED);
  doc.text('ТЕЛЕФОН ДЛЯ ПЕРЕВОДА', M, payY + 78, { lineBreak: false });
  doc.font('bold').fontSize(18).fillColor(INK);
  doc.text(order.transferPhone, M, payY + 98, { lineBreak: false });

  const bandTop = 390;
  doc.rect(0, bandTop, PAGE_W, PAGE_H - bandTop).fill(YELLOW);

  const cols = [
    { label: 'ОПИСАНИЕ', x: M, w: 280, align: 'left' },
    { label: 'КОЛИЧЕСТВО', x: 330, w: 90, align: 'right' },
    { label: 'СТОИМОСТЬ', x: 430, w: PAGE_W - M - 430, align: 'right' },
  ];

  doc.font('semibold').fontSize(12).fillColor(YELLOW_INK);
  cols.forEach((col) => {
    doc.text(col.label, col.x, bandTop + 28, {
      width: col.w,
      align: col.align,
      lineBreak: false,
    });
  });
  doc.moveTo(M, bandTop + 52).lineTo(PAGE_W - M, bandTop + 52).lineWidth(1).strokeColor(YELLOW_LINE).stroke();

  let rowY = bandTop + 72;
  order.items.forEach((item) => {
    doc.font('semibold').fontSize(16).fillColor(INK);
    doc.text(item.name, M, rowY, { width: 290, lineBreak: false });
    doc.font('medium').fontSize(16).fillColor(INK);
    doc.text(qty(item.qty), 330, rowY, { width: 90, align: 'right', lineBreak: false });
    doc.text(money(item.sum), 430, rowY, {
      width: PAGE_W - M - 430,
      align: 'right',
      lineBreak: false,
    });
    rowY += 58;
    doc.moveTo(M, rowY - 16).lineTo(PAGE_W - M, rowY - 16).lineWidth(0.8).strokeColor(YELLOW_LINE).stroke();
  });

  const total = order.items.reduce((sum, item) => sum + item.sum, 0);
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const totalLabel = money(total);

  doc.font('bold').fontSize(16);
  const valueW = doc.widthOfString(totalLabel);
  doc.font('semibold').fontSize(13);
  const captionW = doc.widthOfString('ИТОГО');
  const totalPillW = captionW + valueW + 36;
  const totalPillH = 36;
  const pillTop = PAGE_H - 64;
  const pillLeft = PAGE_W - M - totalPillW;
  doc.roundedRect(pillLeft, pillTop, totalPillW, totalPillH, 18).fill('#FFFFFF');
  doc.fillColor(INK);
  doc.font('semibold').fontSize(13);
  doc.text('ИТОГО', pillLeft + 16, pillTop + 10, { lineBreak: false });
  doc.font('bold').fontSize(16);
  doc.text(totalLabel, pillLeft + 22 + captionW, pillTop + 9, { lineBreak: false });

  doc.font('semibold').fontSize(16).fillColor(INK);
  doc.text(`${qty(totalQty)} ед.`, M, pillTop + 8, { lineBreak: false });

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
