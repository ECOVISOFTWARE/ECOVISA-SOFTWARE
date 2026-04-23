const router = require('express').Router();
const { supabaseAdmin: supabase } = require('../supabaseAdmin');
const { generateQuotePDF, generateQuoteExcel, generateQuoteXML } = require('../utils/quotesExport');
const { branchFilter } = require('../middleware/branchFilter');
const { createNotifications } = require('./notifications');
const { syncReservations, releaseReservations, deductInventoryFromQuote } = require('../utils/quoteInventory');
/* ── SSE broadcast ─────────────────────────────────────── */
const sseClients = new Set();
function broadcast(data = { event: 'change' }) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of [...sseClients]) {
    try { res.write(msg); }
    catch { sseClients.delete(res); }
  }
}

/* ── GET /stream ──────────────────────────────────────── */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"event":"connected"}\n\n');
  sseClients.add(res);
  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch { clearInterval(hb); } }, 25000);
  req.on('close', () => { sseClients.delete(res); clearInterval(hb); });
});

/* ── helpers ──────────────────────────────────────────── */
function round2(n) { return Math.round(n * 100) / 100; }
function calcTotals(items = [], taxRate = 16, extraDiscount = 0) {
  const sub  = items.reduce((s, it) => {
    const line = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
    return s + line - line * ((Number(it.discount_pct) || 0) / 100);
  }, 0);
  const after = Math.max(0, sub - (Number(extraDiscount) || 0));
  const tax   = after * ((Number(taxRate) || 0) / 100);
  return { subtotal: round2(sub), tax_amount: round2(tax), total: round2(after + tax) };
}
async function canApproveQuotes(workerId) {
  if (!workerId) return false;
  const { data } = await supabase
    .from('workers')
    .select('department:departments!workers_department_id_fkey(name), level:worker_levels!workers_level_id_fkey(can_approve_quotes,authority)')
    .eq('id', workerId)
    .single();
  if (!data) return false;
  const isDireccion = String(data.department?.name || '').toUpperCase() === 'DIRECCION';
  return isDireccion || Boolean(data.level?.can_approve_quotes) || Number(data.level?.authority) >= 5;
}



