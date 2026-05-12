const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");
const { branchFilter } = require("../middleware/branchFilter");
const { sendPushToWorker } = require("./pushSubscriptions");

/* ══════════════════════════════════════════════
   SSE — conexiones activas por worker
   notifClients: Map<workerId, Set<res>>
══════════════════════════════════════════════ */
const notifClients = new Map();

function addNotifClient(workerId, res) {
  if (!notifClients.has(workerId)) notifClients.set(workerId, new Set());
  notifClients.get(workerId).add(res);
}

function removeNotifClient(workerId, res) {
  const set = notifClients.get(workerId);
  if (!set) return;
  set.delete(res);
  if (!set.size) notifClients.delete(workerId);
}

function pushToWorker(workerId, payload) {
  const set = notifClients.get(String(workerId || ""));
  if (!set || !set.size) return;
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of [...set]) {
    try { res.write(msg); }
    catch { set.delete(res); }
  }
}

// GET /stream — el frontend se conecta aquí para recibir notifs en tiempo real
router.get("/stream", (req, res) => {
  const { recipient_id } = req.query;
  if (!recipient_id) return res.status(400).json({ error: "recipient_id required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // ping inicial para confirmar conexión
  res.write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);

  addNotifClient(recipient_id, res);

  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); }
    catch { clearInterval(hb); }
  }, 25000);

  req.on("close", () => {
    clearInterval(hb);
    removeNotifClient(recipient_id, res);
    res.end();
  });
});

// Helper que otros routers importan para crear notificaciones
async function createNotifications(items) {
  if (!Array.isArray(items) || items.length === 0) return;

const clean = items
    .map((item) => ({
      recipient_id: item.recipient_id || null,
      actor_id: item.actor_id || null,
      actor_name: item.actor_name || "",
      actor_photo: item.actor_photo || "",
      type: item.type || "info",
      title: item.title || "",
      message: item.message || "",
      entity_type: item.entity_type || null,
      entity_id: item.entity_id || null,
      branch_id: item.branch_id || null,
      module_key: item.module_key || null,
      action_key: item.action_key || null,
      read: Boolean(item.read),
    }))
    .filter((item) => item.recipient_id);

  if (!clean.length) return;

try {
    await supabaseAdmin.from("notifications").insert(clean);

    for (const notif of clean) {
      // SSE (in-app)
      pushToWorker(notif.recipient_id, {
        type: "new_notification",
        notif_type: notif.type,
        title: notif.title,
        message: notif.message,
        actor_name: notif.actor_name,
        at: new Date().toISOString(),
      });

      // Web Push (fuera de la app — móvil y escritorio)
      sendPushToWorker(notif.recipient_id, {
        title: notif.title || "ECOVISA",
        body: notif.message || "",
        icon: "/assets/ECOVISA_ICON.png",
        badge: "/assets/ECOVISA_ICON.png",
        data: {
          entity_type: notif.entity_type,
          entity_id: notif.entity_id,
          url: "/",
        },
      }).catch(() => {});
    }
  } catch (e) {
    console.error("createNotifications error:", e.message);
  }
}

// GET: notificaciones de un worker, filtradas por base
router.get("/", branchFilter, async (req, res) => {
  try {
    const {
      recipient_id,
      unread_only,
      limit = 40,
      module_key,
      entity_type,
      entity_id,
      type,
      related_worker_id,
    } = req.query;

    if (!recipient_id) {
      return res.status(400).json({ error: "recipient_id required" });
    }

    if (!req.isDirector && req.actorWorker?.id !== recipient_id) {
      return res.status(403).json({ error: "No puedes consultar notificaciones de otro usuario" });
    }

    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("recipient_id", recipient_id)
      .order("created_at", { ascending: false })
      .limit(Number(limit));

    if (!req.isDirector && req.branchId) {
      query = query.eq("branch_id", req.branchId);
    }

    if (unread_only === "true") query = query.eq("read", false);
    if (module_key) query = query.eq("module_key", module_key);
    if (entity_type) query = query.eq("entity_type", entity_type);
    if (entity_id) query = query.eq("entity_id", entity_id);
    if (type) query = query.eq("type", type);
    if (related_worker_id) query = query.eq("related_worker_id", related_worker_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ data: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT: marcar una como leída
router.put("/:id/read", branchFilter, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: row, error: findError } = await supabaseAdmin
      .from("notifications")
      .select("id, recipient_id, branch_id")
      .eq("id", id)
      .maybeSingle();

    if (findError) return res.status(500).json({ error: findError.message });
    if (!row) return res.status(404).json({ error: "notification not found" });

    if (!req.isDirector && req.actorWorker?.id !== row.recipient_id) {
      return res.status(403).json({ error: "No puedes modificar notificaciones de otro usuario" });
    }

    if (!req.isDirector && req.branchId && row.branch_id && row.branch_id !== req.branchId) {
      return res.status(403).json({ error: "La notificación pertenece a otra base" });
    }

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT: marcar todas como leídas
router.put("/read-all", branchFilter, async (req, res) => {
  try {
    const { recipient_id } = req.body || {};

    if (!recipient_id) {
      return res.status(400).json({ error: "recipient_id required" });
    }

    if (!req.isDirector && req.actorWorker?.id !== recipient_id) {
      return res.status(403).json({ error: "No puedes modificar notificaciones de otro usuario" });
    }

    let query = supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("recipient_id", recipient_id)
      .eq("read", false);

    if (!req.isDirector && req.branchId) {
      query = query.eq("branch_id", req.branchId);
    }

    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE: limpiar leídas
router.delete("/clear", branchFilter, async (req, res) => {
  try {
    const { recipient_id } = req.body || {};

    if (!recipient_id) {
      return res.status(400).json({ error: "recipient_id required" });
    }

    if (!req.isDirector && req.actorWorker?.id !== recipient_id) {
      return res.status(403).json({ error: "No puedes limpiar notificaciones de otro usuario" });
    }

    let query = supabaseAdmin
      .from("notifications")
      .delete()
      .eq("recipient_id", recipient_id)
      .eq("read", true);

    if (!req.isDirector && req.branchId) {
      query = query.eq("branch_id", req.branchId);
    }

    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.createNotifications = createNotifications;