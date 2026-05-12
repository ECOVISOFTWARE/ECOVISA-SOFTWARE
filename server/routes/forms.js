const router = require("express").Router();
const { supabaseAdmin } = require("../supabaseAdmin");
const {
  generateExcelBuffer,
  generatePdfBuffer,
  generateAnswersGridExcelBuffer,
} = require("../utils/formsExport");
const { branchFilter } = require("../middleware/branchFilter");

const answerStreams = new Map();

function streamKey(formId) {
  return `form_${formId}`;
}

function addAnswerStream(formId, res) {
  const key = streamKey(formId);
  const current = answerStreams.get(key) || new Set();
  current.add(res);
  answerStreams.set(key, current);
}

function removeAnswerStream(formId, res) {
  const key = streamKey(formId);
  const current = answerStreams.get(key);
  if (!current) return;
  current.delete(res);
  if (!current.size) {
    answerStreams.delete(key);
  }
}

function emitAnswerEvent(formId, payload = {}) {
  const key = streamKey(formId);
  const listeners = answerStreams.get(key);
  if (!listeners || !listeners.size) return;

  const body = `data: ${JSON.stringify({
    type: "answers_changed",
    formId,
    at: new Date().toISOString(),
    ...payload,
  })}\n\n`;

  listeners.forEach((res) => {
    try {
      res.write(body);
    } catch {
      //
    }
  });
}

async function getWorkerContext(workerId) {
  if (!workerId) return null;

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select(`
      id,
      username,
      full_name,
      department_id,
      level_id,
      profile_photo_url,
      department:departments!workers_department_id_fkey(id,name,color,icon),
      level:worker_levels!workers_level_id_fkey(id,name,authority,rank)
    `)
    .eq("id", workerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

function isDirection(worker) {
  return String(worker?.department?.name || "").trim().toUpperCase() === "DIRECCION";
}

function normalizeField(field = {}, index = 0) {
  return {
    id: field.id || `field_${Date.now()}_${index}`,
    type: field.type || "text",
    label: field.label || "Nuevo campo",
    placeholder: field.placeholder || "",
    help_text: field.help_text || "",
    required: Boolean(field.required),
    x: Number(field.x || 24),
    y: Number(field.y || 24 + index * 90),
    w: Number(field.w || 280),
    h: Number(field.h || 86),
    options: Array.isArray(field.options) ? field.options : [],
    settings: field.settings && typeof field.settings === "object" ? field.settings : {},
  };
}

function buildFormFolioPrefix(title = "") {
  const clean = String(title || "")
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "FRM";

  const words = clean.split(" ").filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 3).padEnd(3, "X");
  }

  return words
    .slice(0, 3)
    .map((word) => word.charAt(0))
    .join("")
    .padEnd(3, "X")
    .slice(0, 3);
}

function padFolioNumber(num) {
  return String(Math.max(1, Number(num || 1))).padStart(4, "0");
}

