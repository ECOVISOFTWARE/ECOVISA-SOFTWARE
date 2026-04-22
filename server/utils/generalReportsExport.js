const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const COMPANY = {
  name: "ECOVISA",
  full: "Ecología, Vida y Salud, S.A. de C.V.",
  address: "Blvd. Jesús García Morales No. 834, Col. La manga, Hermosillo, Sonora",
  phone: "668 8197879",
  web: "www.ecovisa.com",
  navy: "#1a3c5e",
  teal: "#0ea5a0",
};

const LOGO_PATH = path.join(__dirname, "../../web/public/assets/ECOVISA_ICON.png");
const LOGOS_PATH = path.join(__dirname, "../../web/public/assets/LOGOS.png");
const LADA_PATH = path.join(__dirname, "../../web/public/assets/lada.png");

const LOGO_BUFFER = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
const LOGOS_BUFFER = fs.existsSync(LOGOS_PATH) ? fs.readFileSync(LOGOS_PATH) : null;
const LADA_BUFFER = fs.existsSync(LADA_PATH) ? fs.readFileSync(LADA_PATH) : null;

function money(value) {
  return Number(value || 0);
}

function fmtCur(value, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function escXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildBodyRows(report) {
  const quotesCount = Number(report?.quotes?.count || 0);
  const quotesAmount = Number(report?.quotes?.total_amount || 0);
  const invoicesCount = Number(report?.invoices?.count || 0);
  const invoicesAmount = Number(report?.invoices?.total_amount || 0);
  const productsCount = Number(report?.inventory?.products_count || 0);
  const movementsCount = Number(report?.inventory?.movements_count || 0);
  const operationsCount = Number(report?.operations?.count || 0);
  const operationsCompleted = Number(report?.operations?.completed_count || 0);
  const operationsIncidents = Number(report?.operations?.incident_count || 0);

  return [
    {
      module: "INVENTARIO",
      indicator: "Productos activos",
      quantity: productsCount,
      amount: null,
      detail: "Total de productos registrados actualmente.",
    },
    {
      module: "",
      indicator: "Movimientos del período",
      quantity: movementsCount,
      amount: null,
      detail: "Entradas y salidas registradas en el rango consultado.",
    },
    {
      module: "COTIZACIONES",
      indicator: "Total cotizaciones",
      quantity: quotesCount,
      amount: quotesAmount,
      detail: "Monto total cotizado en el período.",
    },
    {
      module: "FACTURACIÓN",
      indicator: "Total facturas",
      quantity: invoicesCount,
      amount: invoicesAmount,
      detail: "Monto total facturado en el período.",
    },
    {
      module: "OPERACIONES",
      indicator: "Operaciones registradas",
      quantity: operationsCount,
      amount: null,
      detail: "Total operativo registrado en el rango.",
    },
    {
      module: "",
      indicator: "Operaciones completadas",
      quantity: operationsCompleted,
      amount: null,
      detail: "Operaciones concluidas sin incidencia.",
    },
    {
      module: "",
      indicator: "Operaciones con incidencia",
      quantity: operationsIncidents,
      amount: null,
      detail: "Operaciones marcadas con incidencia.",
    },
  ];
}
function buildMeta(report) {
  return {
    periodLabel: report?.periodLabel || "General",
    dateFrom: report?.dateFrom || report?.filters?.date_from || report?.filters?.dateFrom || "",
    dateTo: report?.dateTo || report?.filters?.date_to || report?.filters?.dateTo || "",
    generatedAt: new Date(),
  };
}

const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const ENTERPRISE_CHART_SIZE = 260;
const ENTERPRISE_CHART_CANVAS = new ChartJSNodeCanvas({
  width: ENTERPRISE_CHART_SIZE,
  height: ENTERPRISE_CHART_SIZE,
  backgroundColour: "transparent",
});

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeText(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function groupRowsForModule(moduleKey, rows = []) {
  const map = new Map();

  rows.forEach((row) => {
    let groupKey = "General";
    let groupLabel = "General";

    if (moduleKey === "inventory") {
      const actorMeta = (row.meta || []).find((m) => m.label === "Actor");
      groupKey = actorMeta?.value || "Sin actor";
      groupLabel = `Responsable: ${actorMeta?.value || "Sin actor"}`;
    } else if (moduleKey === "quotes" || moduleKey === "invoices") {
      groupKey = safeText(row.subtitle, "Sin cliente");
      groupLabel = `Cliente / referencia: ${safeText(row.subtitle, "Sin cliente")}`;
    } else if (moduleKey === "operations") {
      const date = row.created_at ? new Date(row.created_at) : null;
      const dayKey = date && !Number.isNaN(date.getTime())
        ? date.toISOString().slice(0, 10)
        : "Sin fecha";
      groupKey = dayKey;
      groupLabel = `Día: ${date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
        : "Sin fecha"}`;
    }

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        label: groupLabel,
        rows: [],
      });
    }

    map.get(groupKey).rows.push(row);
  });

  return [...map.values()];
}

function getEnterpriseChartPalette() {
  return [
    "#0F4C81",
    "#16A5A0",
    "#22C55E",
    "#F59E0B",
    "#7C3AED",
    "#EF4444",
  ];
}

function buildEnterpriseLegend(rows = []) {
  const palette = getEnterpriseChartPalette();

  return rows.slice(0, 6).map((row, idx) => ({
    label: safeText(row.title, "Registro"),
    color: palette[idx % palette.length],
    value: Number(row.amount || 0),
  }));
}

