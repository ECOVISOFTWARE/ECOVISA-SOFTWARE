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
const clientsCount = Number(report?.clients?.count || 0);

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
  module: "CLIENTES",
  indicator: "Clientes nuevos en el período",
  quantity: clientsCount,
  amount: null,
  detail: "Altas de clientes registradas dentro del rango consultado.",
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

const LINE_CHART_W = 560;
const LINE_CHART_H = 110;
const LINE_CHART_CANVAS = new ChartJSNodeCanvas({
  width: LINE_CHART_W,
  height: LINE_CHART_H,
  backgroundColour: "transparent",
});

async function renderLineChart(timeline = [], options = {}) {
  const {
    color = "#0ea5a0",
    color2 = null,
    valueKey = "amount",
    valueKey2 = null,
    label = "Valor",
    label2 = "",
  } = options;

  const sorted = [...timeline].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  if (sorted.length < 2) return null;

  const labels = sorted.map((p) => String(p.date || "").slice(5));
  const values = sorted.map((p) => Number(p[valueKey] ?? 0));

  const datasets = [
    {
      label,
      data: values,
      borderColor: color,
      backgroundColor: color + "22",
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      borderWidth: 2,
    },
  ];

  if (valueKey2 && color2) {
    datasets.push({
      label: label2,
      data: sorted.map((p) => Number(p[valueKey2] ?? 0)),
      borderColor: color2,
      backgroundColor: color2 + "22",
      fill: false,
      tension: 0.4,
      pointRadius: 2,
      borderWidth: 2,
    });
  }

  return LINE_CHART_CANVAS.renderToBuffer({
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
      layout: { padding: { left: 8, right: 8, top: 6, bottom: 4 } },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: {
            font: { size: 8 },
            color: "#475569",
            boxWidth: 10,
            padding: 8,
          },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          ticks: {
            font: { size: 7 },
            color: "#64748b",
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          grid: { display: false },
        },
        y: {
          ticks: { font: { size: 7 }, color: "#64748b" },
          grid: { color: "#e2e8f0", lineWidth: 0.5 },
        },
      },
    },
  });
}

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

// ─── MODULE TABLE CONFIG ───────────────────────────────────────
function getModuleTableConfig(moduleKey) {
  switch (moduleKey) {
    case "inventory_products":
      return {
        headers: ["PRODUCTO", "SKU", "STOCK ACT.", "STOCK MÍN.", "BAJO MÍN.", "UNIDAD", "FECHA DE ALTA"],
        cols: [145, 78, 58, 58, 58, 52, 107],
      };
    case "inventory_movements":
      return {
        headers: ["MOVIMIENTO", "MOTIVO / DETALLE", "TIPO", "ENTRADAS", "SALIDAS", "ACTOR", "FECHA / HORA"],
        cols: [108, 120, 44, 58, 58, 82, 86],
      };
    case "invoices":
      return {
        headers: ["FOLIO", "CLIENTE", "UBIC. / PERÍODO", "CONCEPTOS", "ACTOR", "MONTO"],
        cols: [58, 108, 110, 130, 78, 72],
      };
    case "quotes":
      return {
        headers: ["FOLIO", "TÍTULO", "CONCEPTOS", "ESTADO", "ACTOR", "MONTO"],
        cols: [64, 100, 152, 64, 88, 88],
      };
    case "clients":
      return {
        headers: ["CLIENTE", "EMPRESA / RFC", "FACT.", "PRODUCTOS / SERVICIOS ADQUIRIDOS", "TOTAL GASTADO", "ALTA"],
        cols: [108, 108, 36, 170, 78, 56],
      };
    case "operations":
      return {
        headers: ["OPERACIÓN", "CLIENTE", "ESTADO", "ACTOR", "FECHA / HORA"],
        cols: [162, 128, 80, 100, 86],
      };
    default:
      return {
        headers: ["TÍTULO", "DETALLE", "FECHA / HORA"],
        cols: [170, 260, 126],
      };
  }
}