function compareAnswersForFolio(a, b) {
  const timeA = new Date(a?.created_at || 0).getTime();
  const timeB = new Date(b?.created_at || 0).getTime();

  if (timeA !== timeB) return timeA - timeB;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function attachFoliosToAnswers(formTitle = "", answers = []) {
  const prefix = buildFormFolioPrefix(formTitle);

  const ordered = [...(answers || [])].sort(compareAnswersForFolio);

  const folioMap = new Map(
    ordered.map((answer, index) => [
      answer.id,
      `${prefix}${padFolioNumber(index + 1)}`,
    ])
  );

  return (answers || []).map((answer) => ({
    ...answer,
    folio: folioMap.get(answer.id) || `${prefix}0001`,
  }));
}

async function getFormBasic(formId) {
  if (!formId) return null;

  const { data, error } = await supabaseAdmin
    .from("forms")
    .select("id,title")
    .eq("id", formId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function getComputedFolioForAnswer(formId, answerId) {
  if (!formId || !answerId) return null;

  const form = await getFormBasic(formId);

  const { data: rows, error } = await supabaseAdmin
    .from("form_answers")
    .select("id,created_at")
    .eq("form_id", formId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const withFolios = attachFoliosToAnswers(form?.title || "", rows || []);
  const target = withFolios.find((item) => item.id === answerId);

  return target?.folio || null;
}

async function getFormAccess(formId, worker) {
  if (!formId || !worker?.id) {
    return {
      canView: false,
      canAnswer: false,
      canEditAnswers: false,
      isDirectionUser: false,
    };
  }

  if (isDirection(worker)) {
    return {
      canView: true,
      canAnswer: true,
      canEditAnswers: true,
      isDirectionUser: true,
    };
  }

  const { data: responderRows, error: responderError } = await supabaseAdmin
    .from("form_responder_departments")
    .select("id, department_id")
    .eq("form_id", formId)
    .eq("department_id", worker.department_id);

  if (responderError) throw new Error(responderError.message);

  const { data: editorRows, error: editorError } = await supabaseAdmin
    .from("form_editor_rules")
    .select("id, department_id, level_id, min_authority")
    .eq("form_id", formId)
    .eq("department_id", worker.department_id);

  if (editorError) throw new Error(editorError.message);

  const authority = Number(worker?.level?.authority || 0);
  const levelId = worker?.level_id || null;

  const canEditAnswers = (editorRows || []).some((rule) => {
    const levelMatch = !rule.level_id || rule.level_id === levelId;
    const authorityMatch = authority >= Number(rule.min_authority || 0);
    return levelMatch && authorityMatch;
  });

  const hasResponderAccess = (responderRows || []).length > 0;
  const canView = hasResponderAccess || canEditAnswers;
  const canAnswer = hasResponderAccess || canEditAnswers;

  return {
    canView,
    canAnswer,
    canEditAnswers,
    isDirectionUser: false,
  };
}

async function getAccessibleFormIds(worker) {
  if (!worker?.id) return [];

  if (isDirection(worker)) {
    const { data, error } = await supabaseAdmin.from("forms").select("id");
    if (error) throw new Error(error.message);
    return (data || []).map((x) => x.id);
  }

  const { data: responderRows, error: responderError } = await supabaseAdmin
    .from("form_responder_departments")
    .select("form_id")
    .eq("department_id", worker.department_id);

  if (responderError) throw new Error(responderError.message);

  const { data: editorRows, error: editorError } = await supabaseAdmin
    .from("form_editor_rules")
    .select("form_id, level_id, min_authority")
    .eq("department_id", worker.department_id);

  if (editorError) throw new Error(editorError.message);

  const authority = Number(worker?.level?.authority || 0);
  const levelId = worker?.level_id || null;

  const editorIds = (editorRows || [])
    .filter((rule) => {
      const levelMatch = !rule.level_id || rule.level_id === levelId;
      const authorityMatch = authority >= Number(rule.min_authority || 0);
      return levelMatch && authorityMatch;
    })
    .map((row) => row.form_id);

  const responderIds = (responderRows || []).map((row) => row.form_id);

  return [...new Set([...responderIds, ...editorIds])];
}

async function loadFormWithRelations(formIds) {
  if (!Array.isArray(formIds) || !formIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("forms")
    .select(`
      *,
      creator:workers!forms_created_by_fkey(
        id,
        username,
        full_name,
        profile_photo_url
      ),
      responder_departments:form_responder_departments(
        id,
        department_id,
        department:departments(id,name,color,icon)
      ),
      editor_rules:form_editor_rules(
        id,
        department_id,
        level_id,
        min_authority,
        department:departments(id,name,color,icon),
        level:worker_levels(id,name,authority,rank)
      )
    `)
    .in("id", formIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

async function replacePermissions(formId, responderDepartmentIds, editorRules) {
  const { error: deleteRespondersError } = await supabaseAdmin
    .from("form_responder_departments")
    .delete()
    .eq("form_id", formId);

  if (deleteRespondersError) throw new Error(deleteRespondersError.message);

  const { error: deleteEditorsError } = await supabaseAdmin
    .from("form_editor_rules")
    .delete()
    .eq("form_id", formId);

  if (deleteEditorsError) throw new Error(deleteEditorsError.message);

  const cleanResponderIds = [...new Set((responderDepartmentIds || []).filter(Boolean))];
  if (cleanResponderIds.length) {
    const rows = cleanResponderIds.map((department_id) => ({
      form_id: formId,
      department_id,
    }));

    const { error: insertResponderError } = await supabaseAdmin
      .from("form_responder_departments")
      .insert(rows);

    if (insertResponderError) throw new Error(insertResponderError.message);
  }

  const cleanEditorRules = (editorRules || [])
    .filter((rule) => rule && rule.department_id)
    .map((rule) => ({
      form_id: formId,
      department_id: rule.department_id,
      level_id: rule.level_id || null,
      min_authority: Number(rule.min_authority || 1),
    }));

  if (cleanEditorRules.length) {
    const { error: insertEditorError } = await supabaseAdmin
      .from("form_editor_rules")
      .insert(cleanEditorRules);

    if (insertEditorError) throw new Error(insertEditorError.message);
  }
}

function enrichFormForDashboard(form, worker) {
  const responderDepartments = (form.responder_departments || [])
    .map((item) => item.department)
    .filter(Boolean);

  const editorDepartments = (form.editor_rules || [])
    .map((item) => item.department)
    .filter(Boolean);

  const affectedMap = new Map();
  [...responderDepartments, ...editorDepartments].forEach((dep) => {
    if (!dep?.id) return;
    affectedMap.set(dep.id, dep);
  });

  return {
    ...form,
    permissions: {
      can_manage: isDirection(worker),
      can_duplicate: isDirection(worker),
      can_delete: isDirection(worker),
    },
    affected_departments: [...affectedMap.values()],
    total_fields: Array.isArray(form.fields) ? form.fields.length : 0,
    total_responder_departments: responderDepartments.length,
    total_editor_rules: (form.editor_rules || []).length,
  };
}

router.get("/meta/catalogs", async (req, res) => {
  try {
    const { data: departments, error: departmentsError } = await supabaseAdmin
      .from("departments")
      .select("id,name,color,icon")
      .order("name", { ascending: true });

    if (departmentsError) {
      return res.status(500).json({ error: departmentsError.message });
    }

    const { data: levels, error: levelsError } = await supabaseAdmin
      .from("worker_levels")
      .select("id,name,authority,rank")
      .order("authority", { ascending: true });

    if (levelsError) {
      return res.status(500).json({ error: levelsError.message });
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id,sku,name,unit,price,cost")
      .order("name", { ascending: true });

    if (productsError) {
      return res.status(500).json({ error: productsError.message });
    }

    return res.json({
      data: {
        departments: departments || [],
        levels: levels || [],
        products: products || [],
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const workerId = req.query.worker_id;
    const q = String(req.query.q || "").trim().toLowerCase();
    const departmentFilter = String(req.query.department_id || "").trim();
    const layoutModeFilter = String(req.query.layout_mode || "").trim();

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const accessibleIds = await getAccessibleFormIds(worker);
    const forms = await loadFormWithRelations(accessibleIds);

    let enriched = forms.map((form) => enrichFormForDashboard(form, worker));

    if (q) {
      enriched = enriched.filter((form) => {
        const haystack = [
          form.title,
          form.description,
          form.creator?.full_name,
          form.creator?.username,
          ...(form.affected_departments || []).map((dep) => dep.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    if (layoutModeFilter) {
      enriched = enriched.filter((form) => String(form.layout_mode || "") === layoutModeFilter);
    }

    if (departmentFilter) {
      enriched = enriched.filter((form) =>
        (form.affected_departments || []).some((dep) => dep.id === departmentFilter)
      );
    }

    return res.json({
      data: enriched,
      current_worker: worker,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.get("/answers/:answerId/export", async (req, res) => {
  try {
    const answerId = req.params.answerId;
    const workerId = req.query.worker_id;
    const format = String(req.query.format || "pdf").trim().toLowerCase();

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    if (!["pdf", "xlsx"].includes(format)) {
      return res.status(400).json({ error: "format must be pdf or xlsx" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const { data: answer, error: answerError } = await supabaseAdmin
      .from("form_answers")
      .select(`
        *,
        worker:workers!form_answers_worker_id_fkey(
          id,
          username,
          full_name,
          profile_photo_url
        ),
        department:departments!form_answers_worker_department_id_fkey(
          id,
          name,
          color,
          icon
        ),
        level:worker_levels!form_answers_worker_level_id_fkey(
          id,
          name,
          authority
        )
      `)
      .eq("id", answerId)
      .maybeSingle();

    if (answerError) {
      return res.status(500).json({ error: answerError.message });
    }

    if (!answer) {
      return res.status(404).json({ error: "Answer not found" });
    }

    const access = await getFormAccess(answer.form_id, worker);
    const ownAnswer = answer.worker_id === worker.id;

    if (!access.canView && !ownAnswer) {
      return res.status(403).json({ error: "No tienes acceso a esta respuesta" });
    }

    if (!access.isDirectionUser && !access.canEditAnswers && !ownAnswer) {
      return res.status(403).json({ error: "No tienes permiso para exportar esta respuesta" });
    }

    const forms = await loadFormWithRelations([answer.form_id]);
    const form = forms[0];

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    const folio = await getComputedFolioForAnswer(answer.form_id, answer.id);

    const fullAnswer = {
      ...answer,
      folio: folio || "",
    };

    if (format === "xlsx") {
      const buffer = await generateExcelBuffer(form, fullAnswer);
      const safeFolio = (folio || "RESPUESTA").replace(/[^\w-]/g, "_");

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFolio}.xlsx"`
      );

      return res.send(buffer);
    }

    const buffer = await generatePdfBuffer(form, fullAnswer);
    const safeFolio = (folio || "RESPUESTA").replace(/[^\w-]/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFolio}.pdf"`
    );

    return res.send(buffer);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const formId = req.params.id;
    const workerId = req.query.worker_id;

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const access = await getFormAccess(formId, worker);
    if (!access.canView) {
      return res.status(403).json({ error: "No tienes acceso a este formulario" });
    }

    const forms = await loadFormWithRelations([formId]);
    const form = forms[0];

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    return res.json({
      data: {
        ...form,
        access,
        permissions: {
          can_edit_answers: access.canEditAnswers,
          can_answer: access.canAnswer,
          can_view: access.canView,
        },
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      worker_id,
      title,
      description,
      color,
      icon,
      cover_url,
      layout_mode,
      fields,
      settings,
      responder_department_ids,
      editor_rules,
    } = req.body || {};

    if (!worker_id) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: "fields must be an array" });
    }

    const worker = await getWorkerContext(worker_id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    if (!isDirection(worker)) {
      return res.status(403).json({ error: "Solo DIRECCION puede crear formularios" });
    }

    const normalizedFields = fields.map((field, index) => normalizeField(field, index));

    const { data: form, error } = await supabaseAdmin
      .from("forms")
      .insert({
        title: String(title).trim(),
        description: description || "",
        color: color || "#3b82f6",
        icon: icon || null,
        cover_url: cover_url || null,
        layout_mode: layout_mode || "canvas",
        fields: normalizedFields,
        settings: settings && typeof settings === "object" ? settings : {},
        created_by: worker.id,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await replacePermissions(form.id, responder_department_ids, editor_rules);

    const forms = await loadFormWithRelations([form.id]);
    return res.json({ data: forms[0] || form });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const formId = req.params.id;
    const {
      worker_id,
      title,
      description,
      color,
      icon,
      cover_url,
      layout_mode,
      fields,
      settings,
      responder_department_ids,
      editor_rules,
    } = req.body || {};

    if (!worker_id) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(worker_id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    if (!isDirection(worker)) {
      return res.status(403).json({ error: "Solo DIRECCION puede editar formularios" });
    }

    const payload = {
      updated_at: new Date().toISOString(),
    };

    if (typeof title === "string") payload.title = title.trim();
    if (typeof description === "string") payload.description = description;
    if (typeof color === "string") payload.color = color;
    if (typeof icon === "string" || icon === null) payload.icon = icon;
    if (typeof cover_url === "string" || cover_url === null) payload.cover_url = cover_url;
    if (typeof layout_mode === "string") payload.layout_mode = layout_mode;
    if (Array.isArray(fields)) payload.fields = fields.map((field, index) => normalizeField(field, index));
    if (settings && typeof settings === "object") payload.settings = settings;

    const { data: form, error } = await supabaseAdmin
      .from("forms")
      .update(payload)
      .eq("id", formId)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    await replacePermissions(formId, responder_department_ids, editor_rules);

    const forms = await loadFormWithRelations([formId]);
    return res.json({ data: forms[0] || form });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/:id/duplicate", async (req, res) => {
  try {
    const sourceId = req.params.id;
    const { worker_id } = req.body || {};

    if (!worker_id) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(worker_id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    if (!isDirection(worker)) {
      return res.status(403).json({ error: "Solo DIRECCION puede duplicar formularios" });
    }

    const forms = await loadFormWithRelations([sourceId]);
    const source = forms[0];

    if (!source) {
      return res.status(404).json({ error: "Form not found" });
    }

    const duplicatedFields = (source.fields || []).map((field, index) => ({
      ...normalizeField(field, index),
      id: `field_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    }));

    const { data: newForm, error: insertError } = await supabaseAdmin
      .from("forms")
      .insert({
        title: `${source.title} (copia)`,
        description: source.description || "",
        color: source.color || "#3b82f6",
        icon: source.icon || null,
        cover_url: source.cover_url || null,
        layout_mode: source.layout_mode || "canvas",
        fields: duplicatedFields,
        settings: source.settings || {},
        created_by: worker.id,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    await replacePermissions(
      newForm.id,
      (source.responder_departments || []).map((row) => row.department_id),
      (source.editor_rules || []).map((row) => ({
        department_id: row.department_id,
        level_id: row.level_id,
        min_authority: row.min_authority,
      }))
    );

    const duplicated = await loadFormWithRelations([newForm.id]);
    return res.json({ data: duplicated[0] || newForm });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const formId = req.params.id;
    const workerId = req.query.worker_id;

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    if (!isDirection(worker)) {
      return res.status(403).json({ error: "Solo DIRECCION puede eliminar formularios" });
    }

    const { error } = await supabaseAdmin
      .from("forms")
      .delete()
      .eq("id", formId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.get("/:id/answers/stream", async (req, res) => {
  try {
    const formId = req.params.id;
    const workerId = req.query.worker_id;

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const access = await getFormAccess(formId, worker);
    if (!access.canView) {
      return res.status(403).json({ error: "No tienes acceso a este formulario" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    addAnswerStream(formId, res);

    res.write(`data: ${JSON.stringify({
      type: "connected",
      formId,
      at: new Date().toISOString(),
    })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeAnswerStream(formId, res);
      res.end();
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.get("/:id/answers", branchFilter, async (req, res) => {
  try {
    const formId = req.params.id;
    const workerId = req.query.worker_id;

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const access = await getFormAccess(formId, worker);
    if (!access.canView) {
      return res.status(403).json({ error: "No tienes acceso a este formulario" });
    }

    const form = await getFormBasic(formId);

    let query = supabaseAdmin
      .from("form_answers")
      .select(`
        *,
        worker:workers!form_answers_worker_id_fkey(
          id,
          username,
          full_name,
          profile_photo_url
        ),
        department:departments!form_answers_worker_department_id_fkey(
          id,
          name,
          color,
          icon
        ),
        level:worker_levels!form_answers_worker_level_id_fkey(
          id,
          name,
          authority
        )
      `)
      .eq("form_id", formId)
      .order("created_at", { ascending: true });

    if (!access.isDirectionUser && !access.canEditAnswers) {
      query = query.eq("worker_id", worker.id);
    }

    // Filtro de base: Dirección ve todas; otros solo las de su base
    if (!req.isDirector && req.branchId) {
      query = query.eq("branch_id", req.branchId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const withFolios = attachFoliosToAnswers(form?.title || "", data || []);

    const sortedForUi = [...withFolios].sort((a, b) => {
      const timeA = new Date(a?.created_at || 0).getTime();
      const timeB = new Date(b?.created_at || 0).getTime();

      if (timeA !== timeB) return timeB - timeA;
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });

    return res.json({
      data: sortedForUi,
      access,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/:id/answers/export-grid", async (req, res) => {
  try {
    const formId = req.params.id;
    const workerId = req.query.worker_id;
    const rawAnswerIds = String(req.query.answer_ids || "").trim();
    const search = String(req.query.q || "").trim().toLowerCase();
    const datePreset = String(req.query.date_preset || "").trim().toLowerCase();

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const access = await getFormAccess(formId, worker);
    if (!access.canView) {
      return res.status(403).json({ error: "No tienes acceso a este formulario" });
    }

    const forms = await loadFormWithRelations([formId]);
    const form = forms[0];

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    let query = supabaseAdmin
      .from("form_answers")
      .select(`
        *,
        worker:workers!form_answers_worker_id_fkey(
          id,
          username,
          full_name,
          profile_photo_url
        ),
        department:departments!form_answers_worker_department_id_fkey(
          id,
          name,
          color,
          icon
        ),
        level:worker_levels!form_answers_worker_level_id_fkey(
          id,
          name,
          authority
        )
      `)
      .eq("form_id", formId)
      .order("created_at", { ascending: true });

    if (!access.isDirectionUser && !access.canEditAnswers) {
      query = query.eq("worker_id", worker.id);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    let rows = attachFoliosToAnswers(form?.title || "", data || []);

    if (rawAnswerIds) {
      const selectedIds = rawAnswerIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      rows = rows.filter((row) => selectedIds.includes(String(row.id)));
    }

    if (search) {
      rows = rows.filter((answer) => {
        const workerName =
          answer?.worker?.full_name ||
          answer?.worker?.username ||
          "";

        const departmentName = answer?.department?.name || "";
        const levelName = answer?.level?.name || "";
        const folio = answer?.folio || "";

        const fieldText = (form?.fields || [])
          .filter((field) => field?.type !== "captcha")
          .map((field) => {
            const rawValue = answer?.answers?.[field.id];

            if (rawValue === null || rawValue === undefined) return "";
            if (typeof rawValue === "string" || typeof rawValue === "number") {
              return String(rawValue);
            }

            try {
              return JSON.stringify(rawValue);
            } catch {
              return "";
            }
          })
          .join(" ");

        const haystack = [
          folio,
          workerName,
          departmentName,
          levelName,
          fieldText,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    if (datePreset) {
      const now = new Date();
      let minDate = null;

      if (datePreset === "today") {
        minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (datePreset === "7d") {
        minDate = new Date(now);
        minDate.setDate(now.getDate() - 7);
      } else if (datePreset === "15d") {
        minDate = new Date(now);
        minDate.setDate(now.getDate() - 15);
      } else if (datePreset === "30d") {
        minDate = new Date(now);
        minDate.setDate(now.getDate() - 30);
      }

      if (minDate) {
        rows = rows.filter((answer) => {
          const raw =
            answer?.submitted_at ||
            answer?.updated_at ||
            answer?.created_at ||
            answer?.answered_at;

          const dt = raw ? new Date(raw) : null;
          return dt && dt >= minDate;
        });
      }
    }

    const buffer = await generateAnswersGridExcelBuffer(form, rows);
    const safeTitle = String(form?.title || "respuestas")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_") || "respuestas";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}_tabla.xlsx"`
    );

    return res.send(buffer);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/:id/answers", branchFilter, async (req, res) => {
  try {
    const formId = req.params.id;
    const { worker_id, answers, status } = req.body || {};

    if (!worker_id) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "answers must be an object" });
    }

    const worker = await getWorkerContext(worker_id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const access = await getFormAccess(formId, worker);
    if (!access.canAnswer) {
      return res.status(403).json({ error: "No tienes permiso para responder este formulario" });
    }

    const { data, error } = await supabaseAdmin
      .from("form_answers")
      .insert({
        form_id: formId,
        worker_id: worker.id,
        worker_department_id: worker.department_id,
        worker_level_id: worker.level_id,
        answers,
        status: status || "SUBMITTED",
        last_edited: new Date().toISOString(),
        //hereda la base del worker que responde
        branch_id: req.branchId || null,
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const folio = await getComputedFolioForAnswer(formId, data.id);

    emitAnswerEvent(formId, {
      action: "created",
      answerId: data.id,
      workerId: worker.id,
    });

    return res.json({
      data: {
        ...data,
        folio: folio || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.put("/answers/:answerId", async (req, res) => {
  try {
    const answerId = req.params.answerId;
    const { worker_id, answers, status } = req.body || {};

    if (!worker_id) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "answers must be an object" });
    }

    const worker = await getWorkerContext(worker_id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const { data: answer, error: answerError } = await supabaseAdmin
      .from("form_answers")
      .select("*")
      .eq("id", answerId)
      .maybeSingle();

    if (answerError) {
      return res.status(500).json({ error: answerError.message });
    }

    if (!answer) {
      return res.status(404).json({ error: "Answer not found" });
    }

    const access = await getFormAccess(answer.form_id, worker);
    const ownAnswer = answer.worker_id === worker.id;

    if (!access.isDirectionUser && !access.canEditAnswers && !ownAnswer) {
      return res.status(403).json({ error: "No tienes permiso para editar esta respuesta" });
    }

    const { data, error } = await supabaseAdmin
      .from("form_answers")
      .update({
        answers,
        status: status || answer.status || "SUBMITTED",
        last_edited: new Date().toISOString(),
      })
      .eq("id", answerId)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const folio = await getComputedFolioForAnswer(answer.form_id, data.id);

    emitAnswerEvent(answer.form_id, {
      action: "updated",
      answerId: data.id,
      workerId: worker.id,
    });

    return res.json({
      data: {
        ...data,
        folio: folio || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.delete("/answers/:answerId", async (req, res) => {
  try {
    const answerId = req.params.answerId;
    const workerId = req.query.worker_id;

    if (!workerId) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    const worker = await getWorkerContext(workerId);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const { data: answer, error: answerError } = await supabaseAdmin
      .from("form_answers")
      .select("*")
      .eq("id", answerId)
      .maybeSingle();

    if (answerError) {
      return res.status(500).json({ error: answerError.message });
    }

    if (!answer) {
      return res.status(404).json({ error: "Answer not found" });
    }

    const access = await getFormAccess(answer.form_id, worker);

    if (!access.isDirectionUser && !access.canEditAnswers) {
      return res.status(403).json({ error: "No tienes permiso para eliminar esta respuesta" });
    }

    const { error } = await supabaseAdmin
      .from("form_answers")
      .delete()
      .eq("id", answerId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    emitAnswerEvent(answer.form_id, {
      action: "deleted",
      answerId,
      workerId: worker.id,
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
router.post("/answers/bulk-delete", async (req, res) => {
  try {
    const { worker_id, answer_ids } = req.body || {};

    if (!worker_id) {
      return res.status(400).json({ error: "worker_id is required" });
    }

    if (!Array.isArray(answer_ids) || !answer_ids.length) {
      return res.status(400).json({ error: "answer_ids must be a non-empty array" });
    }

    const worker = await getWorkerContext(worker_id);
    if (!worker) {
      return res.status(404).json({ error: "Worker not found" });
    }

    const uniqueIds = [...new Set(answer_ids.filter(Boolean))];

    const { data: answersToDelete, error: answersError } = await supabaseAdmin
      .from("form_answers")
      .select("id, form_id")
      .in("id", uniqueIds);

    if (answersError) {
      return res.status(500).json({ error: answersError.message });
    }

    if (!answersToDelete || !answersToDelete.length) {
      return res.status(404).json({ error: "No se encontraron respuestas para eliminar" });
    }

    const formIds = [...new Set(answersToDelete.map((row) => row.form_id).filter(Boolean))];

    for (const formId of formIds) {
      const access = await getFormAccess(formId, worker);

      if (!access.isDirectionUser && !access.canEditAnswers) {
        return res.status(403).json({
          error: "No tienes permiso para eliminar una o más respuestas seleccionadas",
        });
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("form_answers")
      .delete()
      .in("id", uniqueIds);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    formIds.forEach((formId) => {
      emitAnswerEvent(formId, {
        action: "bulk_deleted",
        answerIds: uniqueIds,
        workerId: worker.id,
      });
    });

    return res.json({
      ok: true,
      deleted_count: uniqueIds.length,
      deleted_ids: uniqueIds,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});



module.exports = router;