async function renderEnterpriseChart(rows = []) {
  const labels = rows.slice(0, 6).map((r) => safeText(r.title, "Registro"));
  const values = rows.slice(0, 6).map((r) => Number(r.amount || 0));
  const palette = getEnterpriseChartPalette();

  const configuration = {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values.every((v) => v === 0) ? labels.map(() => 1) : values,
          backgroundColor: palette,
          borderWidth: 0,
          hoverOffset: 0,
          radius: "90%",
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      cutout: "60%",
      devicePixelRatio: 2,
      layout: {
        padding: 0,
      },
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: false,
        },
        tooltip: {
          enabled: false,
        },
      },
    },
  };

  return ENTERPRISE_CHART_CANVAS.renderToBuffer(configuration);
}
function drawEnterpriseFrame(doc, report, pageTitle, sectionLabel) {
  const W = doc.page.width;
  const H = doc.page.height;
  const PL = 28;
  const PR = 28;
  const CW = W - PL - PR;

  const topY = 24;

  if (LOGO_BUFFER) {
    doc.image(LOGO_BUFFER, PL, topY, { width: 56, height: 56 });
  }

  doc.font("Helvetica-Bold").fontSize(13).fillColor(COMPANY.navy)
    .text(COMPANY.name, PL + 64, topY + 3);

  doc.font("Helvetica").fontSize(7).fillColor("#64748b")
    .text(COMPANY.full, PL + 64, topY + 19)
    .text(COMPANY.address, PL + 64, topY + 29, { width: 220 });

  const folioBoxX = W - PR - 160;

  doc.rect(folioBoxX, topY, 160, 13).fill(COMPANY.teal);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
    .text("FOLIO", folioBoxX, topY + 3, { width: 160, align: "center" });

  doc.rect(folioBoxX, topY + 13, 160, 28).fill("#f8fafc");
  doc.rect(folioBoxX, topY + 13, 160, 28).lineWidth(0.6).strokeColor("#dbe4ee").stroke();

  doc.font("Helvetica-Bold").fontSize(10).fillColor(COMPANY.teal)
    .text(String(report?.folio || "SIN-FOLIO"), folioBoxX + 8, topY + 21, {
      width: 144,
      align: "center",
    });

  doc.rect(PL, 88, CW, 1).fill("#17324D");

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a")
    .text(pageTitle, PL, 101, { width: CW, align: "center" });

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0ea5a0")
    .text(sectionLabel, PL, 126, { width: CW, align: "left" });

  doc.roundedRect(PL, 146, CW, 34, 10).fill("#f8fbff");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b")
    .text("PERÍODO", PL + 14, 156);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a")
    .text(report?.periodLabel || "General", PL + 14, 166);

  return {
    contentTop: 194,
    footerTop: H - 72,
    pageWidth: W,
    pageHeight: H,
    left: PL,
    right: PR,
    contentWidth: CW,
  };
}

function drawEnterpriseFooter(doc, frame) {
  const footerY = frame.footerTop;
  const PL = frame.left;
  const W = doc.page.width;
  const PR = frame.right;

  doc.rect(PL, footerY - 8, frame.contentWidth, 0.5).fill("#dbe4ee");

  if (LOGOS_BUFFER) {
    doc.image(LOGOS_BUFFER, PL, footerY + 2, { height: 22, fit: [145, 22] });
  }

  if (LADA_BUFFER) {
    doc.image(LADA_BUFFER, W - PR - 148, footerY + 2, { height: 22, fit: [148, 22] });
  }

  doc.font("Helvetica").fontSize(7).fillColor("#64748b")
    .text(`Tel: ${COMPANY.phone}`, PL, footerY + 30)
    .text(COMPANY.web, PL + 106, footerY + 30)
    .text(COMPANY.address, PL + 210, footerY + 30, { width: 255 });
}

async function drawModuleDetailPage(doc, report, moduleKey, title, rows, sectionIndex = 1) {
  doc.addPage();

  const frame = drawEnterpriseFrame(
    doc,
    report,
    "REPORTES GENERALES",
    `${title} - Sección #${sectionIndex}`
  );

  const grouped = groupRowsForModule(moduleKey, rows);
  const leftX = frame.left;
  const fullW = frame.contentWidth;
  let y = frame.contentTop;

  const sectionTitleY = y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a")
    .text("DETALLE OPERATIVO", leftX, sectionTitleY);

  y += 18;

  const tableX = leftX;
  const tableW = fullW;
  const col1 = 170;
  const col2 = 260;
  const col3 = tableW - col1 - col2;

  doc.rect(tableX, y, tableW, 16).fill("#17324D");
  doc.font("Helvetica-Bold").fontSize(7.4).fillColor("#ffffff")
    .text("TÍTULO", tableX + 8, y + 5, { width: col1 - 16 })
    .text("DETALLE", tableX + col1 + 8, y + 5, { width: col2 - 16 })
    .text("FECHA / HORA", tableX + col1 + col2 + 8, y + 5, { width: col3 - 16 });

  y += 16;

  const flatRows = grouped.flatMap((group) => [
    { __group: true, label: group.label },
    ...group.rows,
  ]);

  const visibleRows = flatRows.slice(0, 14);

  visibleRows.forEach((row, idx) => {
    const rowH = row.__group ? 18 : 22;
    const bg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";

    doc.rect(tableX, y, tableW, rowH).fill(bg);
    doc.rect(tableX, y + rowH - 0.5, tableW, 0.5).fill("#e2e8f0");

    if (row.__group) {
      doc.font("Helvetica-Bold").fontSize(7.2).fillColor("#0ea5a0")
        .text(row.label, tableX + 8, y + 5, { width: tableW - 16 });
    } else {
      doc.font("Helvetica-Bold").fontSize(7.6).fillColor("#0f172a")
        .text(safeText(row.title), tableX + 8, y + 6, { width: col1 - 16 });

      doc.font("Helvetica").fontSize(7.2).fillColor("#475569")
        .text(safeText(row.subtitle), tableX + col1 + 8, y + 6, { width: col2 - 16 });

      doc.font("Helvetica").fontSize(7.2).fillColor("#334155")
        .text(fmtDateTime(row.created_at), tableX + col1 + col2 + 8, y + 6, { width: col3 - 16 });
    }

    y += rowH;
  });

  doc.rect(tableX, sectionTitleY + 18, tableW, y - (sectionTitleY + 18))
    .lineWidth(0.6)
    .strokeColor("#dbe4ee")
    .stroke();

  y += 18;

  const stripTitleY = y;
  doc.rect(leftX, stripTitleY, fullW, 16).fill("#17324D");
  doc.font("Helvetica-Bold").fontSize(8.2).fillColor("#ffffff")
    .text("PANORAMA DEL MÓDULO", leftX + 8, stripTitleY + 4, {
      width: fullW - 16,
    });

  y += 24;

  const totalRows = rows.length;
  const totalAmount = rows.reduce((acc, item) => acc + Number(item.amount || 0), 0);

  const metricBoxW = 210;
  const metricGap = 14;
  const metricsX = leftX;
  const chartAreaX = metricsX + metricBoxW + metricGap;
  const chartAreaW = fullW - metricBoxW - metricGap;

  const chartCanvasSize = 156;
  const legendGap = 16;
  const legendW = chartAreaW - chartCanvasSize - legendGap;
  const legendX = chartAreaX + chartCanvasSize + legendGap;

  const boxH = 62;

  doc.rect(metricsX, y, metricBoxW, boxH).fill("#edf5ff");
  doc.rect(metricsX, y, metricBoxW, 15).fill("#17324D");
  doc.font("Helvetica-Bold").fontSize(7.4).fillColor("#ffffff")
    .text("REGISTROS CONSIDERADOS", metricsX + 4, y + 4, {
      width: metricBoxW - 8,
      align: "center",
    });
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#17324D")
    .text(String(totalRows), metricsX + 4, y + 21, {
      width: metricBoxW - 8,
      align: "center",
    });
  doc.font("Helvetica").fontSize(7.1).fillColor("#64748b")
    .text("Total de movimientos / acciones consideradas", metricsX + 8, y + 48, {
      width: metricBoxW - 16,
      align: "center",
    });

  doc.rect(metricsX, y + boxH + 10, metricBoxW, boxH).fill("#e8fffb");
  doc.rect(metricsX, y + boxH + 10, metricBoxW, 15).fill("#0ea5a0");
  doc.font("Helvetica-Bold").fontSize(7.4).fillColor("#ffffff")
    .text("MONTO ACUMULADO", metricsX + 4, y + boxH + 14, {
      width: metricBoxW - 8,
      align: "center",
    });
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0ea5a0")
    .text(fmtCur(totalAmount), metricsX + 4, y + boxH + 31, {
      width: metricBoxW - 8,
      align: "center",
    });
  doc.font("Helvetica").fontSize(7.1).fillColor("#64748b")
    .text("Suma económica del bloque actual", metricsX + 8, y + boxH + 58, {
      width: metricBoxW - 16,
      align: "center",
    });

  doc.font("Helvetica-Bold").fontSize(8.3).fillColor("#0f172a")
    .text(`${title} · distribución`, chartAreaX, y - 2, {
      width: chartAreaW,
      align: "center",
    });

  const chartY = y + 6;
  const legendItems = buildEnterpriseLegend(rows);

  if (legendItems.length > 0) {
    const chartBuffer = await renderEnterpriseChart(rows);

    doc.image(chartBuffer, chartAreaX + 6, chartY, {
      width: chartCanvasSize,
      height: chartCanvasSize,
    });
  } else {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b")
      .text("Sin datos para graficar", chartAreaX, chartY + 70, {
        width: chartCanvasSize,
        align: "center",
      });
  }

  let legendY = chartY + 8;

  legendItems.forEach((item) => {
    doc.rect(legendX, legendY + 2, 8, 8).fill(item.color);

    doc.font("Helvetica").fontSize(8).fillColor("#334155")
      .text(item.label, legendX + 14, legendY, {
        width: legendW - 14,
        ellipsis: true,
      });

    legendY += 17;
  });

  drawEnterpriseFooter(doc, frame);
}