// ─── MODULE ROW CELLS ──────────────────────────────────────────
function getModuleRowCells(moduleKey, row) {
  const getMeta = (label) => {
    const m = (row.meta || []).find((m) => m.label === label);
    return m != null ? String(m.value ?? "—") : "—";
  };
  switch (moduleKey) {
    case "inventory_products":
      return [
        safeText(row.title),
        safeText(row.subtitle),
        String(Number(row.amount ?? 0)),
        getMeta("Stock mínimo"),
        getMeta("Stock bajo") === "Sí" ? "⚠ Sí" : "No",
        getMeta("Unidad"),
        fmtDateTime(row.created_at),
      ];
    case "inventory_movements":
      return [
        safeText(row.title),
        getMeta("Detalle") !== "—" ? getMeta("Detalle") : safeText(row.subtitle),
        getMeta("Tipo"),
        getMeta("Tipo") === "Entrada" ? getMeta("Cantidad") : "—",
        getMeta("Tipo") === "Salida" ? getMeta("Cantidad") : "—",
        getMeta("Actor"),
        fmtDateTime(row.created_at),
      ];
    case "invoices":
      return [
        safeText(row.title),
        safeText(row.subtitle),
        getMeta("Ubicación") !== "—"
          ? `${getMeta("Ubicación")} / ${getMeta("Periodo")}`
          : getMeta("Periodo"),
        getMeta("Conceptos"),
        getMeta("Actor"),
        row.amount != null ? fmtCur(row.amount) : "—",
      ];
    case "quotes":
      return [
        safeText(row.title),
        safeText(row.subtitle),
        getMeta("Conceptos"),
        getMeta("Estado"),
        getMeta("Actor"),
        row.amount != null ? fmtCur(row.amount) : "—",
      ];
    case "clients":
      return [
        safeText(row.title),
        getMeta("Empresa") !== "—"
          ? `${getMeta("Empresa")}${getMeta("RFC") !== "—" ? " · " + getMeta("RFC") : ""}`
          : getMeta("RFC"),
        getMeta("Facturas"),
        getMeta("Productos / servicios"),
        fmtCur(getMeta("Total gastado")),
        fmtDateTime(row.created_at),
      ];
    case "operations":
      return [
        safeText(row.title),
        safeText(row.subtitle),
        getMeta("Estado"),
        getMeta("Actor"),
        fmtDateTime(row.created_at),
      ];
    default:
      return [
        safeText(row.title),
        safeText(row.subtitle),
        fmtDateTime(row.created_at),
      ];
  }
}

