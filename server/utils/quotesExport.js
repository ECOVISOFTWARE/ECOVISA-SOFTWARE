const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const ExcelJS     = require('exceljs');
const path        = require('path');
const fs          = require('fs');

const COMPANY = {
  name:     'ECOVISA',
  full:     'Ecología, Vida y Salud, S.A. de C.V.',
  address:  'Blvd. Jesús García Morales No. 834, Col. La manga, Hermosillo, Sonora',
  phone:    '668 8197879',
  web:      'www.ecovisa.com',
  navy:     '#1a3c5e',
  teal:     '#0ea5a0',
  BASE_URL: 'https://ecovisa-software.onrender.com',
};

const LOGO_PATH  = path.join(__dirname, '../../web/public/assets/ECOVISA_ICON.png');
const LOGOS_PATH = path.join(__dirname, '../../web/public/assets/LOGOS.png');
const LADA_PATH  = path.join(__dirname, '../../web/public/assets/lada.png');

const LOGO_BUFFER  = fs.existsSync(LOGO_PATH)  ? fs.readFileSync(LOGO_PATH)  : null;
const LOGOS_BUFFER = fs.existsSync(LOGOS_PATH) ? fs.readFileSync(LOGOS_PATH) : null;
const LADA_BUFFER  = fs.existsSync(LADA_PATH)  ? fs.readFileSync(LADA_PATH)  : null;

const qrBufferCache = new Map();

async function getQrBuffer(publicToken, width = 72) {
  const safeToken = String(publicToken || '').trim();
  if (!safeToken) return null;

  const cacheKey = `${safeToken}__${width}`;
  if (qrBufferCache.has(cacheKey)) {
    return qrBufferCache.get(cacheKey);
  }

  const qrUrl = `${COMPANY.BASE_URL}/cotizacion/${safeToken}`;
  const qrBuf = await QRCode.toBuffer(qrUrl, {
    width,
    margin: 1,
    type: 'png',
    color: { dark: COMPANY.navy, light: '#ffffff' },
  });

  qrBufferCache.set(cacheKey, qrBuf);

  if (qrBufferCache.size > 250) {
    const firstKey = qrBufferCache.keys().next().value;
    qrBufferCache.delete(firstKey);
  }

  return qrBuf;
}

function fmtCur(n, cur = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur || 'MXN' }).format(Number(n) || 0);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* ════════════════════════════════════════
   PDF
