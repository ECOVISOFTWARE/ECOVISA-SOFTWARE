import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { apiFetch } from "../api.js";
import "./adminPanelPro.css";
import ProSelect from "../components/ProSelect/ProSelect";
import {
  TbPlus,
  TbTrash,
  TbEdit,
  TbEye, 
  TbX,
  TbRefresh,
  TbSearch,
  TbBuilding,
  TbCrown,
  TbUserPlus,
  TbKey,
  TbShieldLock,
  TbDotsVertical,
 TbUserCircle,
  TbBriefcase,
  TbTruckDelivery,
  TbChartBar,
  TbTools,
  TbHeartHandshake,
  TbUsersGroup,
  TbShield,
  TbBuildingWarehouse,
  TbFileText,
  TbDeviceDesktop,
  TbHeadset,
  TbCoin,
  TbShoppingCart,
  TbReportAnalytics,
  TbCalendarEvent,
  TbClipboardCheck,
  TbBolt,
  TbSchool,
  TbSettings,
  TbMapPin,
  TbPackage,
  TbClipboardText,
} from "react-icons/tb";

/* =========================
  Helpers (Title Case + Password)
========================= */
function titleCaseWords(str = "") {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


// - Primera Letra De Cada Palabra => Mayúscula
// - Resto => Minúscula
function titleCaseLive(str = "") {
  const s = String(str);

  let out = "";
  let newWord = true;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    // separadores de palabra: espacios y saltos (si quieres más, agrega \t, etc.)
    if (ch === " " || ch === "\n" || ch === "\t") {
      out += ch;
      newWord = true;
      continue;
    }

    // si es letra, aplica mayúscula/minúscula
    // (con acentos funciona porque JS respeta unicode)
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(ch)) {
      out += newWord ? ch.toLocaleUpperCase("es-MX") : ch.toLocaleLowerCase("es-MX");
      newWord = false;
      continue;
    }

    // otros caracteres se dejan igual (guiones, puntos, etc.)
    out += ch;
    newWord = false;
  }

  return out;
}
function onlyLetters(str = "") {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "");
}

// 2 letras nombre + 2 letras apellido + 4 nums => "SACA0000"
function genPassword(firstName, lastName) {
  const fn = onlyLetters(firstName).toLowerCase();
  const ln = onlyLetters(lastName).toLowerCase();
  const a = fn.slice(0, 2).padEnd(2, "x");
  const b = ln.slice(0, 2).padEnd(2, "x");
  const nums = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return (a + b + nums).toUpperCase();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hslToRgb(h, s, l) {
  // h: 0..360, s/l: 0..100
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= h && h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (60 <= h && h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (120 <= h && h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (180 <= h && h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (240 <= h && h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function parseColorToRgb(input = "") {
  const c = String(input).trim().toLowerCase();

  // #RGB / #RRGGBB
  if (c.startsWith("#")) {
    const h = c.replace("#", "");
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return null;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // rgb(...) / rgba(...)
  const rgbMatch = c.match(/^rgba?\(\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)\s*[,\s]\s*([0-9.]+)(?:\s*[,\s]\s*([0-9.]+))?\s*\)$/i);
  if (rgbMatch) {
    return {
      r: Math.round(Number(rgbMatch[1])),
      g: Math.round(Number(rgbMatch[2])),
      b: Math.round(Number(rgbMatch[3])),
    };
  }

  // hsl(...) / hsla(...)  (tu caso)
  const hslMatch = c.match(/^hsla?\(\s*([0-9.]+)\s*(?:deg)?\s*[,\s]\s*([0-9.]+)%\s*[,\s]\s*([0-9.]+)%(?:\s*[,\s]\s*([0-9.]+))?\s*\)$/i);
  if (hslMatch) {
    const h = ((Number(hslMatch[1]) % 360) + 360) % 360;
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    return hslToRgb(h, s, l);
  }

  return null; // si llega algo raro, no truena
}

// luminancia percibida (0..1). si es alto = color claro
function isLightColor(color) {
  const rgb = parseColorToRgb(color);
  if (!rgb) return true; // fallback: trata como claro para evitar texto blanco
  const { r, g, b } = rgb;
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return L > 0.55;
}

/* =========================
  UI Consts
========================= */
const MODULES = [
  { key: "home", label: "Inicio" },
  { key: "admin", label: "Admin" },
  { key: "forms", label: "Formularios" },
  { key: "inventory", label: "Inventario" },
  { key: "quotes", label: "Cotizaciones" },
  { key: "services", label: "Servicios" },
  { key: "invoices", label: "Facturación" },
  { key: "serviceSheets", label: "Hoja de Servicios" },
  { key: "weeklyReports", label: "Bitácora Semanal" },
  { key: "calendar", label: "Calendario" },
];

// Permisos granulares: qué acciones aplican a cada módulo
const MODULES_FULL = [
  { key: "home",          label: "Inicio",            actions: ["can_view"] },
  { key: "admin",         label: "Admin",             actions: ["can_view", "can_create", "can_edit", "can_delete"] },
  { key: "forms",         label: "Formularios",       actions: ["can_view", "can_create", "can_edit", "can_delete", "can_export"] },
  { key: "inventory",     label: "Inventario",        actions: ["can_view", "can_create", "can_edit", "can_delete", "can_export"] },
  { key: "quotes",        label: "Cotizaciones",      actions: ["can_view", "can_create", "can_edit", "can_approve", "can_delete", "can_export"] },
  { key: "operations",    label: "Operaciones",       actions: ["can_view", "can_create", "can_edit", "can_delete"] },
  { key: "invoices",      label: "Facturación",       actions: ["can_view", "can_create", "can_edit", "can_delete", "can_export"] },
  { key: "serviceSheets", label: "Hoja de Servicios", actions: ["can_view", "can_create", "can_edit", "can_delete"] },
  { key: "weeklyReports", label: "Bitácora Semanal",  actions: ["can_view", "can_create", "can_edit", "can_delete", "can_export"] },
  { key: "calendar",      label: "Calendario",        actions: ["can_view", "can_create", "can_edit", "can_delete"] },
];

const ACTION_LABELS = {
  can_view:    "Ver",
  can_create:  "Crear",
  can_edit:    "Editar",
  can_approve: "Aprobar",
  can_delete:  "Eliminar",
  can_export:  "Exportar",
};

function defaultPermissions() {
  const obj = {};
  MODULES_FULL.forEach((m) => {
    obj[m.key] = {
      can_view:    true,
      can_create:  false,
      can_edit:    false,
      can_approve: false,
      can_delete:  false,
      can_export:  false,
    };
  });
  return obj;
}

const DEPT_ICONS = [
  { key: "briefcase", label: "Administración", Icon: TbBriefcase },
  { key: "truck", label: "Logística", Icon: TbTruckDelivery },
  { key: "chart", label: "Analítica", Icon: TbChartBar },
  { key: "tools", label: "Mantenimiento", Icon: TbTools },
  { key: "handshake", label: "Relación Cliente", Icon: TbHeartHandshake },
  { key: "users", label: "Recursos Humanos", Icon: TbUsersGroup },
  { key: "shield", label: "Seguridad", Icon: TbShield },
  { key: "warehouse", label: "Almacén", Icon: TbBuildingWarehouse },
  { key: "file", label: "Documentación", Icon: TbFileText },
  { key: "it", label: "Sistemas", Icon: TbDeviceDesktop },
  { key: "support", label: "Soporte", Icon: TbHeadset },
  { key: "coin", label: "Finanzas", Icon: TbCoin },
  { key: "cart", label: "Compras", Icon: TbShoppingCart },
  { key: "report", label: "Reportes", Icon: TbReportAnalytics },
  { key: "calendar", label: "Planeación", Icon: TbCalendarEvent },
  { key: "check", label: "Calidad", Icon: TbClipboardCheck },
  { key: "bolt", label: "Operaciones", Icon: TbBolt },
  { key: "school", label: "Capacitación", Icon: TbSchool },
  { key: "settings", label: "Configuración", Icon: TbSettings },
  { key: "map", label: "GPS", Icon: TbMapPin },
  { key: "package", label: "Inventario", Icon: TbPackage },
  { key: "clipboard", label: "Formularios", Icon: TbClipboardText },
];

function DeptIcon({ iconKey, size = 18 }) {
  const found = DEPT_ICONS.find((x) => x.key === iconKey);
  const I = found?.Icon || TbBuilding;
  return <I style={{ fontSize: size }} />;
}

/* =========================
  Color grid (tipo imagen 3)
========================= */
function buildColorGrid() {
  
  const colsHue = 12;
  const rows = 7;

  const out = [];

  
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1); // 0..1
    const sat = clamp(90 - t * 35, 40, 90);
    const light = clamp(92 - t * 55, 25, 92);

    for (let c = 0; c < colsHue; c++) {
      const h = Math.round((c / colsHue) * 360);
      out.push(`hsl(${h} ${sat}% ${light}%)`);
    }

    
    out.push(`hsl(0 0% ${clamp(98 - t * 10, 86, 98)}%)`); 
    out.push(`hsl(0 0% ${clamp(90 - t * 18, 60, 90)}%)`);
    out.push(`hsl(0 0% ${clamp(78 - t * 22, 45, 78)}%)`);
    out.push(`hsl(0 0% ${clamp(64 - t * 22, 30, 64)}%)`);
  }

  return out;
}

const COLOR_GRID = buildColorGrid();

/* =========================
  Modal
========================= */
function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) setClosing(false);
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") handleClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose?.();
    }, 170);
  };

  if (!open) return null;

  return (
    <div
      className={`apModalBack ${closing ? "out" : "in"}`}
      onMouseDown={(e) => {
        if (ref.current && !ref.current.contains(e.target)) handleClose();
      }}
    >
      <div className={`apModal ${closing ? "apAnimOut" : "apAnimIn"}`} ref={ref}>
        <div className="apModalTop">
          <div className="apModalTitle">{title}</div>
          <button className="apIconBtn" onClick={handleClose} type="button" aria-label="Cerrar">
            <TbX />
          </button>
        </div>
        <div className="apModalBody">{children}</div>
      </div>
    </div>
  );
}