// ─── MODULE STATS (KPIs + chart config) ───────────────────────
function getModuleStats(moduleKey, rows, timeline, report) {
  const sorted = [...(timeline || [])].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const getMeta = (row, label) => {
    const m = (row.meta || []).find((m) => m.label === label);
    return m != null ? m.value : null;
  };

  switch (moduleKey) {
    case "inventory_products": {
      const totalStock = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const lowCount = rows.filter(
        (r) => String(getMeta(r, "Stock bajo") ?? "") === "Sí"
      ).length;
      const netChange = sorted.reduce((acc, p) => acc + Number(p.delta ?? 0), 0);
      return {
        kpis: [
          { label: "Stock total actual", value: String(totalStock), delta: totalStock, bg: "#edf5ff", accent: COMPANY.navy },
          { label: "Artículos bajo mínimo", value: String(lowCount), delta: -lowCount, bg: lowCount > 0 ? "#fff7ed" : "#f0fdf4", accent: lowCount > 0 ? "#d97706" : "#16a34a" },
          { label: "Variación neta del período", value: netChange >= 0 ? `+${netChange}` : String(netChange), delta: netChange, bg: netChange >= 0 ? "#f0fdf4" : "#fef2f2", accent: netChange >= 0 ? "#16a34a" : "#dc2626" },
        ],
        chartTitle: "EVOLUCIÓN DE STOCK EN EL PERÍODO",
        lineOptions: { color: COMPANY.navy, valueKey: "delta", label: "Δ Stock (unidades)" },
      };
    }
    case "inventory_movements": {
      const totalIn = sorted.reduce((acc, p) => acc + Number(p.qty_in ?? 0), 0);
      const totalOut = sorted.reduce((acc, p) => acc + Number(p.qty_out ?? 0), 0);
      const net = totalIn - totalOut;
      return {
        kpis: [
          { label: "Total entradas", value: String(totalIn), delta: totalIn, bg: "#f0fdf4", accent: "#16a34a" },
          { label: "Total salidas", value: String(totalOut), delta: -totalOut, bg: "#fef2f2", accent: "#dc2626" },
          { label: "Balance neto", value: net >= 0 ? `+${net}` : String(net), delta: net, bg: net >= 0 ? "#f0fdf4" : "#fef2f2", accent: net >= 0 ? "#16a34a" : "#dc2626" },
        ],
        chartTitle: "ENTRADAS vs SALIDAS EN EL PERÍODO",
        lineOptions: { color: "#16a34a", color2: "#dc2626", valueKey: "qty_in", valueKey2: "qty_out", label: "Entradas", label2: "Salidas" },
      };
    }
    case "invoices": {
      const totalAmount = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const peak = sorted.length > 0 ? Math.max(...sorted.map((p) => Number(p.amount || 0))) : 0;
      const firstVal = sorted.length > 0 ? Number(sorted[0].amount || 0) : 0;
      const lastVal = sorted.length > 0 ? Number(sorted[sorted.length - 1].amount || 0) : 0;
      const trendDelta = lastVal - firstVal;
      return {
        kpis: [
          { label: "Total facturado", value: fmtCur(totalAmount), delta: totalAmount, bg: "#e8fffb", accent: COMPANY.teal },
          { label: "Pico de facturación", value: fmtCur(peak), delta: 1, bg: "#fff7ed", accent: "#d97706" },
          { label: "Tendencia (último vs primero)", value: trendDelta >= 0 ? `+${fmtCur(trendDelta)}` : fmtCur(trendDelta), delta: trendDelta, bg: trendDelta >= 0 ? "#f0fdf4" : "#fef2f2", accent: trendDelta >= 0 ? "#16a34a" : "#dc2626" },
        ],
        chartTitle: "TENDENCIA DE FACTURACIÓN EN EL PERÍODO",
        lineOptions: { color: COMPANY.teal, valueKey: "amount", label: "Facturado $" },
      };
    }
    case "quotes": {
      const totalAmount = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const approved = rows.filter((r) => getMeta(r, "Estado") === "Aprobada").length;
      const peak = sorted.length > 0 ? Math.max(...sorted.map((p) => Number(p.amount || 0))) : 0;
      return {
        kpis: [
          { label: "Monto total cotizado", value: fmtCur(totalAmount), delta: totalAmount, bg: "#edf5ff", accent: COMPANY.navy },
          { label: "Aprobadas", value: String(approved), delta: approved, bg: "#f0fdf4", accent: "#16a34a" },
          { label: "Pico de cotización", value: fmtCur(peak), delta: 1, bg: "#fff7ed", accent: "#d97706" },
        ],
        chartTitle: "TENDENCIA DE COTIZACIONES EN EL PERÍODO",
        lineOptions: { color: "#7c3aed", valueKey: "amount", label: "Cotizado $" },
      };
    }
    case "clients": {
      const totalSpent = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const withInvoices = rows.filter((r) => Number(getMeta(r, "Facturas") ?? 0) > 0).length;
      const convRate = Number(report?.clients?.conversion_rate || 0);
      return {
        kpis: [
          { label: "Total facturado a clientes", value: fmtCur(totalSpent), delta: totalSpent, bg: "#edf5ff", accent: COMPANY.navy },
          { label: "Clientes con facturas", value: `${withInvoices} / ${rows.length}`, delta: withInvoices, bg: "#f0fdf4", accent: "#16a34a" },
          { label: "Tasa de conversión", value: `${convRate}%`, delta: convRate >= 50 ? 1 : -1, bg: convRate >= 50 ? "#f0fdf4" : "#fff7ed", accent: convRate >= 50 ? "#16a34a" : "#d97706" },
        ],
        chartTitle: "TENDENCIA DE FACTURACIÓN (VENTAS DEL PERÍODO)",
        lineOptions: { color: "#2563eb", valueKey: "amount", label: "Facturado $" },
      };
    }
    case "operations": {
      const completed = rows.filter((r) => getMeta(r, "Estado") === "Completada").length;
      const incidents = rows.filter((r) => getMeta(r, "Estado") === "Incidencia").length;
      const rate = rows.length > 0 ? ((completed / rows.length) * 100).toFixed(1) + "%" : "—";
      const opsByDay = {};
      rows.forEach((r) => {
        const day = String(r.created_at || "").slice(0, 10);
        if (day) opsByDay[day] = (opsByDay[day] || 0) + 1;
      });
      const builtTimeline = Object.entries(opsByDay)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        kpis: [
          { label: "Completadas", value: String(completed), delta: completed, bg: "#f0fdf4", accent: "#16a34a" },
          { label: "Con incidencia", value: String(incidents), delta: -incidents, bg: incidents > 0 ? "#fef2f2" : "#f8fafc", accent: incidents > 0 ? "#dc2626" : "#64748b" },
          { label: "Tasa de éxito", value: rate, delta: completed >= incidents ? 1 : -1, bg: "#edf5ff", accent: COMPANY.navy },
        ],
        chartTitle: "OPERACIONES POR DÍA EN EL PERÍODO",
        lineOptions: { color: "#4f46e5", valueKey: "amount", label: "Operaciones" },
        builtTimeline,
      };
    }
    default:
      return { kpis: [], chartTitle: "TENDENCIA DEL PERÍODO", lineOptions: { color: COMPANY.teal, valueKey: "amount" } };
  }
}

