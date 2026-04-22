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
    .select("id, folio, title, total, status, created_at, created_by")
    .not("status", "in", '("invoiced","cancelled")');

  let invoicesQuery = supabaseAdmin
    .from("invoices")
    .select("id, folio, client_name, service_location, total, status, created_at, created_by");

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
      product:products(name, sku)
    `);

  let productsQuery = supabaseAdmin
    .from("products")
    .select("id, sku, name, created_at", { count: "exact" })
    .eq("is_active", true);

  if (fromIso) {
    quotesQuery = quotesQuery.gte("created_at", fromIso);
    invoicesQuery = invoicesQuery.gte("created_at", fromIso);
    operationsQuery = operationsQuery.gte("created_at", fromIso);
    inventoryMovementsQuery = inventoryMovementsQuery.gte("created_at", fromIso);
    productsQuery = productsQuery.gte("created_at", fromIso);
  }

  if (toIso) {
    quotesQuery = quotesQuery.lte("created_at", toIso);
    invoicesQuery = invoicesQuery.lte("created_at", toIso);
    operationsQuery = operationsQuery.lte("created_at", toIso);
    inventoryMovementsQuery = inventoryMovementsQuery.lte("created_at", toIso);
    productsQuery = productsQuery.lte("created_at", toIso);
  }

  const [
    quotesRes,
    invoicesRes,
    operationsRes,
    inventoryMovementsRes,
    inventoryMovementItemsRes,
    productsRes,
  ] = await Promise.all([
    quotesQuery.order("created_at", { ascending: false }),
    invoicesQuery.order("created_at", { ascending: false }),
    operationsQuery.order("created_at", { ascending: false }),
    inventoryMovementsQuery.order("created_at", { ascending: false }),
    inventoryMovementItemsQuery,
    productsQuery.order("created_at", { ascending: false }),
  ]);

  if (quotesRes.error) throw quotesRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  if (operationsRes.error) throw operationsRes.error;
  if (inventoryMovementsRes.error) throw inventoryMovementsRes.error;
  if (inventoryMovementItemsRes.error) throw inventoryMovementItemsRes.error;
  if (productsRes.error) throw productsRes.error;

  const quotes = quotesRes.data || [];
  const invoices = invoicesRes.data || [];
  const operations = operationsRes.data || [];
  const inventoryMovements = inventoryMovementsRes.data || [];
  const inventoryMovementItems = inventoryMovementItemsRes.data || [];
  const products = productsRes.data || [];

  const inventoryMovementsCount = Number(inventoryMovementsRes.count || 0);
  const productsCount = Number(productsRes.count || 0);

  const workerIds = [
    ...new Set(
      [
        ...quotes.map((item) => item.created_by),
        ...invoices.map((item) => item.created_by),
        ...operations.map((item) => item.created_by),
        ...inventoryMovements.map((item) => item.created_by),
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

  return {
    folio: options.folio || null,
    periodKey: buildPeriodKey(date_from, date_to),
    periodLabel: buildPeriodLabel(date_from, date_to),
    dateFrom: date_from || "",
    dateTo: date_to || "",
    inventory: {
      products_count: productsCount,
      movements_count: inventoryMovementsCount,
      products_rows: products.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.name || "Producto sin nombre",
        subtitle: item.sku ? `SKU: ${item.sku}` : "Sin SKU",
        created_at: item.created_at,
        meta: [
          { label: "Tipo", value: "Producto activo" },
          { label: "Alta", value: safeDate(item.created_at) ? new Date(item.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
        ],
      })),
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
          created_at: movement.created_at,
          meta: [
            { label: "Cantidad", value: totalQty },
            { label: "Productos", value: items.length },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Hora", value: movement.created_at ? new Date(movement.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
            {
              label: "Detalle",
              value:
                items.length > 0
                  ? items
                      .slice(0, 3)
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
      recent_rows: quotes.slice(0, 12).map((item) => {
        const actor = workersMap[item.created_by];
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
          ],
        };
      }),
    },
    invoices: {
      count: invoices.length,
      total_amount: invoices.reduce((acc, item) => acc + Number(item.total || 0), 0),
      recent_rows: invoices.slice(0, 12).map((item) => {
        const actor = workersMap[item.created_by];
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
          meta: [
            { label: "Estado", value: humanizeStatus(item.status, "operations") },
            { label: "Actor", value: actor?.full_name || actor?.username || "Sin usuario" },
            { label: "Hora", value: baseDate ? new Date(baseDate).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—" },
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