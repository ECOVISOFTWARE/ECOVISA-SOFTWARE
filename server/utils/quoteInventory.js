const { supabaseAdmin } = require("../supabaseAdmin");

/**
 * Sincroniza las reservas de una cotización.
 * Lee los quote_items que tienen product_id y actualiza quote_reservations.
 */
async function syncReservations(quoteId) {
  if (!quoteId) return;

  // 1) Leer items con product_id
  const { data: items, error } = await supabaseAdmin
    .from("quote_items")
    .select("product_id, quantity")
    .eq("quote_id", quoteId)
    .not("product_id", "is", null);

  if (error) {
    console.error("syncReservations - items error:", error.message);
    return;
  }

  // 2) Agrupar por product_id (pueden repetirse)
  const grouped = {};
  for (const item of items || []) {
    if (!item.product_id) continue;
    grouped[item.product_id] = (grouped[item.product_id] || 0) + Number(item.quantity || 0);
  }

  // 3) Borrar reservas anteriores de esta cotización
  await supabaseAdmin
    .from("quote_reservations")
    .delete()
    .eq("quote_id", quoteId);

  // 4) Insertar reservas actualizadas
  const rows = Object.entries(grouped)
    .filter(([, qty]) => qty > 0)
    .map(([product_id, qty]) => ({ quote_id: quoteId, product_id, qty }));

  if (rows.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from("quote_reservations")
      .insert(rows);
    if (insErr) console.error("syncReservations - insert error:", insErr.message);
  }
}

/**
 * Libera las reservas de una cotización (rechazada, cancelada, etc.)
 */
async function releaseReservations(quoteId) {
  if (!quoteId) return;
  await supabaseAdmin
    .from("quote_reservations")
    .delete()
    .eq("quote_id", quoteId);
}

/**
 * Convierte los items de una cotización en un movimiento de SALIDA real del inventario.
 */
async function deductInventoryFromQuote(quoteId, actorId, folio) {
  if (!quoteId) return;

  // 1) Leer items con product_id
  const { data: items, error } = await supabaseAdmin
    .from("quote_items")
    .select("product_id, quantity, unit_price")
    .eq("quote_id", quoteId)
    .not("product_id", "is", null);

  if (error || !items?.length) {
    console.warn("deductInventoryFromQuote - no items con product_id:", quoteId);
    await releaseReservations(quoteId);
    return;
  }

  // Agrupar por product_id
  const grouped = {};
  for (const item of items) {
    if (!item.product_id) continue;
    if (!grouped[item.product_id]) {
      grouped[item.product_id] = { qty: 0, unit_cost: Number(item.unit_price || 0) };
    }
    grouped[item.product_id].qty += Number(item.quantity || 0);
  }

  const movItems = Object.entries(grouped)
    .filter(([, v]) => v.qty > 0)
    .map(([product_id, v]) => ({ product_id, qty: v.qty, unit_cost: v.unit_cost }));

  if (!movItems.length) {
    await releaseReservations(quoteId);
    return;
  }

  // 2) Crear movimiento de SALIDA
  const { data: movement, error: movErr } = await supabaseAdmin
    .from("inventory_movements")
    .insert({
      type: "OUT",
      reason: `Cotización ${folio || quoteId} aprobada`,
      created_by: actorId || null,
    })
    .select("id")
    .single();

  if (movErr || !movement) {
    console.error("deductInventoryFromQuote - movement error:", movErr?.message);
    return;
  }

  // 3) Insertar items del movimiento
  const { error: itemsErr } = await supabaseAdmin
    .from("inventory_movement_items")
    .insert(
      movItems.map((i) => ({
        movement_id: movement.id,
        product_id: i.product_id,
        qty: i.qty,
        unit_cost: i.unit_cost,
      }))
    );

  if (itemsErr) {
    console.error("deductInventoryFromQuote - items error:", itemsErr.message);
  }

  // 4) Liberar reservas (ya se descontaron del inventario real)
  await releaseReservations(quoteId);
}

module.exports = { syncReservations, releaseReservations, deductInventoryFromQuote };