function groupRowsForModule(moduleKey, rows = []) {
  const map = new Map();

  rows.forEach((row) => {
    let groupKey = "General";
    let groupLabel = "General";

    if (moduleKey === "inventory" || moduleKey === "inventory_movements") {
      const actorMeta = (row.meta || []).find((m) => m.label === "Actor");
      groupKey = actorMeta?.value || "Sin actor";
      groupLabel = `Responsable: ${actorMeta?.value || "Sin actor"}`;
    } else if (moduleKey === "inventory_products") {
      const lowMeta = (row.meta || []).find((m) => m.label === "Stock bajo");
      const isLow = String(lowMeta?.value ?? "") === "Sí";
      groupKey = isLow ? "bajo_minimo" : "en_stock";
      groupLabel = isLow ? "⚠ Artículos bajo mínimo" : "✓ Artículos en stock normal";
    } else if (moduleKey === "quotes" || moduleKey === "invoices") {
      groupKey = safeText(row.subtitle, "Sin cliente");
      groupLabel = `Cliente / referencia: ${safeText(row.subtitle, "Sin cliente")}`;
    } else if (moduleKey === "clients") {
      const companyMeta = (row.meta || []).find((m) => m.label === "Empresa");
      groupKey = companyMeta?.value || "Sin empresa";
      groupLabel = `Empresa: ${companyMeta?.value || "Sin empresa"}`;
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
      map.set(groupKey, { label: groupLabel, rows: [] });
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
// ─── TREND ICON (barras + flecha curva) ───────────────────────
function drawTrendIcon(doc, x, y, size = 28, direction = "up") {
  const isUp = direction === "up";
  const color = isUp ? "#16a34a" : "#dc2626";
  const barCount = 5;
  const barW = size * 0.11;
  const barGap = size * 0.045;
  const maxBarH = size * 0.62;
  const baseY = y + size * 0.78;

  // Dibujar barras
  for (let i = 0; i < barCount; i++) {
    const ratio = isUp
      ? (i + 1) / barCount
      : 1 - i / barCount;
    const bH = Math.max(size * 0.12, maxBarH * ratio);
    const bX = x + i * (barW + barGap);
    const bY = baseY - bH;

    doc.rect(bX, bY, barW, bH).fill("#0f172a");
  }

  // Dibujar flecha curva
  const arrowStartX = x;
  const arrowStartY = isUp ? baseY - maxBarH * 0.18 : baseY - maxBarH * 0.88;
  const arrowEndX = x + (barCount - 1) * (barW + barGap) + barW;
  const arrowEndY = isUp ? baseY - maxBarH * 0.96 : baseY - maxBarH * 0.12;

  const cpX = (arrowStartX + arrowEndX) / 2;
  const cpY = isUp
    ? baseY - maxBarH * 0.3
    : baseY - maxBarH * 0.7;

  doc.save();
  doc.moveTo(arrowStartX, arrowStartY)
    .quadraticCurveTo(cpX, cpY, arrowEndX, arrowEndY)
    .lineWidth(size * 0.09)
    .strokeColor(color)
    .stroke();

  // Cabeza de flecha
  const headSize = size * 0.14;
  const angle = isUp ? -Math.PI / 4 : Math.PI / 4;

  const hx1 = arrowEndX + Math.cos(angle + Math.PI * 0.6) * headSize;
  const hy1 = arrowEndY + Math.sin(angle + Math.PI * 0.6) * headSize;
  const hx2 = arrowEndX + Math.cos(angle - Math.PI * 0.6) * headSize;
  const hy2 = arrowEndY + Math.sin(angle - Math.PI * 0.6) * headSize;

  doc.moveTo(hx1, hy1)
    .lineTo(arrowEndX, arrowEndY)
    .lineTo(hx2, hy2)
    .lineWidth(size * 0.09)
    .lineJoin("round")
    .strokeColor(color)
    .stroke();

  doc.restore();
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
async function drawModuleDetailPage(doc, report, moduleKey, title, rows, sectionIndex = 1, timeline = []) {
  doc.addPage();

  const frame = drawEnterpriseFrame(
    doc,
    report,
    "REPORTES GENERALES",
    `${title} - Sección #${sectionIndex}`
  );

  const leftX = frame.left;
  const fullW = frame.contentWidth;
  let y = frame.contentTop;

  // ── SECCIÓN TÍTULO ─────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a")
    .text("DETALLE OPERATIVO", leftX, y);
  y += 18;

  // ── TABLA CON COLUMNAS POR MÓDULO ──────────────────────────────
  const tblCfg = getModuleTableConfig(moduleKey);
  const cols = tblCfg.cols;
  const headers = tblCfg.headers;
  const HEADER_H = 16;

  doc.rect(leftX, y, fullW, HEADER_H).fill("#17324D");
  let hx = leftX;
  headers.forEach((head, i) => {
    doc.font("Helvetica-Bold").fontSize(6.6).fillColor("#ffffff")
      .text(head, hx + 4, y + 5, { width: (cols[i] || 80) - 8 });
    hx += cols[i] || 80;
  });
  y += HEADER_H;

  const tableStartY = y - HEADER_H;

  const normalizedKey =
    moduleKey === "inventory_products" || moduleKey === "inventory_movements"
      ? moduleKey
      : moduleKey;
  const grouped = groupRowsForModule(normalizedKey, rows);
  const flatRows = grouped.flatMap((group) => [
    { __group: true, label: group.label },
    ...group.rows,
  ]);
  const visibleRows = flatRows.slice(0, 12);

  visibleRows.forEach((row, idx) => {
    const rowH = row.__group ? 15 : 18;
    const bg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";

    doc.rect(leftX, y, fullW, rowH).fill(bg);
    doc.rect(leftX, y + rowH - 0.4, fullW, 0.4).fill("#e2e8f0");

    if (row.__group) {
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#0ea5a0")
        .text(row.label, leftX + 8, y + 4, { width: fullW - 16 });
    } else {
      const cellValues = getModuleRowCells(moduleKey, row);
      let cx = leftX;
      cellValues.forEach((val, i) => {
        const isLast = i === cellValues.length - 1;
        doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(6.8)
          .fillColor(i === 0 ? "#0f172a" : "#475569")
          .text(String(val ?? "—"), cx + 4, y + 5, {
            width: (cols[i] || 80) - 8,
            align: isLast ? "right" : "left",
            ellipsis: true,
          });
        cx += cols[i] || 80;
      });
    }

    y += rowH;
  });

  doc.rect(leftX, tableStartY, fullW, y - tableStartY)
    .lineWidth(0.5)
    .strokeColor("#dbe4ee")
    .stroke();

  y += 12;

  // ── PANORAMA STRIP ─────────────────────────────────────────────
  doc.rect(leftX, y, fullW, 16).fill("#17324D");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff")
    .text("PANORAMA DEL MÓDULO", leftX + 8, y + 4, { width: fullW - 16 });
  y += 20;

  // ── Stats y timeline efectiva ──────────────────────────────────
  const moduleStats = getModuleStats(moduleKey, rows, timeline, report);
  const effectiveTimeline =
    timeline && timeline.length > 1
      ? timeline
      : moduleStats.builtTimeline || [];

  // ── Constantes de layout ───────────────────────────────────────
  const metricsW = 196;
  const gapM = 12;
  const donutSize = 108;
  const legendGap = 8;
  const donutAreaW = donutSize + legendGap + 96; // 212
  const kpiGap = 10;
  const kpiColW = fullW - metricsW - gapM - donutAreaW - kpiGap; // ~126
  const panoramaY = y;

  // ── Cajas de métricas (columna izquierda) ──────────────────────
  const boxH = 54;
  const boxGap = 8;

  doc.rect(leftX, panoramaY, metricsW, boxH).fill("#edf5ff");
  doc.rect(leftX, panoramaY, metricsW, 14).fill("#17324D");
  doc.font("Helvetica-Bold").fontSize(6.2).fillColor("#ffffff")
    .text("REGISTROS CONSIDERADOS", leftX + 4, panoramaY + 4, {
      width: metricsW - 8,
      align: "center",
    });
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#17324D")
    .text(String(rows.length), leftX + 4, panoramaY + 17, {
      width: metricsW - 8,
      align: "center",
    });
  doc.font("Helvetica").fontSize(6.2).fillColor("#64748b")
    .text("Total de registros en este bloque", leftX + 8, panoramaY + 44, {
      width: metricsW - 16,
      align: "center",
    });

  const box2Y = panoramaY + boxH + boxGap;
  const totalAmount = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  doc.rect(leftX, box2Y, metricsW, boxH).fill("#e8fffb");
  doc.rect(leftX, box2Y, metricsW, 14).fill(COMPANY.teal);
  doc.font("Helvetica-Bold").fontSize(6.2).fillColor("#ffffff")
    .text("MONTO ACUMULADO", leftX + 4, box2Y + 4, {
      width: metricsW - 8,
      align: "center",
    });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COMPANY.teal)
    .text(fmtCur(totalAmount), leftX + 4, box2Y + 18, {
      width: metricsW - 8,
      align: "center",
    });
  doc.font("Helvetica").fontSize(6.2).fillColor("#64748b")
    .text("Suma económica del bloque", leftX + 8, box2Y + 44, {
      width: metricsW - 16,
      align: "center",
    });

  // ── Gráfica de dona + leyenda (columna central) ────────────────
  const donutX = leftX + metricsW + gapM;
  const legendX = donutX + donutSize + legendGap;
  const legendItemW = donutAreaW - donutSize - legendGap;
  const legendItems = buildEnterpriseLegend(rows);

  doc.font("Helvetica-Bold").fontSize(7.2).fillColor("#0f172a")
    .text(`${title} · distribución`, donutX, panoramaY - 2, {
      width: donutAreaW,
      align: "center",
    });

  if (legendItems.length > 0) {
    const chartBuffer = await renderEnterpriseChart(rows);
    doc.image(chartBuffer, donutX + 4, panoramaY + 4, {
      width: donutSize,
      height: donutSize,
    });
  } else {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b")
      .text("Sin datos para graficar", donutX, panoramaY + 46, {
        width: donutSize,
        align: "center",
      });
  }

  let legY = panoramaY + 10;
  legendItems.forEach((item) => {
    doc.rect(legendX, legY + 2, 6, 6).fill(item.color);
    doc.font("Helvetica").fontSize(6.8).fillColor("#334155")
      .text(item.label, legendX + 9, legY, {
        width: legendItemW - 9,
        ellipsis: true,
      });
    legY += 14;
  });

  // ── KPIs del módulo (columna derecha) ──────────────────────────
  if (kpiColW > 80 && moduleStats.kpis && moduleStats.kpis.length > 0) {
    const kpiX = donutX + donutAreaW + kpiGap;
    let ky = panoramaY;

    moduleStats.kpis.forEach((kpi) => {
      const kBoxH = 36;
      doc.rect(kpiX, ky, kpiColW, kBoxH).fill(kpi.bg || "#f8fafc");
      doc.rect(kpiX, ky, kpiColW, 12).fill(kpi.accent || "#17324D");
      doc.font("Helvetica-Bold").fontSize(5.4).fillColor("#ffffff")
        .text(kpi.label.toUpperCase(), kpiX + 3, ky + 3, {
          width: kpiColW - 6,
          align: "center",
        });

doc.font("Helvetica-Bold").fontSize(8.5).fillColor(kpi.accent || "#17324D")
        .text(String(kpi.value), kpiX + 3, ky + 14, {
          width: kpiColW - 32,
          align: "left",
        });

      if (kpi.delta !== 0) {
        drawTrendIcon(
          doc,
          kpiX + kpiColW - 28,
          ky + 10,
          20,
          kpi.delta > 0 ? "up" : "down"
        );
      }

      ky += kBoxH + 4;
    });
  }

  const leftColH = boxH + boxGap + boxH; // ~116
  y = panoramaY + Math.max(leftColH, donutSize + 10) + 10;

  // ── Gráfica de líneas del período ──────────────────────────────
  if (effectiveTimeline.length > 1) {
    const lineH = 86;

    doc.rect(leftX, y, fullW, 14).fill("#0f172a");
    doc.font("Helvetica-Bold").fontSize(6.8).fillColor("#ffffff")
      .text(
        moduleStats.chartTitle || "TENDENCIA DEL PERÍODO",
        leftX + 8,
        y + 4,
        { width: fullW - 16 }
      );
    y += 14;

    try {
      const lineBuf = await renderLineChart(
        effectiveTimeline,
        moduleStats.lineOptions || {}
      );
      if (lineBuf) {
        doc.image(lineBuf, leftX, y, { width: fullW, height: lineH });
        y += lineH + 6;
      }
    } catch (_e) {
      doc.font("Helvetica").fontSize(8).fillColor("#64748b")
        .text(
          "Sin datos suficientes para mostrar la tendencia.",
          leftX,
          y + 30,
          { width: fullW, align: "center" }
        );
      y += lineH + 6;
    }
  }

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
  { label: "Artículos en inventario",    value: Number(report?.inventory?.products_count || 0), accent: NAVY,  bg: "FFEDF5FF" },
  { label: "Movimientos de inventario",  value: Number(report?.inventory?.movements_count || 0), accent: AMBER, bg: "FFFFF4E5" },
  { label: "Servicios registrados",      value: Number(report?.operations?.count || 0), accent: TEAL,  bg: "FFE8FFFB" },
  { label: "Clientes nuevos",            value: Number(report?.clients?.new_count || 0), accent: NAVY,  bg: "FFEDF5FF" },
  { label: "Clientes facturados",        value: Number(report?.clients?.invoiced_count || 0), accent: GREEN, bg: "FFEAFBF0" },
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

  const colDefs = (() => {
    switch (moduleKey) {
      case "inventory_products":
        return [
          { header: "Producto", key: "title", width: 32 },
          { header: "SKU", key: "subtitle", width: 18 },
          { header: "Stock Actual", key: "stock", width: 14 },
          { header: "Stock Mínimo", key: "stock_min", width: 14 },
          { header: "Bajo Mínimo", key: "low_stock", width: 14 },
          { header: "Unidad", key: "unit", width: 12 },
          { header: "Fecha de Alta", key: "created_at", width: 24 },
        ];
      case "inventory_movements":
        return [
          { header: "Tipo", key: "type", width: 14 },
          { header: "Motivo", key: "subtitle", width: 28 },
          { header: "Cantidad Total", key: "amount", width: 14 },
          { header: "Núm. Productos", key: "products", width: 16 },
          { header: "Actor", key: "actor", width: 24 },
          { header: "Detalle", key: "detail", width: 48 },
          { header: "Fecha / Hora", key: "created_at", width: 24 },
        ];
      case "invoices":
        return [
          { header: "Folio", key: "title", width: 14 },
          { header: "Cliente", key: "subtitle", width: 28 },
          { header: "Ubicación", key: "location", width: 24 },
          { header: "Período", key: "period", width: 18 },
          { header: "Conceptos", key: "concepts", width: 48 },
          { header: "Estado", key: "status", width: 14 },
          { header: "Actor", key: "actor", width: 24 },
          { header: "Monto", key: "amount", width: 16 },
          { header: "Fecha / Hora", key: "created_at", width: 24 },
        ];
      case "quotes":
        return [
          { header: "Folio", key: "title", width: 14 },
          { header: "Título", key: "subtitle", width: 28 },
          { header: "Conceptos", key: "concepts", width: 48 },
          { header: "Estado", key: "status", width: 14 },
          { header: "Actor", key: "actor", width: 24 },
          { header: "Monto", key: "amount", width: 16 },
          { header: "Fecha / Hora", key: "created_at", width: 24 },
        ];
      case "clients":
        return [
          { header: "Cliente", key: "title", width: 28 },
          { header: "Empresa", key: "company", width: 24 },
          { header: "RFC", key: "rfc", width: 16 },
          { header: "Email", key: "email", width: 28 },
          { header: "Teléfono", key: "phone", width: 16 },
          { header: "Facturas Emitidas", key: "invoices_count", width: 18 },
          { header: "Folios de Facturas", key: "folios", width: 30 },
          { header: "Productos / Servicios Adquiridos", key: "products", width: 48 },
          { header: "Total Gastado", key: "amount", width: 16 },
          { header: "Alta", key: "created_at", width: 24 },
        ];
      case "operations":
        return [
          { header: "Operación", key: "title", width: 32 },
          { header: "Cliente", key: "subtitle", width: 26 },
          { header: "Estado", key: "status", width: 16 },
          { header: "Actor", key: "actor", width: 24 },
          { header: "Fecha / Hora", key: "created_at", width: 24 },
        ];
      default:
        return [
          { header: "Título", key: "title", width: 30 },
          { header: "Detalle", key: "subtitle", width: 38 },
          { header: "Fecha / Hora", key: "created_at", width: 24 },
          { header: "Meta 1", key: "meta1", width: 20 },
          { header: "Meta 2", key: "meta2", width: 20 },
          { header: "Monto", key: "amount", width: 18 },
        ];
    }
  })();

  ws.columns = colDefs;

  ws.getRow(1).height = 18;
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } };
  ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };

  if (!Array.isArray(rows) || rows.length === 0) {
    const lastCol = String.fromCharCode(64 + colDefs.length);
    ws.mergeCells(`A2:${lastCol}2`);
    ws.getCell("A2").value = "Sin registros en el período";
    ws.getCell("A2").font = { bold: true, size: 11, color: { argb: "FF64748B" } };
    ws.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 28;
    ws.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    return;
  }

  const gm = (row, label) => {
    const m = (row.meta || []).find((m) => m.label === label);
    return m != null ? String(m.value ?? "") : "";
  };

  rows.forEach((r) => {
    let rowData = {};
    switch (moduleKey) {
      case "inventory_products":
        rowData = {
          title: r.title || "",
          subtitle: r.subtitle || "",
          stock: Number(r.amount || 0),
          stock_min: Number(gm(r, "Stock mínimo") || 0),
          low_stock: gm(r, "Stock bajo") === "Sí" ? "⚠ Bajo mínimo" : "✓ OK",
          unit: gm(r, "Unidad"),
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
        };
        break;
      case "inventory_movements":
        rowData = {
          type: gm(r, "Tipo"),
          subtitle: r.subtitle || "",
          amount: Number(r.amount || 0),
          products: gm(r, "Productos"),
          actor: gm(r, "Actor"),
          detail: gm(r, "Detalle"),
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
        };
        break;
      case "invoices":
        rowData = {
          title: r.title || "",
          subtitle: r.subtitle || "",
          location: gm(r, "Ubicación"),
          period: gm(r, "Periodo"),
          concepts: gm(r, "Conceptos"),
          status: gm(r, "Estado"),
          actor: gm(r, "Actor"),
          amount: Number(r.amount || 0),
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
        };
        break;
      case "quotes":
        rowData = {
          title: r.title || "",
          subtitle: r.subtitle || "",
          concepts: gm(r, "Conceptos"),
          status: gm(r, "Estado"),
          actor: gm(r, "Actor"),
          amount: Number(r.amount || 0),
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
        };
        break;
      case "clients":
        rowData = {
          title: r.title || "",
          company: gm(r, "Empresa"),
          rfc: gm(r, "RFC"),
          email: gm(r, "Email"),
          phone: gm(r, "Teléfono"),
          invoices_count: gm(r, "Facturas"),
          folios: gm(r, "Folios"),
          products: gm(r, "Productos / servicios"),
          amount: Number(gm(r, "Total gastado") || r.amount || 0),
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
        };
        break;
      case "operations":
        rowData = {
          title: r.title || "",
          subtitle: r.subtitle || "",
          status: gm(r, "Estado"),
          actor: gm(r, "Actor"),
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
        };
        break;
      default: {
        const meta = Array.isArray(r.meta) ? r.meta : [];
        rowData = {
          title: r.title || "",
          subtitle: r.subtitle || "",
          created_at: r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "",
          meta1: meta[0] ? `${meta[0].label}: ${meta[0].value}` : "",
          meta2: meta[1] ? `${meta[1].label}: ${meta[1].value}` : "",
          amount: Number(r.amount || 0),
        };
      }
    }
    ws.addRow(rowData);
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 18;
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      cell.alignment = { vertical: "middle", wrapText: false };
      cell.font = { size: 9, color: { argb: "FF0F172A" } };
    });
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });

  const amountIdx = colDefs.findIndex((c) => c.key === "amount");
  if (amountIdx >= 0) ws.getColumn(amountIdx + 1).numFmt = '"$"#,##0.00';
  const stockIdx = colDefs.findIndex((c) => c.key === "stock");
  if (stockIdx >= 0) ws.getColumn(stockIdx + 1).numFmt = "#,##0";
}