/* =========================
  MiniMenu 
========================= */
function MiniMenu({ open, onClose, anchorRef, children }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, origin: "top" });

  useEffect(() => {
    function onDown(e) {
      if (!open) return;

      const a = anchorRef?.current;
      const m = menuRef?.current;

      if (a && a.contains(e.target)) return;
      if (m && m.contains(e.target)) return;

      onClose?.();
    }

    if (open) window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const a = anchorRef?.current;
    if (!a) return;

    const r = a.getBoundingClientRect();
    const margin = 8;

    // posición base: abajo a la derecha del botón
    let left = Math.round(r.right - 8); // ajusta fino con CSS transform
    let top = Math.round(r.bottom + margin);
    let origin = "top";

    // si no cabe abajo, lo subimos
    const estHeight = 56; // aprox (2 botones). el CSS lo afina
    if (top + estHeight > window.innerHeight - 10) {
      top = Math.round(r.top - margin);
      origin = "bottom";
    }

    setPos({ top, left, origin });
  }, [open, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      className={`apMiniMenu apMiniMenuPortal ${pos.origin === "bottom" ? "fromBottom" : "fromTop"}`}
      ref={menuRef}
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

/* =========================
  AdminPanel
========================= */
export default function AdminPanel({ currentWorker }) {
const [departments, setDepartments] = useState([]);
  const [levels, setLevels] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [branches, setBranches] = useState([]);
  // Modal "Ver detalles" (móvil + pro)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsWorker, setDetailsWorker] = useState(null);

  function openDetails(w) {
    setDetailsWorker(w);
    setDetailsOpen(true);
  }
  function closeDetails() {
    setDetailsOpen(false);
    setDetailsWorker(null);
  }
  // filtros
  const [fDept, setFDept] = useState("all");
  const [fLevel, setFLevel] = useState("all");
  const [q, setQ] = useState("");

  // buscador general (Departamentos + Puestos)
  const [adminQ, setAdminQ] = useState("");

// paginación (usuarios)
const PAGE_SIZE = 5;
const [page, setPage] = useState(1);

// paginación (departamentos)
const DEPT_PAGE_SIZE = 5;
const [deptPage, setDeptPage] = useState(1);

// paginación (puestos)
const LEVEL_PAGE_SIZE = 5;
const [levelPage, setLevelPage] = useState(1);
  // modal usuario
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState(""); 
  const [passwordPlain, setPasswordPlain] = useState("");
  const [selDept, setSelDept] = useState("");
  const [selLevel, setSelLevel] = useState("");
  const [selBranch, setSelBranch] = useState("");

  // modal depto (create)
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [depName, setDepName] = useState("");
  const [depColor, setDepColor] = useState(COLOR_GRID[0]);
  const [depIcon, setDepIcon] = useState(DEPT_ICONS[0].key);

  // modal depto (edit)
  const [deptEditOpen, setDeptEditOpen] = useState(false);
  const [deptEditingId, setDeptEditingId] = useState(null);

  // modal unificado: Puesto + Permisos
  const [lpOpen, setLpOpen] = useState(false);
  const [lpIsNew, setLpIsNew] = useState(true);
  const [lpLevelId, setLpLevelId] = useState("");
  const [lpLevelName, setLpLevelName] = useState("");
  const [lpAuthority, setLpAuthority] = useState(1);

const [lpDeptId, setLpDeptId] = useState("");
  const [lpModules, setLpModules] = useState(() => new Set(MODULES.map((m) => m.key)));
const [lpCanManageCalendar, setLpCanManageCalendar] = useState(false);
  const [lpCanApproveQuotes,  setLpCanApproveQuotes]  = useState(false);

  // Permisos granulares del PUESTO
  const [lpPermissions, setLpPermissions] = useState(defaultPermissions);

  // Modal de Bases
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchEditOpen, setBranchEditOpen] = useState(false);
  const [branchEditingId, setBranchEditingId] = useState(null);
  const [branchName, setBranchName] = useState("");
  const [branchColor, setBranchColor] = useState("#1a3b6b");
  const branchMenuBtnRefs = useRef({});
  const [branchMenuOpenId, setBranchMenuOpenId] = useState(null);

  // paginación bases
  const BRANCH_PAGE_SIZE = 6;
  const [branchPage, setBranchPage] = useState(1);
  // menus 3 puntitos
  const [deptMenuOpenId, setDeptMenuOpenId] = useState(null);
  const [levelMenuOpenId, setLevelMenuOpenId] = useState(null);

  const deptMenuBtnRefs = useRef({});
  const lvlMenuBtnRefs = useRef({});

async function loadAll() {
    const [d, l, w, p, b] = await Promise.all([
      apiFetch("/api/admin/departments"),
      apiFetch("/api/admin/levels"),
      apiFetch("/api/admin/workers"),
      apiFetch("/api/admin/access-policies"),
      apiFetch("/api/branches"),
    ]);

    setDepartments(d.data || []);
    setLevels(l.data || []);
    setWorkers(w.data || []);
    setPolicies(p.data || []);
    setBranches(b.data || []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  // defaults dept/level del director actual (si aplica)
  useEffect(() => {
    if (!currentWorker) return;
    if (currentWorker.department_id) setSelDept(currentWorker.department_id);
    if (currentWorker.level_id) setSelLevel(currentWorker.level_id);
  }, [currentWorker]);

  // autocompletar: fullName + username + password (si no editMode)
  useEffect(() => {
    const f = titleCaseWords(firstName);
    const l = titleCaseWords(lastName);
    const full = [f, l].filter(Boolean).join(" ").trim();

    setFullName(full);

    // username OBLIGATORIO = "Nombre Apellido" (Title Case)
    if (!editMode) {
      setUsername(full);
      if (f && l) setPasswordPlain(genPassword(f, l));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, editMode]);

  const departmentsMap = useMemo(() => {
    const m = new Map();
    departments.forEach((d) => m.set(d.id, d));
    return m;
  }, [departments]);

  const levelsMap = useMemo(() => {
    const m = new Map();
    levels.forEach((l) => m.set(l.id, { ...l, authority: l.authority ?? l.rank ?? 1 }));
    return m;
  }, [levels]);

  const policiesMap = useMemo(() => {
    const m = new Map(); // key: `${deptId}|${levelId}` => allowed_modules[]
    (policies || []).forEach((p) => {
      m.set(`${p.department_id}|${p.level_id}`, p.allowed_modules || []);
    });
    return m;
  }, [policies]);
// ====== Departamentos: filtro + paginación interna (usa adminQ) ======
const filteredDepartments = useMemo(() => {
  const query = adminQ.trim().toLowerCase();
  if (!query) return departments;
  return departments.filter((d) => String(d.name || "").toLowerCase().includes(query));
}, [departments, adminQ]);

useEffect(() => {
  setDeptPage(1);
}, [adminQ, departments.length]);

const deptTotalPages = Math.max(1, Math.ceil(filteredDepartments.length / DEPT_PAGE_SIZE));
const deptSafePage = Math.min(deptPage, deptTotalPages);

const pagedDepartments = useMemo(() => {
  const start = (deptSafePage - 1) * DEPT_PAGE_SIZE;
  return filteredDepartments.slice(start, start + DEPT_PAGE_SIZE);
}, [filteredDepartments, deptSafePage]);

// ====== Puestos: filtro + paginación interna (usa adminQ) ======
const filteredLevels = useMemo(() => {
  const query = adminQ.trim().toLowerCase();
  if (!query) return levels;
  return levels.filter((l) => String(l.name || "").toLowerCase().includes(query));
}, [levels, adminQ]);

useEffect(() => {
  setLevelPage(1);
}, [adminQ, levels.length]);

const levelTotalPages = Math.max(1, Math.ceil(filteredLevels.length / LEVEL_PAGE_SIZE));
const levelSafePage = Math.min(levelPage, levelTotalPages);

const pagedLevels = useMemo(() => {
  const start = (levelSafePage - 1) * LEVEL_PAGE_SIZE;
  return filteredLevels.slice(start, start + LEVEL_PAGE_SIZE);
}, [filteredLevels, levelSafePage]);
  const filteredWorkers = useMemo(() => {
    const query = q.trim().toLowerCase();
    return workers.filter((w) => {
      if (fDept !== "all" && String(w.department_id || "") !== String(fDept)) return false;
      if (fLevel !== "all" && String(w.level_id || "") !== String(fLevel)) return false;

      if (!query) return true;

      const dep = departmentsMap.get(w.department_id)?.name || "";
      const lvl = levelsMap.get(w.level_id)?.name || "";

      const hay = [w.username, w.full_name, dep, lvl].join(" ").toLowerCase();

      return hay.includes(query);
    });
  }, [workers, fDept, fLevel, q, departmentsMap, levelsMap]);
// reset de página cuando cambian filtros/búsqueda
useEffect(() => {
  setPage(1);
}, [fDept, fLevel, q]);

const totalPages = Math.max(1, Math.ceil(filteredWorkers.length / PAGE_SIZE));
const safePage = Math.min(page, totalPages);

const pagedWorkers = useMemo(() => {
  const start = (safePage - 1) * PAGE_SIZE;
  return filteredWorkers.slice(start, start + PAGE_SIZE);
}, [filteredWorkers, safePage]);
  /* =========================
    Users modal open/close
  ========================= */
function closeUserModal() {
    setUserModalOpen(false);
    setEditMode(false);
    setEditingId(null);

    setFirstName("");
    setLastName("");
    setFullName("");
    setUsername("");
    setPasswordPlain("");

    if (currentWorker?.department_id) setSelDept(currentWorker.department_id);
    else setSelDept("");
    if (currentWorker?.level_id) setSelLevel(currentWorker.level_id);
    else setSelLevel("");
    setSelBranch("");
  }

function openCreateUser() {
    setEditMode(false);
    setEditingId(null);
    setFirstName("");
    setLastName("");
    setFullName("");
    setUsername("");
    setPasswordPlain("");

    if (currentWorker?.department_id) setSelDept(currentWorker.department_id);
    else setSelDept("");
    if (currentWorker?.level_id) setSelLevel(currentWorker.level_id);
    else setSelLevel("");
    setSelBranch(currentWorker?.branch_id || "");

    setUserModalOpen(true);
  }
function openEditUser(w) {
    setEditMode(true);
    setEditingId(w.id);

    const parts = String(w.full_name || "").trim().split(/\s+/);
    const f = parts.slice(0, 1).join(" ");
    const l = parts.slice(1).join(" ");

    setFirstName(f);
    setLastName(l);
    setFullName(w.full_name || "");
    setUsername(w.username || "");
    setPasswordPlain(w.password_plain || "");
    setSelDept(w.department_id || "");
    setSelLevel(w.level_id || "");
    setSelBranch(w.branch_id || "");

    setUserModalOpen(true);
  }

/* =========================
    Branches (create/edit/delete)
  ========================= */
  function openBranchModal() {
    setBranchName("");
    setBranchColor("#1a3b6b");
    setBranchModalOpen(true);
  }

  async function addBranch() {
    const name = titleCaseWords(branchName);
    if (!name) {
      Swal.fire({ icon: "error", title: "Falta nombre", text: "Escribe el nombre de la base." });
      return;
    }
    try {
      await apiFetch("/api/branches", {
        method: "POST",
        body: JSON.stringify({ name, color: branchColor }),
      });
      setBranchModalOpen(false);
      await loadAll();
      Swal.fire({ icon: "success", title: "Base creada", timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  function openEditBranch(b) {
    setBranchEditingId(b.id);
    setBranchName(b.name || "");
    setBranchColor(b.color || "#1a3b6b");
    setBranchEditOpen(true);
    setBranchMenuOpenId(null);
  }

  async function saveEditBranch() {
    const name = titleCaseWords(branchName);
    if (!branchEditingId || !name) return;
    try {
      await apiFetch(`/api/branches/${branchEditingId}`, {
        method: "PUT",
        body: JSON.stringify({ name, color: branchColor }),
      });
      setBranchEditOpen(false);
      setBranchEditingId(null);
      await loadAll();
      Swal.fire({ icon: "success", title: "Base actualizada", timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  async function deleteBranch(b) {
    setBranchMenuOpenId(null);
    const go = await Swal.fire({
      icon: "warning",
      title: "Eliminar base",
      html: `<b>${b.name}</b><br/>Esto no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });
    if (!go.isConfirmed) return;
    try {
      await apiFetch(`/api/branches/${b.id}`, { method: "DELETE" });
      await loadAll();
      Swal.fire({ icon: "success", title: "Eliminada", timer: 1100, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  /* =========================
    Departments (create/edit/delete)
  ========================= */
  function openDeptModal() {
    setDepName("");
    setDepColor(COLOR_GRID[0]);
    setDepIcon(DEPT_ICONS[0].key);
    setDeptModalOpen(true);
  }

  async function addDepartmentPro() {
    const name = titleCaseWords(depName);
    if (!name) {
      Swal.fire({ icon: "error", title: "Falta nombre", text: "Escribe el nombre del departamento." });
      return;
    }

    try {
      await apiFetch("/api/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name, color: depColor, icon: depIcon }),
      });

      setDeptModalOpen(false);
      await loadAll();

      Swal.fire({
        icon: "success",
        title: "Departamento creado",
        html: `<div style="text-align:left"><b>${name}</b><br/>Color: <span style="font-family:monospace">${depColor}</span><br/>Icono: ${depIcon}</div>`,
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  function openEditDept(d) {
    setDeptEditingId(d.id);
    setDepName(d.name || "");
    setDepColor(d.color || COLOR_GRID[0]);
    setDepIcon(d.icon || DEPT_ICONS[0].key);
    setDeptEditOpen(true);
    setDeptMenuOpenId(null);
  }

  async function saveEditDept() {
    const name = titleCaseWords(depName);
    if (!deptEditingId) return;
    if (!name) {
      Swal.fire({ icon: "error", title: "Falta nombre", text: "Escribe el nombre del departamento." });
      return;
    }

    try {
      await apiFetch(`/api/admin/departments/${deptEditingId}`, {
        method: "PUT",
        body: JSON.stringify({ name, color: depColor, icon: depIcon }),
      });

      setDeptEditOpen(false);
      setDeptEditingId(null);
      await loadAll();

      Swal.fire({
        icon: "success",
        title: "Departamento actualizado",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  async function deleteDepartment(d) {
    setDeptMenuOpenId(null);

    const go = await Swal.fire({
      icon: "warning",
      title: "Eliminar departamento",
      html: `<b>${d.name}</b><br/>Esto no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });

    if (!go.isConfirmed) return;

    try {
      await apiFetch(`/api/admin/departments/${d.id}`, { method: "DELETE" });
      await loadAll();
      Swal.fire({ icon: "success", title: "Eliminado", timer: 1100, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  /* =========================
    Levels + Policies (unificado)
  ========================= */
function openLevelPolicyModalCreate() {
    if (departments.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Primero crea al menos 1 Departamento.",
      });
      return;
    }

    const d0 = departments[0].id;

    setLpOpen(true);
    setLpIsNew(true);
    setLpLevelId("");
    setLpLevelName("");
    setLpAuthority(1);
    setLpCanManageCalendar(false);
    setLpCanApproveQuotes(false);
    setLpDeptId(d0);
    setLpModules(new Set(MODULES.map((m) => m.key)));
    setLpPermissions(defaultPermissions());
    setLevelMenuOpenId(null);
  }

async function openLevelPolicyModalEdit(levelObj) {
    if (departments.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        text: "Primero crea al menos 1 Departamento.",
      });
      return;
    }

    const d0 = departments[0].id;
    const lv = levelsMap.get(levelObj.id) || levelObj;
    const authority = lv.authority ?? lv.rank ?? 1;

    const key = `${d0}|${levelObj.id}`;
    const saved = policiesMap.get(key);

    setLpOpen(true);
    setLpIsNew(false);
    setLpLevelId(levelObj.id);
    setLpLevelName(levelObj.name || "");
    setLpAuthority(Number(authority) || 1);
    setLpCanManageCalendar(Boolean(levelObj.can_manage_calendar));
    setLpCanApproveQuotes(Boolean(levelObj.can_approve_quotes));

    setLpDeptId(d0);
    if (Array.isArray(saved) && saved.length > 0) setLpModules(new Set(saved));
    else setLpModules(new Set(MODULES.map((m) => m.key)));

    // Cargar permisos granulares del puesto
    try {
      const permsResp = await apiFetch(`/api/admin/levels/${levelObj.id}/permissions`);
      const existingPerms = permsResp?.data || {};
      const base = defaultPermissions();
      Object.keys(existingPerms).forEach((key) => {
        if (base[key]) base[key] = { ...base[key], ...existingPerms[key] };
      });
      setLpPermissions(base);
    } catch {
      setLpPermissions(defaultPermissions());
    }

    setLevelMenuOpenId(null);
  }
  function syncLpPolicy(nextDeptId, nextLevelId) {
    const key = `${nextDeptId}|${nextLevelId}`;
    const saved = policiesMap.get(key);
    if (Array.isArray(saved) && saved.length > 0) setLpModules(new Set(saved));
    else setLpModules(new Set(MODULES.map((m) => m.key)));
  }

  async function saveLevelAndPolicy() {
    // validar
    const name = titleCaseWords(lpLevelName);
    const authority = clamp(Number(lpAuthority || 1), 1, 5);

    if (!lpDeptId) {
      Swal.fire({ icon: "error", title: "Falta departamento", text: "Selecciona un departamento." });
      return;
    }

    if (!name) {
      Swal.fire({ icon: "error", title: "Falta puesto", text: "Escribe el nombre del puesto." });
      return;
    }

    const mods = Array.from(lpModules);

    try {
      let levelId = lpLevelId;

      // 1) crear o editar puesto
if (lpIsNew) {
        const res = await apiFetch("/api/admin/levels", {
          method: "POST",
          body: JSON.stringify({ name, authority, can_manage_calendar: lpCanManageCalendar, can_approve_quotes: lpCanApproveQuotes }),
        });
        levelId = res?.data?.id || res?.id || levelId;

        // fallback: recargar y localizar por nombre (por si tu API no regresa id)
        await loadAll();
        if (!levelId) {
          const found = levels.find((x) => String(x.name).toLowerCase() === String(name).toLowerCase());
          levelId = found?.id;
        }

        if (!levelId) {
          throw new Error("No se pudo obtener el id del puesto creado. Ajusta tu API para retornar {data:{id}}.");
        }
} else {
        if (!levelId) throw new Error("Falta el id del puesto.");
        await apiFetch(`/api/admin/levels/${levelId}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            authority,
            can_manage_calendar: lpCanManageCalendar,
            can_approve_quotes: lpCanApproveQuotes,
          }),
        });
      }
// 2) guardar policy depto+puesto (módulos habilitados)
      await apiFetch("/api/admin/access-policies", {
        method: "POST",
        body: JSON.stringify({
          department_id: lpDeptId,
          level_id: levelId,
          allowed_modules: mods,
        }),
      });

      // 3) guardar permisos granulares del puesto
      const permissionsArray = MODULES_FULL.map((m) => ({
        module_key:  m.key,
        can_view:    Boolean(lpPermissions[m.key]?.can_view),
        can_create:  Boolean(lpPermissions[m.key]?.can_create),
        can_edit:    Boolean(lpPermissions[m.key]?.can_edit),
        can_approve: Boolean(lpPermissions[m.key]?.can_approve),
        can_delete:  Boolean(lpPermissions[m.key]?.can_delete),
        can_export:  Boolean(lpPermissions[m.key]?.can_export),
      }));

      await apiFetch(`/api/admin/levels/${levelId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: permissionsArray }),
      });

      setLpOpen(false);
      await loadAll();

      Swal.fire({
        icon: "success",
        title: "Guardado",
        text: `Puesto: ${name} · Autoridad ${authority} · Módulos: ${mods.length}`,
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  async function deleteLevel(levelObj) {
    setLevelMenuOpenId(null);

    const go = await Swal.fire({
      icon: "warning",
      title: "Eliminar puesto",
      html: `<b>${levelObj.name}</b><br/>Esto no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });

    if (!go.isConfirmed) return;

    try {
      await apiFetch(`/api/admin/levels/${levelObj.id}`, { method: "DELETE" });
      await loadAll();
      Swal.fire({ icon: "success", title: "Eliminado", timer: 1100, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: "error", title: "Error", text: e.message });
    }
  }

  /* =========================
    Worker CRUD
  ========================= */
  async function createOrUpdateWorker() {
    const f = titleCaseWords(firstName);
    const l = titleCaseWords(lastName);

    if (!f || !l) {
      await Swal.fire({
        icon: "error",
        title: "Faltan datos",
        text: "Debes ingresar 1 nombre y 1 apellido.",
      });
      return;
    }

    const enforcedUsername = `${f} ${l}`.trim(); 
    const enforcedPassword = passwordPlain?.trim() || genPassword(f, l);

    // si están editando uno viejo (ej: director) no lo forzamos a cambiar
    const finalUsername = editMode ? (username.trim() || enforcedUsername) : enforcedUsername;

    if (!finalUsername) {
      await Swal.fire({ icon: "error", title: "Falta usuario" });
      return;
    }
    if (!enforcedPassword) {
      await Swal.fire({ icon: "error", title: "Falta contraseña" });
      return;
    }

    // cerrar modal para confirm
    setUserModalOpen(false);

    const confirm = await Swal.fire({
      icon: "question",
      title: editMode ? "Guardar cambios" : "Crear usuario",
      text: editMode ? "Se actualizará la información del trabajador." : "Se creará el trabajador con contraseña generada.",
      showCancelButton: true,
      confirmButtonText: editMode ? "Guardar" : "Crear",
      cancelButtonText: "Cancelar",
    });

    if (!confirm.isConfirmed) {
      setUserModalOpen(true);
      return;
    }

const payload = {
      username: finalUsername,
      password_plain: enforcedPassword,
      full_name: `${f} ${l}`.trim(),
      department_id: selDept || null,
      level_id: selLevel || null,
      branch_id: selBranch || null,
      active: true,
    };

try {
      if (!editMode) {
        await apiFetch("/api/admin/workers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/admin/workers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      await loadAll();

await Swal.fire({
  icon: "success",
  title: editMode ? "Actualizado" : "Creado",
  customClass: {
    popup: "apSwalPopup",
    title: "apSwalTitle",
    htmlContainer: "apSwalHtml",
    confirmButton: "apSwalBtn",
  },
  buttonsStyling: false,
  html: `
    <div class="apSwalCard">
      <div class="apSwalRow">
        <span class="apSwalLabel">Usuario:</span>
        <span class="apSwalValue">${payload.username}</span>
      </div>

      <div class="apSwalRow">
        <span class="apSwalLabel">Nombre:</span>
        <span class="apSwalValue">${payload.full_name}</span>
      </div>

      <div class="apSwalRow">
        <span class="apSwalLabel">Contraseña:</span>
        <span class="apSwalValue apSwalMono">${payload.password_plain}</span>
      </div>
    </div>
  `,
  confirmButtonText: "OK",
});

      closeUserModal();
    } catch (e) {
      await Swal.fire({ icon: "error", title: "Error", text: e.message });
      setUserModalOpen(true);
    }
  }

  async function deleteWorker(w) {
    const go = await Swal.fire({
      icon: "warning",
      title: "Eliminar usuario",
      html: `<b>${w.full_name || w.username}</b><br/>Esto no se puede deshacer.`,
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });

    if (!go.isConfirmed) return;

    try {
      await apiFetch(`/api/admin/workers/${w.id}`, { method: "DELETE" });
      await loadAll();

      await Swal.fire({
        icon: "success",
        title: "Eliminado",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (e) {
      await Swal.fire({ icon: "error", title: "Error al eliminar", text: e.message });
    }
  }

  return (
    <div className="apWrap">
      <div className="apHeader">
        <div>
          <div className="apTitle">Administración</div>
          <div className="apSub">Departamentos · Puestos · Usuarios</div>
        </div>

        {/* Buscador general centrado (Departamentos + Puestos) */}
        <div className="apHeaderMid">
          <div className="apSearch apHeaderSearch">
            <TbSearch />
            <input
              className="apSearchInput apHeaderSearchInput"
              value={adminQ}
              onChange={(e) => setAdminQ(e.target.value)}
              placeholder="Buscar departamento o puesto..."
            />
          </div>
        </div>

        <div className="apHeaderRight">
          <button className="apBtn apBtnPrimary apBtnIconHeavy" onClick={openCreateUser} type="button" title="Crear usuario">
            <TbUserPlus /> Usuario
          </button>

          <button className="apBtn apBtnGhost apBtnIconOnly" onClick={loadAll} type="button" title="Recargar">
            <TbRefresh />
          </button>
        </div>
      </div>

      <div className="apGrid2">
        {/* Departamentos */}
        <section className="apCard apCardFixed">
          <div className="apCardTop">
            <div className="apCardTitle">
              <TbBuilding /> Departamentos
            </div>

            <button className="apBtn apBtnPrimary" onClick={openDeptModal} type="button">
              <TbPlus /> Crear
            </button>
          </div>
<div className="apInnerBar apInnerBarOnlyMeta">
  <div className="apInnerMeta">
    Mostrando <b>{pagedDepartments.length}</b> de <b>{filteredDepartments.length}</b>
  </div>
</div>
<div className="apDeptGrid">
  {pagedDepartments.map((d) => {
    const bg = d.color || "rgba(255,255,255,0.80)";
    const light = isLightColor(bg);
    const fg = light ? "rgba(10,12,14,0.92)" : "rgba(255,255,255,0.96)";

    return (
      <div
        className="apDeptTile"
        key={d.id}
        style={{ background: bg, color: fg }}
      >
        <button
          className="apDeptTileKebab"
          type="button"
          ref={(el) => (deptMenuBtnRefs.current[d.id] = el)}
          onClick={() => setDeptMenuOpenId((prev) => (prev === d.id ? null : d.id))}
          aria-label="Opciones"
          title="Opciones"
          style={{ color: fg }}
        >
          <TbDotsVertical />
        </button>

        <div className="apDeptTileIcon" style={{ color: fg }}>
          <DeptIcon iconKey={d.icon} size={44} />
        </div>

        <div className="apDeptTileName" style={{ color: fg }}>
          {d.name}
        </div>

        <MiniMenu
          open={deptMenuOpenId === d.id}
          onClose={() => setDeptMenuOpenId(null)}
          anchorRef={{ current: deptMenuBtnRefs.current[d.id] }}
        >
          <button className="apMiniItem" type="button" onClick={() => openEditDept(d)} title="Editar">
            <TbEdit />
          </button>
          <button className="apMiniItem apMiniDanger" type="button" onClick={() => deleteDepartment(d)} title="Eliminar">
            <TbTrash />
          </button>
        </MiniMenu>
      </div>
    );
  })}

  {departments.length === 0 && <div className="apMuted">Sin departamentos</div>}
</div>
<div className="apPager apPagerSm">
  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setDeptPage(1)}
    disabled={deptSafePage === 1}
    title="Primera"
  >
    «
  </button>

  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setDeptPage((p) => Math.max(1, p - 1))}
    disabled={deptSafePage === 1}
    title="Anterior"
  >
    ‹
  </button>

  <div className="apPagerInfo apPagerInfoSm">
    <span className="apPagerStrong">{deptSafePage}</span>
    <span className="apPagerSep">/</span>
    <span>{deptTotalPages}</span>
  </div>

  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setDeptPage((p) => Math.min(deptTotalPages, p + 1))}
    disabled={deptSafePage === deptTotalPages}
    title="Siguiente"
  >
    ›
  </button>

  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setDeptPage(deptTotalPages)}
    disabled={deptSafePage === deptTotalPages}
    title="Última"
  >
    »
  </button>
</div>
        </section>

        {/* Puestos/Niveles */}
        <section className="apCard apCardFixed">
          <div className="apCardTop">
            <div className="apCardTitle">
              <TbCrown /> Puestos
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="apHint">Autoridad: 1 (básico) → 5 (máximo)</div>
              <button className="apBtn apBtnPrimary" onClick={openLevelPolicyModalCreate} type="button">
                <TbPlus /> Crear
              </button>
            </div>
          </div>

          {/* unificado: crear/editar puesto + permisos en 1 solo modal */}
<div className="apInnerBar apInnerBarOnlyMeta">
  <div className="apInnerMeta">
    Mostrando <b>{pagedLevels.length}</b> de <b>{filteredLevels.length}</b>
  </div>
</div>

<div className="apMiniTable">
  <div className="apMiniHead">
    <div>Puesto</div>
    <div>Autoridad</div>
    <div className="apMiniHeadActions"></div>
  </div>

{pagedLevels.map((l) => {
  const auth = l.authority ?? l.rank ?? 1;

  return (
    <div className="apMiniRow" key={l.id}>
      <div className="apMiniCell apMiniStrong">{l.name}</div>

      <div className="apMiniCell apMiniCenter">
        <span className="apMiniPill">
          <TbShieldLock /> {auth}
        </span>
      </div>

      <div className="apMiniCell apMiniActions">
        <div className="apKebabWrap">
          <button
            className="apKebabBtn"
            type="button"
            ref={(el) => (lvlMenuBtnRefs.current[l.id] = el)}
            onClick={() => setLevelMenuOpenId((prev) => (prev === l.id ? null : l.id))}
            aria-label="Opciones"
            title="Opciones"
          >
            <TbDotsVertical />
          </button>

          <MiniMenu
            open={levelMenuOpenId === l.id}
            onClose={() => setLevelMenuOpenId(null)}
            anchorRef={{ current: lvlMenuBtnRefs.current[l.id] }}
          >
            <button className="apMiniItem" type="button" onClick={() => openLevelPolicyModalEdit(l)} title="Editar / Permisos">
              <TbEdit />
            </button>
            <button className="apMiniItem apMiniDanger" type="button" onClick={() => deleteLevel(l)} title="Eliminar">
              <TbTrash />
            </button>
          </MiniMenu>
        </div>
      </div>
    </div>
  );
})}

  {levels.length === 0 && <div className="apMuted">Sin puestos</div>}
  <div className="apPager apPagerSm">
  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setLevelPage(1)}
    disabled={levelSafePage === 1}
    title="Primera"
  >
    «
  </button>

  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setLevelPage((p) => Math.max(1, p - 1))}
    disabled={levelSafePage === 1}
    title="Anterior"
  >
    ‹
  </button>

  <div className="apPagerInfo apPagerInfoSm">
    <span className="apPagerStrong">{levelSafePage}</span>
    <span className="apPagerSep">/</span>
    <span>{levelTotalPages}</span>
  </div>

  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setLevelPage((p) => Math.min(levelTotalPages, p + 1))}
    disabled={levelSafePage === levelTotalPages}
    title="Siguiente"
  >
    ›
  </button>

  <button
    className="apPagerBtn apPagerBtnSm"
    type="button"
    onClick={() => setLevelPage(levelTotalPages)}
    disabled={levelSafePage === levelTotalPages}
    title="Última"
  >
    »
  </button>
</div>
</div>
        </section>
</div>

      {/* BASES / SUCURSALES */}
      <section className="apCard apCardFull" style={{ marginTop: 16 }}>
        <div className="apCardTop">
          <div className="apCardTitle">
            <TbMapPin /> Bases / Sucursales
          </div>
          <button className="apBtn apBtnPrimary" onClick={openBranchModal} type="button">
            <TbPlus /> Nueva base
          </button>
        </div>

        <div className="apDeptGrid">
          {branches.map((b) => {
            const bg = b.color || "#1a3b6b";
            const light = isLightColor(bg);
            const fg = light ? "rgba(10,12,14,0.92)" : "rgba(255,255,255,0.96)";
            return (
              <div className="apDeptTile" key={b.id} style={{ background: bg, color: fg }}>
                <button
                  className="apDeptTileKebab"
                  type="button"
                  ref={(el) => (branchMenuBtnRefs.current[b.id] = el)}
                  onClick={() => setBranchMenuOpenId((prev) => (prev === b.id ? null : b.id))}
                  style={{ color: fg }}
                >
                  <TbDotsVertical />
                </button>
                <div className="apDeptTileIcon" style={{ color: fg }}>
                  <TbMapPin style={{ fontSize: 44 }} />
                </div>
                <div className="apDeptTileName" style={{ color: fg }}>{b.name}</div>
                <MiniMenu
                  open={branchMenuOpenId === b.id}
                  onClose={() => setBranchMenuOpenId(null)}
                  anchorRef={{ current: branchMenuBtnRefs.current[b.id] }}
                >
                  <button className="apMiniItem" type="button" onClick={() => openEditBranch(b)}>
                    <TbEdit />
                  </button>
                  <button className="apMiniItem apMiniDanger" type="button" onClick={() => deleteBranch(b)}>
                    <TbTrash />
                  </button>
                </MiniMenu>
              </div>
            );
          })}
          {branches.length === 0 && <div className="apMuted">Sin bases registradas</div>}
        </div>
      </section>

      {/* Usuarios */}
      <section className="apCard apCardFull">
<div className="apCardTop apCardTopRow apUsersTopRow">
  <div className="apCardTitle">
    <TbKey /> Usuarios internos
  </div>

  {/* buscador centrado */}
  <div className="apUsersSearchMid">
    <div className="apSearch apUsersSearch">
      <TbSearch />
      <input
        className="apSearchInput apUsersSearchInput"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por usuario, nombre, depto, puesto..."
      />
    </div>
  </div>

  {/* filtros a la derecha */}
  <div className="apUsersFiltersRight">
    <ProSelect value={fDept} onChange={(e) => setFDept(e.target.value)} ariaLabel="Filtro depto">
      <option value="all">Todos los deptos</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </ProSelect>

    <ProSelect value={fLevel} onChange={(e) => setFLevel(e.target.value)} ariaLabel="Filtro puesto">
      <option value="all">Todos los puestos</option>
      {levels.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </ProSelect>
  </div>
</div>

        <div className="apTableWrap">
          <table className="apTable">
            <thead>
              <tr>
                <th>Trabajador</th>
                <th>Usuario</th>
                <th>Contraseña</th>
                <th>Departamento</th>
                <th>Puesto</th>
                <th>Activo</th>
                <th className="apThActions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedWorkers.map((w) => {
                const depObj = departmentsMap.get(w.department_id);
                const dep = depObj?.name || "-";
                const lvl = levelsMap.get(w.level_id)?.name || "-";
                const active = String(w.active) === "true";

const rowTint = depObj?.color ? depObj.color : null;

return (
  <tr
    key={w.id}
    className={rowTint ? "apRowTinted" : ""}
    style={rowTint ? { "--rowTint": rowTint } : undefined}
  >
<td className="apTdStrong" data-label="Trabajador">
  <div className="apUserCell">
    <span className="apAvatar">
      <TbUserCircle />
      {w.profile_photo_url ? (
        <img
          src={`${w.profile_photo_url}${w.profile_photo_url.includes("?") ? "&" : "?"}v=${encodeURIComponent(w.updated_at || w.id || Date.now())}`}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>

    <span className="apUserName">{w.full_name || "-"}</span>
  </div>
</td>

<td data-label="Usuario">{w.username}</td>

<td className="apMono" data-label="Contraseña">{w.password_plain}</td>

<td data-label="Departamento">
  <span className="apDeptCell">
    <span className="apDeptIcoPlain">
      <DeptIcon iconKey={depObj?.icon} />
    </span>
    <span className="apDeptName">{dep}</span>
  </span>
</td>

<td data-label="Puesto">{lvl}</td>

<td data-label="Activo">
  <span className={`apDot ${active ? "ok" : "off"}`} />
  {active ? "Sí" : "No"}
</td>

<td className="apActions" data-label="Acciones">
  <button
    className="apIconBtn apInfo"
    onClick={() => openDetails(w)}
    type="button"
    title="Ver detalles"
    aria-label="Ver detalles"
  >
    <TbEye />
  </button>

  <button className="apIconBtn" onClick={() => openEditUser(w)} type="button" title="Editar" aria-label="Editar">
    <TbEdit />
  </button>

  <button className="apIconBtn apDanger" onClick={() => deleteWorker(w)} type="button" title="Eliminar" aria-label="Eliminar">
    <TbTrash />
  </button>
</td>
  </tr>
);
              })}

              {filteredWorkers.length === 0 && (
                <tr>
                  <td colSpan={7} className="apEmpty">
                    No hay usuarios con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="apPager">
  <button
    className="apPagerBtn"
    type="button"
    onClick={() => setPage(1)}
    disabled={safePage === 1}
    title="Primera"
  >
    «
  </button>

  <button
    className="apPagerBtn"
    type="button"
    onClick={() => setPage((p) => Math.max(1, p - 1))}
    disabled={safePage === 1}
    title="Anterior"
  >
    ‹
  </button>

  <div className="apPagerInfo">
    <span className="apPagerStrong">{safePage}</span>
    <span className="apPagerSep">/</span>
    <span>{totalPages}</span>
    <span className="apPagerMeta">
      Mostrando {pagedWorkers.length} de {filteredWorkers.length}
    </span>
  </div>

  <button
    className="apPagerBtn"
    type="button"
    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
    disabled={safePage === totalPages}
    title="Siguiente"
  >
    ›
  </button>

  <button
    className="apPagerBtn"
    type="button"
    onClick={() => setPage(totalPages)}
    disabled={safePage === totalPages}
    title="Última"
  >
    »
  </button>
</div>
      </section>
      {/* MODAL VER DETALLES */}
      <Modal open={detailsOpen} title="Detalles del usuario" onClose={closeDetails}>
        {(() => {
          const w = detailsWorker;
          if (!w) return <div className="apMuted">Sin datos</div>;

          const depObj = departmentsMap.get(w.department_id);
          const dep = depObj?.name || "-";
          const lvl = levelsMap.get(w.level_id)?.name || "-";
          const active = String(w.active) === "true";

          return (
            <div className="apDetailsWrap">
              
              <div className="apDetailsHero">
                <div className="apDetailsAvatar">
                  <TbUserCircle />
                  {w.profile_photo_url ? (
                    <img
                      src={`${w.profile_photo_url}${w.profile_photo_url.includes("?") ? "&" : "?"}v=${encodeURIComponent(w.updated_at || w.id || Date.now())}`}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </div>

                <div className="apDetailsName">{w.full_name || "-"}</div>
                <div className="apDetailsSub">{dep} · {lvl}</div>
              </div>

              {/* Grid tipo “label / value” */}
              <div className="apDetailsGrid">
                <div className="apDetailsRow">
                  <div className="apDetailsLabel">Trabajador</div>
                  <div className="apDetailsValue">{w.full_name || "-"}</div>
                </div>

                <div className="apDetailsRow">
                  <div className="apDetailsLabel">Usuario</div>
                  <div className="apDetailsValue">{w.username || "-"}</div>
                </div>

                <div className="apDetailsRow">
                  <div className="apDetailsLabel">Departamento</div>
                  <div className="apDetailsValue">
                    <span className="apDetailsInline">
                      <span className="apDetailsDeptIco">
                        <DeptIcon iconKey={depObj?.icon} />
                      </span>
                      <span>{dep}</span>
                    </span>
                  </div>
                </div>

                <div className="apDetailsRow">
                  <div className="apDetailsLabel">Puesto</div>
                  <div className="apDetailsValue">{lvl}</div>
                </div>

                <div className="apDetailsRow">
                  <div className="apDetailsLabel">Activo</div>
                  <div className="apDetailsValue">
                    <span className={`apDot ${active ? "ok" : "off"}`} />
                    {active ? "Sí" : "No"}
                  </div>
                </div>
              </div>

              
              <div className="apDetailsActions">
                <button className="apBtn apBtnGhost" type="button" onClick={closeDetails}>
                  <TbX /> Cerrar
                </button>

                <button className="apBtn apBtnPrimary" type="button" onClick={() => { closeDetails(); openEditUser(w); }}>
                  <TbEdit /> Editar
                </button>

                <button className="apBtn apBtnGhost apBtnDanger" type="button" onClick={() => { closeDetails(); deleteWorker(w); }}>
                  <TbTrash /> Eliminar
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
      {/* MODAL CREAR/EDITAR USUARIO */}
      <Modal open={userModalOpen} title={editMode ? "Editar usuario" : "Crear usuario"} onClose={closeUserModal}>
        <div className="apModalGrid">
          <div className="apField">
            <label>Nombre</label>
<input
  className="apInput"
  value={firstName}
onChange={(e) => setFirstName(titleCaseLive(e.target.value))}
  placeholder="Ingresa el Nombre"
/>
            <div className="apSmallHint">Cada palabra inicia en mayúscula.</div>
          </div>

          <div className="apField">
            <label>Apellido</label>
<input
  className="apInput"
  value={lastName}
onChange={(e) => setLastName(titleCaseLive(e.target.value))}
  placeholder="Ingresa el Apellido"
/>
            <div className="apSmallHint">Cada palabra inicia en mayúscula.</div>
          </div>

          <div className="apField apSpan2">
            <label>Usuario (obligatorio)</label>
            <input className="apInput" value={editMode ? username : fullName} readOnly />
            <div className="apSmallHint">
              Usuario = <b>Nombre Apellido</b>. (En edición se respeta el usuario anterior).
            </div>
          </div>

          <div className="apField">
            <label>Contraseña</label>
            <div className="apInline">
              <input
                className="apInput apMono"
                value={passwordPlain}
                onChange={(e) => setPasswordPlain(e.target.value.toUpperCase())}
                placeholder="SACA0000"
              />
              <button className="apBtn apBtnGhost" type="button" onClick={() => setPasswordPlain(genPassword(firstName, lastName))} title="Regenerar contraseña">
                <TbRefresh /> Random
              </button>
            </div>
            <div className="apSmallHint">2 letras nombre + 2 letras apellido + 4 números.</div>
          </div>

<div className="apField">
            <label>Departamento</label>
            <ProSelect value={selDept} onChange={(e) => setSelDept(e.target.value)} ariaLabel="Departamento">
              <option value="">Sin depto</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </ProSelect>

            <ProSelect value={selLevel} onChange={(e) => setSelLevel(e.target.value)} ariaLabel="Puesto">
              <option value="">Sin puesto</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </ProSelect>
          </div>

          <div className="apField">
            <label>Sucursal / Base</label>
            <ProSelect value={selBranch} onChange={(e) => setSelBranch(e.target.value)} ariaLabel="Sucursal">
              <option value="">Sin base asignada (Dirección)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </ProSelect>
            <div className="apSmallHint">
              Dirección puede ver todas las bases. Usuarios sin base asignada también.
            </div>
          </div>

{/* AVISO: permisos heredados del puesto */}
          <div className="apField apSpan2">
            <label style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: "block" }}>
              <TbShieldLock style={{ marginRight: 4 }} />
              Permisos del usuario
            </label>

            <div
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#f8f9fa",
                borderRadius: 14,
                padding: "14px 16px",
                color: "#374151",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Este usuario <b>no tendrá permisos propios</b>.  
              Todos sus accesos, acciones y autorizaciones se heredan del <b>puesto</b> seleccionado.
              <br /><br />
              Si quieres cambiar lo que puede hacer, edítalo desde <b>Puestos</b>.
            </div>

            <div className="apSmallHint">
              Dirección siempre conserva acceso total.
            </div>
          </div>

          <div className="apModalActions apSpan2">
            <button className="apBtn apBtnGhost" onClick={closeUserModal} type="button">
              <TbX /> Cancelar
            </button>
            <button className="apBtn apBtnPrimary" onClick={createOrUpdateWorker} type="button">
              {editMode ? (
                <>
                  <TbEdit /> Guardar
                </>
              ) : (
                <>
                  <TbPlus /> Crear
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL CREAR DEPARTAMENTO */}
      <Modal open={deptModalOpen} title="Crear departamento" onClose={() => setDeptModalOpen(false)}>
        <div className="apModalGrid">
          <div className="apField apSpan2">
            <label>Nombre del departamento</label>
<input
  className="apInput"
  value={depName}
onChange={(e) => setDepName(titleCaseLive(e.target.value))}
  placeholder="Ingresa tu departamento"
/>
            <div className="apSmallHint">Cada palabra inicia en mayúscula.</div>
          </div>

          <div className="apField">
            <label>Color</label>
            <div className="apColorGridPro">
              {COLOR_GRID.map((c, idx) => (
                <button
                  key={`${c}-${idx}`}
                  type="button"
                  className={`apColorCell ${depColor === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setDepColor(c)}
                  aria-label={`Color ${c}`}
                  title={String(c)}
                />
              ))}
            </div>
          </div>

          <div className="apField">
            <label>Icono</label>
            <div className="apIconGridPro">
              {DEPT_ICONS.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`apIconPickPro ${depIcon === it.key ? "active" : ""}`}
                  onClick={() => setDepIcon(it.key)}
                  title={it.label}
                  aria-label={it.label}
                >
                  <it.Icon />
                </button>
              ))}
            </div>
          </div>

          <div className="apModalActions apSpan2">
            <button className="apBtn apBtnGhost" onClick={() => setDeptModalOpen(false)} type="button">
              <TbX /> Cancelar
            </button>
            <button className="apBtn apBtnPrimary" onClick={addDepartmentPro} type="button">
              <TbPlus /> Crear
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL EDITAR DEPARTAMENTO */}
      <Modal open={deptEditOpen} title="Editar departamento" onClose={() => setDeptEditOpen(false)}>
        <div className="apModalGrid">
          <div className="apField apSpan2">
            <label>Nombre del departamento</label>
            <input
  className="apInput"
  value={depName}
onChange={(e) => setDepName(titleCaseLive(e.target.value))}
/>
          </div>

          <div className="apField">
            <label>Color</label>
            <div className="apColorGridPro">
              {COLOR_GRID.map((c, idx) => (
                <button
                  key={`${c}-${idx}`}
                  type="button"
                  className={`apColorCell ${depColor === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setDepColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="apField">
            <label>Icono</label>
            <div className="apIconGridPro">
              {DEPT_ICONS.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`apIconPickPro ${depIcon === it.key ? "active" : ""}`}
                  onClick={() => setDepIcon(it.key)}
                  title={it.label}
                >
                  <it.Icon />
                </button>
              ))}
            </div>
          </div>

          <div className="apModalActions apSpan2">
            <button className="apBtn apBtnGhost" type="button" onClick={() => setDeptEditOpen(false)}>
              <TbX /> Cancelar
            </button>
            <button className="apBtn apBtnPrimary" type="button" onClick={saveEditDept}>
              <TbEdit /> Guardar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL UNIFICADO: PUESTO + PERMISOS */}
      <Modal open={lpOpen} title="Puesto + Permisos (Departamento + Puesto)" onClose={() => setLpOpen(false)}>
        <div className="apLPWrap">
<div className="apLPTop">
  <div className="apField">
    <label>Departamento (para política de módulos)</label>
    <ProSelect
      value={lpDeptId}
      onChange={(e) => {
        const nextDept = e.target.value;
        setLpDeptId(nextDept);

        const effectiveLevel = lpLevelId || "";
        if (effectiveLevel) syncLpPolicy(nextDept, effectiveLevel);
      }}
      ariaLabel="Departamento permisos"
    >
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </ProSelect>
    <div className="apSmallHint">
      Aquí defines qué módulos puede usar este puesto dentro de ese departamento.
    </div>
  </div>

  {!lpIsNew && (
    <div className="apField">
      <label>Puesto existente</label>
      <ProSelect
        value={lpLevelId}
        onChange={(e) => {
          const v = e.target.value;
          setLpLevelId(v);
          const obj = levelsMap.get(v);
          setLpLevelName(obj?.name || "");
          setLpAuthority(Number(obj?.authority ?? obj?.rank ?? 1) || 1);
          setLpCanManageCalendar(Boolean(obj?.can_manage_calendar));
          setLpCanApproveQuotes(Boolean(obj?.can_approve_quotes));
          syncLpPolicy(lpDeptId, v);
        }}
        ariaLabel="Puesto existente"
      >
        {levels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </ProSelect>
    </div>
  )}

  <div className="apField">
    <label>Nombre del puesto</label>
    <input
      className="apInput"
      value={lpLevelName}
      onChange={(e) => setLpLevelName(titleCaseLive(e.target.value))}
      placeholder="Ej: Gerente General"
    />
  </div>

  <div className="apField">
    <label>Autoridad</label>
    <ProSelect
      value={lpAuthority}
      onChange={(e) => setLpAuthority(Number(e.target.value))}
      ariaLabel="Autoridad"
    >
      <option value={1}>Autoridad 1</option>
      <option value={2}>Autoridad 2</option>
      <option value={3}>Autoridad 3</option>
      <option value={4}>Autoridad 4</option>
      <option value={5}>Autoridad 5</option>
    </ProSelect>
  </div>
</div>

{/* Toggle: puede gestionar calendario */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderRadius: 10,
            border: lpCanManageCalendar ? "1px solid rgba(26,115,232,0.3)" : "1px solid rgba(0,0,0,0.08)",
            background: lpCanManageCalendar ? "rgba(26,115,232,0.06)" : "#f8f9fa",
            marginBottom: 12, cursor: "pointer", transition: "all 140ms",
          }}
            onClick={() => setLpCanManageCalendar((v) => !v)}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ap-text, #202124)" }}>
                📅 Puede crear/editar/eliminar eventos del calendario
              </div>
              <div style={{ fontSize: 12, color: "#5f6368", marginTop: 2 }}>
                Si está desactivado, solo puede ver eventos. Dirección siempre puede gestionar.
              </div>
            </div>
            <div style={{
              width: 44, height: 24, borderRadius: 12, flexShrink: 0,
              background: lpCanManageCalendar ? "#1a73e8" : "#dadce0",
              position: "relative", transition: "background 200ms",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3,
                left: lpCanManageCalendar ? 23 : 3,
                transition: "left 200ms",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </div>

          {/* Toggle: puede aprobar cotizaciones */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderRadius: 10,
            border: lpCanApproveQuotes ? "1px solid rgba(22,163,74,0.3)" : "1px solid rgba(0,0,0,0.08)",
            background: lpCanApproveQuotes ? "rgba(22,163,74,0.06)" : "#f8f9fa",
            marginBottom: 12, cursor: "pointer", transition: "all 140ms",
          }}
            onClick={() => setLpCanApproveQuotes((v) => !v)}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ap-text, #202124)" }}>
                💰 Puede aprobar y rechazar cotizaciones
              </div>
              <div style={{ fontSize: 12, color: "#5f6368", marginTop: 2 }}>
                Si está desactivado, solo puede ver y crear. Dirección siempre puede aprobar.
              </div>
            </div>
            <div style={{
              width: 44, height: 24, borderRadius: 12, flexShrink: 0,
              background: lpCanApproveQuotes ? "#16a34a" : "#dadce0",
              position: "relative", transition: "background 200ms",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3,
                left: lpCanApproveQuotes ? 23 : 3,
                transition: "left 200ms",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </div>

          {/* Módulos habilitados para este puesto */}
          <div className="apPermGridPro">
            {MODULES.map((m) => {
              const on = lpModules.has(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`apPermItemPro ${on ? "on" : "off"}`}
                  onClick={() => {
                    setLpModules((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.key)) next.delete(m.key);
                      else next.add(m.key);
                      return next;
                    });
                  }}
                >
                  <span className={`apPermDot ${on ? "on" : "off"}`} />
                  <span className="apPermLabelPro">{m.label}</span>
                  <span className="apPermKeyPro">{m.key}</span>
                </button>
              );
            })}
          </div>

          {/* Permisos más legibles + menos blanco */}
          <div className="apPermGridPro">
            {MODULES.map((m) => {
              const on = lpModules.has(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`apPermItemPro ${on ? "on" : "off"}`}
                  onClick={() => {
                    setLpModules((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.key)) next.delete(m.key);
                      else next.add(m.key);
                      return next;
                    });
                  }}
                >
                  <span className={`apPermDot ${on ? "on" : "off"}`} />
                  <span className="apPermLabelPro">{m.label}</span>
                  <span className="apPermKeyPro">{m.key}</span>
                </button>
              );
            })}
          </div>

{/* Matriz de permisos granulares del PUESTO */}
          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              <TbShieldLock style={{ marginRight: 4 }} />
              Permisos granulares del puesto
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f1f3f4" }}>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: "#444" }}>Módulo</th>
                    {["can_view","can_create","can_edit","can_approve","can_delete","can_export"].map((a) => (
                      <th key={a} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#444", whiteSpace: "nowrap" }}>
                        {ACTION_LABELS[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES_FULL.map((m, idx) => (
                    <tr key={m.key} style={{ background: idx % 2 === 0 ? "#fff" : "#f8f9fa", borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "6px 10px", fontWeight: 600, color: "#202124" }}>{m.label}</td>
                      {["can_view","can_create","can_edit","can_approve","can_delete","can_export"].map((action) => {
                        const applicable = m.actions.includes(action);
                        const checked = applicable && Boolean(lpPermissions[m.key]?.[action]);
                        return (
                          <td key={action} style={{ textAlign: "center", padding: "6px 8px" }}>
                            {applicable ? (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setLpPermissions((prev) => ({
                                    ...prev,
                                    [m.key]: { ...prev[m.key], [action]: e.target.checked },
                                  }))
                                }
                                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#1a73e8" }}
                              />
                            ) : (
                              <span style={{ color: "#ccc" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" className="apBtn apBtnGhost" style={{ fontSize: 11 }}
                onClick={() => { const n = defaultPermissions(); setLpPermissions(n); }}>
                Solo lectura
              </button>
              <button type="button" className="apBtn apBtnGhost" style={{ fontSize: 11 }}
                onClick={() => {
                  const n = {}; MODULES_FULL.forEach((m) => { n[m.key] = { can_view:true, can_create:true, can_edit:true, can_approve:false, can_delete:false, can_export:true }; });
                  setLpPermissions(n);
                }}>
                Operativo
              </button>
              <button type="button" className="apBtn apBtnPrimary" style={{ fontSize: 11 }}
                onClick={() => {
                  const n = {}; MODULES_FULL.forEach((m) => { n[m.key] = { can_view:true, can_create:true, can_edit:true, can_approve:true, can_delete:true, can_export:true }; });
                  setLpPermissions(n);
                }}>
                Acceso total
              </button>
            </div>
            <div className="apSmallHint">Todos los usuarios con este puesto heredan estos permisos. Dirección siempre tiene acceso total.</div>
          </div>

          <div className="apPermActionsCenter">
            <button className="apBtn apBtnGhost" type="button" onClick={() => setLpModules(new Set())}>
              <TbX /> Bloquear todo
            </button>

            <button className="apBtn apBtnGhost" type="button" onClick={() => setLpModules(new Set(MODULES.map((x) => x.key)))}>
              <TbRefresh /> Permitir todo
            </button>

            <button className="apBtn apBtnPrimary" type="button" onClick={saveLevelAndPolicy}>
              <TbShieldLock /> Guardar
            </button>
          </div>

          <div className="apSmallHint apCenterHint">
            Tip: Si no existe policy guardada para esa combinación, por defecto se permite <b>todo</b>.
          </div>
        </div>
      </Modal>
    </div>
  );
}