════════════════════════════════════════ */
async function generateQuotePDF(quote) {
  // Resuelve el QR ANTES de arrancar el build síncrono del PDF
  const [qrBuf] = await Promise.all([
    getQrBuffer(quote.public_token, 72),
  ]);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: { Title: `Cotización ${quote.folio || ''}`, Author: COMPANY.name },
      });
      const bufs = [];
      doc.on('data', c => bufs.push(c));
      doc.on('end',  () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      const W    = doc.page.width;
      const H    = doc.page.height;
      const PL   = 28, PR = 28;
      const CW   = W - PL - PR;
      const navy = COMPANY.navy;
      const teal = COMPANY.teal;

      const client = quote.client || quote.client_snapshot || {};
      const items  = quote.items  || [];

      const colW = CW / 2 - 10;
      const recX = PL + colW + 20;

      const FIXED_SIG_TOP    = H - 174;
      const FIXED_FOOTER_TOP = H - 96;
      const BODY_BOTTOM      = FIXED_SIG_TOP - 10;
      function drawStaticPageFrame() {
        let yy = 24;

        if (LOGO_BUFFER) {
          doc.image(LOGO_BUFFER, PL, yy, { width: 56, height: 56 });
        }

        doc.font('Helvetica-Bold').fontSize(13).fillColor(navy)
           .text(COMPANY.name, PL + 64, yy + 4);
        doc.font('Helvetica').fontSize(7).fillColor('#475569')
           .text(COMPANY.full,    PL + 64, yy + 20)
           .text(COMPANY.address, PL + 64, yy + 30, { width: 180 });

        const folioBoxX = W - PR - 90;
        doc.rect(folioBoxX, yy, 90, 14).fill(navy);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
           .text('FOLIO', folioBoxX, yy + 3, { width: 90, align: 'center' });
        doc.rect(folioBoxX, yy + 14, 90, 24).fill('#f8fafc')
           .strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(11).fillColor(navy)
           .text(quote.folio || '0000000', folioBoxX, yy + 19, { width: 90, align: 'center' });

        yy += 54;
        doc.rect(PL, yy, CW, 1).fill(navy);
        yy += 8;

        doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a')
           .text('COTIZACIÓN', PL, yy, { width: CW, align: 'center' });
        yy += 18;

        const bw = 90, bh = 32, bGap = 10;
        const totalBoxW = bw + bGap + bw + 10;
        const boxStartX = (W - totalBoxW) / 2;

        doc.rect(boxStartX, yy, bw, 14).fill(navy);
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
           .text('FECHA', boxStartX, yy + 3, { width: bw, align: 'center' });
        doc.rect(boxStartX, yy + 14, bw, bh - 14).fill('#f8fafc');
        doc.rect(boxStartX, yy + 14, bw, bh - 14).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
           .text(fmtDate(quote.created_at), boxStartX, yy + 18, { width: bw, align: 'center' });

        const vhX = boxStartX + bw + bGap;
        doc.rect(vhX, yy, bw + 10, 14).fill(navy);
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
           .text('VÁLIDA HASTA', vhX, yy + 3, { width: bw + 10, align: 'center' });
        doc.rect(vhX, yy + 14, bw + 10, bh - 14).fill('#f8fafc');
        doc.rect(vhX, yy + 14, bw + 10, bh - 14).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
           .text(fmtDate(quote.valid_until), vhX, yy + 18, { width: bw + 10, align: 'center' });

        yy += bh + 12;
        doc.rect(PL, yy, CW, 0.5).fill('#e2e8f0');
        yy += 12;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(teal)
           .text('EMISOR', PL, yy)
           .text('RECEPTOR', PL + colW + 20, yy);
        yy += 11;
        doc.rect(PL, yy, colW, 0.6).fill(teal);
        doc.rect(PL + colW + 20, yy, colW, 0.6).fill(teal);
        yy += 7;

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(COMPANY.name, PL, yy);
        doc.font('Helvetica').fontSize(8).fillColor('#475569')
           .text(COMPANY.full,    PL, yy + 13)
           .text(COMPANY.address, PL, yy + 23, { width: colW })
           .text(`Tel: ${COMPANY.phone}`, PL, yy + 41);

        if (client.name) {
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(client.name, recX, yy);
          let cy = yy + 13;
          [
            client.company ? `Empresa: ${client.company}` : null,
            client.rfc     ? `RFC: ${client.rfc}`         : null,
            client.address ? client.address               : null,
            client.phone   ? `Tel: ${client.phone}`       : null,
            client.email   ? client.email                 : null,
          ].filter(Boolean).forEach(l => {
            doc.font('Helvetica').fontSize(8).fillColor('#475569').text(l, recX, cy, { width: colW });
            cy += 12;
          });
        } else {
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#94a3b8').text('DATOS DEL CLIENTE', recX, yy);
        }

        const sigY = FIXED_SIG_TOP;
        const sw = CW / 2 - 24;
        const lineLen = 100;

        const sig1CenterX = PL + sw / 2 + PL / 2;
        doc.rect(sig1CenterX - lineLen / 2, sigY + 28, lineLen, 0.7).fill('#94a3b8');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a')
           .text(COMPANY.name, PL, sigY + 33, { width: sw + PL, align: 'center' });

        if (quote.signer_name && quote.signer_name.trim()) {
          doc.font('Helvetica-Bold').fontSize(8).fillColor(navy)
             .text(quote.signer_name, PL, sigY + 44, { width: sw + PL, align: 'center' });
          let signerY = sigY + 55;
          if (quote.signer_title && quote.signer_title.trim()) {
            doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
               .text(quote.signer_title, PL, signerY, { width: sw + PL, align: 'center' });
            signerY += 11;
          }
          if (quote.signer_phone && quote.signer_phone.trim()) {
            doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
               .text(`Tel. ${quote.signer_phone}`, PL, signerY, { width: sw + PL, align: 'center' });
          }
        } else {
          doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
             .text('Autorizado por', PL, sigY + 44, { width: sw + PL, align: 'center' });
        }

        const sigRX = PL + colW + 20;
        const sig2CenterX = sigRX + colW / 2;
        doc.rect(sig2CenterX - lineLen / 2, sigY + 28, lineLen, 0.7).fill('#94a3b8');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a')
           .text(client.name || 'Cliente', sigRX, sigY + 33, { width: colW, align: 'center' });
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
           .text('Aceptado por', sigRX, sigY + 44, { width: colW, align: 'center' });

        const footerY = FIXED_FOOTER_TOP;
        const qrSize = 60;

        if (qrBuf) {
          doc.image(qrBuf, PL, footerY, { width: qrSize, height: qrSize });
        }

        const icX   = PL + qrSize + 14;
        const icY   = footerY + 2;
        const icR   = 8;
        const lineH = 19;

        [
          { label: COMPANY.phone,   type: 'phone'    },
          { label: COMPANY.address, type: 'location' },
          { label: COMPANY.web,     type: 'web'      },
        ].forEach(({ label, type }, i) => {
          const ly = icY + i * lineH;
          const cx = icX + icR;
          const cy = ly + icR;

          doc.circle(cx, cy, icR).fill(teal);

          if (type === 'phone') {
            doc.circle(cx, cy, icR).fill(teal);
            doc.moveTo(cx - 3, cy + 3).quadraticCurveTo(cx - 4, cy - 1, cx - 1, cy - 3)
               .quadraticCurveTo(cx + 2, cy - 5, cx + 3, cy - 3).lineWidth(1.4).strokeColor('#ffffff').stroke();
            doc.moveTo(cx - 3, cy + 3).lineTo(cx - 1.5, cy + 1.5).lineWidth(1.4).strokeColor('#ffffff').stroke();
            doc.moveTo(cx + 3, cy - 3).lineTo(cx + 1.5, cy - 1.5).lineWidth(1.4).strokeColor('#ffffff').stroke();
          } else if (type === 'location') {
            doc.circle(cx, cy - 1.5, 2.8).fillAndStroke(teal, '#ffffff');
            doc.moveTo(cx - 2, cy + 0.5).quadraticCurveTo(cx, cy + 5, cx, cy + 5)
               .quadraticCurveTo(cx, cy + 5, cx + 2, cy + 0.5).lineWidth(1.2).strokeColor('#ffffff').stroke();
          } else {
            doc.circle(cx, cy, 4).lineWidth(1.1).strokeColor('#ffffff').stroke();
            doc.moveTo(cx - 4, cy).lineTo(cx + 4, cy).stroke();
            doc.moveTo(cx, cy - 4).lineTo(cx, cy + 4).stroke();
            doc.ellipse(cx, cy, 2, 4).stroke();
          }

          doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
             .text(label, icX + icR * 2 + 5, ly + icR - 4, {
               width: CW - qrSize - icR * 2 - 20,
             });
        });

        const logosY = footerY + qrSize - 2;
        if (LOGOS_BUFFER) {
          doc.image(LOGOS_BUFFER, PL, logosY, { height: 24, fit: [145, 24] });
        }
        if (LADA_BUFFER) {
          doc.image(LADA_BUFFER, W - PR - 150, logosY, { height: 24, fit: [150, 24] });
        }

        yy += 58;
        doc.rect(PL, yy, CW, 0.5).fill('#e2e8f0');
        yy += 12;

        return yy;
      }

      let y = drawStaticPageFrame();

      function ensurePageSpace(spaceNeeded = 24) {
        if (y + spaceNeeded > BODY_BOTTOM) {
          doc.addPage();
          y = drawStaticPageFrame();
        }
      }

      /* ══ A QUIEN CORRESPONDA ══ */
      doc.font('Helvetica-Bold').fontSize(10).fillColor(navy).text('A QUIEN CORRESPONDA', PL, y);
      y += 14;

      const introText = quote.intro_text && quote.intro_text.trim()
        ? quote.intro_text
        : `Por este conducto me permito presentarle la cotización de ${quote.title || 'nuestros servicios'}${client.name ? ` para ${client.name}` : ''}.`;
      doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(introText, PL, y, { width: CW });
      y += doc.heightOfString(introText, { width: CW }) + 8;

      doc.rect(PL, y, CW, 0.5).fill('#e2e8f0');
      y += 10;
      /* ══ TÍTULO ══ */
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a')
         .text((quote.title || 'Cotización').toUpperCase(), PL, y);
      y += 14;

      /* ══ TABLA ══ */
      const COLS  = [0.34, 0.12, 0.10, 0.14, 0.10, 0.20].map(p => Math.floor(p * CW));
      const HEADS = ['CONCEPTO', 'UNIDAD', 'CANT.', 'P. UNIT.', 'DESC. %', 'TOTAL'];
      const RH    = 16;
      const TW    = COLS.reduce((a, b) => a + b, 0);
      doc.rect(PL, y, TW, RH).fill(navy);
      let xp = PL;
      HEADS.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
           .text(h, xp + 4, y + 5, { width: COLS[i] - 8, align: i > 0 ? 'right' : 'left' });
        xp += COLS[i];
      });
      const tableTop = y;
      y += RH;

