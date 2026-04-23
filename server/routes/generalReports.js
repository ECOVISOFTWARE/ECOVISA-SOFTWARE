const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");
const {
  generateGeneralReportExcel,
  generateGeneralReportPDF,
  generateGeneralReportXML,
} = require("../utils/generalReportsExport");

function safeDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function buildPeriodLabel(dateFrom, dateTo) {
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `Desde ${dateFrom}`;
  if (dateTo) return `Hasta ${dateTo}`;
  return "General";
}

function buildPeriodKey(dateFrom, dateTo) {
  if (dateFrom && dateTo) {
    return `${dateFrom}_A_${dateTo}`;
  }
  if (dateFrom) return `DESDE_${dateFrom}`;
  if (dateTo) return `HASTA_${dateTo}`;
  return "GENERAL";
}
function humanizeStatus(status, moduleKey = "") {
  const normalized = String(status || "").trim().toLowerCase();

  const commonMap = {
    draft: "Borrador",
    pending: "Pendiente",
    issued: "Emitida",
    paid: "Pagada",
    cancelled: "Cancelada",
    rejected: "Rechazada",
    approved: "Aprobada",
    invoiced: "Facturada",
    completed: "Completada",
    incident: "Incidencia",
    scheduled: "Programada",
    preparing: "Preparando",
    on_way: "En camino",
    on_site: "En sitio",
    loading: "Cargando",
    unloading: "Descargando",
    active: "Activo",
    inactive: "Inactivo",
  };

  const quotesMap = {
    draft: "Borrador",
    pending: "En espera",
    sent: "Enviada",
    approved: "Aprobada",
    invoiced: "Facturada",
    rejected: "Rechazada",
    paid: "Pagada",
    cancelled: "Cancelada",
  };

  const invoicesMap = {
    draft: "Borrador",
    pending: "Pendiente",
    issued: "Emitida",
    paid: "Pagada",
    cancelled: "Cancelada",
  };

  const operationsMap = {
    pending: "Pendiente",
    scheduled: "Programada",
    preparing: "Preparando",
    on_way: "En camino",
    on_site: "En sitio",
    loading: "Cargando",
    unloading: "Descargando",
    completed: "Completada",
    incident: "Incidencia",
    cancelled: "Cancelada",
  };

  const moduleMap =
    moduleKey === "quotes"
      ? quotesMap
      : moduleKey === "invoices"
      ? invoicesMap
      : moduleKey === "operations"
      ? operationsMap
      : commonMap;

  return moduleMap[normalized] || commonMap[normalized] || status || "Sin estado";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
async function generateReportFolio(date_from, date_to) {
  const periodKey = buildPeriodKey(date_from, date_to);

  const { data, error } = await supabaseAdmin
    .from("activity_log")
    .select("meta, created_at")
    .eq("module_key", "general_reports")
    .eq("action", "EXPORT_GENERATED")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  const samePeriodRows = rows.filter(
    (row) => String(row?.meta?.period || "") === periodKey
  );

  const lastNumber = samePeriodRows.reduce((max, row) => {
    const folio = String(row?.meta?.folio || "");
    const match = folio.match(/-(\d{4})$/);
    const num = match ? Number(match[1]) : 0;
    return num > max ? num : max;
  }, 0);

  const next = lastNumber + 1;

  return `RPT-${periodKey}-${String(next).padStart(4, "0")}`;
}

async function logReportExport({ folio, period, format }) {
  await supabaseAdmin.from("activity_log").insert({
    module_key: "general_reports",
    action: "EXPORT_GENERATED",
    meta: {
      folio,
      period,
      format,
    },
  });
}

async function buildGeneralSummary(date_from, date_to, options = {}) {
  const fromIso = safeDate(date_from);
  const toIso = safeDate(date_to);

let quotesQuery = supabaseAdmin
  .from("quotes")
  .select("id, folio, title, total, status, created_at, created_by, client_id")
  .not("status", "in", '("invoiced","cancelled")');

let invoicesQuery = supabaseAdmin
  .from("invoices")
  .select("id, folio, client_name, service_location, total, status, created_at, created_by, client_id, billing_period");

let operationsQuery = supabaseAdmin
  .from("operations")
  .select("id, title, client_name, status, scheduled_at, created_at, created_by");

let inventoryMovementsQuery = supabaseAdmin
  .from("inventory_movements")
  .select("id, type, reason, created_by, created_at", { count: "exact" });

let inventoryMovementItemsQuery = supabaseAdmin
  .from("inventory_movement_items")
  .select(`
    id,
    movement_id,
    product_id,
    qty,
    unit_cost,
    product:products(id, name, sku, unit, stock_min)
  `);

let productsQuery = supabaseAdmin
  .from("products")
  .select("id, sku, name, unit, stock_min, created_at", { count: "exact" })
  .eq("is_active", true);

let productStockQuery = supabaseAdmin
  .from("v_product_stock")
  .select("product_id, name, sku, unit, stock_min, stock, is_low_stock");

let clientsQuery = supabaseAdmin
  .from("clients")
  .select("id, name, company, rfc, email, phone, address, created_at, created_by", { count: "exact" });

let invoiceItemsQuery = supabaseAdmin
  .from("invoice_items")
  .select("id, invoice_id, description, qty, unit_price, amount");

let quoteItemsQuery = supabaseAdmin
  .from("quote_items")
  .select("id, quote_id, description, qty, unit_price, amount");
if (fromIso) {
  quotesQuery = quotesQuery.gte("created_at", fromIso);
  invoicesQuery = invoicesQuery.gte("created_at", fromIso);
  operationsQuery = operationsQuery.gte("created_at", fromIso);
  inventoryMovementsQuery = inventoryMovementsQuery.gte("created_at", fromIso);
  productsQuery = productsQuery.gte("created_at", fromIso);
  clientsQuery = clientsQuery.gte("created_at", fromIso);
}

if (toIso) {
  quotesQuery = quotesQuery.lte("created_at", toIso);
  invoicesQuery = invoicesQuery.lte("created_at", toIso);
  operationsQuery = operationsQuery.lte("created_at", toIso);
  inventoryMovementsQuery = inventoryMovementsQuery.lte("created_at", toIso);
  productsQuery = productsQuery.lte("created_at", toIso);
  clientsQuery = clientsQuery.lte("created_at", toIso);
}

const [
  quotesRes,
  invoicesRes,
  operationsRes,
  inventoryMovementsRes,
  inventoryMovementItemsRes,
  productsRes,
  productStockRes,
  clientsRes,
  invoiceItemsRes,
  quoteItemsRes,
] = await Promise.all([
  quotesQuery.order("created_at", { ascending: false }),
  invoicesQuery.order("created_at", { ascending: false }),
  operationsQuery.order("created_at", { ascending: false }),
  inventoryMovementsQuery.order("created_at", { ascending: false }),
  inventoryMovementItemsQuery,
  productsQuery.order("created_at", { ascending: false }),
  productStockQuery,
  clientsQuery.order("created_at", { ascending: false }),
  invoiceItemsQuery,
  quoteItemsQuery,
]);

if (quotesRes.error) throw quotesRes.error;
if (invoicesRes.error) throw invoicesRes.error;
if (operationsRes.error) throw operationsRes.error;
if (inventoryMovementsRes.error) throw inventoryMovementsRes.error;
if (inventoryMovementItemsRes.error) throw inventoryMovementItemsRes.error;
if (productsRes.error) throw productsRes.error;
if (productStockRes.error) throw productStockRes.error;
if (clientsRes.error) throw clientsRes.error;
if (invoiceItemsRes.error) {
  console.warn("invoice_items query error (tabla posiblemente inexistente):", invoiceItemsRes.error.message);
}
if (quoteItemsRes.error) {
  console.warn("quote_items query error:", quoteItemsRes.error.message);
}

const quotes = quotesRes.data || [];
const invoices = invoicesRes.data || [];
const operations = operationsRes.data || [];
const inventoryMovements = inventoryMovementsRes.data || [];
const inventoryMovementItems = inventoryMovementItemsRes.data || [];
const products = productsRes.data || [];
const productStocks = productStockRes.data || [];
const clients = clientsRes.data || [];
const invoiceItems = invoiceItemsRes.data || [];
const quoteItems = quoteItemsRes.data || [];

const inventoryMovementsCount = Number(inventoryMovementsRes.count || 0);
const productsCount = Number(productsRes.count || 0);
const clientsCount = Number(clientsRes.count || 0);

const workerIds = [
  ...new Set(
    [
      ...quotes.map((item) => item.created_by),
      ...invoices.map((item) => item.created_by),
      ...operations.map((item) => item.created_by),
      ...inventoryMovements.map((item) => item.created_by),
      ...clients.map((item) => item.created_by),
    ].filter(Boolean)
  ),
];
  let workersMap = {};

  if (workerIds.length > 0) {
    const { data: workersRows, error: workersError } = await supabaseAdmin
      .from("workers")
      .select("id, full_name, username")
      .in("id", workerIds);

    if (workersError) throw workersError;

    workersMap = (workersRows || []).reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }

const movementItemsMap = inventoryMovementItems.reduce((acc, item) => {
  const key = item.movement_id;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

const invoiceItemsMap = invoiceItems.reduce((acc, item) => {
  const key = item.invoice_id;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

const quoteItemsMap = quoteItems.reduce((acc, item) => {
  const key = item.quote_id;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

const productStockMap = productStocks.reduce((acc, row) => {
  acc[row.product_id] = row;
  return acc;
}, {});

const movementTimelineMap = {};
inventoryMovements.forEach((movement) => {
  const dayKey = String(movement.created_at || "").slice(0, 10);
  if (!dayKey) return;
  if (!movementTimelineMap[dayKey]) {
    movementTimelineMap[dayKey] = { in: 0, out: 0 };
  }

  const items = movementItemsMap[movement.id] || [];
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  if (movement.type === "IN") {
    movementTimelineMap[dayKey].in += totalQty;
  } else if (movement.type === "OUT") {
    movementTimelineMap[dayKey].out += totalQty;
  }
});

const stockTimelineMap = {};
inventoryMovements
  .slice()
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  .forEach((movement) => {
    const dayKey = String(movement.created_at || "").slice(0, 10);
    if (!dayKey) return;

    const items = movementItemsMap[movement.id] || [];
    const delta = items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      return sum + (movement.type === "IN" ? qty : -qty);
    }, 0);

    if (!stockTimelineMap[dayKey]) {
      stockTimelineMap[dayKey] = 0;
    }

    stockTimelineMap[dayKey] += delta;
  });

const quotedClientIds = [...new Set(quotes.map((item) => item.client_id).filter(Boolean))];

const invoicedClientKeys = new Set();

clients.forEach((client) => {
  const clientId = client?.id || null;
  const clientNameKey = normalizeText(client?.name);
  const clientCompanyKey = normalizeText(client?.company);

  const hasInvoice = invoices.some((invoice) => {
    if (clientId && invoice?.client_id === clientId) return true;

    if (invoice?.client_id) return false;

    const invoiceNameKey = normalizeText(invoice?.client_name);
    if (!invoiceNameKey) return false;

    return (
      invoiceNameKey === clientNameKey ||
      invoiceNameKey === clientCompanyKey
    );
  });

  if (hasInvoice && clientId) {
    invoicedClientKeys.add(clientId);
  }
});

const invoicedClientIds = [...invoicedClientKeys];

const clientConversionRate =
  quotedClientIds.length > 0
    ? Number(((invoicedClientIds.length / quotedClientIds.length) * 100).toFixed(1))
    : 0;

const salesTimelineMap = {};
invoices.forEach((invoice) => {
  const dayKey = String(invoice.created_at || "").slice(0, 10);
  if (!dayKey) return;
  if (!salesTimelineMap[dayKey]) {
    salesTimelineMap[dayKey] = 0;
  }
  salesTimelineMap[dayKey] += Number(invoice.total || 0);
});

const quotesTimelineMap = {};
quotes.forEach((quote) => {
  const dayKey = String(quote.created_at || "").slice(0, 10);
  if (!dayKey) return;
  if (!quotesTimelineMap[dayKey]) {
    quotesTimelineMap[dayKey] = 0;
  }
  quotesTimelineMap[dayKey] += Number(quote.total || 0);
});

const clientsSpendMap = {};
invoices.forEach((invoice) => {
  const invoiceNameKey = normalizeText(invoice?.client_name);
  clients.forEach((client) => {
    const clientId = client?.id || null;
    const clientNameKey = normalizeText(client?.name);
    const clientCompanyKey = normalizeText(client?.company);

    const matches =
      (clientId && invoice?.client_id === clientId) ||
      (!invoice?.client_id &&
        invoiceNameKey &&
        (invoiceNameKey === clientNameKey || invoiceNameKey === clientCompanyKey));

    if (!matches || !clientId) return;

    if (!clientsSpendMap[clientId]) {
      clientsSpendMap[clientId] = {
        totalSpent: 0,
        invoices: 0,
        folios: [],
        products: {},
      };
    }

    clientsSpendMap[clientId].totalSpent += Number(invoice.total || 0);
    clientsSpendMap[clientId].invoices += 1;
    if (invoice.folio) clientsSpendMap[clientId].folios.push(invoice.folio);

    (invoiceItemsMap[invoice.id] || []).forEach((item) => {
      const desc = String(item.description || "Concepto").trim();
      if (!clientsSpendMap[clientId].products[desc]) {
        clientsSpendMap[clientId].products[desc] = 0;
      }
      clientsSpendMap[clientId].products[desc] += Number(item.qty || 0);
    });
  });
});

  return {
    folio: options.folio || null,
    periodKey: buildPeriodKey(date_from, date_to),
    periodLabel: buildPeriodLabel(date_from, date_to),
    dateFrom: date_from || "",
    dateTo: date_to || "",
    inventory: {
      products_count: productsCount,
      movements_count: inventoryMovementsCount,
      stock_timeline: Object.entries(stockTimelineMap).map(([date, delta]) => ({
        date,
        delta,
      })),
      movement_timeline: Object.entries(movementTimelineMap).map(([date, row]) => ({
        date,
        qty_in: Number(row.in || 0),
        qty_out: Number(row.out || 0),
        net: Number(row.in || 0) - Number(row.out || 0),
      })),
      products_rows: products.slice(0, 12).map((item) => {
        const stockRow = productStockMap[item.id] || {};
        return {
          id: item.id,
          title: item.name || "Producto sin nombre",
          subtitle: item.sku ? `SKU: ${item.sku}` : "Sin SKU",
          amount: Number(stockRow.stock || 0),
          created_at: item.created_at,
          meta: [
            { label: "Tipo", value: "Producto activo" },
            { label: "Unidad", value: item.unit || "pz" },
            { label: "Stock actual", value: Number(stockRow.stock || 0) },
            { label: "Stock mínimo", value: Number(stockRow.stock_min || 0) },
            { label: "Stock bajo", value: stockRow.is_low_stock ? "Sí" : "No" },
            { label: "Alta", value: safeDate(item.created_at) ? new Date(item.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
          ],
        };
      }),
      movements_rows: inventoryMovements.slice(0, 12).map((movement) => {
        const items = movementItemsMap[movement.id] || [];
        const totalQty = items.reduce((acc, item) => acc + Number(item.qty || 0), 0);
        const actor = workersMap[movement.created_by];

        return {
          id: movement.id,
          title:
            movement.type === "IN"
              ? "Entrada de inventario"
              : movement.type === "OUT"
              ? "Salida de inventario"
              : "Movimiento de inventario",
          subtitle: movement.reason || "Sin motivo registrado",
          amount: totalQty,
          created_at: movement.created_at,
          meta: [
            { label: "Tipo", value: movement.type === "IN" ? "Entrada" : "Salida" },
            { label: "Cantidad", value: totalQty },
            { label: "Productos", value: items.length },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Hora", value: movement.created_at ? new Date(movement.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
            {
              label: "Detalle",
              value:
                items.length > 0
                  ? items
                      .slice(0, 4)
                      .map((item) => {
                        const productName = item.product?.name || "Producto";
                        return `${productName} (${Number(item.qty || 0)})`;
                      })
                      .join(" · ")
                  : "Sin partidas",
            },
          ],
        };
      }),
    },
    quotes: {
      count: quotes.length,
      total_amount: quotes.reduce((acc, item) => acc + Number(item.total || 0), 0),
      trend: Object.entries(quotesTimelineMap).map(([date, amount]) => ({
        date,
        amount: Number(amount || 0),
      })),
      recent_rows: quotes.slice(0, 12).map((item) => {
        const actor = workersMap[item.created_by];
        const lines = quoteItemsMap[item.id] || [];

        return {
          id: item.id,
          title: item.folio || item.title || "Cotización sin folio",
          subtitle: item.title || "Sin título",
          amount: Number(item.total || 0),
          created_at: item.created_at,
          meta: [
            { label: "Estado", value: humanizeStatus(item.status, "quotes") },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Hora", value: item.created_at ? new Date(item.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
            {
              label: "Conceptos",
              value: lines.length
                ? lines
                    .slice(0, 4)
                    .map((line) => `${line.description} x${Number(line.qty || 0)}`)
                    .join(" · ")
                : "Sin partidas",
            },
          ],
        };
      }),
    },
    invoices: {
      count: invoices.length,
      total_amount: invoices.reduce((acc, item) => acc + Number(item.total || 0), 0),
      trend: Object.entries(salesTimelineMap).map(([date, amount]) => ({
        date,
        amount: Number(amount || 0),
      })),
      recent_rows: invoices.slice(0, 12).map((item) => {
        const actor = workersMap[item.created_by];
        const lines = invoiceItemsMap[item.id] || [];

        return {
          id: item.id,
          title: item.folio || "Sin folio",
          subtitle: item.client_name || item.service_location || "Sin cliente / ubicación",
          amount: Number(item.total || 0),
          created_at: item.created_at,
          meta: [
            { label: "Estado", value: humanizeStatus(item.status, "invoices") },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Hora", value: item.created_at ? new Date(item.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
            { label: "Ubicación", value: item.service_location || "—" },
            { label: "Periodo", value: item.billing_period || "—" },
            {
              label: "Conceptos",
              value: lines.length
                ? lines
                    .slice(0, 4)
                    .map((line) => `${line.description} x${Number(line.qty || 0)}`)
                    .join(" · ")
                : "Sin partidas",
            },
          ],
        };
      }),
    },
    operations: {
      count: operations.length,
      completed_count: operations.filter((item) => item.status === "completed").length,
      incident_count: operations.filter((item) => item.status === "incident").length,
      recent_rows: operations.slice(0, 12).map((item) => {
        const actor = workersMap[item.created_by];
        const baseDate = item.scheduled_at || item.created_at;

        return {
          id: item.id,
          title: item.title || "Operación sin título",
          subtitle: item.client_name || "Sin cliente",
          created_at: baseDate,
          amount: 1,
          meta: [
            { label: "Estado", value: humanizeStatus(item.status, "operations") },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Hora", value: baseDate ? new Date(baseDate).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
          ],
        };
      }),
    },
    clients: {
      count: clientsCount,
      new_count: clientsCount,
      quoted_count: quotedClientIds.length,
      invoiced_count: invoicedClientIds.length,
      conversion_rate: clientConversionRate,
      recent_rows: clients.slice(0, 12).map((item) => {
        const actor = workersMap[item.created_by];
        const spend = clientsSpendMap[item.id] || {
          totalSpent: 0,
          invoices: 0,
          folios: [],
          products: {},
        };

        const topProducts = Object.entries(spend.products)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 4)
          .map(([name, qty]) => `${name} (${qty})`)
          .join(" · ");

        return {
          id: item.id,
          title: item.name || "Cliente sin nombre",
          subtitle: item.company || item.rfc || item.email || "Sin información adicional",
          amount: Number(spend.totalSpent || 0),
          created_at: item.created_at,
          meta: [
            { label: "Empresa", value: item.company || "—" },
            { label: "RFC", value: item.rfc || "—" },
            { label: "Email", value: item.email || "—" },
            { label: "Teléfono", value: item.phone || "—" },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Facturas", value: Number(spend.invoices || 0) },
            { label: "Folios", value: spend.folios.length ? spend.folios.join(" · ") : "—" },
            { label: "Productos / servicios", value: topProducts || "—" },
            { label: "Total gastado", value: Number(spend.totalSpent || 0) },
          ],
        };
      }),
    },
  };
}
router.get("/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write(`data: ${JSON.stringify({ event: "connected" })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ event: "ping", ts: Date.now() })}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    res.end();
  });
});
router.get("/export/excel", async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const folio = await generateReportFolio(date_from, date_to);

    const report = await buildGeneralSummary(date_from, date_to, { folio });

    logReportExport({
      folio,
      period: report.periodKey,
      format: "excel",
    }).catch((err) => {
      console.error("logReportExport excel error:", err.message);
    });

    const buf = await generateGeneralReportExcel(report);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${folio}.xlsx"`
    );

    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/export/pdf", async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const folio = await generateReportFolio(date_from, date_to);

    const report = await buildGeneralSummary(date_from, date_to, { folio });

    logReportExport({
      folio,
      period: report.periodKey,
      format: "pdf",
    }).catch((err) => {
      console.error("logReportExport pdf error:", err.message);
    });

    const buf = await generateGeneralReportPDF(report);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${folio}.pdf"`
    );

    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/export/xml", async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const folio = await generateReportFolio(date_from, date_to);

    const report = await buildGeneralSummary(date_from, date_to, { folio });

    logReportExport({
      folio,
      period: report.periodKey,
      format: "xml",
    }).catch((err) => {
      console.error("logReportExport xml error:", err.message);
    });

    const xml = generateGeneralReportXML(report);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${folio}.xml"`
    );

    return res.send(xml);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.get("/summary", async (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    const report = await buildGeneralSummary(date_from, date_to);

    return res.json({
      success: true,
      data: report,
    });
  } catch (e) {
    console.error("summary error:", e);
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
});
module.exports = router;