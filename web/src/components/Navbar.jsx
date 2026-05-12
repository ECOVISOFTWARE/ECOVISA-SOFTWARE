import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from "react";
import { FiMenu, FiX, FiLogOut, FiCamera, FiBell } from "react-icons/fi";
import Cropper from "react-easy-crop";
import Swal from "sweetalert2";
import {
  TbHome2,
  TbUsers,
  TbClipboardText,
  TbBox,
  TbTruck,
  TbCalendarMonth,
  TbFileInvoice,
  TbUserCircle,
  TbReceipt2,
  TbClipboardList,
  TbReportAnalytics,
  TbBuilding
} from "react-icons/tb";
import { apiFetch, API_BASE } from "../api.js";
import toast from "react-hot-toast";
import "./Navbar.css";
import { useNavigate, useLocation } from "react-router-dom";

const ICONS = {
  home: <TbHome2 />,
  admin: <TbUsers />,
  forms: <TbClipboardText />,
  inventory: <TbBox />,
  clients: <TbBuilding />,
  operations: <TbTruck />,
  calendar: <TbCalendarMonth />,
  quotes: <TbFileInvoice />,
  invoices: <TbReceipt2 />,
  serviceSheets: <TbClipboardList />,
  weeklyReports: <TbReportAnalytics />
};
export default function Navbar({ worker, active, onChange, onLogout }) {
const [mobileOpen, setMobileOpen] = useState(false);
const navigate = useNavigate();
const location = useLocation();

const ROUTES = useMemo(() => ({
  home: "/",
  admin: "/admin",
  forms: "/forms",
  inventory: "/inventory",
  clients: "/clients",
  quotes: "/quotes",
  operations: "/operations",
  invoices: "/invoices",
  serviceSheets: "/service-sheets",
  weeklyReports: "/general-reports",
  calendar: "/calendar"
}), []);


const getKeyFromPath = useCallback((pathname) => {
  // orden: rutas más largas primero por seguridad
  const entries = Object.entries(ROUTES).sort((a, b) => b[1].length - a[1].length);

  for (const [key, path] of entries) {
    if (path === "/") {
      if (pathname === "/") return "home";
      continue;
    }
    if (pathname === path || pathname.startsWith(path + "/")) return key;
  }
  return "home";
}, [ROUTES]);


const activeKey = useMemo(() => {
  return getKeyFromPath(location.pathname);
}, [location.pathname, getKeyFromPath]);

console.log("NAV DEBUG:", { pathname: location.pathname, activeKey });
// Perfil
const [profileOpen, setProfileOpen] = useState(false);
const [profileClosing, setProfileClosing] = useState(false);

// Notificaciones
const [notifOpen, setNotifOpen] = useState(false);
const [notifClosing, setNotifClosing] = useState(false);
const [notifTab, setNotifTab] = useState("all"); // "all" | "unread"
const openProfile = () => {
  setNotifOpen(false);
  setNotifClosing(false);
  setProfileClosing(false);
  setProfileOpen(true);
};

const closeProfile = () => {
  setProfileClosing(true);
  setTimeout(() => {
    setProfileOpen(false);
    setProfileClosing(false);
  }, 160);
};

const openNotif = () => {
  setProfileOpen(false);
  setProfileClosing(false);
  setNotifClosing(false);
  setNotifOpen(true);
};

const closeNotif = () => {
  setNotifClosing(true);
  setTimeout(() => {
    setNotifOpen(false);
    setNotifClosing(false);
  }, 160);
};
  const fileRef = useRef(null);
  const profileRef = useRef(null);
  const navCenterRef = useRef(null);
const pillRef = useRef(null);
const btnRefs = useRef({}); // key -> button element
const [activePill, setActivePill] = useState({ x: 0, y: 0, w: 44, h: 44, ready: false });
const setBtnRef = useCallback(
  (key) => (el) => {
    if (el) btnRefs.current[key] = el;
    else delete btnRefs.current[key];
  },
  []
);
// --- Avatar crop (tipo Facebook)
const [cropOpen, setCropOpen] = useState(false);
const [rawImageUrl, setRawImageUrl] = useState("");
const [rawFileType, setRawFileType] = useState("image/jpeg");
const [crop, setCrop] = useState({ x: 0, y: 0 });
const [zoom, setZoom] = useState(1);
const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const items = useMemo(
    () => [
      { key: "home", label: "Inicio" },
      { key: "admin", label: "Admin" },
      { key: "forms", label: "Formularios" },
      { key: "inventory", label: "Inventario" },
      { key: "clients", label: "Clientes" },
      { key: "quotes", label: "Cotizaciones" },
      { key: "operations", label: "Operaciones" },
      { key: "invoices", label: "Facturación" },
      { key: "weeklyReports", label: "Reportes Generales" },
      { key: "calendar", label: "Calendario" }
    ],
    []
  );
const handleGo = (key) => {
  const path = ROUTES[key] || "/";
  if (location.pathname !== path) navigate(path); 
  onChange?.(key); 
  setMobileOpen(false);
};
useLayoutEffect(() => {
  const container = navCenterRef.current;
  const btn = btnRefs.current[activeKey];

  // si aún no están listos, reintenta en el siguiente frame
  if (!container || !btn) {
    const id = requestAnimationFrame(() => {
      // fuerza un render mínimo sin cambiar activeKey:
      setActivePill((p) => ({ ...p, ready: false }));
    });
    return () => cancelAnimationFrame(id);
  }

  let raf1 = 0;
  let raf2 = 0;

  const update = () => {
    const b = btnRefs.current[activeKey];
    const c = navCenterRef.current;
    if (!c || !b) return;

    setActivePill({
      x: b.offsetLeft,
      y: b.offsetTop,
      w: b.offsetWidth,
      h: b.offsetHeight,
      ready: true
    });
  };

  const center = (behavior = "auto") => {
    const b = btnRefs.current[activeKey];
    const c = navCenterRef.current;
    if (!c || !b) return;

    const target = b.offsetLeft - (c.clientWidth - b.offsetWidth) / 2;
    c.scrollTo({ left: Math.max(0, target), behavior });
  };

  // 1) primer cálculo
  update();

  // 2) estabiliza tras 2 frames (cuando icon fonts / layout terminan)
  raf1 = requestAnimationFrame(() => {
    update();
    center("auto"); // sin anim al cargar/refresh
    raf2 = requestAnimationFrame(() => {
      update();
    });
  });

  // ResizeObserver: si cambia el tamaño del nav o del botón, recalcula
let ro;
if (typeof ResizeObserver !== "undefined") {
  ro = new ResizeObserver(() => update());
  ro.observe(container);
  ro.observe(btn);
}

  // cuando termina el load (imágenes/fonts/etc), recalcula
  const onLoad = () => {
    update();
    center("auto");
  };
  window.addEventListener("load", onLoad);

  // cuando las fonts están listas (iconos), recalcula
  let cancelled = false;
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (cancelled) return;
      update();
      center("auto");
    });
  }

  // resize normal
  window.addEventListener("resize", update);

  return () => {
    cancelled = true;
    if (raf1) cancelAnimationFrame(raf1);
    if (raf2) cancelAnimationFrame(raf2);
    ro.disconnect();
    window.removeEventListener("resize", update);
    window.removeEventListener("load", onLoad);
  };
}, [activeKey]);

  // Cerrar dropdown al click afuera