items.forEach((it, idx) => {
        // Calcula la altura real que necesita el texto de descripción
        const descH = doc.font('Helvetica-Bold').fontSize(8)
          .heightOfString(it.description || '', { width: COLS[0] - 8 });
        const rowH = Math.max(RH, descH + 6);
        if (y + rowH > BODY_BOTTOM) {
          doc.addPage();
          y = drawStaticPageFrame();

          doc.rect(PL, y, TW, RH).fill(navy);
          xp = PL;
          HEADS.forEach((h, i) => {
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
               .text(h, xp + 4, y + 5, { width: COLS[i] - 8, align: i > 0 ? 'right' : 'left' });
            xp += COLS[i];
          });
          y += RH;
        }
        doc.rect(PL, y, TW, rowH).fill(idx % 2 === 0 ? '#f8fafc' : '#ffffff');
        doc.rect(PL, y + rowH - 0.4, TW, 0.4).fill('#e2e8f0');
        xp = PL;
        [
          it.description || '',
          it.unit || 'pieza',
          Number(it.quantity || 0).toFixed(2),
          fmtCur(it.unit_price, quote.currency),
          Number(it.discount_pct || 0) > 0 ? `${Number(it.discount_pct).toFixed(0)}%` : '—',
          fmtCur(it.amount, quote.currency),
        ].forEach((c, i) => {
          // Descripción: permite saltos de línea y se centra verticalmente
          // Resto de columnas: una sola línea, centradas verticalmente
          const textY = i === 0 ? y + 5 : y + (rowH - 8) / 2;
          doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
             .fillColor(i === 0 ? '#0f172a' : '#475569')
             .text(String(c), xp + 4, textY,
               { width: COLS[i] - 8, align: i > 0 ? 'right' : 'left', lineBreak: i === 0 });
          xp += COLS[i];
        });
        y += rowH;
      });

      doc.rect(PL, tableTop, TW, y - tableTop).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
      y += 10;

      /* ══ CHECKLIST ══ */
      if (quote.service_checklist && quote.service_checklist.trim()) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(navy).text('Servicio consiste en:', PL, y);
        y += 13;
        quote.service_checklist.split('\n').filter(l => l.trim()).forEach(line => {
          doc.circle(PL + 5, y + 4.5, 3.5).fill(teal);
          doc.moveTo(PL + 3.5, y + 4.5).lineTo(PL + 5, y + 6.2).lineTo(PL + 7, y + 3.2)
             .lineWidth(1.2).strokeColor('#ffffff').stroke();
          doc.font('Helvetica').fontSize(8.5).fillColor('#475569')
             .text(line.trim(), PL + 14, y, { width: CW - 14 });
          y += 13;
        });
        y += 6;
      }

      /* ══ ADVERTENCIAS DE PRECIO ══ */
      if (quote.price_notes && quote.price_notes.trim()) {
        quote.price_notes.split('\n').filter(l => l.trim()).forEach(line => {
          const txt   = `** ${line.trim()}`;
          const noteH = doc.heightOfString(txt, { width: CW - 18 }) + 10;
          doc.rect(PL, y, CW, noteH).fill('#fffbeb');
          doc.rect(PL, y, 3, noteH).fill('#f59e0b');
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#92400e')
             .text(txt, PL + 10, y + 5, { width: CW - 16 });
          y += noteH + 4;
        });
        y += 4;
      }

      /* ══ TOTALES ══ */
      const totW = 200;
      const totX = PL + CW - totW;
      const totRows = [
        ['Sub-total:', fmtCur(quote.subtotal, quote.currency)],
        ...(Number(quote.discount_amount) > 0
          ? [['Descuento:', `−${fmtCur(quote.discount_amount, quote.currency)}`]]
          : []),
        [`IVA (${quote.tax_rate || 0}%):`, fmtCur(quote.tax_amount, quote.currency)],
      ];
      totRows.forEach(([lbl, val]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(lbl, totX, y);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
           .text(val, totX, y, { width: totW, align: 'right' });
        doc.rect(totX, y + 13, totW, 0.3).fill('#f1f5f9');
        y += 16;
      });
      y += 3;
      doc.rect(totX, y, totW, 22).fill(navy);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text('TOTAL:', totX + 6, y + 7);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff')
         .text(fmtCur(quote.total, quote.currency), totX, y + 6, { width: totW - 6, align: 'right' });
      y += 24;

      /* ══ TÉRMINOS / NOTAS ══ */
      if (quote.terms || quote.notes) {
        doc.rect(PL, y, CW, 0.5).fill('#e2e8f0'); y += 8;
        if (quote.terms) {
          doc.font('Helvetica-Bold').fontSize(7).fillColor(teal).text('TÉRMINOS Y CONDICIONES', PL, y);
          y += 10;
          doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(quote.terms, PL, y, { width: CW });
          y += doc.heightOfString(quote.terms, { width: CW }) + 8;
        }
        if (quote.notes) {
          doc.font('Helvetica-Bold').fontSize(7).fillColor(teal).text('NOTAS', PL, y);
          y += 10;
          doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(quote.notes, PL, y, { width: CW });
          y += doc.heightOfString(quote.notes, { width: CW }) + 8;
        }
      }

      /* ══ CIERRE FORMAL ══ */
      const closingText = (quote.closing_text && quote.closing_text.trim())
        ? quote.closing_text
        : 'Sin más por el momento y en espera de poder servirles, quedamos a sus órdenes.';

      const closingNeeded =
        doc.heightOfString(closingText, { width: CW }) + 16;

      ensurePageSpace(closingNeeded);

      doc.font('Helvetica').fontSize(8.5).fillColor('#475569')
         .text(closingText, PL, y, { width: CW });
      y += doc.heightOfString(closingText, { width: CW }) + 4;

      ensurePageSpace(12);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(navy)
         .text('ATENTAMENTE.', PL, y);
      y += 20;

      doc.end();
    } catch (e) {
      console.error('❌ PDF GENERATION ERROR:', e.message, e.stack);
      reject(e);
    }
  });
}

