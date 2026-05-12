const router = require("express").Router();
const multer = require("multer");
const { supabaseAdmin } = require("../supabaseAdmin");
const { branchFilter } = require("../middleware/branchFilter");
const { createNotifications } = require("./notifications");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
});

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeString(value) {
  return String(value ?? "").trim();
}

function toIso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function getWorkerMeta(workerId) {
  if (!workerId) return null;

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select(`
      id,
      username,
      full_name,
      profile_photo_url,
      department_id,
      level_id,
      department:departments!workers_department_id_fkey(id, name, color, icon),
      level:worker_levels!workers_level_id_fkey(id, name, authority)
    `)
    .eq("id", workerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

function canViewEvent(event, viewer) {
  if (!event) return false;
  if (event.visibility === "PUBLIC") return true;
  if (!viewer) return false;

  const isCreator = String(event.created_by || "") === String(viewer.id || "");
  const isDirection =
    String(viewer.department?.name || "").trim().toUpperCase() === "DIRECCION";

  const deptIds = Array.isArray(event.department_ids) ? event.department_ids : [];
  const viewerDeptId = String(viewer.department_id || "");

  return isCreator || isDirection || deptIds.some((id) => String(id) === viewerDeptId);
}

async function hydrateEvents(baseEvents) {
  if (!Array.isArray(baseEvents) || baseEvents.length === 0) return [];

  const eventIds = baseEvents.map((e) => e.id);

  const [
    departmentsRes,
    workersRes,
    filesRes,
    commentsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("calendar_event_departments")
      .select(`
        event_id,
        department:departments(id, name, color, icon)
      `)
      .in("event_id", eventIds),

    supabaseAdmin
      .from("calendar_event_workers")
      .select(`
        event_id,
        worker:workers(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name, color),
          level:worker_levels(name, authority)
        )
      `)
      .in("event_id", eventIds),

    supabaseAdmin
      .from("calendar_event_files")
      .select("*")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true }),

    supabaseAdmin
      .from("calendar_event_comments")
      .select(`
        id,
        event_id,
        comment,
        created_at,
        worker:workers(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name),
          level:worker_levels(name)
        )
      `)
      .in("event_id", eventIds)
      .order("created_at", { ascending: true }),
  ]);

  if (departmentsRes.error) throw new Error(departmentsRes.error.message);
  if (workersRes.error) throw new Error(workersRes.error.message);
  if (filesRes.error) throw new Error(filesRes.error.message);
  if (commentsRes.error) throw new Error(commentsRes.error.message);

  const departmentsByEvent = {};
  const workersByEvent = {};
  const filesByEvent = {};
  const commentsByEvent = {};

  for (const row of departmentsRes.data || []) {
    const key = row.event_id;
    if (!departmentsByEvent[key]) departmentsByEvent[key] = [];
    if (row.department) departmentsByEvent[key].push(row.department);
  }

  for (const row of workersRes.data || []) {
    const key = row.event_id;
    if (!workersByEvent[key]) workersByEvent[key] = [];
    if (row.worker) workersByEvent[key].push(row.worker);
  }

  for (const row of filesRes.data || []) {
    const key = row.event_id;
    if (!filesByEvent[key]) filesByEvent[key] = [];
    filesByEvent[key].push(row);
  }

  for (const row of commentsRes.data || []) {
    const key = row.event_id;
    if (!commentsByEvent[key]) commentsByEvent[key] = [];
    commentsByEvent[key].push(row);
  }

  return baseEvents.map((event) => {
    const departments = departmentsByEvent[event.id] || [];
    return {
      ...event,
      departments,
      department_ids: departments.map((d) => d.id),
      workers: workersByEvent[event.id] || [],
      files: filesByEvent[event.id] || [],
      comments: commentsByEvent[event.id] || [],
    };
  });
}