addDetailSheet("Inventario Productos", "inventory_products", report.inventory.products_rows || []);
addDetailSheet("Inventario Movimientos", "inventory_movements", report.inventory.movements_rows || []);
addDetailSheet("Cotizaciones", "quotes", report.quotes.recent_rows || []);
addDetailSheet("Facturación", "invoices", report.invoices.recent_rows || []);
addDetailSheet("Clientes", "clients", report.clients.recent_rows || []);
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
        { label: "Clientes registrados",     value: Number(report?.clients?.count || 0), color: "#0F4C81" },
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
    "inventory_products",
    "INVENTARIO",
    report.inventory.products_rows || [],
    1,
    report.inventory.stock_timeline || []
  );
}

if ((report.inventory.movements_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "inventory_movements",
    "INVENTARIO",
    report.inventory.movements_rows || [],
    2,
    report.inventory.movement_timeline || []
  );
}

if ((report.quotes.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "quotes",
    "COTIZACIONES",
    report.quotes.recent_rows || [],
    1,
    report.quotes.trend || []
  );
}

if ((report.invoices.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "invoices",
    "FACTURACIÓN",
    report.invoices.recent_rows || [],
    1,
    report.invoices.trend || []
  );
}

if ((report.clients.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "clients",
    "CLIENTES",
    report.clients.recent_rows || [],
    1,
    report.invoices.trend || []
  );
}