/* ════════════════════════════════════════
   EXCEL
════════════════════════════════════════ */
async function generateQuoteExcel(quote) {
  // Resuelve el QR ANTES de construir el workbook
  const qrBuf = await getQrBuffer(quote.public_token, 80);

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.created = new Date();

  const ws = wb.addWorksheet('Cotización', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: false }],
  });

  ws.columns = [
    { width: 8  }, { width: 28 }, { width: 11 },
    { width: 9  }, { width: 13 }, { width: 9  }, { width: 15 },
  ];

  const NAVY  = 'FF1A3C5E';
  const TEAL  = 'FF0EA5A0';
  const WHITE = 'FFFFFFFF';
  const GRAY  = 'FF475569';
  const LGRAY = 'FF94A3B8';
  const LIGHT = 'FFF8FAFC';
  const DARK  = 'FF0F172A';
  const SEPAR = 'FFE2E8F0';
  const BGSEP = 'FFF1F5F9';
  const WARN  = 'FFFFFBEB';
  const WARNB = 'FFF59E0B';

  const client = quote.client || quote.client_snapshot || {};
  const items  = quote.items  || [];

  function gc(r, col) { return ws.getCell(`${col}${r}`); }
  function merge(r, a, b) { ws.mergeCells(`${a}${r}:${b}${r}`); }
  function fill(cell, argb) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }
  function bottomBorder(cell, color = SEPAR) {
    cell.border = { bottom: { style: 'thin', color: { argb: color } } };
  }
  function textRow(r, txt, bold, argb, height = 14) {
    ws.getRow(r).height = height;
    merge(r, 'A', 'G');
    gc(r, 'A').value = txt;
    gc(r, 'A').font  = { bold: !!bold, size: 9, color: { argb: argb || DARK } };
    gc(r, 'A').alignment = { wrapText: true, vertical: 'top' };
  }

  let row = 1;

  /* ── Logo ── */
  if (LOGO_BUFFER) {
    const logoId = wb.addImage({ buffer: LOGO_BUFFER, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, br: { col: 1.0, row: 3.8 }, editAs: 'oneCell' });
  }

  /* ── Header ── */
  ws.getRow(1).height = 8;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 13;
  ws.getRow(4).height = 13;

  merge(2, 'B', 'D');
  gc(2, 'B').value = COMPANY.name;
  gc(2, 'B').font  = { bold: true, size: 13, color: { argb: NAVY } };
  gc(2, 'B').alignment = { vertical: 'middle' };

  merge(3, 'B', 'D');
  gc(3, 'B').value = COMPANY.full;
  gc(3, 'B').font  = { size: 7.5, color: { argb: LGRAY } };

  merge(4, 'B', 'D');
  gc(4, 'B').value = COMPANY.address;
  gc(4, 'B').font  = { size: 7.5, color: { argb: LGRAY } };

  merge(2, 'E', 'F');
  gc(2, 'E').value = 'COTIZACIÓN';
  gc(2, 'E').font  = { bold: true, size: 16, color: { argb: DARK } };
  gc(2, 'E').alignment = { horizontal: 'center', vertical: 'middle' };

  gc(2, 'G').value = 'FOLIO';
  gc(2, 'G').font  = { bold: true, size: 8, color: { argb: WHITE } };
  gc(2, 'G').alignment = { horizontal: 'center', vertical: 'middle' };
  fill(gc(2, 'G'), NAVY);

  ws.getRow(3).height = 20;
  gc(3, 'G').value = quote.folio || '—';
  gc(3, 'G').font  = { bold: true, size: 11, color: { argb: NAVY } };
  gc(3, 'G').alignment = { horizontal: 'center', vertical: 'middle' };
  fill(gc(3, 'G'), 'FFF8FAFC');

  row = 5;

  /* ── Línea navy ── */
  ws.getRow(row).height = 3;
  merge(row, 'A', 'G'); fill(gc(row, 'A'), NAVY); row++;
  ws.getRow(row).height = 6; row++;

  /* ── Fechas ── */
  ws.getRow(row).height = 14;
  merge(row, 'C', 'D');
  gc(row, 'C').value = 'FECHA';
  gc(row, 'C').font  = { bold: true, size: 7.5, color: { argb: WHITE } };
  gc(row, 'C').alignment = { horizontal: 'center', vertical: 'middle' };
  fill(gc(row, 'C'), NAVY);

  merge(row, 'E', 'F');
  gc(row, 'E').value = 'VÁLIDA HASTA';
  gc(row, 'E').font  = { bold: true, size: 7.5, color: { argb: WHITE } };
  gc(row, 'E').alignment = { horizontal: 'center', vertical: 'middle' };
  fill(gc(row, 'E'), NAVY);
  row++;

  ws.getRow(row).height = 16;
  merge(row, 'C', 'D');
  gc(row, 'C').value = fmtDate(quote.created_at);
  gc(row, 'C').font  = { size: 9, color: { argb: DARK } };
  gc(row, 'C').alignment = { horizontal: 'center', vertical: 'middle' };
  fill(gc(row, 'C'), 'FFF8FAFC');

  merge(row, 'E', 'F');
  gc(row, 'E').value = fmtDate(quote.valid_until);
  gc(row, 'E').font  = { size: 9, color: { argb: DARK } };
  gc(row, 'E').alignment = { horizontal: 'center', vertical: 'middle' };
  fill(gc(row, 'E'), 'FFF8FAFC');
  row++;

  ws.getRow(row).height = 6;
  merge(row, 'A', 'G'); fill(gc(row, 'A'), BGSEP); row++;

  /* ── Emisor / Receptor ── */
  ws.getRow(row).height = 13;
  merge(row, 'A', 'C');
  gc(row, 'A').value = 'EMISOR';
  gc(row, 'A').font  = { bold: true, size: 9, color: { argb: TEAL } };
  bottomBorder(gc(row, 'A'), TEAL);

  merge(row, 'E', 'G');
  gc(row, 'E').value = 'RECEPTOR';
  gc(row, 'E').font  = { bold: true, size: 9, color: { argb: TEAL } };
  gc(row, 'E').alignment = { horizontal: 'left' };
  bottomBorder(gc(row, 'E'), TEAL);
  row++;

  ws.getRow(row).height = 15;
  merge(row, 'A', 'C');
  gc(row, 'A').value = COMPANY.name;
  gc(row, 'A').font  = { bold: true, size: 10, color: { argb: DARK } };
  merge(row, 'E', 'G');
  gc(row, 'E').value = client.name || 'DATOS DEL CLIENTE';
  gc(row, 'E').font  = { bold: true, size: 10, color: { argb: client.name ? DARK : LGRAY } };
  row++;

  const emLines  = [COMPANY.full, COMPANY.address, `Tel: ${COMPANY.phone}`];
  const recLines = [
    client.company ? `Empresa: ${client.company}` : null,
    client.rfc     ? `RFC: ${client.rfc}`         : null,
    client.address ? client.address               : null,
    client.phone   ? `Tel: ${client.phone}`       : null,
    client.email   ? client.email                 : null,
  ].filter(Boolean);
  const maxL = Math.max(emLines.length, recLines.length);

  for (let i = 0; i < maxL; i++) {
    ws.getRow(row).height = 12;
    merge(row, 'A', 'C');
    if (emLines[i]) { gc(row, 'A').value = emLines[i]; gc(row, 'A').font = { size: 8, color: { argb: GRAY } }; }
    merge(row, 'E', 'G');
    if (recLines[i]) { gc(row, 'E').value = recLines[i]; gc(row, 'E').font = { size: 8, color: { argb: GRAY } }; }
    row++;
  }

  ws.getRow(row).height = 6; merge(row, 'A', 'G'); fill(gc(row, 'A'), BGSEP); row++;

  /* ── A QUIEN CORRESPONDA ── */
  textRow(row, 'A QUIEN CORRESPONDA', true, NAVY, 14); row++;
  const introText = (quote.intro_text && quote.intro_text.trim())
    ? quote.intro_text
    : `Por este conducto me permito presentarle la cotización de ${quote.title || 'nuestros servicios'}${client.name ? ` para ${client.name}` : ''}.`;
  ws.getRow(row).height = 28;
  merge(row, 'A', 'G');
  gc(row, 'A').value = introText;
  gc(row, 'A').font  = { size: 9, color: { argb: GRAY } };
  gc(row, 'A').alignment = { wrapText: true, vertical: 'top' };
  row++;

  ws.getRow(row).height = 6; merge(row, 'A', 'G'); fill(gc(row, 'A'), BGSEP); row++;

  /* ── Título ── */
  ws.getRow(row).height = 18;
  merge(row, 'A', 'G');
  gc(row, 'A').value = (quote.title || 'Cotización').toUpperCase();
  gc(row, 'A').font  = { bold: true, size: 12, color: { argb: DARK } };
  gc(row, 'A').alignment = { vertical: 'middle' };
  row++;
  ws.getRow(row).height = 5; row++;

  /* ── Tabla header ── */
  ws.getRow(row).height = 20;
  const thr = ws.getRow(row);
  thr.values = ['', 'CONCEPTO', 'UNIDAD', 'CANT.', 'P. UNIT.', 'DESC. %', 'TOTAL'];
  thr.font = { bold: true, size: 8, color: { argb: WHITE } };
  thr.eachCell((cell, cn) => {
    fill(cell, NAVY);
    cell.alignment = { horizontal: cn <= 2 ? 'left' : 'right', vertical: 'middle' };
  });
  row++;

  /* ── Items ── */