/* ════════════════════════════════════════════════════════
   PUBLIC (sin auth)
════════════════════════════════════════════════════════ */
router.get('/public/:token', async (req, res) => {
  try {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select(`
        id, folio, title, status, subtotal, tax_rate, tax_amount,
        discount_amount, total, currency, valid_until, created_at,
        terms, notes, public_token, client_snapshot,
        client:clients(name, email, phone, company, rfc)
      `)
      .eq('public_token', req.params.token)
      .single();
    if (error || !quote) return res.status(404).json({ error: 'Cotización no encontrada' });

    const { data: items } = await supabase
      .from('quote_items').select('*').eq('quote_id', quote.id).order('sort_order');

    const { id, ...pub } = quote;
    res.json({ data: { ...pub, items: items || [] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/public/:token/export/pdf', async (req, res) => {
  try {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select(`*, client:clients(name, email, phone, company, rfc, address)`)
      .eq('public_token', req.params.token).single();
    if (error || !quote) return res.status(404).json({ error: 'No encontrada' });

    const { data: items } = await supabase
      .from('quote_items').select('*').eq('quote_id', quote.id).order('sort_order');

    const pdfBuf = await generateQuotePDF({ ...quote, items: items || [] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio || 'cotizacion'}.pdf"`);
    res.send(pdfBuf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   QUOTES LIST & CRUD
════════════════════════════════════════════════════════ */

// ✅ GET con filtro de base
router.get('/', branchFilter, async (req, res) => {
  try {
    const { status, q } = req.query;
    let query = supabase
      .from('quotes')
      .select(`
        id, folio, title, status, subtotal, tax_rate, tax_amount,
        discount_amount, total, currency, valid_until, created_at,
        public_token, client_snapshot, created_by,
        client:clients(id, name, email, phone, company)
      `)
      .order('created_at', { ascending: false });

    // ✅ Dirección ve todo; otros solo su base
    if (req.branchId) query = query.eq('branch_id', req.branchId);

    if (status && status !== 'all') query = query.eq('status', status);
    if (q) query = query.or(`title.ilike.%${q}%,folio.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;

    const creatorIds = [...new Set((data || []).map(r => r.created_by).filter(Boolean))];
    let creatorsMap = {};
    if (creatorIds.length) {
      const { data: workers } = await supabase
        .from('workers')
        .select(`
          id, full_name, profile_photo_url,
          department:departments!workers_department_id_fkey(id, name, color),
          level:worker_levels!workers_level_id_fkey(name)
        `)
        .in('id', creatorIds);
      (workers || []).forEach(w => { creatorsMap[w.id] = w; });
    }

    const enriched = (data || []).map(r => ({
      ...r,
      creator: creatorsMap[r.created_by] || null,
    }));

    res.json({ data: enriched });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { data: quote, error } = await supabase
      .from('quotes')
      .select(`*, client:clients(id, name, email, phone, address, company, rfc)`)
      .eq('id', req.params.id).single();
    if (error) throw error;
    const { data: items, error: ie } = await supabase
      .from('quote_items').select('*').eq('quote_id', req.params.id).order('sort_order');
    if (ie) throw ie;
    res.json({ data: { ...quote, items: items || [] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ✅ POST con branch_id
router.post('/', branchFilter, async (req, res) => {
  try {
    const { worker_id, items = [], ...payload } = req.body;
    const totals = calcTotals(items, payload.tax_rate, payload.discount_amount);
    let clientSnapshot = {};
    if (payload.client_id) {
      const { data: c } = await supabase.from('clients').select('*').eq('id', payload.client_id).single();
      if (c) clientSnapshot = c;
    }
    const { data: quote, error } = await supabase.from('quotes')
      .insert({
        ...payload, ...totals,
        client_snapshot: clientSnapshot,
        created_by: worker_id,
        status: 'pending',
        // ✅ hereda base del worker
        branch_id: req.branchId || null,
      })
      .select().single();
    if (error) throw error;
const rows = items.filter(it => String(it.description || '').trim()).map((it, idx) => ({
      quote_id: quote.id, description: it.description, unit: it.unit || 'pieza',
      quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0,
      discount_pct: Number(it.discount_pct) || 0, amount: Number(it.amount) || 0, sort_order: idx,
      product_id: it.product_id || null,
    }));
    if (rows.length) await supabase.from('quote_items').insert(rows);
    await syncReservations(quote.id).catch((e) => console.warn("syncReservations POST/ error:", e?.message));
    broadcast();
    res.json({ data: quote });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { worker_id, items, ...payload } = req.body;
    const totals = calcTotals(items || [], payload.tax_rate, payload.discount_amount);
    const { data: quote, error } = await supabase.from('quotes')
      .update({ ...payload, ...totals }).eq('id', req.params.id).select().single();
    if (error) throw error;
if (items !== undefined) {
      await supabase.from('quote_items').delete().eq('quote_id', req.params.id);
      const rows = (items || []).filter(it => String(it.description || '').trim()).map((it, idx) => ({
        quote_id: req.params.id, description: it.description, unit: it.unit || 'pieza',
        quantity: Number(it.quantity) || 1, unit_price: Number(it.unit_price) || 0,
        discount_pct: Number(it.discount_pct) || 0, amount: Number(it.amount) || 0, sort_order: idx,
        product_id: it.product_id || null,
      }));
      if (rows.length) await supabase.from('quote_items').insert(rows);
    }
    await syncReservations(req.params.id).catch((e) => console.warn("syncReservations PUT/:id error:", e?.message));
    broadcast();
    res.json({ data: quote });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('quotes').delete().eq('id', req.params.id);
    if (error) throw error;
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Status transitions ──────────────────────────────── */

// ✅ pending → approved con notificación al creador
router.post('/:id/approve', async (req, res) => {
  try {
    const { worker_id } = req.body;
    if (!await canApproveQuotes(worker_id))
      return res.status(403).json({ error: 'No tienes permiso para aprobar cotizaciones' });

    // Obtener la cotización antes de actualizar
    const { data: prev } = await supabase
      .from('quotes').select('id, folio, title, created_by, branch_id').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('quotes')
      .update({ status: 'approved', approved_by: worker_id, approved_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    broadcast();

// ✅ Notificar al creador de la cotización
    if (prev?.created_by && prev.created_by !== worker_id) {
      const { data: actor } = await supabase
        .from('workers').select('id, full_name, profile_photo_url').eq('id', worker_id).maybeSingle();
      await createNotifications([{
        recipient_id: prev.created_by,
        actor_id: worker_id,
        actor_name: actor?.full_name || 'Director',
        actor_photo: actor?.profile_photo_url || null,
        type: 'quote_approved',
        title: 'Cotización aprobada',
        message: `Tu cotización "${prev.folio || prev.title}" fue aprobada`,
        entity_type: 'quote',
        entity_id: prev.id,
        branch_id: prev.branch_id || null,
      }]);
    }

    // ✅ Descontar inventario y registrar salida
    await deductInventoryFromQuote(req.params.id, worker_id, prev?.folio).catch((e) =>
      console.warn("deductInventory approve error:", e?.message)
    );

    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
}); 

// ✅ pending/approved → rejected con notificación al creador
router.post('/:id/reject', async (req, res) => {
  try {
    const { worker_id, reason } = req.body;
    if (!await canApproveQuotes(worker_id))
      return res.status(403).json({ error: 'No tienes permiso para rechazar cotizaciones' });

    const { data: prev } = await supabase
      .from('quotes').select('id, folio, title, created_by, branch_id').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('quotes')
      .update({
        status: 'rejected', rejected_by: worker_id,
        rejected_at: new Date().toISOString(), rejection_reason: reason || '',
      })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    broadcast();

// ✅ Notificar al creador
    if (prev?.created_by && prev.created_by !== worker_id) {
      const { data: actor } = await supabase
        .from('workers').select('id, full_name, profile_photo_url').eq('id', worker_id).maybeSingle();
      await createNotifications([{
        recipient_id: prev.created_by,
        actor_id: worker_id,
        actor_name: actor?.full_name || 'Director',
        actor_photo: actor?.profile_photo_url || null,
        type: 'quote_rejected',
        title: 'Cotización rechazada',
        message: `Tu cotización "${prev.folio || prev.title}" fue rechazada${reason ? ': ' + reason : ''}`,
        entity_type: 'quote',
        entity_id: prev.id,
        branch_id: prev.branch_id || null,
      }]);
    }

    // ✅ Liberar reservas de inventario
    await releaseReservations(req.params.id).catch((e) =>
      console.warn("releaseReservations reject error:", e?.message)
    );

    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// rejected → pending
router.post('/:id/reopen', async (req, res) => {
  try {
    const { data, error } = await supabase.from('quotes')
      .update({ status: 'pending', rejected_at: null, rejected_by: null, rejection_reason: null })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    broadcast();
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// approved → paid + descuenta inventario
router.post('/:id/pay', async (req, res) => {
  try {
    const { worker_id } = req.body;
    if (!await canApproveQuotes(worker_id))
      return res.status(403).json({ error: 'No tienes permiso para marcar como pagada' });

    const { data: quote, error: qe } = await supabase.from('quotes')
      .update({ status: 'paid', approved_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (qe) throw qe;

    // ✅ Usa el helper centralizado: crea movimiento OUT + libera reservas
    await deductInventoryFromQuote(req.params.id, worker_id, quote?.folio).catch((e) =>
      console.warn("deductInventory pay error:", e?.message)
    );

    broadcast();
    res.json({ data: quote });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// approved/paid → cancelled
router.post('/:id/cancel', async (req, res) => {
  try {
    const { worker_id } = req.body;
    if (!await canApproveQuotes(worker_id))
      return res.status(403).json({ error: 'No tienes permiso para cancelar cotizaciones' });
    const { data, error } = await supabase.from('quotes')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    // ✅ Liberar reservas al cancelar
    await releaseReservations(req.params.id).catch((e) =>
      console.warn("releaseReservations cancel error:", e?.message)
    );

    broadcast();
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/:id/invoice', async (req, res) => {
  try {
    const { worker_id } = req.body;
    if (!await canApproveQuotes(worker_id))
      return res.status(403).json({ error: 'No tienes permiso para marcar como facturada' });

    const { data, error } = await supabase.from('quotes')
      .update({ status: 'invoiced' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    broadcast();
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
/* ── Exports ─────────────────────────────────────────── */
async function loadFullQuote(id) {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select(`*, client:clients(name, email, phone, address, company, rfc)`)
    .eq('id', id).single();
  if (error) throw error;
  const { data: items } = await supabase
    .from('quote_items').select('*').eq('quote_id', id).order('sort_order');
  let approver = null;
  if (quote?.approved_by) {
    const { data: w } = await supabase
      .from('workers').select('full_name').eq('id', quote.approved_by).single();
    approver = w || null;
  }
  return { ...quote, approver, items: items || [] };
}

router.get('/:id/export/pdf', async (req, res) => {
  try {
    const quote = await loadFullQuote(req.params.id);
    const buf   = await generateQuotePDF(quote);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio || 'cotizacion'}.pdf"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }); }
});

router.get('/:id/export/excel', async (req, res) => {
  try {
    const quote = await loadFullQuote(req.params.id);
    const buf   = await generateQuoteExcel(quote);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio || 'cotizacion'}.xlsx"`);
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }); }
});

router.get('/:id/export/xml', async (req, res) => {
  try {
    const quote = await loadFullQuote(req.params.id);
    const xml   = generateQuoteXML(quote);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.folio || 'cotizacion'}.xml"`);
    res.send(xml);
  } catch (e) { res.status(500).json({ error: e.message, stack: e.stack }); }
});

module.exports = router;