async function generateGeneralReportExcel(report) {
  const meta = buildMeta(report);
  const rows = buildBodyRows(report);

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY.name;
  wb.created = new Date();

  const ws = wb.addWorksheet("Reporte General", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
    views: [{ showGridLines: false }],
  });

  ws.columns = [
    { width: 7 },
    { width: 22 },
    { width: 28 },
    { width: 14 },
    { width: 18 },
    { width: 42 },
  ];

  const NAVY = "FF1A3C5E";
  const TEAL = "FF0EA5A0";
  const WHITE = "FFFFFFFF";
  const DARK = "FF0F172A";
  const GRAY = "FF475569";
  const LGRAY = "FF94A3B8";
  const LIGHT = "FFF8FAFC";
  const SEPAR = "FFE2E8F0";
  const BGSEP = "FFF1F5F9";
  const GREEN = "FF16A34A";
  const AMBER = "FFD97706";
  const RED = "FFDC2626";

  function gc(r, c) {
    return ws.getCell(`${c}${r}`);
  }

  function merge(r, a, b) {
    ws.mergeCells(`${a}${r}:${b}${r}`);
  }

  function fill(cell, argb) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }

  function borderBottomRange(rowNumber, fromCol, toCol, color = SEPAR) {
    for (let i = fromCol.charCodeAt(0); i <= toCol.charCodeAt(0); i += 1) {
      ws.getCell(`${String.fromCharCode(i)}${rowNumber}`).border = {
        bottom: { style: "thin", color: { argb: color } },
      };
    }
  }

  function textRow(rowNumber, text, options = {}) {
    const {
      from = "A",
      to = "F",
      bold = false,
      size = 9,
      color = DARK,
      height = 14,
      align = "left",
    } = options;

    ws.getRow(rowNumber).height = height;
    merge(rowNumber, from, to);
    const cell = gc(rowNumber, from);
    cell.value = text;
    cell.font = { bold, size, color: { argb: color } };
    cell.alignment = { wrapText: true, vertical: "top", horizontal: align };
  }

  let row = 1;

  if (LOGO_BUFFER) {
    const logoId = wb.addImage({ buffer: LOGO_BUFFER, extension: "png" });
    ws.addImage(logoId, {
      tl: { col: 0.15, row: 0.15 },
      br: { col: 1.05, row: 3.9 },
      editAs: "oneCell",
    });
  }

  ws.getRow(1).height = 8;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 13;
  ws.getRow(4).height = 13;

  merge(2, "B", "D");
  gc(2, "B").value = COMPANY.name;
  gc(2, "B").font = { bold: true, size: 13, color: { argb: NAVY } };
  gc(2, "B").alignment = { vertical: "middle" };

  merge(3, "B", "D");
  gc(3, "B").value = COMPANY.full;
  gc(3, "B").font = { size: 7.5, color: { argb: LGRAY } };

  merge(4, "B", "D");
  gc(4, "B").value = COMPANY.address;
  gc(4, "B").font = { size: 7.5, color: { argb: LGRAY } };

  merge(2, "E", "F");
  gc(2, "E").value = "REPORTE GENERAL";
  gc(2, "E").font = { bold: true, size: 16, color: { argb: DARK } };
  gc(2, "E").alignment = { horizontal: "center", vertical: "middle" };

  gc(2, "F").value = "CORTE";
  gc(2, "F").font = { bold: true, size: 8, color: { argb: WHITE } };
  gc(2, "F").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(2, "F"), NAVY);

  gc(3, "F").value = meta.periodLabel;
  gc(3, "F").font = { bold: true, size: 10, color: { argb: NAVY } };
  gc(3, "F").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  fill(gc(3, "F"), LIGHT);

  row = 5;

  ws.getRow(row).height = 3;
  merge(row, "A", "F");
  fill(gc(row, "A"), NAVY);
  row += 1;

  ws.getRow(row).height = 6;
  row += 1;

  ws.getRow(row).height = 14;
  merge(row, "B", "C");
  gc(row, "B").value = "FECHA INICIAL";
  gc(row, "B").font = { bold: true, size: 7.5, color: { argb: WHITE } };
  gc(row, "B").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "B"), NAVY);

  merge(row, "D", "E");
  gc(row, "D").value = "FECHA FINAL";
  gc(row, "D").font = { bold: true, size: 7.5, color: { argb: WHITE } };
  gc(row, "D").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "D"), NAVY);
  row += 1;

  ws.getRow(row).height = 16;
  merge(row, "B", "C");
  gc(row, "B").value = meta.dateFrom ? fmtDate(meta.dateFrom) : "Sin filtro";
  gc(row, "B").font = { size: 9, color: { argb: DARK } };
  gc(row, "B").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "B"), LIGHT);

  merge(row, "D", "E");
  gc(row, "D").value = meta.dateTo ? fmtDate(meta.dateTo) : "Sin filtro";
  gc(row, "D").font = { size: 9, color: { argb: DARK } };
  gc(row, "D").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "D"), LIGHT);
  row += 1;

  ws.getRow(row).height = 6;
  merge(row, "A", "F");
  fill(gc(row, "A"), BGSEP);
  row += 1;

  textRow(row, "RESUMEN EJECUTIVO", {
    from: "A",
    to: "F",
    bold: true,
    size: 12,
    color: NAVY,
    height: 16,
  });
  row += 1;

  textRow(
    row,
    `Período consultado: ${meta.periodLabel}. Generado el ${fmtDate(meta.generatedAt)}.`,
    {
      from: "A",
      to: "F",
      size: 8.5,
      color: GRAY,
      height: 16,
    }
  );
  row += 2;

  ws.getRow(row).height = 20;
  const headers = ["#", "MÓDULO", "INDICADOR", "CANTIDAD", "MONTO", "OBSERVACIONES"];
  headers.forEach((label, idx) => {
    const cell = ws.getCell(row, idx + 1);
    cell.value = label;
    cell.font = { bold: true, size: 8.5, color: { argb: WHITE } };
    cell.alignment = {
      horizontal: idx >= 3 && idx <= 4 ? "right" : "left",
      vertical: "middle",
    };
    fill(cell, NAVY);
  });
  row += 1;

  rows.forEach((item, idx) => {
    ws.getRow(row).height = 18;

    const values = [
      idx + 1,
      item.module,
      item.indicator,
      Number(item.quantity || 0),
      item.amount == null ? "" : Number(item.amount || 0),
      item.detail,
    ];

    values.forEach((val, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = val;
      cell.font = {
        size: 9,
        bold: i === 1 || i === 2,
        color: { argb: i === 1 ? NAVY : DARK },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: i === 0 ? "center" : i === 3 || i === 4 ? "right" : "left",
        wrapText: i === 5,
      };
      fill(cell, idx % 2 === 0 ? LIGHT : WHITE);
      cell.border = {
        bottom: { style: "thin", color: { argb: SEPAR } },
      };
      if (i === 4 && val !== "") {
        cell.numFmt = '"$"#,##0.00';
      }
      if (i === 3) {
        cell.numFmt = '#,##0';
      }
    });

    row += 1;
  });

  row += 1;

  textRow(row, "RESUMEN FINANCIERO", {
    from: "A",
    to: "F",
    bold: true,
    size: 11,
    color: NAVY,
    height: 14,
  });
  row += 1;

  const totals = [
    {
      label: "Total cotizaciones",
      value: Number(report?.quotes?.total_amount || 0),
      color: NAVY,
    },
    {
      label: "Total facturación",
      value: Number(report?.invoices?.total_amount || 0),
      color: TEAL,
    },
  ];

  totals.forEach((item) => {
    ws.getRow(row).height = 18;

    merge(row, "A", "C");
    gc(row, "A").value = item.label;
    gc(row, "A").font = { bold: true, size: 9, color: { argb: DARK } };
    gc(row, "A").alignment = { horizontal: "left", vertical: "middle" };
    fill(gc(row, "A"), LIGHT);
    borderBottomRange(row, "A", "C");

    merge(row, "D", "F");
    gc(row, "D").value = item.value;
    gc(row, "D").numFmt = '"$"#,##0.00';
    gc(row, "D").font = { bold: true, size: 10, color: { argb: item.color } };
    gc(row, "D").alignment = { horizontal: "right", vertical: "middle" };
    fill(gc(row, "D"), LIGHT);
    borderBottomRange(row, "D", "F");

    row += 1;
  });

  row += 1;

 // ─── PANORAMA OPERATIVO DEL PERÍODO ────────────────────────────────
  ws.getRow(row).height = 4;
  merge(row, "A", "F");
  fill(gc(row, "A"), BGSEP);
  row += 1;

  ws.getRow(row).height = 17;
  merge(row, "A", "F");
  gc(row, "A").value = "PANORAMA OPERATIVO DEL PERÍODO";
  gc(row, "A").font = { bold: true, size: 11, color: { argb: WHITE } };
  gc(row, "A").alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  fill(gc(row, "A"), NAVY);
  row += 1;

  ws.getRow(row).height = 4;
  row += 1;

  // ── Ingresos principales ─────────────────────────────────────────────
  const xCotizado  = Number(report?.quotes?.total_amount   || 0);
  const xFacturado = Number(report?.invoices?.total_amount || 0);
  const xPct       = xCotizado > 0
    ? ((xFacturado / xCotizado) * 100).toFixed(1) + "%"
    : "—";

  ws.getRow(row).height = 13;
  merge(row, "A", "C");
  gc(row, "A").value = "INGRESOS COTIZADOS";
  gc(row, "A").font = { bold: true, size: 7.5, color: { argb: WHITE } };
  gc(row, "A").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "A"), NAVY);

  merge(row, "D", "F");
  gc(row, "D").value = "INGRESOS FACTURADOS";
  gc(row, "D").font = { bold: true, size: 7.5, color: { argb: WHITE } };
  gc(row, "D").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "D"), TEAL);
  row += 1;

  ws.getRow(row).height = 30;
  merge(row, "A", "C");
  gc(row, "A").value = xCotizado;
  gc(row, "A").numFmt = '"$"#,##0.00';
  gc(row, "A").font = { bold: true, size: 20, color: { argb: NAVY } };
  gc(row, "A").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "A"), "FFEDF5FF");

  merge(row, "D", "F");
  gc(row, "D").value = xFacturado;
  gc(row, "D").numFmt = '"$"#,##0.00';
  gc(row, "D").font = { bold: true, size: 20, color: { argb: TEAL } };
  gc(row, "D").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "D"), "FFE8FFFB");
  row += 1;

  ws.getRow(row).height = 13;
  merge(row, "A", "C");
  gc(row, "A").value = "Total cotizado del período";
  gc(row, "A").font = { size: 7.5, color: { argb: LGRAY } };
  gc(row, "A").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "A"), "FFEDF5FF");

  merge(row, "D", "F");
  gc(row, "D").value = `Conversión al cobro: ${xPct}`;
  gc(row, "D").font = { size: 7.5, color: { argb: LGRAY } };
  gc(row, "D").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "D"), "FFE8FFFB");
  row += 2;

  // ── Comparativo de actividad operativa (barra horizontal) ────────────
  ws.getRow(row).height = 15;
  merge(row, "A", "F");
  gc(row, "A").value = "COMPARATIVO DE ACTIVIDAD OPERATIVA";
  gc(row, "A").font = { bold: true, size: 8.5, color: { argb: WHITE } };
  gc(row, "A").alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  fill(gc(row, "A"), DARK);
  row += 1;

  // Cabecera de columnas
  ws.getRow(row).height = 12;
  gc(row, "A").value = "Indicador";
  gc(row, "A").font = { bold: true, size: 7.5, color: { argb: GRAY } };
  gc(row, "A").alignment = { vertical: "middle", indent: 1 };
  fill(gc(row, "A"), BGSEP);

  gc(row, "B").value = "Total";
  gc(row, "B").font = { bold: true, size: 7.5, color: { argb: GRAY } };
  gc(row, "B").alignment = { horizontal: "center", vertical: "middle" };
  fill(gc(row, "B"), BGSEP);

  merge(row, "C", "F");
  gc(row, "C").value = "Comparativo visual";
  gc(row, "C").font = { bold: true, size: 7.5, color: { argb: GRAY } };
  gc(row, "C").alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  fill(gc(row, "C"), BGSEP);
  row += 1;

  const actItems = [
    { label: "Artículos en inventario",   value: Number(report?.inventory?.products_count  || 0), accent: NAVY,  bg: "FFEDF5FF" },
    { label: "Movimientos de inventario", value: Number(report?.inventory?.movements_count || 0), accent: AMBER, bg: "FFFFF4E5" },
    { label: "Servicios registrados",     value: Number(report?.operations?.count           || 0), accent: TEAL,  bg: "FFE8FFFB" },
    { label: "Servicios completados",     value: Number(report?.operations?.completed_count || 0), accent: GREEN, bg: "FFEAFBF0" },
    { label: "Servicios con incidencia",  value: Number(report?.operations?.incident_count  || 0), accent: RED,   bg: "FFFFECEC" },
  ];

  const maxActVal = Math.max(...actItems.map((a) => a.value), 1);

  actItems.forEach((item, idx) => {
    ws.getRow(row).height = 17;
    const rowBg = idx % 2 === 0 ? LIGHT : WHITE;

    // Col A: etiqueta
    gc(row, "A").value = item.label;
    gc(row, "A").font = { size: 8.5, color: { argb: DARK } };
    gc(row, "A").alignment = { vertical: "middle", indent: 1 };
    fill(gc(row, "A"), rowBg);
    gc(row, "A").border = { bottom: { style: "thin", color: { argb: SEPAR } } };

    // Col B: valor numérico
    gc(row, "B").value = item.value;
    gc(row, "B").numFmt = "#,##0";
    gc(row, "B").font = { bold: true, size: 10, color: { argb: item.accent } };
    gc(row, "B").alignment = { horizontal: "center", vertical: "middle" };
    fill(gc(row, "B"), rowBg);
    gc(row, "B").border = { bottom: { style: "thin", color: { argb: SEPAR } } };

    // Cols C–F: barra proporcional (4 celdas = 100%)
    const filledCount = item.value > 0
      ? Math.max(1, Math.round((item.value / maxActVal) * 4))
      : 0;

    ["C", "D", "E", "F"].forEach((col, ci) => {
      const cell = ws.getCell(`${col}${row}`);
      fill(cell, ci < filledCount ? item.accent : rowBg);
      cell.border = {
        bottom: { style: "thin", color: { argb: SEPAR } },
        ...(ci < 3 ? { right: { style: "thin", color: { argb: "FFD1D9E6" } } } : {}),
      };
    });

    row += 1;
  });

  row += 1;
  ws.getRow(row).height = 8;
  merge(row, "A", "F");
  fill(gc(row, "A"), BGSEP);
  row += 1;

  textRow(row, "ATENTAMENTE.", {
    from: "A",
    to: "F",
    bold: true,
    size: 10,
    color: NAVY,
    height: 14,
  });
  row += 2;

  if (LOGOS_BUFFER) {
    const logosId = wb.addImage({ buffer: LOGOS_BUFFER, extension: "png" });
    ws.addImage(logosId, {
      tl: { col: 0.15, row: row - 1 },
      br: { col: 2.8, row: row + 2.5 },
      editAs: "oneCell",
    });
  }

  if (LADA_BUFFER) {
    const ladaId = wb.addImage({ buffer: LADA_BUFFER, extension: "png" });
    ws.addImage(ladaId, {
      tl: { col: 4.1, row: row - 1 },
      br: { col: 5.95, row: row + 2.5 },
      editAs: "oneCell",
    });
  }

  ws.getRow(row).height = 14;
  row += 1;

  textRow(row, `Tel: ${COMPANY.phone} · ${COMPANY.web}`, {
    from: "A",
    to: "F",
    size: 8,
    color: GRAY,
    height: 12,
    align: "center",
  });
  row += 1;

 // ─── HOJAS DETALLE ─────────────────────────────