useEffect(() => {
  const onDown = (e) => {
    if (!profileRef.current) return;
    if (!profileRef.current.contains(e.target)) {
      if (profileOpen) closeProfile();
      if (notifOpen) closeNotif();
    }
  };
  document.addEventListener("mousedown", onDown);
  return () => document.removeEventListener("mousedown", onDown);
}, [profileOpen, notifOpen]);
// Cerrar drawer con ESC (mobile/desktop)
useEffect(() => {
  const onKey = (e) => {
    if (e.key === "Escape") setMobileOpen(false);
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, []);

  useEffect(() => {
    const run = async () => {
      if (!worker?.id) return;
      try {
        const data = await apiFetch(`/api/workers/${worker.id}`);
        const w = data?.worker;
if (w) {
  setWorkerMeta({
    department_name: w.department_name || "",
    level_name: w.level_name || ""
  });

  worker.department_name = w.department_name || worker.department_name || "";
  worker.level_name = w.level_name || worker.level_name || "";


  const photo = w.profile_photo_url || "";
  if (photo) {
    setAvatarUrl(photo);
    worker.profile_photo_url = photo;
  }
}
      } catch (e) {
        // si falla, no rompas UI
        console.warn("No se pudo refrescar worker meta:", e?.message || e);
      }
    };
    run();
  }, [worker?.id]);
const [avatarUrl, setAvatarUrl] = useState(worker?.profile_photo_url || "");

// Mantén sincronizado si el padre actualiza worker
useEffect(() => {
  setAvatarUrl(worker?.profile_photo_url || "");
}, [worker?.profile_photo_url]);
useEffect(() => {
  if (!mobileOpen) return;

  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = prev;
  };
}, [mobileOpen]);

useEffect(() => {
  const c = navCenterRef.current;
  if (!c) return;

  c.scrollLeft = 0;
}, []);
  // --- Helpers (Title Case)
  const toTitleCase = (str = "") =>
    String(str)
      .trim()
      .toLowerCase()
      .replace(/\b\p{L}/gu, (m) => m.toUpperCase()); // soporta acentos

  // Pide: el nombre que se muestra debe ser el username (login)
  const fullNameRaw = (worker?.username || "Usuario").trim();
  const fullName = toTitleCase(fullNameRaw);

  // --- Meta real (depto/puesto) refrescada desde backend
  const [workerMeta, setWorkerMeta] = useState({
    department_name: "",
    level_name: ""
  });

  // (pide: PUESTO y DEPARTAMENTO por nombre)
  const department = toTitleCase(
    workerMeta.department_name ||
    worker?.department_name ||
    worker?.department ||
    "—"
  );

  const position = toTitleCase(
    workerMeta.level_name ||
    worker?.level_name ||
    worker?.level ||
    "—"
  );

// === Notificaciones REALES ===
  const [notifications, setNotifications] = useState([]);


// ── Web Push: registrar SW y suscribir ────────────────
  const registerPush = useCallback(async () => {
    if (!worker?.id) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const { key } = await apiFetch("/api/push/vapid-public-key");
      if (!key) return;

      // convertir clave VAPID a Uint8Array
      const b64 = key.replace(/-/g, "+").replace(/_/g, "/");
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: raw,
      });

      await apiFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ worker_id: worker.id, subscription: sub.toJSON() }),
      });
    } catch (e) {
      console.warn("registerPush error:", e?.message);
    }
  }, [worker?.id]);

  useEffect(() => {
    registerPush();
  }, [registerPush]);

  const fetchNotifications = useCallback(async () => {
    if (!worker?.id) return;
    try {
      const resp = await apiFetch(`/api/notifications?recipient_id=${worker.id}&worker_id=${worker.id}&limit=40`);
      setNotifications(
        (resp?.data || []).map((n) => ({
          ...n,
          date: new Date(n.created_at),
          // compatibilidad con UI existente
          avatar: n.actor_photo || "",
          user: n.actor_name || "Sistema",
          dept: "",
          action: n.message,
        }))
      );
    } catch (e) {
      console.warn("fetchNotifications error:", e?.message);
    }
  }, [worker?.id]);


  useEffect(() => {
    if (!worker?.id) return;

    // carga inicial
    fetchNotifications();

    // construye URL del stream igual que apiFetch (evita /api/api doble)
    const sseUrl = (() => {
      const base = String(API_BASE || "").replace(/\/+$/, "");
      let p = `/api/notifications/stream?recipient_id=${worker.id}`;
      if (base.endsWith("/api") && p.startsWith("/api/")) {
        p = p.replace(/^\/api/, "");
      }
      return `${base}${p}`;
    })();

    let es;
    let fallback;

    try {
      es = new EventSource(sseUrl);

es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data || "{}");
          if (msg.type === "new_notification") {
            fetchNotifications();

            // ── Toast visual ──────────────────────────────
            toast.custom((t) => (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "#fff",
                  borderRadius: "14px",
                  padding: "12px 16px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                  opacity: t.visible ? 1 : 0,
                  transition: "opacity 0.2s",
                  minWidth: "280px",
                  maxWidth: "420px",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "#0ea5a0", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  flexShrink: 0, fontSize: 20, color: "#fff",
                }}>
                  🔔
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 2 }}>
                    {msg.title || "Nueva notificación"}
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {msg.message || msg.actor_name || ""}
                  </div>
                </div>
              </div>
            ), { duration: 5000 });

            // ── Sonido ────────────────────────────────────
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(880, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.4);
            } catch {}
          }
        } catch {}
      };
      es.onerror = () => {
        try { es?.close?.(); } catch {}
        // si SSE falla, cae a polling cada 30 seg
        if (!fallback) {
          fallback = setInterval(fetchNotifications, 30_000);
        }
      };
    } catch {
      // navegador sin soporte EventSource → polling
      fallback = setInterval(fetchNotifications, 30_000);
    }

    return () => {
      try { es?.close?.(); } catch {}
      if (fallback) clearInterval(fallback);
    };
  }, [worker?.id, fetchNotifications]);

  const formatNotifTime = (d) => {
    try {
      return new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d instanceof Date ? d : new Date(d));
    } catch {
      return String(d);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasNotif = unreadCount > 0;

  const handleMarkAllSeen = async () => {
    if (!worker?.id) return;
    // Optimista
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await apiFetch("/api/notifications/read-all", {
        method: "PUT",
        body: JSON.stringify({ recipient_id: worker.id }),
      });
    } catch (e) {
      console.warn("markAllRead error:", e?.message);
    }
  };

  const handleMarkOneSeen = async (id) => {
    // Optimista
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PUT" });
    } catch (e) {
      console.warn("markOneRead error:", e?.message);
    }
  };

  const filteredNotifications =
    notifTab === "unread" ? notifications.filter((n) => !n.read) : notifications;
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getCroppedBlob(imageSrc, cropPixels, mimeType = "image/jpeg") {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, 0.92);
  });
}

