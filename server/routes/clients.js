const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");

function toNumber(value) {
  return Number(value || 0);
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isQuoteAlreadyInvoiced(row) {
  const s = normalizeStatus(row?.status);
  return ["facturada", "facturado", "invoiced", "billed"].includes(s);
}

router.get("/", async (req, res) => {
  try {
    console.log("🟢 clients GET / reached");
    console.log("🟢 query params:", req.query);
    const {
      q,
      status,
      industry,
      company_size,
      min_billed,
      max_billed,
      created_from,
      created_to,
    } = req.query;

    let query = supabaseAdmin
      .from("clients")
      .select("*")
      .order("name", { ascending: true });

    if (q && String(q).trim()) {
      const term = String(q).trim();
      query = query.or(
        `name.ilike.%${term}%,company.ilike.%${term}%,rfc.ilike.%${term}%,email.ilike.%${term}%,website.ilike.%${term}%`
      );
    }

    if (status && String(status).trim() && status !== "Todos") {
      query = query.eq("client_status", String(status).trim());
    }

    if (industry && String(industry).trim() && industry !== "Todas") {
      query = query.eq("industry", String(industry).trim());
    }

    if (company_size && String(company_size).trim() && company_size !== "Todas") {
      query = query.eq("company_size", String(company_size).trim());
    }

    if (created_from) {
      query = query.gte("created_at", created_from);
    }

    if (created_to) {
      query = query.lte("created_at", `${created_to}T23:59:59.999Z`);
    }

    const { data: clients, error } = await query;
    if (error) throw error;

    const clientIds = (clients || []).map((c) => c.id);

    let quotes = [];
    let invoices = [];

    if (clientIds.length > 0) {
      const [{ data: quotesRows, error: quotesError }, { data: invoiceRows, error: invoicesError }] =
        await Promise.all([
          supabaseAdmin
            .from("quotes")
            .select("id, client_id, total, created_at, status")
            .in("client_id", clientIds),
          supabaseAdmin
            .from("invoices")
            .select("id, client_id, client_name, total, created_at, status")
            .or(`client_id.in.(${clientIds.join(",")}),client_name.not.is.null`),
        ]);

      if (quotesError) throw quotesError;
      if (invoicesError) throw invoicesError;

      quotes = quotesRows || [];
      invoices = invoiceRows || [];
    }

    const quotesByClient = quotes.reduce((acc, row) => {
      const key = row.client_id;
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const invoicesByClient = invoices.reduce((acc, row) => {
      const key = row.client_id;
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    let enriched = (clients || []).map((client) => {
      const clientQuotes = quotesByClient[client.id] || [];
      const activeQuotes = clientQuotes.filter((row) => !isQuoteAlreadyInvoiced(row));

      const clientInvoicesById = invoicesByClient[client.id] || [];
      const clientNameKey = normalizeText(client.name);
      const clientCompanyKey = normalizeText(client.company);

      const clientInvoicesByName = invoices.filter((row) => {
        if (row?.client_id) return false;
        const invoiceName = normalizeText(row?.client_name);
        if (!invoiceName) return false;
        return invoiceName === clientNameKey || invoiceName === clientCompanyKey;
      });

      const uniqueInvoicesMap = new Map();
      [...clientInvoicesById, ...clientInvoicesByName].forEach((row) => {
        uniqueInvoicesMap.set(row.id, row);
      });

      const clientInvoices = Array.from(uniqueInvoicesMap.values());

      const lastQuoteDate = activeQuotes
        .map((x) => safeDate(x.created_at))
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null;

      const lastInvoiceDate = clientInvoices
        .map((x) => safeDate(x.created_at))
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null;

      const lastActivity =
        [lastQuoteDate, lastInvoiceDate]
          .filter(Boolean)
          .sort((a, b) => b - a)[0] || null;

      return {
        ...client,
        metrics: {
          quotes_count: activeQuotes.length,
          invoices_count: clientInvoices.length,
          total_quoted: activeQuotes.reduce((sum, row) => sum + toNumber(row.total), 0),
          total_billed: clientInvoices.reduce((sum, row) => sum + toNumber(row.total), 0),
          last_activity_at: lastActivity ? lastActivity.toISOString() : null,
        },
      };
    });

    if (min_billed !== undefined && min_billed !== "") {
      enriched = enriched.filter((client) => Number(client?.metrics?.total_billed || 0) >= Number(min_billed || 0));
    }

    if (max_billed !== undefined && max_billed !== "") {
      enriched = enriched.filter((client) => Number(client?.metrics?.total_billed || 0) <= Number(max_billed || 0));
    }

    return res.json({ data: enriched });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) return res.status(404).json({ error: "client not found" });

    const [
      { data: quotes, error: quotesError },
      { data: invoicesById, error: invoicesByIdError },
      { data: invoicesByName, error: invoicesByNameError },
      { data: serviceSheets, error: serviceSheetsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("quotes")
        .select(`
          id,
          folio,
          title,
          status,
          total,
          valid_until,
          created_at
        `)
        .eq("client_id", id)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("invoices")
        .select(`
          id,
          client_id,
          client_name,
          folio,
          status,
          total,
          delivery_date,
          billing_period,
          service_location,
          created_at
        `)
        .eq("client_id", id)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("invoices")
        .select(`
          id,
          client_id,
          client_name,
          folio,
          status,
          total,
          delivery_date,
          billing_period,
          service_location,
          created_at
        `)
        .eq("client_name", client.name)
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("service_sheets")
        .select(`
          id,
          client_name,
          route_name,
          city,
          location,
          quantity,
          unit_price,
          total_price,
          delivery_date,
          pickup_date,
          service_type,
          status,
          created_at
        `)
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (quotesError) throw quotesError;
    if (invoicesByIdError) throw invoicesByIdError;
    if (invoicesByNameError) throw invoicesByNameError;
    if (serviceSheetsError) throw serviceSheetsError;

    const safeQuotes = quotes || [];
    const activeQuotes = safeQuotes.filter((row) => !isQuoteAlreadyInvoiced(row));

    const invoiceMap = new Map();
    [...(invoicesById || []), ...(invoicesByName || [])].forEach((row) => {
      invoiceMap.set(row.id, row);
    });

    const safeInvoices = Array.from(invoiceMap.values()).sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );

    const safeServiceSheets = serviceSheets || [];

    const totalQuoted = activeQuotes.reduce((sum, row) => sum + toNumber(row.total), 0);
    const totalBilled = safeInvoices.reduce((sum, row) => sum + toNumber(row.total), 0);

    const allDates = [
      ...activeQuotes.map((x) => safeDate(x.created_at)),
      ...safeInvoices.map((x) => safeDate(x.created_at)),
      ...safeServiceSheets.map((x) => safeDate(x.created_at)),
    ].filter(Boolean);

    const lastPurchaseAt = allDates.sort((a, b) => b - a)[0] || null;

    const quoteDates = activeQuotes
      .map((x) => safeDate(x.created_at))
      .filter(Boolean)
      .sort((a, b) => a - b);

    let frequencyDays = null;
    if (quoteDates.length >= 2) {
      let totalDiff = 0;
      for (let i = 1; i < quoteDates.length; i += 1) {
        totalDiff += quoteDates[i] - quoteDates[i - 1];
      }
      frequencyDays = Math.round(totalDiff / (quoteDates.length - 1) / (1000 * 60 * 60 * 24));
    }

    return res.json({
      data: {
        ...client,
        summary: {
          quotes_count: activeQuotes.length,
          invoices_count: safeInvoices.length,
          service_sheets_count: safeServiceSheets.length,
          total_quoted: totalQuoted,
          total_billed: totalBilled,
          last_purchase_at: lastPurchaseAt ? lastPurchaseAt.toISOString() : null,
          frequency_days: frequencyDays,
        },
        quotes: safeQuotes,
        active_quotes: activeQuotes,
        invoices: safeInvoices,
        service_sheets: safeServiceSheets,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { worker_id, ...payload } = req.body || {};

    const { data, error } = await supabaseAdmin
      .from("clients")
      .insert({
        ...payload,
        created_by: worker_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { worker_id, ...payload } = req.body || {};

    const { data, error } = await supabaseAdmin
      .from("clients")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from("clients")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;