function addDetailSheet(name, moduleKey, rows) {
  const ws = wb.addWorksheet(name, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35 },
    },
  });

  ws.columns = [
    { header: "Título", key: "title", width: 30 },
    { header: "Detalle", key: "subtitle", width: 38 },
    { header: "Fecha / Hora", key: "created_at", width: 24 },
    { header: "Meta 1", key: "meta1", width: 20 },
    { header: "Meta 2", key: "meta2", width: 20 },
    { header: "Monto", key: "amount", width: 18 },
  ];

  ws.getRow(1).height = 18;
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17324D" },
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    ws.mergeCells("A2:F2");
    ws.getCell("A2").value = "Sin registros en el período";
    ws.getCell("A2").font = { bold: true, size: 11, color: { argb: "FF64748B" } };
    ws.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    ws.getRow(2).height = 28;
    ws.getCell("A2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF8FAFC" },
    };
    ws.getCell("A2").border = {
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    ws.getColumn("amount").numFmt = '"$"#,##0.00';
    return;
  }

  rows.forEach((r) => {
    const meta = Array.isArray(r.meta) ? r.meta : [];
    ws.addRow({
      title: r.title || "",
      subtitle: r.subtitle || "",
      created_at: r.created_at
        ? new Date(r.created_at).toLocaleString("es-MX")
        : "",
      meta1: meta[0] ? `${meta[0].label}: ${meta[0].value}` : "",
      meta2: meta[1] ? `${meta[1].label}: ${meta[1].value}` : "",
      amount: Number(r.amount || 0),
    });
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.height = 18;
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };
      cell.font = { size: 9, color: { argb: "FF0F172A" } };
    });

    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }
  });

  ws.getColumn("amount").numFmt = '"$"#,##0.00';
}
addDetailSheet("Inventario Productos", "inventory", report.inventory.products_rows || []);
addDetailSheet("Inventario Movimientos", "inventory", report.inventory.movements_rows || []);
addDetailSheet("Cotizaciones", "quotes", report.quotes.recent_rows || []);
addDetailSheet("Facturación", "invoices", report.invoices.recent_rows || []);
addDetailSheet("Operaciones", "operations", report.operations.recent_rows || []);

