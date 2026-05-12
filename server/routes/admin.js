const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");

// DEBUG: confirma que ESTE archivo se está cargando
console.log("ADMIN ROUTES LOADED:", __filename);

async function replaceLevelPermissions(levelId, permissions) {
  const safePermissions = Array.isArray(permissions) ? permissions : [];

  const { error: deleteError } = await supabaseAdmin
    .from("level_module_permissions")
    .delete()
    .eq("level_id", levelId);

  if (deleteError) throw new Error(deleteError.message);

  const rows = safePermissions
    .filter((item) => item && item.module_key)
    .map((item) => ({
      level_id: levelId,
      module_key: String(item.module_key).trim(),
      can_view: Boolean(item.can_view),
      can_create: Boolean(item.can_create),
      can_edit: Boolean(item.can_edit),
      can_approve: Boolean(item.can_approve),
      can_delete: Boolean(item.can_delete),
      can_export: Boolean(item.can_export),
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) return;

  const { error: insertError } = await supabaseAdmin
    .from("level_module_permissions")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);
}

// DEBUG: confirma que el PUT/DELETE realmente entra al router admin
router.use((req, res, next) => {
  if (req.url.startsWith("/departments/")) {
    console.log("ADMIN HIT:", req.method, req.originalUrl);
  }
  next();
});

// =====================
// Departments
// =====================
router.get("/departments", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id, name, color, icon, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.post("/departments", async (req, res) => {
  const { name, color, icon } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  const payload = {
    name,
    color: color ?? null,
    icon: icon ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("departments")
    .insert(payload)
    .select("id, name, color, icon, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.put("/departments/:id", async (req, res) => {
  const { id } = req.params;
  const { name, color, icon } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  if (!name) return res.status(400).json({ error: "name required" });

  const payload = {
    name,
    color: color ?? null,
    icon: icon ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("departments")
    .update(payload)
    .eq("id", id)
    .select("id, name, color, icon, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.delete("/departments/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });

  const { error } = await supabaseAdmin
    .from("departments")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
// =====================
// Levels (Puestos)
// authority: 1..5 (simple)
// rank se mantiene por compatibilidad
// =====================
router.get("/levels", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("worker_levels")
    .select("*")
    .order("authority", { ascending: true })
    .order("rank", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.post("/levels", async (req, res) => {
  const { name, authority, can_approve_quotes, can_manage_calendar } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  const auth = Math.max(1, Math.min(5, Number(authority || 1)));
  const rank = auth;

  const { data, error } = await supabaseAdmin
    .from("worker_levels")
    .insert({ name, authority: auth, rank, can_approve_quotes: Boolean(can_approve_quotes), can_manage_calendar: Boolean(can_manage_calendar) })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});
// UPDATE level
router.put("/levels/:id", async (req, res) => {
  const { id } = req.params;
  const { name, authority, can_approve_quotes, can_manage_calendar } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  if (!name) return res.status(400).json({ error: "name required" });

  const auth = Math.max(1, Math.min(5, Number(authority || 1)));
  const rank = auth;

  const { data, error } = await supabaseAdmin
    .from("worker_levels")
    .update({ name, authority: auth, rank, can_approve_quotes: Boolean(can_approve_quotes), can_manage_calendar: Boolean(can_manage_calendar) })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// DELETE level
router.delete("/levels/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });

  const { error } = await supabaseAdmin
    .from("worker_levels")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
// =====================
// Workers
// =====================
router.get("/workers", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select(`
      id,
      username,
      password_plain,
      full_name,
      active,
      department_id,
      level_id,
      branch_id,
      profile_photo_url,
      created_at,
      department:departments!workers_department_id_fkey(id, name, color, icon),
      level:worker_levels!workers_level_id_fkey(id, name, authority, rank, can_approve_quotes, can_manage_calendar),
      branch:branches!workers_branch_id_fkey(id, name, color)
    `)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});
router.post("/workers", async (req, res) => {
  const { username, password_plain, full_name, department_id, level_id, branch_id, active } = req.body || {};
  if (!username || !password_plain) return res.status(400).json({ error: "username and password_plain required" });

  const { data, error } = await supabaseAdmin
    .from("workers")
    .insert({
      username,
      password_plain,
      full_name: full_name || null,
      department_id: department_id || null,
      level_id: level_id || null,
      branch_id: branch_id || null,
      active: active ?? true,
    })
    .select("id, username, password_plain, full_name, active, department_id, level_id, branch_id, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

router.put("/workers/:id", async (req, res) => {
  const { id } = req.params;
  const { username, password_plain, full_name, department_id, level_id, branch_id, active } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });
  if (!username || !password_plain) return res.status(400).json({ error: "username and password_plain required" });

  // Invalida cache de base si cambió
  const { invalidateBranchCache } = require("../middleware/branchFilter");
  invalidateBranchCache(id);

  const { data, error } = await supabaseAdmin
    .from("workers")
    .update({
      username,
      password_plain,
      full_name: full_name || null,
      department_id: department_id || null,
      level_id: level_id || null,
      branch_id: branch_id || null,
      active: active ?? true,
    })
    .eq("id", id)
    .select("id, username, password_plain, full_name, active, department_id, level_id, branch_id, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});
router.delete("/workers/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });

  const { error } = await supabaseAdmin
    .from("workers")
    .delete()
    .eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});


// =====================
// Access Policies (Permisos por depto + puesto)
// =====================

// GET: listar policies
router.get("/access-policies", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("access_policies")
    .select("id, department_id, level_id, allowed_modules, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST: upsert por (department_id, level_id)
router.post("/access-policies", async (req, res) => {
  const { department_id, level_id, allowed_modules } = req.body || {};
  if (!department_id || !level_id) {
    return res.status(400).json({ error: "department_id and level_id required" });
  }

  const payload = {
    department_id,
    level_id,
    allowed_modules: Array.isArray(allowed_modules) ? allowed_modules : [],
  };

  const { data, error } = await supabaseAdmin
    .from("access_policies")
    .upsert(payload, { onConflict: "department_id,level_id" })
    .select("id, department_id, level_id, allowed_modules, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});
// =====================
// Permisos efectivos del usuario (heredados del puesto)
// =====================

router.get("/workers/:id/permissions", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });

  const { data: worker, error: workerError } = await supabaseAdmin
    .from("workers")
    .select("id, level_id")
    .eq("id", id)
    .maybeSingle();

  if (workerError) return res.status(500).json({ error: workerError.message });
  if (!worker) return res.status(404).json({ error: "worker not found" });

  const { data, error } = await supabaseAdmin
    .from("level_module_permissions")
    .select("module_key, can_view, can_create, can_edit, can_approve, can_delete, can_export")
    .eq("level_id", worker.level_id);

  if (error) return res.status(500).json({ error: error.message });

  const map = {};
  (data || []).forEach((row) => {
    map[row.module_key] = {
      can_view: row.can_view,
      can_create: row.can_create,
      can_edit: row.can_edit,
      can_approve: row.can_approve,
      can_delete: row.can_delete,
      can_export: row.can_export,
    };
  });

  return res.json({
    data: {
      worker_id: worker.id,
      level_id: worker.level_id,
      inherited_from_level: true,
      permissions: map,
    },
  });
});

// =====================
// Permisos granulares por PUESTO
// =====================
router.get("/levels/:id/permissions", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id required" });

  const { data, error } = await supabaseAdmin
    .from("level_module_permissions")
    .select("module_key, can_view, can_create, can_edit, can_approve, can_delete, can_export")
    .eq("level_id", id);

  if (error) return res.status(500).json({ error: error.message });

  const map = {};
  (data || []).forEach((row) => {
    map[row.module_key] = {
      can_view:    row.can_view,
      can_create:  row.can_create,
      can_edit:    row.can_edit,
      can_approve: row.can_approve,
      can_delete:  row.can_delete,
      can_export:  row.can_export,
    };
  });

  return res.json({ data: map });
});

router.put("/levels/:id/permissions", async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body || {};
  if (!id) return res.status(400).json({ error: "id required" });

  try {
    await replaceLevelPermissions(id, Array.isArray(permissions) ? permissions : []);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// También incluir permisos al traer los levels
router.get("/levels/with-permissions", async (req, res) => {
  const { data: levels, error: levelsError } = await supabaseAdmin
    .from("worker_levels")
    .select("*")
    .order("authority", { ascending: true });

  if (levelsError) return res.status(500).json({ error: levelsError.message });

  const { data: perms, error: permsError } = await supabaseAdmin
    .from("level_module_permissions")
    .select("*");

  if (permsError) return res.status(500).json({ error: permsError.message });

  const permsByLevel = {};
  (perms || []).forEach((p) => {
    if (!permsByLevel[p.level_id]) permsByLevel[p.level_id] = {};
    permsByLevel[p.level_id][p.module_key] = p;
  });

  const enriched = (levels || []).map((l) => ({
    ...l,
    module_permissions: permsByLevel[l.id] || {},
  }));

  return res.json({ data: enriched });
});

// DEBUG: lista rutas registradas en este router (para confirmar que existe access-policies)
router.get("/__routes", (req, res) => {
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });
  res.json({ routes });
});

module.exports = router;