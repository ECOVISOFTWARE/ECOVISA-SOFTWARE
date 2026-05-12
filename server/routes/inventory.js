const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");

const INVENTORY_ROUTE_VERSION = "inventory-router-v2-performance-summary";

console.log("🧩 LOADED inventory routes from:", __filename);
console.log("🧩 inventory route version:", INVENTORY_ROUTE_VERSION);
console.log("🧩 inventory routes has:", {
  ping: "/ping",
  routeVersion: INVENTORY_ROUTE_VERSION,
  products: "/products",
  stock: "/stock",
  stockMovements: "/stock/:productId/movements",
  kardex: "/kardex",
  analytics: "/analytics",
  performanceSummary: "/performance-summary",
  activity: "/activity",
  topStock: "/top-stock",
  topIn: "/top-in",
  topOut: "/top-out",
});
// DEBUG: confirma que el router está montado y accesible
router.get("/ping", (req, res) => {
  res.json({ ok: true, route: "/api/inventory/ping" });
});
router.get("/route-version", (req, res) => {
  res.json({
    ok: true,
    route: "/api/inventory/route-version",
    version: INVENTORY_ROUTE_VERSION,
    file: __filename,
    ts: Date.now(),
  });
});
/* =========================
   Realtime (SSE) - Inventory
   - Frontend se conecta a /api/inventory/stream
   - Backend emite eventos cuando hay cambios (movimientos/productos)
========================= */
const SSE_CLIENTS = new Set();

