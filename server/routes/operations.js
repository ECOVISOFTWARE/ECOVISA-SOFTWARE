const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");
const { branchFilter } = require("../middleware/branchFilter");
const { createNotifications } = require("./notifications");

function toText(v) { return String(v || "").trim() || null; }
function toNumber(v) { return Number(v || 0); }

router.get("/", branchFilter, async (req, res) => {
  try {
    const { q, status } = req.query;
    let query = supabaseAdmin
      .from("operations")
      .select("*")
      .order("created_at", { ascending: false });

    // Filtro de base: Dirección ve todo; otros solo su base
    if (req.branchId) query = query.eq("branch_id", req.branchId);

    if (status) query = query.eq("status", status);
    if (q && q.trim()) {
      const term = q.trim();
      query = query.or(
        `title.ilike.%${term}%,unit_name.ilike.%${term}%,operator_name.ilike.%${term}%,client_name.ilike.%${term}%,origin.ilike.%${term}%,destination.ilike.%${term}%`
      );
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [opRes, evRes, incRes] = await Promise.all([
      supabaseAdmin.from("operations").select("*").eq("id", id).maybeSingle(),
      supabaseAdmin.from("operation_events").select("*").eq("operation_id", id).order("created_at", { ascending: true }),
      supabaseAdmin.from("operation_incidents").select("*").eq("operation_id", id).order("created_at", { ascending: false }),
    ]);
    if (opRes.error) return res.status(500).json({ error: opRes.error.message });
    if (!opRes.data) return res.status(404).json({ error: "Operation not found" });
    return res.json({ data: { ...opRes.data, events: evRes.data || [], incidents: incRes.data || [] } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/", branchFilter, async (req, res) => {
  try {
    const b = req.body || {};
    if (!toText(b.title)) return res.status(400).json({ error: "title required" });

const payload = {
  title: toText(b.title),
  status: b.status || "scheduled",
  unit_name: toText(b.unit_name),
  operator_name: toText(b.operator_name),

  client_id: b.client_id || null,
  client_name: toText(b.client_name),
  origin: toText(b.origin),
  destination: toText(b.destination),

  city: toText(b.city),
  location: toText(b.location),
  warehouse_exit: toText(b.warehouse_exit),
  delivery_date: b.delivery_date || null,
  removed: Boolean(b.removed),

  sanitary_qty: toNumber(b.sanitary_qty),
  sink_qty: toNumber(b.sink_qty),
  trailer_qty: toNumber(b.trailer_qty),
  sanitary_owned: toNumber(b.sanitary_owned),
  sanitary_external: toNumber(b.sanitary_external),

  unit_price: toNumber(b.unit_price),
  total_price: toNumber(b.total_price),

  billing_period: toNumber(b.billing_period) || 1,
  billing_start: b.billing_start || null,
  billing_end: b.billing_end || null,
  billing_alert: toText(b.billing_alert) || "------",
  invoice_number: toText(b.invoice_number),
  invoice_id: b.invoice_id || null,
  invoice_status: toText(b.invoice_status) || "pending",

  service_frequency: toNumber(b.service_frequency) || 1,
  service_days: toNumber(b.service_days),
  branch: toText(b.branch) || "MOCHIS",
  control_date: b.control_date || null,

  latitude: b.latitude === "" ? null : b.latitude,
  longitude: b.longitude === "" ? null : b.longitude,
  full_address: toText(b.full_address),
  google_maps_url: toText(b.google_maps_url),

  monday: Boolean(b.monday),
  tuesday: Boolean(b.tuesday),
  wednesday: Boolean(b.wednesday),
  thursday: Boolean(b.thursday),
  friday: Boolean(b.friday),
  saturday: Boolean(b.saturday),
  sunday: Boolean(b.sunday),

  scheduled_at: b.scheduled_at || null,
  real_departure_at: b.real_departure_at || null,
  real_arrival_at: b.real_arrival_at || null,
  observations: toText(b.observations),
  created_by: b.created_by || null,

  branch_id: req.branchId || b.branch_id || null,
};

    const { data, error } = await supabaseAdmin
      .from("operations").insert(payload).select("*").single();
    if (error) return res.status(500).json({ error: error.message });

    // Notificar a todos los trabajadores de la misma base (excepto el actor)
    if (data && req.actorWorker) {
      const branchToFilter = data.branch_id;
      if (branchToFilter) {
        const { data: peers } = await supabaseAdmin
          .from("workers")
          .select("id")
          .eq("branch_id", branchToFilter)
          .neq("id", req.actorWorker.id);

        if (peers && peers.length > 0) {
            await createNotifications(peers.map((p) => ({
            recipient_id: p.id,
            actor_id: req.actorWorker.id,
            actor_name: req.actorWorker.full_name || req.actorWorker.username || "Sistema",
            actor_photo: req.actorWorker.profile_photo_url || null,
            type: "operation_created",
            title: "Nueva operación registrada",
            message: `${req.actorWorker.name} creó la operación "${data.title}"`,
            entity_type: "operation",
            entity_id: data.id,
            branch_id: branchToFilter,
          })));
        }
      }
    }

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
const payload = {
  title: toText(b.title),
  status: b.status || "scheduled",
  unit_name: toText(b.unit_name),
  operator_name: toText(b.operator_name),

  client_id: b.client_id || null,
  client_name: toText(b.client_name),
  origin: toText(b.origin),
  destination: toText(b.destination),

  city: toText(b.city),
  location: toText(b.location),
  warehouse_exit: toText(b.warehouse_exit),
  delivery_date: b.delivery_date || null,
  removed: Boolean(b.removed),

  sanitary_qty: toNumber(b.sanitary_qty),
  sink_qty: toNumber(b.sink_qty),
  trailer_qty: toNumber(b.trailer_qty),
  sanitary_owned: toNumber(b.sanitary_owned),
  sanitary_external: toNumber(b.sanitary_external),

  unit_price: toNumber(b.unit_price),
  total_price: toNumber(b.total_price),

  billing_period: toNumber(b.billing_period) || 1,
  billing_start: b.billing_start || null,
  billing_end: b.billing_end || null,
  billing_alert: toText(b.billing_alert) || "------",
  invoice_number: toText(b.invoice_number),
  invoice_id: b.invoice_id || null,
  invoice_status: toText(b.invoice_status) || "pending",

  service_frequency: toNumber(b.service_frequency) || 1,
  service_days: toNumber(b.service_days),
  branch: toText(b.branch) || "MOCHIS",
  control_date: b.control_date || null,

  latitude: b.latitude === "" ? null : b.latitude,
  longitude: b.longitude === "" ? null : b.longitude,
  full_address: toText(b.full_address),
  google_maps_url: toText(b.google_maps_url),

  monday: Boolean(b.monday),
  tuesday: Boolean(b.tuesday),
  wednesday: Boolean(b.wednesday),
  thursday: Boolean(b.thursday),
  friday: Boolean(b.friday),
  saturday: Boolean(b.saturday),
  sunday: Boolean(b.sunday),

  scheduled_at: b.scheduled_at || null,
  real_departure_at: b.real_departure_at || null,
  real_arrival_at: b.real_arrival_at || null,
  observations: toText(b.observations),
  updated_at: new Date().toISOString(),
};
    const { data, error } = await supabaseAdmin.from("operations").update(payload).eq("id", id).select("*").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/:id/invoice", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const { data: operation, error: opError } = await supabaseAdmin
      .from("operations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (opError) return res.status(500).json({ error: opError.message });
    if (!operation) return res.status(404).json({ error: "operation not found" });

    if (operation.invoice_id) {
      return res.json({
        data: {
          invoice_id: operation.invoice_id,
          invoice_folio: operation.invoice_number,
          already_created: true,
        },
      });
    }

    const subtotal = Number(operation.total_price || 0);
    const tax = Number((subtotal * 0.16).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));

    const invoicePayload = {
      client_id: operation.client_id || null,
      client_name: operation.client_name || "Cliente sin nombre",
      delivery_date: operation.delivery_date || null,
      billing_period: operation.billing_period ? `Periodo ${operation.billing_period}` : null,
      service_location: operation.location || operation.city || null,
      subtotal,
      tax,
      total,
      status: b.status || "draft",
      notes: b.notes || `Factura generada desde servicio sanitario: ${operation.title || operation.client_name || id}`,
      created_by: b.created_by || operation.created_by || null,
      branch_id: operation.branch_id || null,
    };

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .insert(invoicePayload)
      .select("*")
      .single();

    if (invoiceError) return res.status(500).json({ error: invoiceError.message });

    const { data: updatedOperation, error: updateError } = await supabaseAdmin
      .from("operations")
      .update({
        invoice_id: invoice.id,
        invoice_number: invoice.folio || null,
        invoice_status: invoice.status || "draft",
        billing_alert: "Facturada",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({
      data: {
        invoice,
        operation: updatedOperation,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from("operations").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/:id/events", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const payload = {
      operation_id: id,
      event_type: toText(b.event_type) || "custom",
      description: toText(b.description) || "",
      created_by: b.created_by || null,
    };
    const { data, error } = await supabaseAdmin.from("operation_events").insert(payload).select("*").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/:id/incidents", async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const payload = {
      operation_id: id,
      incident_type: toText(b.incident_type) || "other",
      priority: toText(b.priority) || "medium",
      description: toText(b.description) || "",
      created_by: b.created_by || null,
    };
    const { data, error } = await supabaseAdmin.from("operation_incidents").insert(payload).select("*").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/:id/incidents/:incidentId", async (req, res) => {
  try {
    const { incidentId } = req.params;
    const b = req.body || {};
    const payload = {
      resolved: Boolean(b.resolved),
      resolved_at: b.resolved ? new Date().toISOString() : null,
    };
    const { data, error } = await supabaseAdmin.from("operation_incidents").update(payload).eq("id", incidentId).select("*").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /:id/invoice — Genera factura desde un servicio sanitario ──────────
router.post("/:id/invoice", async (req, res) => {
  try {
    const { id } = req.params;
    const { created_by, status = "draft" } = req.body || {};

    // 1. Obtener el servicio
    const { data: op, error: opErr } = await supabaseAdmin
      .from("operations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (opErr) return res.status(500).json({ error: opErr.message });
    if (!op)   return res.status(404).json({ error: "Servicio no encontrado" });

    // 2. Verificar que no tenga factura ya generada
    if (op.invoice_id) {
      return res.status(400).json({
        error: "Este servicio ya tiene una factura generada",
        invoice_id: op.invoice_id,
      });
    }

    // 3. Calcular montos
    const subtotal = Number(op.total_price || op.unit_price || 0);
    const tax      = Number((subtotal * 0.16).toFixed(2));
    const total    = Number((subtotal + tax).toFixed(2));

    // 4. Crear la factura
    const invoicePayload = {
      client_id       : op.client_id    || null,
      client_name     : op.client_name  || "Sin cliente",
      delivery_date   : op.delivery_date || null,
      billing_period  : op.billing_period
        ? `Período ${op.billing_period}`
        : null,
      service_location: op.location     || op.city || null,
      subtotal,
      tax,
      total,
      status,
      notes: op.observations || "",
      created_by: created_by || op.created_by || null,
    };

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .insert(invoicePayload)
      .select("*")
      .single();

    if (invErr) return res.status(500).json({ error: invErr.message });

    // 5. Vincular el invoice al servicio + guardar el folio como invoice_number
    const { error: updErr } = await supabaseAdmin
      .from("operations")
      .update({
        invoice_id     : invoice.id,
        invoice_status : "draft",
        invoice_number : invoice.folio || op.invoice_number || null,
        billing_alert  : "------",      // ya se facturó, quitar la alerta
        updated_at     : new Date().toISOString(),
      })
      .eq("id", id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.json({
      data: {
        invoice,
        invoice_folio: invoice.folio,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;