const onCropComplete = useCallback((_, croppedPixels) => {
  setCroppedAreaPixels(croppedPixels);
}, []);
  async function handlePickPhoto() {
    if (fileRef.current) fileRef.current.click();
  }

async function handleUploadPhoto(e) {
  const file = e.target.files?.[0];
  if (!file || !worker?.id) return;

  const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  if (!ok) {
    setProfileOpen(false);
    await Swal.fire({ icon: "error", title: "Formato no válido", text: "Solo PNG, JPG o WEBP." });
    e.target.value = "";
    return;
  }

  const url = URL.createObjectURL(file);
  setRawImageUrl(url);
  setRawFileType(file.type);
  setCrop({ x: 0, y: 0 });
  setZoom(1);
  setCroppedAreaPixels(null);

  // abre modal de recorte
  setCropOpen(true);

  // reset input para permitir subir la misma foto otra vez
  e.target.value = "";
}
async function handleCancelCrop() {
  if (rawImageUrl) URL.revokeObjectURL(rawImageUrl);
  setCropOpen(false);
  setProfileOpen(false);

  await Swal.fire({
    icon: "info",
    title: "Foto cancelada",
    text: "No se realizaron cambios."
  });
}

async function handleSaveCroppedPhoto() {
  try {
    if (!worker?.id || !rawImageUrl || !croppedAreaPixels) return;

    const blob = await getCroppedBlob(rawImageUrl, croppedAreaPixels, rawFileType);
    if (!blob) throw new Error("No se pudo recortar la imagen");

    const ext =
      rawFileType === "image/png" ? "png" :
      rawFileType === "image/webp" ? "webp" : "jpg";

    const fd = new FormData();
    fd.append("photo", blob, `avatar.${ext}`);

    const data = await apiFetch(`/api/workers/${worker.id}/photo`, {
      method: "POST",
      body: fd
    });

if (data?.profile_photo_url) {
  setAvatarUrl(data.profile_photo_url);             
  worker.profile_photo_url = data.profile_photo_url; 
}

    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl);
    setCropOpen(false);
    setProfileOpen(false);

    await Swal.fire({
      icon: "success",
      title: "Foto actualizada",
      text: "Tu foto se guardó correctamente."
    });
  } catch (err) {
    setCropOpen(false);
    setProfileOpen(false);
    await Swal.fire({
      icon: "error",
      title: "Error al subir foto",
      text: err?.message || "Ocurrió un error"
    });
  }
}
  return (
    <header className="nav">
      <div className="nav-row">
        {/* LEFT */}
        <div className="nav-left">
          <button
            className="nav-burger"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            title="Menú"
          >
            <FiMenu />
          </button>

          <button
            className="nav-logoBtn"
            onClick={() => handleGo("home")}
            aria-label="Ir a inicio"
            title="Inicio"
          >
            <img
              className="nav-logo-img"
              src="/assets/ECOVISACONTEXTO.png"
              alt="ECOVISA"
            />
          </button>
        </div>

        {/* CENTER */}
<nav className="nav-center" aria-label="Módulos" ref={navCenterRef}>
 
  <span
    ref={pillRef}
    className={`nav-activePill ${activePill.ready ? "ready" : ""}`}
    style={{
      width: `${activePill.w}px`,
      height: `${activePill.h}px`,
      transform: `translate3d(${activePill.x}px, ${activePill.y}px, 0)`
    }}
    aria-hidden="true"
  />

{items.map((it) => (
  <button
    key={it.key}
    ref={setBtnRef(it.key)}
    data-key={it.key}
    className={`nav-iconBtn ${activeKey === it.key ? "active" : ""}`}
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => handleGo(it.key)}
    data-tip={it.label}
    aria-label={it.label}
    type="button"
  >
    <span className="nav-icon">{ICONS[it.key]}</span>
  </button>
))}
</nav>

        {/* RIGHT (avatar/icon + nombre) */}