return Buffer.from(await wb.xlsx.writeBuffer());
}

async function generateGeneralReportPDF(report) {
  const meta = buildMeta(report);
  const rows = buildBodyRows(report);

  return new Promise(async (resolve, reject) => {
    try {
const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
  bufferPages: true,
  info: {
    Title: `Reporte General ${meta.periodLabel}`,
    Author: COMPANY.name,
  },
});

      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width;
      const H = doc.page.height;
      const PL = 28;
      const PR = 28;
      const CW = W - PL - PR;
      const navy = COMPANY.navy;
      const teal = COMPANY.teal;

      const FIXED_FOOTER_TOP = H - 88;
      const BODY_BOTTOM = FIXED_FOOTER_TOP - 14;

      function drawStaticPageFrame() {
        let yy = 24;

        if (LOGO_BUFFER) {
          doc.image(LOGO_BUFFER, PL, yy, { width: 56, height: 56 });
        }

        doc.font("Helvetica-Bold").fontSize(13).fillColor(navy)
          .text(COMPANY.name, PL + 64, yy + 4);

        doc.font("Helvetica").fontSize(7).fillColor("#475569")
          .text(COMPANY.full, PL + 64, yy + 20)
          .text(COMPANY.address, PL + 64, yy + 30, { width: 190 });

        const folioBoxX = W - PR - 190;

        doc.rect(folioBoxX, yy, 160, 14).fill(teal);
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
          .text("FOLIO", folioBoxX, yy + 3, { width: 160, align: "center" });

        doc.rect(folioBoxX, yy + 14, 160, 28).fill("#f8fafc")
          .strokeColor("#e2e8f0").lineWidth(0.5).stroke();

        doc.font("Helvetica-Bold").fontSize(10).fillColor(teal)
          .text(String(report?.folio || "SIN-FOLIO"), folioBoxX + 8, yy + 22, {
            width: 144,
            align: "center",
          });

        yy += 54;
        doc.rect(PL, yy, CW, 1).fill(navy);
        yy += 10;

        doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a")
          .text("REPORTES GENERALES", PL, yy, { width: CW, align: "center" });

        yy += 20;

        const bw = 120;
        const gap = 14;
        const totalWidth = bw * 2 + gap;
        const startX = (W - totalWidth) / 2;

        doc.rect(startX, yy, bw, 14).fill(navy);
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff")
          .text("FECHA INICIAL", startX, yy + 3, { width: bw, align: "center" });

        doc.rect(startX, yy + 14, bw, 20).fill("#f8fafc");
        doc.rect(startX, yy + 14, bw, 20).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
        doc.font("Helvetica").fontSize(8.5).fillColor("#0f172a")
          .text(meta.dateFrom ? fmtDate(meta.dateFrom) : "Sin filtro", startX, yy + 20, {
            width: bw,
            align: "center",
          });

        const endX = startX + bw + gap;
        doc.rect(endX, yy, bw, 14).fill(navy);
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff")
          .text("FECHA FINAL", endX, yy + 3, { width: bw, align: "center" });

        doc.rect(endX, yy + 14, bw, 20).fill("#f8fafc");
        doc.rect(endX, yy + 14, bw, 20).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
        doc.font("Helvetica").fontSize(8.5).fillColor("#0f172a")
          .text(meta.dateTo ? fmtDate(meta.dateTo) : "Sin filtro", endX, yy + 20, {
            width: bw,
            align: "center",
          });

        yy += 46;
        doc.rect(PL, yy, CW, 0.5).fill("#e2e8f0");
        yy += 10;

        doc.font("Helvetica-Bold").fontSize(9).fillColor(teal)
          .text("RESUMEN EJECUTIVO", PL, yy);

        yy += 12;

        const intro = `Consolidado financiero, operativo e inventarial correspondiente a ${meta.periodLabel}. Generado el ${fmtDate(meta.generatedAt)}.`;
        doc.font("Helvetica").fontSize(8.5).fillColor("#475569")
          .text(intro, PL, yy, { width: CW });

        yy += doc.heightOfString(intro, { width: CW }) + 10;
        doc.rect(PL, yy, CW, 0.5).fill("#e2e8f0");
        yy += 10;

        return yy;
      }

      let y = drawStaticPageFrame();

      doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a")
        .text("DETALLE CONSOLIDADO", PL, y);
      y += 16;

      const COLS = [28, 112, 148, 70, 90, 128];
      const HEADS = ["#", "MÓDULO", "INDICADOR", "CANTIDAD", "MONTO", "OBSERVACIONES"];
      const HEADER_H = 16;

      doc.rect(PL, y, COLS.reduce((a, b) => a + b, 0), HEADER_H).fill(navy);

      let x = PL;
      HEADS.forEach((head, i) => {
        doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
          .text(head, x + 4, y + 5, {
            width: COLS[i] - 8,
            align: i >= 3 && i <= 4 ? "right" : i === 0 ? "center" : "left",
          });
        x += COLS[i];
      });

      y += HEADER_H;
      const tableStartY = y - HEADER_H;

      rows.forEach((item, idx) => {
        const values = [
          String(idx + 1),
          item.module,
          item.indicator,
          String(Number(item.quantity || 0)),
          item.amount == null ? "—" : fmtCur(item.amount),
          item.detail,
        ];

        const lineHeights = values.map((text, i) =>
          doc.font(i === 1 || i === 2 ? "Helvetica-Bold" : "Helvetica")
            .fontSize(8)
            .heightOfString(String(text), { width: COLS[i] - 8 })
        );

        const rowH = Math.max(18, Math.max(...lineHeights) + 8);

        if (y + rowH > BODY_BOTTOM) {
          doc.addPage();
          y = drawStaticPageFrame();

          doc.rect(PL, y, COLS.reduce((a, b) => a + b, 0), HEADER_H).fill(navy);

          let hx = PL;
          HEADS.forEach((head, i) => {
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
              .text(head, hx + 4, y + 5, {
                width: COLS[i] - 8,
                align: i >= 3 && i <= 4 ? "right" : i === 0 ? "center" : "left",
              });
            hx += COLS[i];
          });

          y += HEADER_H;
        }

        doc.rect(PL, y, COLS.reduce((a, b) => a + b, 0), rowH)
          .fill(idx % 2 === 0 ? "#f8fafc" : "#ffffff");

        doc.rect(PL, y + rowH - 0.35, COLS.reduce((a, b) => a + b, 0), 0.35)
          .fill("#e2e8f0");

        let cx = PL;
        values.forEach((text, i) => {
          const align = i >= 3 && i <= 4 ? "right" : i === 0 ? "center" : "left";
          doc.font(i === 1 || i === 2 ? "Helvetica-Bold" : "Helvetica")
            .fontSize(8)
            .fillColor(i === 1 ? navy : "#0f172a")
            .text(String(text), cx + 4, y + 5, {
              width: COLS[i] - 8,
              align,
            });
          cx += COLS[i];
        });

        y += rowH;
      });

      doc.rect(PL, tableStartY, COLS.reduce((a, b) => a + b, 0), y - tableStartY)
        .lineWidth(0.5)
        .strokeColor("#cbd5e1")
        .stroke();

      y += 12;

      doc.font("Helvetica-Bold").fontSize(11).fillColor(navy)
        .text("RESUMEN FINANCIERO", PL, y);
      y += 16;

      const financialRows = [
        ["Total cotizaciones", fmtCur(report?.quotes?.total_amount || 0)],
        ["Total facturación", fmtCur(report?.invoices?.total_amount || 0)],
      ];

      const labelX = PL + 250;
      const valueX = W - PR - 170;
      financialRows.forEach(([label, value], idx) => {
        doc.rect(labelX, y - 2, 320, 16).fill(idx % 2 === 0 ? "#f8fafc" : "#ffffff");
        doc.font("Helvetica").fontSize(8.5).fillColor("#64748b")
          .text(label, labelX + 8, y + 2, { width: 170 });
        doc.font("Helvetica-Bold").fontSize(9).fillColor(navy)
          .text(value, valueX, y + 2, { width: 140, align: "right" });
        y += 18;
      });

y += 6;

      // ─── PANORAMA OPERATIVO DEL PERÍODO ────────────────────────────
      const panelW     = 185;
      const chartLeft  = PL + panelW + 18;
      const chartW     = CW - panelW - 18;
      const bodyStartY = y;

      // Barra de título
      doc.rect(PL, y, CW, 16).fill(navy);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
        .text("PANORAMA OPERATIVO DEL PERÍODO", PL + 8, y + 4, {
          width: CW - 16,
        });
      y += 21;

      const panelBodyY = y;

      // ── Panel izquierdo: ingresos ──────────────────────────────────
      const pxCotizado  = Number(report?.quotes?.total_amount   || 0);
      const pxFacturado = Number(report?.invoices?.total_amount || 0);
      const pxPct       = pxCotizado > 0
        ? ((pxFacturado / pxCotizado) * 100).toFixed(1) + "%"
        : "—";

      const kBoxH   = 62;
      const kBoxGap = 10;

      // Caja 1 — Cotizado
      doc.rect(PL, panelBodyY, panelW, kBoxH).fill("#edf5ff");
      doc.rect(PL, panelBodyY, panelW, 15).fill(navy);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
        .text("INGRESOS COTIZADOS", PL + 4, panelBodyY + 4, {
          width: panelW - 8,
          align: "center",
        });
      doc.font("Helvetica-Bold").fontSize(17).fillColor(navy)
        .text(fmtCur(pxCotizado), PL + 4, panelBodyY + 20, {
          width: panelW - 8,
          align: "center",
        });
      doc.font("Helvetica").fontSize(7).fillColor("#64748b")
        .text("Total cotizado del período", PL + 4, panelBodyY + 50, {
          width: panelW - 8,
          align: "center",
        });

      // Caja 2 — Facturado
      const kBox2Y = panelBodyY + kBoxH + kBoxGap;
      doc.rect(PL, kBox2Y, panelW, kBoxH).fill("#e8fffb");
      doc.rect(PL, kBox2Y, panelW, 15).fill(teal);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
        .text("INGRESOS FACTURADOS", PL + 4, kBox2Y + 4, {
          width: panelW - 8,
          align: "center",
        });
      doc.font("Helvetica-Bold").fontSize(17).fillColor(teal)
        .text(fmtCur(pxFacturado), PL + 4, kBox2Y + 20, {
          width: panelW - 8,
          align: "center",
        });
      doc.font("Helvetica").fontSize(7).fillColor("#64748b")
        .text(`Conversión al cobro: ${pxPct}`, PL + 4, kBox2Y + 50, {
          width: panelW - 8,
          align: "center",
        });

      const leftPanelH = kBoxH + kBoxGap + kBoxH; // 134 px

      // ── Panel derecho: gráfica horizontal de barras ────────────────
      const barItems = [
        { label: "Artículos en inventario",   value: Number(report?.inventory?.products_count  || 0), color: navy },
        { label: "Movimientos de inventario", value: Number(report?.inventory?.movements_count || 0), color: "#d97706" },
        { label: "Servicios registrados",     value: Number(report?.operations?.count           || 0), color: teal },
        { label: "Servicios completados",     value: Number(report?.operations?.completed_count || 0), color: "#16a34a" },
        { label: "Servicios con incidencia",  value: Number(report?.operations?.incident_count  || 0), color: "#dc2626" },
      ];

      const barMaxVal    = Math.max(...barItems.map((b) => b.value), 1);
      const barH         = 18;
      const barGap       = 7;
      const chartLabelW  = 108;
      const chartValW    = 26;
      const chartBarX    = chartLeft + chartLabelW + chartValW + 4;
      const chartBarMaxW = chartW - chartLabelW - chartValW - 10;

      // Encabezado de gráfica
      doc.rect(chartLeft, panelBodyY, chartW, 15).fill("#0f172a");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
        .text("COMPARATIVO DE ACTIVIDAD OPERATIVA", chartLeft + 6, panelBodyY + 4, {
          width: chartW - 12,
        });

      barItems.forEach((item, idx) => {
        const barY = panelBodyY + 15 + idx * (barH + barGap);
        const bg   = idx % 2 === 0 ? "#f8fafc" : "#ffffff";

        // Fondo de fila
        doc.rect(chartLeft, barY, chartW, barH).fill(bg);

        // Etiqueta
        doc.font("Helvetica").fontSize(7.5).fillColor("#334155")
          .text(item.label, chartLeft + 4, barY + 5, {
            width: chartLabelW - 4,
            ellipsis: true,
          });

        // Valor numérico
        doc.font("Helvetica-Bold").fontSize(8).fillColor(item.color)
          .text(String(item.value), chartLeft + chartLabelW + 2, barY + 5, {
            width: chartValW,
            align: "right",
          });

        // Pista de barra (fondo gris)
        doc.rect(chartBarX, barY + 5, chartBarMaxW, barH - 10).fill("#e2e8f0");

        // Barra coloreada proporcional
        const barFillW = item.value > 0
          ? Math.max(3, (item.value / barMaxVal) * chartBarMaxW)
          : 2;
        doc.rect(chartBarX, barY + 5, barFillW, barH - 10).fill(item.color);

        // Línea separadora
        if (idx < barItems.length - 1) {
          doc.rect(chartLeft, barY + barH, chartW, 0.5).fill("#e2e8f0");
        }
      });

      const rightPanelH = 15 + barItems.length * (barH + barGap);

      y = panelBodyY + Math.max(leftPanelH, rightPanelH) + 12;

      const footerY = FIXED_FOOTER_TOP;

      doc.rect(PL, footerY - 10, CW, 0.5).fill("#e2e8f0");

      if (LOGOS_BUFFER) {
        doc.image(LOGOS_BUFFER, PL, footerY + 8, { height: 24, fit: [145, 24] });
      }

      if (LADA_BUFFER) {
        doc.image(LADA_BUFFER, W - PR - 150, footerY + 8, { height: 24, fit: [150, 24] });
      }

      doc.font("Helvetica").fontSize(7.5).fillColor("#475569")
        .text(`Tel: ${COMPANY.phone}`, PL, footerY + 40)
        .text(COMPANY.web, PL + 120, footerY + 40)
        .text(COMPANY.address, PL + 210, footerY + 40, { width: 270 });

// ─── HOJAS DETALLADAS ─────────────────────────────

if ((report.inventory.products_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "inventory",
    "INVENTARIO",
    report.inventory.products_rows || [],
    1
  );
}

if ((report.inventory.movements_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "inventory",
    "INVENTARIO",
    report.inventory.movements_rows || [],
    2
  );
}

if ((report.quotes.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "quotes",
    "COTIZACIONES",
    report.quotes.recent_rows || [],
    1
  );
}

if ((report.invoices.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "invoices",
    "FACTURACIÓN",
    report.invoices.recent_rows || [],
    1
  );
}

if ((report.operations.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "operations",
    "OPERACIONES",
    report.operations.recent_rows || [],
    1
  );
}

// ─── PAGINACIÓN TOTAL ─────────────────────────────
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i += 1) {
  doc.switchToPage(i);

  const W = doc.page.width;
  const H = doc.page.height;

  doc.font("Helvetica").fontSize(7.2).fillColor("#64748b")
    .text(`Página ${i + 1} de ${range.count}`, 0, H - 18, {
      width: W - 24,
      align: "right",
    });
}

doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function generateGeneralReportXML(report) {
  const meta = buildMeta(report);
  const rows = buildBodyRows(report);
  const generatedAt = meta.generatedAt.toISOString();

  const concepts = rows
    .map(
      (item) => `    <Indicador
      Modulo="${escXml(item.module)}"
      Nombre="${escXml(item.indicator)}"
      Cantidad="${Number(item.quantity || 0)}"
      Monto="${item.amount == null ? "" : Number(item.amount || 0).toFixed(2)}"
      Observaciones="${escXml(item.detail)}" />`
    )
    .join("\n");

  const kpiSummary = `  <ResumenFinanciero>
    <TotalCotizaciones>${Number(report?.quotes?.total_amount || 0).toFixed(2)}</TotalCotizaciones>
    <TotalFacturacion>${Number(report?.invoices?.total_amount || 0).toFixed(2)}</TotalFacturacion>
  </ResumenFinanciero>

  <KpisClave>
    <ProductosActivos>${Number(report?.inventory?.products_count || 0)}</ProductosActivos>
    <Movimientos>${Number(report?.inventory?.movements_count || 0)}</Movimientos>
    <Operaciones>${Number(report?.operations?.count || 0)}</Operaciones>
    <Completadas>${Number(report?.operations?.completed_count || 0)}</Completadas>
    <Incidencias>${Number(report?.operations?.incident_count || 0)}</Incidencias>
  </KpisClave>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<ReporteGeneral
  xmlns:rep="http://ecovisa.com/reportes-generales/1.0"
  Version="1.0"
  Periodo="${escXml(meta.periodLabel)}"
  FechaInicial="${escXml(meta.dateFrom || "")}"
  FechaFinal="${escXml(meta.dateTo || "")}"
  GeneradoEn="${generatedAt}"
>
  <Emisor
    Nombre="${escXml(COMPANY.name)}"
    RazonSocial="${escXml(COMPANY.full)}"
    Domicilio="${escXml(COMPANY.address)}"
    Telefono="${escXml(COMPANY.phone)}"
    Web="${escXml(COMPANY.web)}"
  />

  <Inventario
    ProductosActivos="${Number(report?.inventory?.products_count || 0)}"
    Movimientos="${Number(report?.inventory?.movements_count || 0)}"
  />

  <Cotizaciones
    Cantidad="${Number(report?.quotes?.count || 0)}"
    MontoTotal="${Number(report?.quotes?.total_amount || 0).toFixed(2)}"
  />

  <Facturacion
    Cantidad="${Number(report?.invoices?.count || 0)}"
    MontoTotal="${Number(report?.invoices?.total_amount || 0).toFixed(2)}"
  />

  <Operaciones
    Cantidad="${Number(report?.operations?.count || 0)}"
    Completadas="${Number(report?.operations?.completed_count || 0)}"
    Incidencias="${Number(report?.operations?.incident_count || 0)}"
  />

  <Indicadores>
  <Detalle>
  ${(report.inventory.products_rows || []).map(r => `
    <InventarioProducto
      titulo="${escXml(r.title)}"
      detalle="${escXml(r.subtitle)}"
      fecha="${escXml(r.created_at || "")}" />
  `).join("")}

  ${(report.inventory.movements_rows || []).map(r => `
    <InventarioMovimiento
      titulo="${escXml(r.title)}"
      detalle="${escXml(r.subtitle)}"
      fecha="${escXml(r.created_at || "")}"
      actor="${escXml((r.meta || []).find(m => m.label === "Actor")?.value || "")}" />
  `).join("")}

  ${(report.quotes.recent_rows || []).map(r => `
    <Cotizacion
      titulo="${escXml(r.title)}"
      estado="${escXml((r.meta || []).find(m => m.label === "Estado")?.value || "")}"
      fecha="${escXml(r.created_at || "")}" />
  `).join("")}

  ${(report.invoices.recent_rows || []).map(r => `
    <Factura
      titulo="${escXml(r.title)}"
      estado="${escXml((r.meta || []).find(m => m.label === "Estado")?.value || "")}"
      fecha="${escXml(r.created_at || "")}" />
  `).join("")}

  ${(report.operations.recent_rows || []).map(r => `
    <Operacion
      titulo="${escXml(r.title)}"
      detalle="${escXml(r.subtitle)}"
      estado="${escXml((r.meta || []).find(m => m.label === "Estado")?.value || "")}"
      fecha="${escXml(r.created_at || "")}" />
  `).join("")}
</Detalle>
${concepts}
  </Indicadores>

${kpiSummary}
</ReporteGeneral>`;
}

module.exports = {
  generateGeneralReportExcel,
  generateGeneralReportPDF,
  generateGeneralReportXML,
};