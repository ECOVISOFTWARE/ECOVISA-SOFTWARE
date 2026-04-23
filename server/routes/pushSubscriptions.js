const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");
const webpush = require("web-push");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@ecovisa.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// GET /api/push/vapid-public-key — el frontend necesita esta clave
router.get("/vapid-public-key", (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — guarda la suscripción del worker
router.post("/subscribe", async (req, res) => {
  try {
    const { worker_id, subscription } = req.body || {};
    if (!worker_id || !subscription?.endpoint) {
      return res.status(400).json({ error: "worker_id and subscription required" });
    }

    await supabaseAdmin.from("push_subscriptions").upsert({
      worker_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }, { onConflict: "endpoint" });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/push/unsubscribe
router.post("/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Función exportada para enviar push a un worker
async function sendPushToWorker(workerId, payload) {
  try {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("worker_id", workerId);

    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 86400 }
        );
      } catch (e) {
        // Si el endpoint expiró, eliminarlo
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  } catch (e) {
    console.error("sendPushToWorker error:", e.message);
  }
}

module.exports = router;
module.exports.sendPushToWorker = sendPushToWorker;