<div className="nav-right" ref={profileRef}>
  {/* Campana */}
<button
  className={`nav-iconBtn nav-bellBtn ${notifOpen ? "active" : ""}`}
  onMouseDown={(e) => e.preventDefault()}
  onClick={() => (notifOpen ? closeNotif() : openNotif())}
  aria-label="Abrir notificaciones"
  title="Notificaciones"
  type="button"
>
  <span className="nav-icon">
    <FiBell />
  </span>

  {hasNotif && (
    <span
      className="nav-bellBadge"
      aria-label={`${unreadCount} notificaciones no leídas`}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  )}
</button>

  {/* Botón usuario */}
  <button
    className="nav-userBtn"
    onClick={() => (profileOpen ? closeProfile() : openProfile())}
    aria-label="Abrir perfil"
    title="Perfil"
  >
    <span className="nav-userAvatar">
      {avatarUrl ? (
       <img
  className="nav-userAvatarImg"
  src={avatarUrl}
  alt="Foto de perfil"
  onError={() => setAvatarUrl("")}
/>
      ) : (
        <span className="nav-userAvatarIcon" aria-hidden>
          <TbUserCircle />
        </span>
      )}
    </span>

    <span className="nav-userName" title={fullName}>
      {fullName}
    </span>
  </button>

  {/* Panel notificaciones */}
{notifOpen && (
  <div className={`nav-notifMenu ${notifClosing ? "closing" : ""}`} role="menu">
    <div className="nav-notifHeader">
      <div className="nav-notifTitle">Notificaciones</div>
      <button
        className="nav-notifClose"
        onClick={closeNotif}
        aria-label="Cerrar notificaciones"
        title="Cerrar"
      >
        <FiX />
      </button>
    </div>

   
    <div className="nav-notifTabs" role="tablist" aria-label="Filtrar notificaciones">
      <button
        type="button"
        className={`nav-notifTab ${notifTab === "all" ? "active" : ""}`}
        onClick={() => setNotifTab("all")}
        role="tab"
        aria-selected={notifTab === "all"}
      >
        Todas
        <span className="nav-notifTabCount">{notifications.length}</span>
      </button>

      <button
        type="button"
        className={`nav-notifTab ${notifTab === "unread" ? "active" : ""}`}
        onClick={() => setNotifTab("unread")}
        role="tab"
        aria-selected={notifTab === "unread"}
      >
        No leídas
        <span className="nav-notifTabCount">{unreadCount}</span>
      </button>
    </div>

    <div className="nav-notifList">
      {filteredNotifications.length === 0 ? (
        <div className="nav-notifEmpty">
          {notifTab === "unread" ? "No tienes notificaciones no leídas." : "No tienes notificaciones."}
        </div>
      ) : (
        filteredNotifications.map((n) => (
          <button
            key={n.id}
            className={`nav-notifItem ${!n.read ? "unread" : "read"}`}
            onClick={() => handleMarkOneSeen(n.id)} 
            type="button"
          >
            <span className="nav-notifAvatar">
{(n.avatar || avatarUrl) ? (
  <img src={n.avatar || avatarUrl} alt="" />
) : (
  <span className="nav-notifAvatarFallback" aria-hidden>
    <TbUserCircle />
  </span>
)}
            </span>

            <span className="nav-notifText">
              <span className="nav-notifLine1">
                <b>{n.user}</b>, del departamento de <b>{n.dept}</b> {n.action}.
              </span>
              <span className="nav-notifLine2">{formatNotifTime(n.date)}</span>
            </span>

            {!n.read ? <span className="nav-notifUnread" aria-hidden /> : <span className="nav-notifReadSpacer" aria-hidden />}
          </button>
        ))
      )}
    </div>

    
    <button
      className="nav-notifFooter solid"
      type="button"
      onClick={handleMarkAllSeen}
      disabled={unreadCount === 0}
      aria-disabled={unreadCount === 0}
      title={unreadCount === 0 ? "No hay no leídas" : "Marcar todas como visto"}
    >
      Marcar todas como visto
    </button>
  </div>
)}

  {/* Menú Perfil */}
  {profileOpen && (
    <div className={`nav-profileMenu ${profileClosing ? "closing" : ""}`} role="menu">
      <div className="nav-profileHeader">
        <div className="nav-profileHeaderSpacer" />
        <div className="nav-profileHeaderName" title={fullName}>
          <span className="nav-profileHeaderLabel">USUARIO:</span>
          <span className="nav-profileHeaderValue">{fullName}</span>
        </div>
        <button className="nav-profileClose" onClick={closeProfile} aria-label="Cerrar" title="Cerrar">
          <FiX />
        </button>
      </div>

      {/* Avatar editable */}
      <div className="nav-profileAvatarArea">
        <button
          className="nav-profileAvatarBtn"
          onClick={handlePickPhoto}
          aria-label="Cambiar foto de perfil"
          title="Cambiar foto"
        >
          {avatarUrl ? (
            <img className="nav-profileAvatarImg" src={avatarUrl} alt="Foto de perfil" />
          ) : (
            <div className="nav-profileAvatarFallback" aria-hidden>
              <TbUserCircle />
            </div>
          )}
          <span className="nav-profileCam" aria-hidden>
            <FiCamera />
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUploadPhoto}
          style={{ display: "none" }}
        />
      </div>

      {/* Info */}
      <div className="nav-profileInfo">
        <div className="nav-profileInfoRow">
          <span className="nav-profileLabel">PUESTO:</span>
          <span className="nav-profileValue" title={String(position)}>{position}</span>
        </div>
        <div className="nav-profileInfoRow">
          <span className="nav-profileLabel">DEPARTAMENTO:</span>
          <span className="nav-profileValue" title={String(department)}>{department}</span>
        </div>
      </div>

      <div className="nav-profileActions">
        <button className="nav-profileLogout" onClick={onLogout}>
          <FiLogOut />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  )}