items.forEach((it, idx) => {
    // Estima líneas necesarias (columna B tiene width 28 ≈ ~42 chars por línea a tamaño 9)
    const desc = String(it.description || '');
    const charsPerLine = 38;
    const lines = Math.max(1, Math.ceil(desc.length / charsPerLine));
    ws.getRow(row).height = Math.max(18, lines * 14 + 6);

    const r = ws.getRow(row);
    r.values = [idx + 1, desc, it.unit || 'pieza',
      Number(it.quantity || 0), Number(it.unit_price || 0),
      Number(it.discount_pct || 0), Number(it.amount || 0)];
    const bg = idx % 2 === 0 ? LIGHT : WHITE;
    r.eachCell(cell => { fill(cell, bg); cell.border = { bottom: { style: 'thin', color: { argb: SEPAR } } }; });
    r.getCell(1).font = { size: 8, color: { argb: LGRAY } };
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(2).font = { bold: true, size: 9, color: { argb: DARK } };
    r.getCell(2).alignment = { vertical: 'middle', wrapText: true }; // ← wrapText activado
    r.getCell(3).font = { size: 9, color: { argb: GRAY } };
    r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(4).numFmt = '#,##0.00'; r.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(5).numFmt = '"$"#,##0.00'; r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(6).numFmt = '0.00"%"'; r.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(7).numFmt = '"$"#,##0.00'; r.getCell(7).font = { bold: true, size: 9 };
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    row++;
  });
  ws.getRow(row).height = 6; row++;

  /* ── Checklist ── */
  if (quote.service_checklist && quote.service_checklist.trim()) {
    textRow(row, 'Servicio consiste en:', true, NAVY, 13); row++;
    quote.service_checklist.split('\n').filter(l => l.trim()).forEach(line => {
      ws.getRow(row).height = 13;
      merge(row, 'A', 'G');
      gc(row, 'A').value = `✓  ${line.trim()}`;
      gc(row, 'A').font  = { size: 9, color: { argb: GRAY } };
      row++;
    });
    ws.getRow(row).height = 5; row++;
  }

  /* ── Advertencias de precio ── */
  if (quote.price_notes && quote.price_notes.trim()) {
    quote.price_notes.split('\n').filter(l => l.trim()).forEach(line => {
      ws.getRow(row).height = 16;
      merge(row, 'A', 'G');
      const cell = gc(row, 'A');
      cell.value = `** ${line.trim()}`;
      cell.font  = { bold: true, size: 9, color: { argb: 'FF92400E' } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARN } };
      cell.border = { left: { style: 'thick', color: { argb: WARNB } } };
      cell.alignment = { wrapText: true, vertical: 'middle' };
      row++;
    });
    ws.getRow(row).height = 5; row++;
  }

  /* ── Totales ── */
  const totRows = [
    ['Sub-total:', Number(quote.subtotal || 0)],
    ...(Number(quote.discount_amount) > 0 ? [['Descuento:', -Number(quote.discount_amount || 0)]] : []),
    [`IVA (${quote.tax_rate || 0}%):`, Number(quote.tax_amount || 0)],
  ];
  totRows.forEach(([lbl, val]) => {
    ws.getRow(row).height = 15;
    merge(row, 'E', 'F');
    gc(row, 'E').value = lbl; gc(row, 'E').font = { size: 9, color: { argb: LGRAY } };
    gc(row, 'E').alignment = { horizontal: 'right', vertical: 'middle' };
    fill(gc(row, 'E'), LIGHT); bottomBorder(gc(row, 'E'));
    gc(row, 'G').value = val; gc(row, 'G').numFmt = '"$"#,##0.00';
    gc(row, 'G').font = { size: 9, color: { argb: DARK } };
    gc(row, 'G').alignment = { horizontal: 'right', vertical: 'middle' };
    fill(gc(row, 'G'), LIGHT); bottomBorder(gc(row, 'G'));
    row++;
  });

  ws.getRow(row).height = 22;
  merge(row, 'E', 'F');
  gc(row, 'E').value = 'TOTAL:'; gc(row, 'E').font = { bold: true, size: 10, color: { argb: WHITE } };
  gc(row, 'E').alignment = { horizontal: 'right', vertical: 'middle' }; fill(gc(row, 'E'), NAVY);
  gc(row, 'G').value = Number(quote.total || 0); gc(row, 'G').numFmt = '"$"#,##0.00';
  gc(row, 'G').font = { bold: true, size: 13, color: { argb: WHITE } };
  gc(row, 'G').alignment = { horizontal: 'right', vertical: 'middle' }; fill(gc(row, 'G'), NAVY);
  row++;
  ws.getRow(row).height = 8; row++;

  /* ── Términos / Notas ── */
  if (quote.terms) {
    textRow(row, 'TÉRMINOS Y CONDICIONES', true, TEAL, 11); row++;
    ws.getRow(row).height = 28; merge(row, 'A', 'G');
    gc(row, 'A').value = quote.terms;
    gc(row, 'A').font  = { size: 8, color: { argb: GRAY } };
    gc(row, 'A').alignment = { wrapText: true, vertical: 'top' }; row++;
  }
  if (quote.notes) {
    textRow(row, 'NOTAS', true, TEAL, 11); row++;
    ws.getRow(row).height = 24; merge(row, 'A', 'G');
    gc(row, 'A').value = quote.notes;
    gc(row, 'A').font  = { size: 8, color: { argb: GRAY } };
    gc(row, 'A').alignment = { wrapText: true, vertical: 'top' }; row++;
  }

  /* ── Cierre formal ── */
  ws.getRow(row).height = 8; merge(row, 'A', 'G'); fill(gc(row, 'A'), BGSEP); row++;
  const closingText = (quote.closing_text && quote.closing_text.trim())
    ? quote.closing_text
    : 'Sin más por el momento y en espera de poder servirles, quedamos a sus órdenes.';
  ws.getRow(row).height = 24; merge(row, 'A', 'G');
  gc(row, 'A').value = closingText;
  gc(row, 'A').font  = { size: 9, color: { argb: GRAY } };
  gc(row, 'A').alignment = { wrapText: true, vertical: 'top' }; row++;

  ws.getRow(row).height = 13;
  merge(row, 'A', 'G');
  gc(row, 'A').value = 'ATENTAMENTE.';
  gc(row, 'A').font  = { bold: true, size: 10, color: { argb: NAVY } }; row++;

  /* ── Firmas ── */
  ws.getRow(row).height = 8; merge(row, 'A', 'G'); fill(gc(row, 'A'), BGSEP); row++;
  ws.getRow(row).height = 28; row++;

  ws.getRow(row).height = 12;
  merge(row, 'A', 'C');
  gc(row, 'A').value = COMPANY.name;
  gc(row, 'A').font  = { bold: true, size: 9, color: { argb: DARK } };
  gc(row, 'A').alignment = { horizontal: 'center' };
  gc(row, 'A').border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } } };

  merge(row, 'E', 'G');
  gc(row, 'E').value = client.name || 'Cliente';
  gc(row, 'E').font  = { bold: true, size: 9, color: { argb: DARK } };
  gc(row, 'E').alignment = { horizontal: 'center' };
  gc(row, 'E').border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  row++;

  if (quote.signer_name && quote.signer_name.trim()) {
    ws.getRow(row).height = 11;
    merge(row, 'A', 'C');
    gc(row, 'A').value = quote.signer_name;
    gc(row, 'A').font  = { bold: true, size: 9, color: { argb: NAVY } };
    gc(row, 'A').alignment = { horizontal: 'center' };
    row++;
    if (quote.signer_title) {
      ws.getRow(row).height = 11;
      merge(row, 'A', 'C');
      gc(row, 'A').value = quote.signer_title;
      gc(row, 'A').font  = { size: 8, color: { argb: GRAY } };
      gc(row, 'A').alignment = { horizontal: 'center' }; row++;
    }
    if (quote.signer_phone) {
      ws.getRow(row).height = 11;
      merge(row, 'A', 'C');
      gc(row, 'A').value = `Tel. ${quote.signer_phone}`;
      gc(row, 'A').font  = { size: 8, color: { argb: GRAY } };
      gc(row, 'A').alignment = { horizontal: 'center' }; row++;
    }
  } else {
    ws.getRow(row).height = 11;
    merge(row, 'A', 'C');
    gc(row, 'A').value = 'Autorizado por';
    gc(row, 'A').font  = { size: 7.5, color: { argb: LGRAY } };
    gc(row, 'A').alignment = { horizontal: 'center' };
    merge(row, 'E', 'G');
    gc(row, 'E').value = 'Aceptado por';
    gc(row, 'E').font  = { size: 7.5, color: { argb: LGRAY } };
    gc(row, 'E').alignment = { horizontal: 'center' }; row++;
  }

  ws.getRow(row).height = 8; merge(row, 'A', 'G'); fill(gc(row, 'A'), BGSEP); row++;