function sseSend(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of SSE_CLIENTS) {
    try { res.write(msg); } catch (e) {}
  }
}

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Si estás detrás de proxy (Render), ayuda a que no se “cuelgue”
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: "HELLO", ts: Date.now() })}\n\n`);

  SSE_CLIENTS.add(res);

  req.on("close", () => {
    SSE_CLIENTS.delete(res);
  });
});
/* =========================
   Helpers
========================= */
async function getActorSnapshot(workerId) {
  if (!workerId) return null;

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select(`
      id,
      username,
      full_name,
      profile_photo_url,
      department:departments!workers_department_id_fkey(name)
    `)
    .eq("id", workerId)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  return {
    actor_id: data.id,
    actor_username: data.username || "",
    actor_full_name: data.full_name || data.username || "",
    actor_department: data.department?.name || "",
    actor_profile_photo_url: data.profile_photo_url || ""
  };
}

async function logActivity(payload) {
  // payload: {module_key, action, actor_id, entity_type, entity_id, meta}
  const snap = await getActorSnapshot(payload.actor_id);

  const insert = {
    module_key: payload.module_key,
    action: payload.action,
    actor_id: payload.actor_id || null,
    actor_username: snap?.actor_username || "",
    actor_full_name: snap?.actor_full_name || "",
    actor_department: snap?.actor_department || "",
    actor_profile_photo_url: snap?.actor_profile_photo_url || "",
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id || null,
    meta: payload.meta || {}
  };

  await supabaseAdmin.from("activity_log").insert(insert);
}

function normalizeSkuText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function buildSkuPrefixFromName(name = "") {
  const clean = normalizeSkuText(name);
  if (!clean) return "PROD";

  const words = clean.split(" ").filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 4).padEnd(4, "X");
  }

  if (words.length === 2) {
    return (
      words[0].slice(0, 2) +
      words[1].slice(0, 2)
    ).padEnd(4, "X");
  }

  if (words.length === 3) {
    return (
      words[0].slice(0, 2) +
      words[1].slice(0, 1) +
      words[2].slice(0, 1)
    ).padEnd(4, "X");
  }

  return words
    .slice(0, 4)
    .map((w) => w.charAt(0))
    .join("")
    .padEnd(4, "X");
}

async function generateNextSku(name = "") {
  const prefix = buildSkuPrefixFromName(name);
  const likePattern = `${prefix}%`;

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("sku")
    .ilike("sku", likePattern);

  if (error) {
    throw error;
  }

  let maxNum = 0;

  for (const row of data || []) {
    const sku = String(row?.sku || "").toUpperCase().trim();
    const match = sku.match(new RegExp(`^${prefix}(\\d{4})$`));
    if (!match) continue;

    const n = Number(match[1] || 0);
    if (n > maxNum) maxNum = n;
  }

  const next = String(maxNum + 1).padStart(4, "0");
  return `${prefix}${next}`;
}

/* =========================
   Products
========================= */
router.get("/products", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});


router.post("/products", async (req, res) => {
  const { sku, name, unit, stock_min, created_by } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  try {
    const finalSku = String(sku || "").trim()
      ? normalizeSkuText(String(sku || "").trim())
      : await generateNextSku(name);

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        sku: finalSku,
        name,
        unit,
        stock_min: stock_min ?? 0,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logActivity({
      module_key: "inventory",
      action: "PRODUCT_CREATED",
      actor_id: created_by || null,
      entity_type: "product",
      entity_id: data.id,
      meta: { sku: finalSku || "", name, stock_min: stock_min ?? 0 }
    });

    sseSend({ type: "PRODUCT_CREATED", product_id: data.id, ts: Date.now() });

    res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/products/:id", async (req, res) => {
  const { id } = req.params;
  const { sku, name, unit, stock_min, updated_by } = req.body || {};

  if (!id) return res.status(400).json({ error: "id required" });
  if (!name) return res.status(400).json({ error: "name required" });

  try {
    const finalSku = String(sku || "").trim()
      ? normalizeSkuText(String(sku || "").trim())
      : await generateNextSku(name);

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        sku: finalSku,
        name,
        unit,
        stock_min: stock_min ?? 0,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logActivity({
      module_key: "inventory",
      action: "PRODUCT_UPDATED",
      actor_id: updated_by || null,
      entity_type: "product",
      entity_id: data.id,
      meta: { sku: finalSku || "", name, stock_min: stock_min ?? 0 }
    });

    sseSend({ type: "PRODUCT_UPDATED", product_id: data.id, ts: Date.now() });

    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.delete("/products/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const { deleted_by } = req.body || {};

    if (!productId) {
      return res.status(400).json({ error: "product id required" });
    }

    const { data: existingProduct, error: existingError } = await supabaseAdmin
      .from("products")
      .select("id, name, sku, is_active")
      .eq("id", productId)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ error: existingError.message });
    }

    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const { error: archiveError } = await supabaseAdmin
      .from("products")
      .update({ is_active: false })
      .eq("id", productId);

    if (archiveError) {
      return res.status(500).json({ error: archiveError.message });
    }

    await logActivity({
      module_key: "inventory",
      action: "PRODUCT_DELETED",
      actor_id: deleted_by || null,
      entity_type: "product",
      entity_id: productId,
      meta: {
        sku: existingProduct.sku || "",
        name: existingProduct.name || "",
      },
    });

    sseSend({
      type: "PRODUCT_DELETED",
      product_id: productId,
      ts: Date.now(),
    });

    return res.json({
      ok: true,
      message: "Producto eliminado correctamente",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
/* =========================
   Stock
========================= */
router.get("/stock", async (req, res) => {
  const { data, error } = await supabaseAdmin.from("v_product_available").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});
router.get("/stock/:productId/movements", async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  if (!productId) {
    return res.status(400).json({ error: "productId required" });
  }

  const { data, error } = await supabaseAdmin
    .from("v_inventory_kardex")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({
      error: error.message,
      route: "/api/inventory/stock/:productId/movements",
      productId,
    });
  }

  return res.json({
    ok: true,
    route: "/api/inventory/stock/:productId/movements",
    productId,
    data: data || [],
  });
});


router.get("/stock-movements/:productId", async (req, res) => {
  const { productId } = req.params;
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  if (!productId) {
    return res.status(400).json({ error: "productId required" });
  }

  const { data, error } = await supabaseAdmin
    .from("v_inventory_kardex")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({
      error: error.message,
      route: "/api/inventory/stock-movements/:productId",
      productId,
    });
  }

  const rows = data || [];
  const movementIds = Array.from(
    new Set(rows.map((r) => r.movement_id).filter(Boolean))
  );

  let movementMap = new Map();
  let workerMap = new Map();

  if (movementIds.length) {
    const { data: movementRows, error: movementErr } = await supabaseAdmin
      .from("inventory_movements")
      .select("id, created_by, created_at, type, reason")
      .in("id", movementIds);

    if (movementErr) {
      return res.status(500).json({
        error: movementErr.message,
        route: "/api/inventory/stock-movements/:productId",
        productId,
      });
    }

    const createdByIds = Array.from(
      new Set((movementRows || []).map((m) => m.created_by).filter(Boolean))
    );

    movementMap = new Map(
      (movementRows || []).map((m) => [String(m.id), m])
    );

    if (createdByIds.length) {
      const { data: workerRows, error: workerErr } = await supabaseAdmin
        .from("workers")
        .select(`
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments!workers_department_id_fkey(name)
        `)
        .in("id", createdByIds);

      if (workerErr) {
        return res.status(500).json({
          error: workerErr.message,
          route: "/api/inventory/stock-movements/:productId",
          productId,
        });
      }

      workerMap = new Map(
        (workerRows || []).map((w) => [String(w.id), w])
      );
    }
  }

  const enriched = rows.map((row) => {
    const movement = movementMap.get(String(row.movement_id || "")) || null;
    const worker = workerMap.get(String(movement?.created_by || "")) || null;

    return {
      ...row,
      actor_id: worker?.id || movement?.created_by || null,
      actor_username: worker?.username || "",
      actor_full_name: worker?.full_name || worker?.username || "",
      actor_department: worker?.department?.name || "",
      actor_profile_photo_url: worker?.profile_photo_url || "",
      movement_reason: movement?.reason || row.reason || "",
      movement_type: movement?.type || row.type || "",
      movement_created_at: movement?.created_at || row.created_at || null,
    };
  });

  return res.json({
    ok: true,
    route: "/api/inventory/stock-movements/:productId",
    productId,
    data: enriched,
  });
});
/* =========================
   Movements (IN/OUT)
========================= */
router.post("/movements", async (req, res) => {
  const { type, reason, created_by, items } = req.body || {};

  if (!type || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "type and items required" });
  }
  if (!["IN", "OUT"].includes(type)) {
    return res.status(400).json({ error: "type must be IN or OUT" });
  }

  // normaliza items (seguro)
  const cleanItems = items
    .map((it) => ({
      product_id: it.product_id,
      qty: Number(it.qty || 0),
      unit_cost: Number(it.unit_cost || 0),
    }))
    .filter((x) => x.product_id && x.qty > 0);

  if (cleanItems.length === 0) {
    return res.status(400).json({ error: "items must include product_id and qty > 0" });
  }

  /* =========================
     VALIDACIÓN STOCK (solo OUT)
  ========================= */
  let stockById = new Map();

  if (type === "OUT") {
    const ids = Array.from(new Set(cleanItems.map((x) => x.product_id)));

    const { data: stocks, error: sErr } = await supabaseAdmin
      .from("v_product_stock")
      .select("product_id, stock, name, sku")
      .in("product_id", ids);

    if (sErr) return res.status(500).json({ error: sErr.message });

    (stocks || []).forEach((r) => {
      stockById.set(String(r.product_id), {
        stock: Number(r.stock || 0),
        name: r.name || "",
        sku: r.sku || "",
      });
    });

    const insufficient = [];
    for (const it of cleanItems) {
      const snap = stockById.get(String(it.product_id)) || { stock: 0, name: "", sku: "" };
      if (it.qty > snap.stock) {
        insufficient.push({
          product_id: it.product_id,
          name: snap.name,
          sku: snap.sku,
          available: snap.stock,
          requested: it.qty,
        });
      }
    }

    if (insufficient.length) {
      return res.status(400).json({
        error: "INSUFFICIENT_STOCK",
        message: "No hay stock suficiente para completar la salida.",
        details: insufficient,
      });
    }
  }

  const { data: movement, error: mErr } = await supabaseAdmin
    .from("inventory_movements")
    .insert({ type, reason, created_by })
    .select("*")
    .single();

  if (mErr) return res.status(500).json({ error: mErr.message });

  const payload = cleanItems.map((it) => ({
    movement_id: movement.id,
    product_id: it.product_id,
    qty: it.qty,
    unit_cost: it.unit_cost ?? 0,
  }));

  const { error: iErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .insert(payload);

  if (iErr) return res.status(500).json({ error: iErr.message });

  const total_items = payload.length;
  const total_qty = payload.reduce((a, x) => a + Number(x.qty || 0), 0);

  await logActivity({
    module_key: "inventory",
    action: "MOVEMENT_CREATED",
    actor_id: created_by || null,
    entity_type: "inventory_movement",
    entity_id: movement.id,
    meta: {
      type,
      reason: reason || "",
      total_items,
      total_qty,
    },
  });

  if (type === "OUT") {
    for (const it of cleanItems) {
      const snap = stockById.get(String(it.product_id)) || { stock: 0, name: "", sku: "" };
      const remaining = Math.max(0, Number(snap.stock || 0) - Number(it.qty || 0));

      if (remaining <= 10) {
        sseSend({
          type: "LOW_STOCK",
          product_id: it.product_id,
          name: snap.name,
          sku: snap.sku,
          remaining,
          ts: Date.now(),
        });
      }
    }
  }

  sseSend({
    type: "MOVEMENT_CREATED",
    movement_id: movement.id,
    meta: { type, total_items, total_qty },
    ts: Date.now(),
  });

  res.json({ ok: true, movement_id: movement.id });
});

router.put("/movement-items/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const { qty, reason, updated_by } = req.body || {};

  if (!itemId) {
    return res.status(400).json({ error: "itemId required" });
  }

  const nextQty = Number(qty || 0);
  if (!Number.isFinite(nextQty) || nextQty <= 0) {
    return res.status(400).json({ error: "qty must be > 0" });
  }

  const { data: existingItem, error: existingErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .select("id, movement_id, product_id, qty, unit_cost")
    .eq("id", itemId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existingItem) return res.status(404).json({ error: "Movement item not found" });

  const { data: movement, error: movementErr } = await supabaseAdmin
    .from("inventory_movements")
    .select("id, type, reason")
    .eq("id", existingItem.movement_id)
    .maybeSingle();

  if (movementErr) return res.status(500).json({ error: movementErr.message });
  if (!movement) return res.status(404).json({ error: "Movement not found" });

  const { data: stockRow, error: stockErr } = await supabaseAdmin
    .from("v_product_stock")
    .select("product_id, stock, name, sku")
    .eq("product_id", existingItem.product_id)
    .maybeSingle();

  if (stockErr) return res.status(500).json({ error: stockErr.message });

  const currentStock = Number(stockRow?.stock || 0);
  const currentQty = Number(existingItem.qty || 0);

  if (movement.type === "OUT") {
    const maxAllowed = currentStock + currentQty;
    if (nextQty > maxAllowed) {
      return res.status(400).json({
        error: "INSUFFICIENT_STOCK",
        message: "No hay stock suficiente para actualizar la salida.",
        details: [{
          product_id: existingItem.product_id,
          name: stockRow?.name || "",
          sku: stockRow?.sku || "",
          available: maxAllowed,
          requested: nextQty,
        }],
      });
    }
  }

  if (movement.type === "IN") {
    const resultingStock = currentStock - currentQty + nextQty;
    if (resultingStock < 0) {
      return res.status(400).json({
        error: "INVALID_STOCK_AFTER_UPDATE",
        message: "La edición dejaría el stock en negativo.",
      });
    }
  }

  const { data: updatedItem, error: updateErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .update({ qty: nextQty })
    .eq("id", itemId)
    .select("*")
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  if (typeof reason === "string") {
    const { error: reasonErr } = await supabaseAdmin
      .from("inventory_movements")
      .update({ reason })
      .eq("id", existingItem.movement_id);

    if (reasonErr) return res.status(500).json({ error: reasonErr.message });
  }

  await logActivity({
    module_key: "inventory",
    action: "MOVEMENT_UPDATED",
    actor_id: updated_by || null,
    entity_type: "inventory_movement_item",
    entity_id: updatedItem.id,
    meta: {
      movement_id: existingItem.movement_id,
      item_id: updatedItem.id,
      type: movement.type,
      qty_before: currentQty,
      qty_after: nextQty,
      reason: typeof reason === "string" ? reason : movement.reason || "",
    },
  });

  sseSend({
    type: "MOVEMENT_UPDATED",
    movement_id: existingItem.movement_id,
    item_id: updatedItem.id,
    product_id: existingItem.product_id,
    ts: Date.now(),
  });

  return res.json({ ok: true, data: updatedItem });
});

router.delete("/movement-items/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const { deleted_by } = req.body || {};

  if (!itemId) {
    return res.status(400).json({ error: "itemId required" });
  }

  const { data: existingItem, error: existingErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .select("id, movement_id, product_id, qty, unit_cost")
    .eq("id", itemId)
    .maybeSingle();

  if (existingErr) return res.status(500).json({ error: existingErr.message });
  if (!existingItem) return res.status(404).json({ error: "Movement item not found" });

  const { data: movement, error: movementErr } = await supabaseAdmin
    .from("inventory_movements")
    .select("id, type, reason")
    .eq("id", existingItem.movement_id)
    .maybeSingle();

  if (movementErr) return res.status(500).json({ error: movementErr.message });
  if (!movement) return res.status(404).json({ error: "Movement not found" });

  if (movement.type === "IN") {
    const { data: stockRow, error: stockErr } = await supabaseAdmin
      .from("v_product_stock")
      .select("product_id, stock")
      .eq("product_id", existingItem.product_id)
      .maybeSingle();

    if (stockErr) return res.status(500).json({ error: stockErr.message });

    const currentStock = Number(stockRow?.stock || 0);
    const itemQty = Number(existingItem.qty || 0);

    if (currentStock - itemQty < 0) {
      return res.status(400).json({
        error: "INVALID_STOCK_AFTER_DELETE",
        message: "No se puede eliminar esta entrada porque dejaría el stock en negativo.",
      });
    }
  }

  const { error: deleteErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .delete()
    .eq("id", itemId);

  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  const { data: remainingItems, error: remainingErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .select("id")
    .eq("movement_id", existingItem.movement_id)
    .limit(1);

  if (remainingErr) return res.status(500).json({ error: remainingErr.message });

  if (!remainingItems || remainingItems.length === 0) {
    const { error: movementDeleteErr } = await supabaseAdmin
      .from("inventory_movements")
      .delete()
      .eq("id", existingItem.movement_id);

    if (movementDeleteErr) return res.status(500).json({ error: movementDeleteErr.message });
  }

  await logActivity({
    module_key: "inventory",
    action: "MOVEMENT_DELETED",
    actor_id: deleted_by || null,
    entity_type: "inventory_movement_item",
    entity_id: existingItem.id,
    meta: {
      movement_id: existingItem.movement_id,
      item_id: existingItem.id,
      type: movement.type,
      qty: Number(existingItem.qty || 0),
      reason: movement.reason || "",
    },
  });

  sseSend({
    type: "MOVEMENT_DELETED",
    movement_id: existingItem.movement_id,
    item_id: existingItem.id,
    product_id: existingItem.product_id,
    ts: Date.now(),
  });

  return res.json({ ok: true });
});
/* =========================
   Kardex (detalle)
========================= */
router.get("/kardex", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const { data, error } = await supabaseAdmin
    .from("v_inventory_kardex")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

/* =========================
   Analytics (rendimiento)
========================= */
router.get("/analytics", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 30), 7), 365);

  // trae últimos N días (vista ya está agregada por day)
  const { data, error } = await supabaseAdmin
    .from("v_inventory_perf")
    .select("*")
    .order("day", { ascending: false })
    .limit(days);

  if (error) return res.status(500).json({ error: error.message });

  // invierte para graficar ascendente
  res.json({ data: (data || []).reverse() });
});




/* =========================
   Performance Summary (Rendimientos PRO)
   - Salud operativa
   - Cobertura
   - Riesgo
   - Top rotación
========================= */
router.get("/performance-summary", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 30), 7), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: prod, error: pErr } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, stock_min");

  if (pErr) return res.status(500).json({ error: pErr.message });

const { data: stockRows, error: sErr } = await supabaseAdmin
    .from("v_product_available")
    .select("product_id, name, sku, stock, stock_min, is_low_stock");

  if (sErr) return res.status(500).json({ error: sErr.message });

  const { data: kardexRows, error: kErr } = await supabaseAdmin
    .from("v_inventory_kardex")
    .select("type, product_id, sku, product_name, qty, created_at")
    .gte("created_at", since);

  if (kErr) return res.status(500).json({ error: kErr.message });

  const prodById = new Map();
  (prod || []).forEach((p) => {
    prodById.set(String(p.id), {
      id: p.id,
      name: p.name || "",
      sku: p.sku || "",
      stock_min: Number(p.stock_min || 0),
    });
  });

  const perfById = new Map();

  for (const row of kardexRows || []) {
    const pid = String(row.product_id || "");
    const info = prodById.get(pid);

    const prev = perfById.get(pid) || {
      product_id: row.product_id,
      sku: row.sku || info?.sku || "",
      name: row.product_name || info?.name || "",
      qty_in: 0,
      qty_out: 0,
      last_movement_at: row.created_at || null,
    };

    const qty = Number(row.qty || 0);

    if (row.type === "IN") {
      prev.qty_in += qty;
    }

    if (row.type === "OUT") {
      prev.qty_out += qty;
    }

    if (!prev.last_movement_at || new Date(row.created_at) > new Date(prev.last_movement_at)) {
      prev.last_movement_at = row.created_at;
    }

    perfById.set(pid, prev);
  }

  let avgCoverageAcc = 0;
  let avgCoverageCount = 0;

  const criticalProducts = [];
  const deadStockProducts = [];
  const overstockProducts = [];
  const lowCoverageProducts = [];
  const topRotationProducts = [];
  const productRows = [];

  let healthyCount = 0;
  let criticalCount = 0;
  let deadCount = 0;
  let overstockCount = 0;

  for (const stockRow of stockRows || []) {
    const pid = String(stockRow.product_id || "");
    const info = prodById.get(pid) || {};
    const perf = perfById.get(pid) || {
      product_id: stockRow.product_id,
      sku: stockRow.sku || info?.sku || "",
      name: stockRow.name || info?.name || "",
      qty_in: 0,
      qty_out: 0,
      last_movement_at: null,
    };

    const stock = Number(stockRow.stock || 0);
    const stockMin = Number(stockRow.stock_min ?? info?.stock_min ?? 0);
    const avgDailyOut = Number(perf.qty_out || 0) / days;
    const coverageDays = avgDailyOut > 0 ? stock / avgDailyOut : null;
    const rotationScore = stock > 0 ? Number(perf.qty_out || 0) / stock : Number(perf.qty_out || 0);

    const isCritical = Boolean(stockRow.is_low_stock) || stock <= stockMin;
    const isDead = Number(perf.qty_in || 0) === 0 && Number(perf.qty_out || 0) === 0;
    const isOverstock =
      (coverageDays !== null && coverageDays > 45) ||
      (coverageDays === null && stock > Math.max(stockMin, 0) * 2 && stock > 0);
    const isLowCoverage = coverageDays !== null && coverageDays <= 7;

    if (coverageDays !== null && Number.isFinite(coverageDays)) {
      avgCoverageAcc += coverageDays;
      avgCoverageCount += 1;
    }

    if (isDead) {
      deadStockProducts.push({
        product_id: stockRow.product_id,
        sku: stockRow.sku || info?.sku || "",
        name: stockRow.name || info?.name || "",
        stock,
        stock_min: stockMin,
        last_movement_at: perf.last_movement_at,
      });
    }

    if (isCritical) {
      criticalProducts.push({
        product_id: stockRow.product_id,
        sku: stockRow.sku || info?.sku || "",
        name: stockRow.name || info?.name || "",
        stock,
        stock_min: stockMin,
        coverage_days: coverageDays,
      });
    }

    if (isOverstock) {
      overstockProducts.push({
        product_id: stockRow.product_id,
        sku: stockRow.sku || info?.sku || "",
        name: stockRow.name || info?.name || "",
        stock,
        stock_min: stockMin,
        coverage_days: coverageDays,
      });
    }

    if (isLowCoverage) {
      lowCoverageProducts.push({
        product_id: stockRow.product_id,
        sku: stockRow.sku || info?.sku || "",
        name: stockRow.name || info?.name || "",
        stock,
        stock_min: stockMin,
        coverage_days: coverageDays,
      });
    }

    topRotationProducts.push({
      product_id: stockRow.product_id,
      sku: stockRow.sku || info?.sku || "",
      name: stockRow.name || info?.name || "",
      stock,
      qty_out: Number(perf.qty_out || 0),
      rotation_score: rotationScore,
      coverage_days: coverageDays,
    });

    productRows.push({
      product_id: stockRow.product_id,
      sku: stockRow.sku || info?.sku || "",
      name: stockRow.name || info?.name || "",
      stock,
      stock_min: stockMin,
      qty_in: Number(perf.qty_in || 0),
      qty_out: Number(perf.qty_out || 0),
      coverage_days: coverageDays,
      rotation_score: rotationScore,
      status: isCritical ? "Crítico" : isDead ? "Sin movimiento" : isOverstock ? "Sobrestock" : "Saludable",
    });

    if (isCritical) {
      criticalCount += 1;
    } else if (isDead) {
      deadCount += 1;
    } else if (isOverstock) {
      overstockCount += 1;
    } else {
      healthyCount += 1;
    }
  }

  criticalProducts.sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  deadStockProducts.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0));
  overstockProducts.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0));
  lowCoverageProducts.sort((a, b) => Number(a.coverage_days || 999999) - Number(b.coverage_days || 999999));
  topRotationProducts.sort((a, b) => Number(b.rotation_score || 0) - Number(a.rotation_score || 0));
  productRows.sort((a, b) => Number(b.rotation_score || 0) - Number(a.rotation_score || 0));

  res.json({
    data: {
      days,
      avg_coverage_days: avgCoverageCount ? (avgCoverageAcc / avgCoverageCount) : 0,
      critical_count: criticalProducts.length,
      dead_count: deadStockProducts.length,
      overstock_count: overstockProducts.length,
      low_coverage_count: lowCoverageProducts.length,
      status_buckets: {
        healthy: healthyCount,
        critical: criticalCount,
        dead: deadCount,
        overstock: overstockCount,
      },
      critical_products: criticalProducts.slice(0, 10),
      dead_stock_products: deadStockProducts.slice(0, 10),
      overstock_products: overstockProducts.slice(0, 10),
      low_coverage_products: lowCoverageProducts.slice(0, 10),
      top_rotation_products: topRotationProducts.slice(0, 10),
      product_rows: productRows.slice(0, 50),
    },
  });
});

/* =========================
   TOP endpoints (dashboard pro)
   - /top-stock  -> productos con más stock (v_product_stock)
   - /top-in     -> productos con mayor qty IN (N días)
   - /top-out    -> productos con mayor qty OUT (N días)
========================= */

router.get("/top-stock", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 8), 50);

  const { data, error } = await supabaseAdmin
    .from("v_product_stock")
    .select("product_id, sku, name, stock")
    .order("stock", { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

router.get("/top-in", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 8), 50);
  const days = Math.min(Math.max(Number(req.query.days || 30), 7), 365);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  // v_inventory_kardex: type, product_name, sku, qty, created_at...
  const { data, error } = await supabaseAdmin
    .from("v_inventory_kardex")
    .select("product_id, sku, product_name, qty")
    .eq("type", "IN")
    .gte("created_at", since);

  if (error) return res.status(500).json({ error: error.message });

  const map = new Map();
  for (const r of data || []) {
    const id = r.product_id;
    const prev = map.get(id) || { product_id: id, sku: r.sku || "", name: r.product_name || "", qty: 0 };
    prev.qty += Number(r.qty || 0);
    map.set(id, prev);
  }

  const out = Array.from(map.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);

  res.json({ data: out });
});

router.get("/top-out", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 8), 50);
  const days = Math.min(Math.max(Number(req.query.days || 30), 7), 365);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("v_inventory_kardex")
    .select("product_id, sku, product_name, qty")
    .eq("type", "OUT")
    .gte("created_at", since);

  if (error) return res.status(500).json({ error: error.message });

  const map = new Map();
  for (const r of data || []) {
    const id = r.product_id;
    const prev = map.get(id) || { product_id: id, sku: r.sku || "", name: r.product_name || "", qty: 0 };
    prev.qty += Number(r.qty || 0);
    map.set(id, prev);
  }

  const out = Array.from(map.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);

  res.json({ data: out });
});


/* =========================
   Activity feed (historial)
========================= */
router.get("/activity", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 25), 100);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const days = req.query.days ? Math.min(Math.max(Number(req.query.days || 30), 1), 365) : null;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;

  let q = supabaseAdmin
    .from("activity_log")
    .select("*")
    .eq("module_key", "inventory");

  if (since) q = q.gte("created_at", since);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

module.exports = router;