</div>
      </div>

{/* MOBILE DRAWER */}
<div className={`nav-drawer ${mobileOpen ? "open" : ""}`} role="dialog" aria-modal="true">
  
  <button
    className="nav-drawer-backdrop"
    onClick={() => setMobileOpen(false)}
    aria-label="Cerrar menú"
    title="Cerrar"
    type="button"
  />

 
  <div className="nav-drawer-inner" role="document">
    <div className="nav-drawer-head">
      <img className="nav-drawer-logo" src="/assets/ECOVISACONTEXTO.png" alt="ECOVISA" />
      <button
        className="nav-drawer-close"
        onClick={() => setMobileOpen(false)}
        aria-label="Cerrar menú"
        title="Cerrar"
        type="button"
      >
        <FiX />
      </button>
    </div>

    <div className="nav-drawer-list">
      {items.map((it) => (
        <button
          key={it.key}
          className={`nav-drawer-item ${activeKey === it.key ? "active" : ""}`}
          onClick={() => handleGo(it.key)}
          type="button"
        >
          <span className="nav-drawer-ico">{ICONS[it.key]}</span>
          <span className="nav-drawer-txt">{it.label}</span>
        </button>
      ))}
    </div>

    <button className="nav-drawer-logout" onClick={onLogout} type="button">
      <FiLogOut />
      <span>Cerrar sesión</span>
    </button>
  </div>
</div>
      {/* MODAL CROP */}
{cropOpen && (
  <div className="avatarCrop-backdrop" role="dialog" aria-modal="true">
    <div className="avatarCrop-modal">
      <div className="avatarCrop-head">
        <div className="avatarCrop-title">Recortar foto</div>
        <button className="avatarCrop-x" onClick={handleCancelCrop} aria-label="Cerrar">
          <FiX />
        </button>
      </div>

      <div className="avatarCrop-body">
        <div className="avatarCrop-cropper">
          <Cropper
            image={rawImageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="avatarCrop-zoomRow">
          <span>-</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span>+</span>
        </div>
      </div>

      <div className="avatarCrop-actions">
        <button className="avatarCrop-btn ghost" onClick={handleCancelCrop}>
          Cancelar
        </button>
        <button className="avatarCrop-btn solid" onClick={handleSaveCroppedPhoto}>
          Guardar
        </button>
      </div>
    </div>
  </div>
)}
    </header>
  );
}