/* ── Footer: QR + contacto ── */
  const qrStartRow = row - 1;

  if (qrBuf) {
    const qrId = wb.addImage({ buffer: qrBuf, extension: 'png' });
    ws.addImage(qrId, { tl: { col: 0.1, row: qrStartRow }, br: { col: 1.0, row: qrStartRow + 5 }, editAs: 'oneCell' });
  }

  [`Tel: ${COMPANY.phone}`, COMPANY.address, COMPANY.web,
   'Escanea el QR para ver la cotización en línea'].forEach(txt => {
    ws.getRow(row).height = 13;
    merge(row, 'B', 'G');
    gc(row, 'B').value = txt;
    gc(row, 'B').font  = {
      size: txt.startsWith('Escanea') ? 8 : 9,
      italic: txt.startsWith('Escanea'),
      color: { argb: txt.startsWith('Escanea') ? LGRAY : DARK },
    };
    row++;
  });

  /* ── Logos inferiores ── */
  ws.getRow(row).height = 6; row++;

  if (LOGOS_BUFFER) {
    const logosId = wb.addImage({ buffer: LOGOS_BUFFER, extension: 'png' });
    ws.addImage(logosId, {
      tl: { col: 0.1, row: row - 1 },
      br: { col: 3.0, row: row + 3 },
      editAs: 'oneCell',
    });
  }

  if (LADA_BUFFER) {
    const ladaId = wb.addImage({ buffer: LADA_BUFFER, extension: 'png' });
    ws.addImage(ladaId, {
      tl: { col: 4.0, row: row - 1 },
      br: { col: 7.0, row: row + 3 },
      editAs: 'oneCell',
    });
  }

  ws.getRow(row).height = 35; row++;
  ws.getRow(row).height = 35; row++;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ════════════════════════════════════════
   XML