if ((report.operations.recent_rows || []).length > 0) {
  await drawModuleDetailPage(
    doc,
    report,
    "operations",
    "OPERACIONES",
    report.operations.recent_rows || [],
    1,
    []
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
    <Clientes>${Number(report?.clients?.count || 0)}</Clientes>
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
  Incidencias="${Number(report?.operations?.incident_count || 0)}"
/>

<Clientes
  Cantidad="${Number(report?.clients?.count || 0)}"
/>

  <Indicadores>
<Detalle>
  ${(report.inventory.products_rows || []).map(r => {
    const gm = (label) => escXml(String((r.meta || []).find(m => m.label === label)?.value ?? ""));
    return `
    <InventarioProducto
      nombre="${escXml(r.title)}"
      sku="${escXml(r.subtitle)}"
      stockActual="${Number(r.amount || 0)}"
      stockMinimo="${gm("Stock mínimo")}"
      bajominimo="${gm("Stock bajo")}"
      unidad="${gm("Unidad")}"
      fecha="${escXml(r.created_at || "")}" />`;
  }).join("")}

  ${(report.inventory.movements_rows || []).map(r => {
    const gm = (label) => escXml(String((r.meta || []).find(m => m.label === label)?.value ?? ""));
    return `
    <InventarioMovimiento
      titulo="${escXml(r.title)}"
      motivo="${escXml(r.subtitle)}"
      tipo="${gm("Tipo")}"
      cantidad="${gm("Cantidad")}"
      numProductos="${gm("Productos")}"
      actor="${gm("Actor")}"
      detalle="${gm("Detalle")}"
      fecha="${escXml(r.created_at || "")}" />`;
  }).join("")}

  ${(report.quotes.recent_rows || []).map(r => {
    const gm = (label) => escXml(String((r.meta || []).find(m => m.label === label)?.value ?? ""));
    return `
    <Cotizacion
      folio="${escXml(r.title)}"
      titulo="${escXml(r.subtitle)}"
      estado="${gm("Estado")}"
      actor="${gm("Actor")}"
      conceptos="${gm("Conceptos")}"
      monto="${Number(r.amount || 0).toFixed(2)}"
      fecha="${escXml(r.created_at || "")}" />`;
  }).join("")}

  ${(report.invoices.recent_rows || []).map(r => {
    const gm = (label) => escXml(String((r.meta || []).find(m => m.label === label)?.value ?? ""));
    return `
    <Factura
      folio="${escXml(r.title)}"
      cliente="${escXml(r.subtitle)}"
      estado="${gm("Estado")}"
      actor="${gm("Actor")}"
      ubicacion="${gm("Ubicación")}"
      periodo="${gm("Periodo")}"
      conceptos="${gm("Conceptos")}"
      monto="${Number(r.amount || 0).toFixed(2)}"
      fecha="${escXml(r.created_at || "")}" />`;
  }).join("")}

  ${(report.clients.recent_rows || []).map(r => {
    const gm = (label) => escXml(String((r.meta || []).find(m => m.label === label)?.value ?? ""));
    return `
    <Cliente
      nombre="${escXml(r.title)}"
      empresa="${gm("Empresa")}"
      rfc="${gm("RFC")}"
      email="${gm("Email")}"
      telefono="${gm("Teléfono")}"
      facturasEmitidas="${gm("Facturas")}"
      foliosFacturas="${gm("Folios")}"
      productosAdquiridos="${gm("Productos / servicios")}"
      totalGastado="${gm("Total gastado")}"
      fecha="${escXml(r.created_at || "")}" />`;
  }).join("")}

  ${(report.operations.recent_rows || []).map(r => {
    const gm = (label) => escXml(String((r.meta || []).find(m => m.label === label)?.value ?? ""));
    return `
    <Operacion
      titulo="${escXml(r.title)}"
      cliente="${escXml(r.subtitle)}"
      estado="${gm("Estado")}"
      actor="${gm("Actor")}"
      fecha="${escXml(r.created_at || "")}" />`;
  }).join("")}
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