  require("dotenv").config();

  const path = require("path");
  const fs = require("fs");
  const express = require("express");
  const cors = require("cors");

  const adminRoutes = require("./routes/admin");
  const formsRoutes = require("./routes/forms");
  const inventoryRoutes = require("./routes/inventory");
  const quotesRoutes = require("./routes/quotes");
  const clientsRoutes = require("./routes/clients");
  const servicesRoutes = require("./routes/services");
  const invoicesRoutes = require("./routes/invoices");
  const serviceSheetsRoutes = require("./routes/serviceSheets");
  const weeklyReportsRoutes  = require("./routes/weeklyReports");
  const generalReportsRoutes = require("./routes/generalReports");
  const operationsRoutes     = require("./routes/operations");
  const branchesRoutes       = require("./routes/branches");
  const notificationsRoutes  = require("./routes/notifications");
  const salesRoutes          = require("./routes/sales");
  const gpsRoutes = require("./routes/gps");
  const calendarRoutes = require("./routes/calendar");
  const workersRoutes = require("./routes/workers");
  const pushRoutes = require("./routes/pushSubscriptions");

  const { supabaseAdmin } = require("./supabaseAdmin");

  const app = express();

  /* =========================
    DEBUG: confirma inventory router
  ========================= */
  console.log("🔌 inventoryRoutes loaded type:", typeof inventoryRoutes);
  console.log("🔌 inventoryRoutes loaded from:", require.resolve("./routes/inventory"));

  /* =========================
    Headers debug
  ========================= */
  app.use((req, res, next) => {
    res.setHeader("X-Server-File", __filename);
    next();
  });

  /* =========================
    CORS (Express 5 compatible)
    - NO usar app.options("*", ...)
  ========================= */
  const isProd = process.env.NODE_ENV === "production";

  
  if (!isProd) {
    const ALLOWED_ORIGINS = [
      "http://localhost:3000",
      "http://localhost:5173",
    ];

    const corsOptions = {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error("CORS blocked: " + origin));
      },
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-worker-id"],
    };

    app.use(cors(corsOptions));
    app.options(/.*/, cors(corsOptions));

    app.use((err, req, res, next) => {
      if (err && String(err.message || "").startsWith("CORS blocked:")) {
        return res.status(403).json({ error: err.message, origin: req.headers.origin || "" });
      }
      next(err);
    });
  }

  // si CORS bloquea, responde en JSON (debug real)
  app.use((err, req, res, next) => {
    if (err && String(err.message || "").startsWith("CORS blocked:")) {
      return res.status(403).json({ error: err.message, origin: req.headers.origin || "" });
    }
    next(err);
  });

  /* =========================
    Parsers + logs
  ========================= */
  app.use(express.json({ limit: "5mb" }));

  app.use((req, res, next) => {
    console.log("➡️", req.method, req.url);
    next();
  });

  /* =========================
    Health
  ========================= */
  app.get("/api/health", (req, res) => res.json({ ok: true }));

  /* =========================
    API Routes
  ========================= */
  app.use("/api/admin", adminRoutes);
  app.use("/api/forms", formsRoutes);

  /* =========================
    DEBUG DIRECTO (BYPASS ROUTER)
  ========================= */
  app.get("/api/inventory/metrics-ping", (req, res) => {
    return res.json({ ok: true, from: "SERVER_DIRECT" });
  });

  // Inventory (con log extra)
  app.use(
    "/api/inventory",
    (req, res, next) => {
      console.log("HIT /api/inventory ->", req.method, req.url);
      console.log("inventory router file mounted from:", require.resolve("./routes/inventory"));
      next();
    },
    inventoryRoutes
  );

  // DEBUG DIRECTO PARA COMPARAR CONTRA EL ROUTER
  app.get("/api/inventory/performance-summary-direct", async (req, res) => {
    return res.json({
      ok: true,
      from: "SERVER_DIRECT_PERFORMANCE",
      server_file: __filename,
      inventory_router_file: require.resolve("./routes/inventory"),
      ts: Date.now(),
    });
  });