router.get("/meta", async (req, res) => {
  try {
    const workerId = safeString(req.query.workerId);

    const [viewer, departmentsRes, workersRes] = await Promise.all([
      getWorkerMeta(workerId),
      supabaseAdmin
        .from("departments")
        .select("id, name, color, icon")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("workers")
        .select(`
          id,
          username,
          full_name,
          profile_photo_url,
          department_id,
          level_id,
          department:departments!workers_department_id_fkey(id, name, color),
          level:worker_levels!workers_level_id_fkey(id, name, authority)
        `)
        .eq("active", true)
        .order("full_name", { ascending: true }),
    ]);

    if (departmentsRes.error) throw new Error(departmentsRes.error.message);
    if (workersRes.error) throw new Error(workersRes.error.message);

    return res.json({
      viewer,
      departments: departmentsRes.data || [],
      workers: workersRes.data || [],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/events", branchFilter, async (req, res) => {
  try {
    const workerId = safeString(req.query.workerId);
    const from = toIso(req.query.from) || new Date().toISOString();
    const to = toIso(req.query.to) || new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString();
    const search = safeString(req.query.search).toLowerCase();
    const departmentIds = safeString(req.query.departmentIds)
      ? safeString(req.query.departmentIds).split(",").map((x) => x.trim()).filter(Boolean)
      : [];

    const viewer = await getWorkerMeta(workerId);

    let eventsQuery = supabaseAdmin
      .from("calendar_events")
      .select(`
        id,
        title,
        description,
        location,
        visibility,
        starts_at,
        ends_at,
        all_day,
        color,
        created_by,
        creator_department_id,
        branch_id,
        created_at,
        updated_at,
        creator:workers!calendar_events_created_by_fkey(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name, color),
          level:worker_levels(name, authority)
        )
      `)
      .lte("starts_at", to)
      .gte("ends_at", from)
      .order("starts_at", { ascending: true });

    // Filtro de base: Dirección ve todo; otros solo su base o eventos sin base
    if (req.branchId) {
      eventsQuery = eventsQuery.or(`branch_id.eq.${req.branchId},branch_id.is.null`);
    }

    const { data, error } = await eventsQuery;

    if (error) throw new Error(error.message);

    let hydrated = await hydrateEvents(data || []);
    hydrated = hydrated.filter((event) => canViewEvent(event, viewer));

    if (search) {
      hydrated = hydrated.filter((event) => {
        const haystack = [
          event.title,
          event.description,
          event.location,
          ...(event.departments || []).map((d) => d.name),
          ...(event.workers || []).map((w) => w.full_name || w.username),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    if (departmentIds.length > 0) {
      hydrated = hydrated.filter((event) =>
        (event.department_ids || []).some((id) => departmentIds.includes(String(id)))
      );
    }

    return res.json({ events: hydrated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const workerId = safeString(req.query.workerId);
    const viewer = await getWorkerMeta(workerId);

    const { data, error } = await supabaseAdmin
      .from("calendar_events")
      .select(`
        id,
        title,
        description,
        location,
        visibility,
        starts_at,
        ends_at,
        all_day,
        color,
        created_by,
        creator_department_id,
        created_at,
        updated_at,
        creator:workers!calendar_events_created_by_fkey(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name, color),
          level:worker_levels(name, authority)
        )
      `)
      .eq("id", eventId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: "Evento no encontrado" });

    const [event] = await hydrateEvents([data]);
    if (!canViewEvent(event, viewer)) {
      return res.status(403).json({ error: "No tienes permiso para ver este evento" });
    }

    return res.json({ event });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/events", branchFilter, upload.array("files", 5), async (req, res) => {
  try {
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const location = safeString(req.body.location);
    const visibility = safeString(req.body.visibility || "PUBLIC").toUpperCase();
    const startsAt = toIso(req.body.starts_at);
    const endsAt = toIso(req.body.ends_at);
    const allDay = String(req.body.all_day || "false") === "true";
    const workerId = safeString(req.body.worker_id);
    const departmentIds = asArray(req.body.department_ids);
    const workerIds = asArray(req.body.worker_ids);

    if (!title) return res.status(400).json({ error: "El título es obligatorio" });
    if (!startsAt || !endsAt) return res.status(400).json({ error: "Fecha y hora inválidas" });
    if (!workerId) return res.status(400).json({ error: "worker_id requerido" });

    const creator = await getWorkerMeta(workerId);
    if (!creator) return res.status(404).json({ error: "Trabajador no encontrado" });

    const eventColor = creator.department?.color || "#2563eb";

    const { data: created, error: createError } = await supabaseAdmin
      .from("calendar_events")
      .insert({
        title,
        description,
        location,
        visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: allDay,
        color: eventColor,
        created_by: creator.id,
        creator_department_id: creator.department_id || null,
        // hereda la base del worker que crea
        branch_id: req.branchId || null,
      })
      .select("*")
      .single();

    if (createError) throw new Error(createError.message);

    if (departmentIds.length > 0) {
      const rows = departmentIds.map((department_id) => ({
        event_id: created.id,
        department_id,
      }));

      const { error: deptError } = await supabaseAdmin
        .from("calendar_event_departments")
        .insert(rows);

      if (deptError) throw new Error(deptError.message);
    }

    if (workerIds.length > 0) {
      const rows = workerIds.map((wid) => ({
        event_id: created.id,
        worker_id: wid,
      }));

      const { error: workersError } = await supabaseAdmin
        .from("calendar_event_workers")
        .insert(rows);

      if (workersError) throw new Error(workersError.message);
    }

    const files = Array.isArray(req.files) ? req.files.slice(0, 5) : [];
    if (files.length > 0) {
      const bucket = "calendar-files";
      const insertedFiles = [];

      for (const file of files) {
        const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
        const filePath = `events/${created.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) throw new Error(uploadError.message);

        const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

        insertedFiles.push({
          event_id: created.id,
          file_name: file.originalname,
          file_url: pub?.publicUrl || "",
          file_type: file.mimetype,
          file_size: file.size || 0,
        });
      }

      if (insertedFiles.length > 0) {
        const { error: fileInsertError } = await supabaseAdmin
          .from("calendar_event_files")
          .insert(insertedFiles);

        if (fileInsertError) throw new Error(fileInsertError.message);
      }
    }

    const { data: reloaded, error: reloadError } = await supabaseAdmin
      .from("calendar_events")
      .select(`
        id,
        title,
        description,
        location,
        visibility,
        starts_at,
        ends_at,
        all_day,
        color,
        created_by,
        creator_department_id,
        created_at,
        updated_at,
        creator:workers!calendar_events_created_by_fkey(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name, color),
          level:worker_levels(name, authority)
        )
      `)
      .eq("id", created.id)
      .maybeSingle();

    if (reloadError) throw new Error(reloadError.message);

    const [event] = await hydrateEvents([reloaded]);

    return res.json({ event });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.patch("/events/:id", upload.array("files", 5), async (req, res) => {
  try {
    const eventId = req.params.id;
    const workerId = safeString(req.body.worker_id);
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const location = safeString(req.body.location);
    const visibility = safeString(req.body.visibility || "PUBLIC").toUpperCase();
    const startsAt = toIso(req.body.starts_at);
    const endsAt = toIso(req.body.ends_at);
    const allDay = String(req.body.all_day || "false") === "true";
    const departmentIds = asArray(req.body.department_ids);
    const workerIds = asArray(req.body.worker_ids);
    const removedFileIds = asArray(req.body.removed_file_ids);

    const editor = await getWorkerMeta(workerId);
    if (!editor) return res.status(404).json({ error: "Trabajador no encontrado" });

    const { data: current, error: currentError } = await supabaseAdmin
      .from("calendar_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (currentError) throw new Error(currentError.message);
    if (!current) return res.status(404).json({ error: "Evento no encontrado" });

    const isCreator = String(current.created_by || "") === String(editor.id || "");
    const isDirection =
      String(editor.department?.name || "").trim().toUpperCase() === "DIRECCION";

    if (!isCreator && !isDirection) {
      return res.status(403).json({ error: "No tienes permiso para editar este evento" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("calendar_events")
      .update({
        title,
        description,
        location,
        visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: allDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (updateError) throw new Error(updateError.message);

    await supabaseAdmin.from("calendar_event_departments").delete().eq("event_id", eventId);
    await supabaseAdmin.from("calendar_event_workers").delete().eq("event_id", eventId);

    if (departmentIds.length > 0) {
      const deptRows = departmentIds.map((department_id) => ({
        event_id: eventId,
        department_id,
      }));
      const { error: deptError } = await supabaseAdmin
        .from("calendar_event_departments")
        .insert(deptRows);
      if (deptError) throw new Error(deptError.message);
    }

    if (workerIds.length > 0) {
      const workerRows = workerIds.map((wid) => ({
        event_id: eventId,
        worker_id: wid,
      }));
      const { error: workerError } = await supabaseAdmin
        .from("calendar_event_workers")
        .insert(workerRows);
      if (workerError) throw new Error(workerError.message);
    }

    if (removedFileIds.length > 0) {
      const { error: removeFilesError } = await supabaseAdmin
        .from("calendar_event_files")
        .delete()
        .in("id", removedFileIds);

      if (removeFilesError) throw new Error(removeFilesError.message);
    }

    const files = Array.isArray(req.files) ? req.files.slice(0, 5) : [];
    if (files.length > 0) {
      const bucket = "calendar-files";
      const insertedFiles = [];

      for (const file of files) {
        const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
        const filePath = `events/${eventId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) throw new Error(uploadError.message);

        const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

        insertedFiles.push({
          event_id: eventId,
          file_name: file.originalname,
          file_url: pub?.publicUrl || "",
          file_type: file.mimetype,
          file_size: file.size || 0,
        });
      }

      if (insertedFiles.length > 0) {
        const { error: insertFileError } = await supabaseAdmin
          .from("calendar_event_files")
          .insert(insertedFiles);

        if (insertFileError) throw new Error(insertFileError.message);
      }
    }

    const { data: reloaded, error: reloadError } = await supabaseAdmin
      .from("calendar_events")
      .select(`
        id,
        title,
        description,
        location,
        visibility,
        starts_at,
        ends_at,
        all_day,
        color,
        created_by,
        creator_department_id,
        created_at,
        updated_at,
        creator:workers!calendar_events_created_by_fkey(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name, color),
          level:worker_levels(name, authority)
        )
      `)
      .eq("id", eventId)
      .maybeSingle();

    if (reloadError) throw new Error(reloadError.message);

    const [event] = await hydrateEvents([reloaded]);

    return res.json({ event });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete("/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const workerId = safeString(req.query.workerId);

    const worker = await getWorkerMeta(workerId);
    if (!worker) return res.status(404).json({ error: "Trabajador no encontrado" });

    const { data: event, error: eventError } = await supabaseAdmin
      .from("calendar_events")
      .select("id, created_by")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message);
    if (!event) return res.status(404).json({ error: "Evento no encontrado" });

    const isCreator = String(event.created_by || "") === String(worker.id || "");
    const isDirection =
      String(worker.department?.name || "").trim().toUpperCase() === "DIRECCION";

    if (!isCreator && !isDirection) {
      return res.status(403).json({ error: "No tienes permiso para eliminar este evento" });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("calendar_events")
      .delete()
      .eq("id", eventId);

    if (deleteError) throw new Error(deleteError.message);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/events/:id/comments", async (req, res) => {
  try {
    const eventId = req.params.id;
    const workerId = safeString(req.body.worker_id);
    const comment = safeString(req.body.comment);

    if (!workerId) return res.status(400).json({ error: "worker_id requerido" });
    if (!comment) return res.status(400).json({ error: "Comentario requerido" });

    const worker = await getWorkerMeta(workerId);
    if (!worker) return res.status(404).json({ error: "Trabajador no encontrado" });

    const { data: eventBase, error: eventError } = await supabaseAdmin
      .from("calendar_events")
      .select(`
        id,
        title,
        description,
        location,
        visibility,
        starts_at,
        ends_at,
        all_day,
        color,
        created_by,
        creator_department_id,
        created_at,
        updated_at,
        creator:workers!calendar_events_created_by_fkey(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name, color),
          level:worker_levels(name, authority)
        )
      `)
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw new Error(eventError.message);
    if (!eventBase) return res.status(404).json({ error: "Evento no encontrado" });

    const [event] = await hydrateEvents([eventBase]);
    if (!canViewEvent(event, worker)) {
      return res.status(403).json({ error: "No tienes permiso para comentar este evento" });
    }

    const { data, error } = await supabaseAdmin
      .from("calendar_event_comments")
      .insert({
        event_id: eventId,
        worker_id: workerId,
        comment,
      })
      .select(`
        id,
        event_id,
        comment,
        created_at,
        worker:workers(
          id,
          username,
          full_name,
          profile_photo_url,
          department:departments(name),
          level:worker_levels(name)
        )
      `)
      .single();

    if (error) throw new Error(error.message);

    return res.json({ comment: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;