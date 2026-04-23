const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");
const { branchFilter } = require("../middleware/branchFilter");
const { createNotifications } = require("./notifications");

function toText(v) { return String(v || "").trim() || null; }

router.get("/", branchFilter, async (req, res) => {
  try {
    const { q, status } = req.query;
    let query = supabaseAdmin
      .from("operations")
      .select("*")
      .order("created_at", { ascending: false });

    // ✅ Filtro de base: Dirección ve todo; otros solo su base
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
      status: b.status || "pending",
      unit_name: toText(b.unit_name),
      operator_name: toText(b.operator_name),
      client_name: toText(b.client_name),
      origin: toText(b.origin),
      destination: toText(b.destination),
      scheduled_at: b.scheduled_at || null,
      real_departure_at: b.real_departure_at || null,
      real_arrival_at: b.real_arrival_at || null,
      observations: toText(b.observations),
      created_by: b.created_by || null,
      // ✅ hereda la base del worker que crea
      branch_id: req.branchId || b.branch_id || null,
    };

    const { data, error } = await supabaseAdmin
      .from("operations").insert(payload).select("*").single();
    if (error) return res.status(500).json({ error: error.message });

    // ✅ Notificar a todos los trabajadores de la misma base (excepto el actor)
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
      status: b.status || "pending",
      unit_name: toText(b.unit_name),
      operator_name: toText(b.operator_name),
      client_name: toText(b.client_name),
      origin: toText(b.origin),
      destination: toText(b.destination),
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

module.exports = router;