app.use("/api/quotes", quotesRoutes);

app.use(
  "/api/clients",
  (req, res, next) => {
    console.log("HIT /api/clients ->", req.method, req.url);
    console.log("clients router file mounted from:", require.resolve("./routes/clients"));
    next();
  },
  clientsRoutes
);

app.use("/api/services", servicesRoutes);
  app.use("/api/invoices", invoicesRoutes);
  app.use("/api/service-sheets", serviceSheetsRoutes);
  app.use("/api/weekly-reports", weeklyReportsRoutes);
  app.use("/api/general-reports", generalReportsRoutes);
  app.use("/api/operations", operationsRoutes);
  app.use("/api/branches", branchesRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/sales", salesRoutes);
  app.use("/api/gps", gpsRoutes);
  app.use("/api/calendar", calendarRoutes);
  app.use("/api/workers", workersRoutes);
  app.use("/api/push", pushRoutes);
  /* =========================
    Debug: lista rutas cargadas
  ========================= */
  app.get("/api/__routes", (req, res) => {
    const out = [];
    const stack =
      (app._router && app._router.stack) ||
      (app.router && app.router.stack) ||
      [];

    function pushRoute(pathBase, layer) {
      if (!layer || !layer.route) return;
      const p = layer.route.path;
      const methods = Object.keys(layer.route.methods || {}).map((m) =>
        m.toUpperCase()
      );
      out.push({ path: `${pathBase}${p}`, methods });
    }

    stack.forEach((layer) => {
      if (layer.name === "router" && layer.handle && layer.handle.stack) {
        const base = layer.regexp?.toString?.() || "";
        let basePretty = "";

        if (base.includes("\\/api\\/admin")) basePretty = "/api/admin";
        else if (base.includes("\\/api\\/forms")) basePretty = "/api/forms";
        else if (base.includes("\\/api\\/inventory")) basePretty = "/api/inventory";
        else if (base.includes("\\/api\\/quotes")) basePretty = "/api/quotes";
        else if (base.includes("\\/api\\/services")) basePretty = "/api/services";
        else if (base.includes("\\/api\\/invoices")) basePretty = "/api/invoices";
        else if (base.includes("\\/api\\/service-sheets")) basePretty = "/api/service-sheets";
        else if (base.includes("\\/api\\/weekly-reports")) basePretty = "/api/weekly-reports";
        else if (base.includes("\\/api\\/sales")) basePretty = "/api/sales";
        else if (base.includes("\\/api\\/gps")) basePretty = "/api/gps";
        else if (base.includes("\\/api\\/calendar")) basePretty = "/api/calendar";
        else if (base.includes("\\/api\\/workers")) basePretty = "/api/workers";

        layer.handle.stack.forEach((l2) => pushRoute(basePretty, l2));
      } else {
        pushRoute("", layer);
      }
    });

    res.json({ routes: out });
  });

  /* =========================
    Login interno
  ========================= */
  app.post("/api/login", async (req, res) => {
    try {
      const rawUser = req.body?.username ?? "";
      const rawPass = req.body?.password ?? "";

      const username = String(rawUser).trim().toLowerCase();
      const password = String(rawPass).replace(/\s+/g, "").trim().toUpperCase();

      if (!username || !password) {
        return res.status(400).json({ error: "Missing credentials" });
      }

const { data, error } = await supabaseAdmin
  .from("workers")
  .select(
    `
    id,
    username,
    password_plain,
    full_name,
    profile_photo_url,
    active,
    department_id,
    level_id,
    branch_id,
    department:departments!workers_department_id_fkey(name),
    level:worker_levels!workers_level_id_fkey(name, authority, can_approve_quotes),
    branch:branches!workers_branch_id_fkey(id, name, color)
  `
  )
  .ilike("username", username)
  .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });

      if (!data || !data.active) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const dbPass = String(data.password_plain ?? "").trim();
      if (dbPass !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

return res.json({
      worker: {
        id: data.id,
        username: data.username,
        full_name: data.full_name,
        profile_photo_url: data.profile_photo_url || "",
        department_id: data.department_id,
        level_id: data.level_id,
        branch_id: data.branch_id || null,
        department_name: data.department?.name || "",
        level_name: data.level?.name || "",
        authority: data.level?.authority || 1,
        can_approve_quotes: Boolean(data.level?.can_approve_quotes),
        branch_name: data.branch?.name || "",
        branch_color: data.branch?.color || "",
      },
    });
    } catch (e) {
      console.error("LOGIN ERROR:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  /* =========================
    404 DEBUG SOLO PARA /api
  ========================= */
  app.use("/api", (req, res) => {
    return res.status(404).json({
      error: "API route not found",
      method: req.method,
      path: req.originalUrl,
      server_file: __filename,
    });
  });

  /* =========================
    Servir React (CRA build)
  ========================= */
  const buildCandidates = [
    path.join(__dirname, "build"),
    path.join(__dirname, "..", "web", "build"),
  ];

  const webBuild =
    buildCandidates.find((candidate) =>
      fs.existsSync(path.join(candidate, "index.html"))
    ) || buildCandidates[0];

  console.log("🌐 React build candidates:", buildCandidates);
  console.log("🌐 React build selected:", webBuild);
  console.log(
    "🌐 index.html exists:",
    fs.existsSync(path.join(webBuild, "index.html"))
  );

  app.use(express.static(webBuild));

  // Catch-all SPA (NO tocar /api)
  app.get(/^\/(?!api).*/, (req, res) => {
    const indexFile = path.join(webBuild, "index.html");

    if (!fs.existsSync(indexFile)) {
      console.error("❌ index.html not found at:", indexFile);
      return res.status(500).json({
        error: "React build not found",
        expected_paths: buildCandidates,
        selected_build: webBuild,
        server_file: __filename,
      });
    }

    return res.sendFile(indexFile);
  });

  /* =========================
    Start
  ========================= */
  // ─── Limpieza automática de notificaciones cada 7 días ───────
  const { supabaseAdmin: _supaForCleanup } = require("./supabaseAdmin");

  async function cleanOldNotifications() {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await _supaForCleanup
        .from("notifications")
        .delete()
        .lt("created_at", cutoff);
      if (error) {
        console.error("⚠️ cleanOldNotifications error:", error.message);
      } else {
        console.log("🧹 Notificaciones antiguas eliminadas (> 7 días):", new Date().toISOString());
      }
    } catch (e) {
      console.error("⚠️ cleanOldNotifications exception:", e.message);
    }
  }

  // Ejecutar al arrancar + cada 7 días
  cleanOldNotifications();
  setInterval(cleanOldNotifications, 7 * 24 * 60 * 60 * 1000);

  const port = Number(process.env.PORT || 3001);

const server = app.listen(port, "0.0.0.0", () => {
  console.log("Server running on port", port);
  console.log("NODE_ENV =", process.env.NODE_ENV);
  console.log("Server file =", __filename);
  console.log("Serving static from =", webBuild);
  console.log("server.listening =", server.listening);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

// Mantener vivo el event loop en dev y además detectar quién cierra el proceso
const __DEV_KEEPALIVE__ = setInterval(() => {
  // noop
}, 30000);

process.on("beforeExit", (code) => {
  console.error("⚠️ process.beforeExit code =", code);
});

process.on("exit", (code) => {
  console.error("⚠️ process.exit code =", code);
});

process.on("SIGINT", () => {
  console.error("⚠️ SIGINT recibido");
});

process.on("SIGTERM", () => {
  console.error("⚠️ SIGTERM recibido");
});

process.on("uncaughtException", (err) => {
  console.error("🔥 uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 unhandledRejection:", reason);
});