════════════════════════════════════════ */
function generateQuoteXML(quote) {
  const client = quote.client || quote.client_snapshot || {};
  const items  = quote.items  || [];
  const now    = new Date().toISOString();

  const conceptos = items.map(it => `
    <Concepto
      Descripcion="${escXml(it.description || '')}"
      Unidad="${escXml(it.unit || 'pieza')}"
      Cantidad="${Number(it.quantity || 0).toFixed(2)}"
      ValorUnitario="${Number(it.unit_price || 0).toFixed(2)}"
      Descuento="${Number(it.discount_pct || 0).toFixed(2)}"
      Importe="${Number(it.amount || 0).toFixed(2)}" />`).join('');

  const checklist = (quote.service_checklist || '').split('\n')
    .filter(l => l.trim())
    .map(l => `    <Item>${escXml(l.trim())}</Item>`)
    .join('\n');

  const priceNotes = (quote.price_notes || '').split('\n')
    .filter(l => l.trim())
    .map(l => `    <Advertencia>${escXml(l.trim())}</Advertencia>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Cotizacion
  xmlns:cot="http://ecovisa.com/cotizacion/1.0"
  Version="1.0"
  Folio="${escXml(quote.folio || '')}"
  Fecha="${quote.created_at ? new Date(quote.created_at).toISOString() : now}"
  Estado="${escXml(quote.status || 'pending')}"
  SubTotal="${Number(quote.subtotal || 0).toFixed(2)}"
  Descuento="${Number(quote.discount_amount || 0).toFixed(2)}"
  TasaIVA="${Number(quote.tax_rate || 0).toFixed(2)}"
  IVA="${Number(quote.tax_amount || 0).toFixed(2)}"
  Total="${Number(quote.total || 0).toFixed(2)}"
  Moneda="${escXml(quote.currency || 'MXN')}"
  GeneradoEn="${now}"
>
  <Emisor
    Nombre="${escXml(COMPANY.name)}"
    RazonSocial="${escXml(COMPANY.full)}"
    Domicilio="${escXml(COMPANY.address)}"
    Telefono="${escXml(COMPANY.phone)}"
    Web="${escXml(COMPANY.web)}"
  />
  <Receptor
    Nombre="${escXml(client.name || '')}"
    RFC="${escXml(client.rfc || '')}"
    Empresa="${escXml(client.company || '')}"
    Domicilio="${escXml(client.address || '')}"
    Telefono="${escXml(client.phone || '')}"
    Email="${escXml(client.email || '')}"
  />
  <Titulo>${escXml(quote.title || '')}</Titulo>
  <ValidaHasta>${quote.valid_until || ''}</ValidaHasta>

  <Introduccion>
    <Saludo>A QUIEN CORRESPONDA</Saludo>
    <Parrafo>${escXml(
      quote.intro_text && quote.intro_text.trim()
        ? quote.intro_text
        : `Por este conducto me permito presentarle la cotización de ${quote.title || 'nuestros servicios'}${client.name ? ` para ${client.name}` : ''}.`
    )}</Parrafo>
  </Introduccion>

  <Conceptos>${conceptos}
  </Conceptos>

  <Impuestos TotalImpuestosTrasladados="${Number(quote.tax_amount || 0).toFixed(2)}" />

  ${checklist ? `<ChecklistServicios>\n${checklist}\n  </ChecklistServicios>` : ''}

  ${priceNotes ? `<AdvertenciasPrecio>\n${priceNotes}\n  </AdvertenciasPrecio>` : ''}

  ${quote.terms ? `<Terminos>${escXml(quote.terms)}</Terminos>` : ''}
  ${quote.notes ? `<Notas>${escXml(quote.notes)}</Notas>` : ''}

  <Cierre>
    <Texto>${escXml(
      quote.closing_text && quote.closing_text.trim()
        ? quote.closing_text
        : 'Sin más por el momento y en espera de poder servirles, quedamos a sus órdenes.'
    )}</Texto>
    <Firma>ATENTAMENTE.</Firma>
  </Cierre>

  <Firmante
    Nombre="${escXml(quote.signer_name || '')}"
    Cargo="${escXml(quote.signer_title || '')}"
    Telefono="${escXml(quote.signer_phone || '')}"
  />

  ${quote.approved_at ? `<Aprobacion Fecha="${new Date(quote.approved_at).toISOString()}" />` : ''}
  <VisualizarEn>${escXml(`${COMPANY.BASE_URL}/cotizacion/${quote.public_token || ''}`)}</VisualizarEn>
  <TokenPublico>${escXml(quote.public_token || '')}</TokenPublico>
</Cotizacion>`;
}

module.exports = { generateQuotePDF, generateQuoteExcel, generateQuoteXML };