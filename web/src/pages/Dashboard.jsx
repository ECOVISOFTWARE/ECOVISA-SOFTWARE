import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import "./Dashboard.css";
import AdminPanel from "./AdminPanel.jsx";
import Inventory from "./Inventory.jsx";
import FormsModule from "./FormsModule.jsx";
import CalendarModule from "./CalendarModule.jsx";
import QuotesModule from "./QuotesModule.jsx";
import InvoicesModule from "./InvoicesModule.jsx";
import ServiceSheetsModule from "./ServiceSheetsModule.jsx";
import WeeklyReportsModule from "./WeeklyReportsModule.jsx";
import OperationsModule from "./OperationsModule.jsx";
import ClientsModule from "./ClientsModule.jsx";
import { setTitle } from "../utils/setTitle";
import {
  TbBox,
  TbTruck,
  TbCalendarMonth,
  TbFileInvoice,
  TbReceipt2,
  TbReportAnalytics,
  TbClipboardText,
  TbUsers,
  TbBuilding
} from "react-icons/tb";

export default function Dashboard({ worker, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  const ROUTES = useMemo(
    () => ({
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
    }),
    []
  );

  const getKeyFromPath = useCallback(
    (pathname) => {
      const entries = Object.entries(ROUTES).sort(
        (a, b) => b[1].length - a[1].length
      );

      for (const [key, path] of entries) {
        if (path === "/") {
          if (pathname === "/") return "home";
          continue;
        }
        if (pathname === path || pathname.startsWith(path + "/")) return key;
      }

      return "home";
    },
    [ROUTES]
  );

  const tab = useMemo(() => getKeyFromPath(location.pathname), [
    location.pathname,
    getKeyFromPath
  ]);

  useEffect(() => {
    const saved = localStorage.getItem("ecovisa_active_tab");
    if (!saved) return;

    if (location.pathname === "/" && saved !== "home") {
      const path = ROUTES[saved] || "/";
      navigate(path, { replace: true });
    }
  }, [location.pathname, ROUTES, navigate]);

  const goTab = useCallback(
    (key) => {
      const path = ROUTES[key] || "/";
      if (location.pathname !== path) navigate(path);
      localStorage.setItem("ecovisa_active_tab", key);
    },
    [ROUTES, navigate, location.pathname]
  );

  const TAB_TITLES = useMemo(
    () => ({
      home: "Inicio",
      admin: "Admin Panel",
      forms: "Formularios",
      inventory: "Inventario",
      clients: "Clientes",
      quotes: "Cotizaciones",
      operations: "Operaciones",
      invoices: "Facturación",
      serviceSheets: "Hoja de Servicios",
      weeklyReports: "Reportes Generales",
      calendar: "Calendario"
    }),
    []
  );

  useEffect(() => {
    setTitle(TAB_TITLES[tab] || "Dashboard");
  }, [tab, TAB_TITLES]);

  useEffect(() => {
    const vv = window.visualViewport;

    const setVh = () => {
      const h = (vv?.height ?? window.innerHeight) * 0.01;
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };

    setVh();

    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);

    vv?.addEventListener("resize", setVh);
    vv?.addEventListener("scroll", setVh);

    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
      vv?.removeEventListener("resize", setVh);
      vv?.removeEventListener("scroll", setVh);
    };
  }, []);

  const modules = useMemo(
    () => [
      {
        key: "inventory",
        title: "Inventario",
        desc: "Entradas · Salidas · Stock",
        tone: "burgundy",
        size: "span2",
        icon: <TbBox />
      },
      {
        key: "operations",
        title: "Operaciones",
        desc: "Unidades · Rutas · Estados · Incidencias",
        tone: "steel",
        size: "span2",
        icon: <TbTruck />
      },
      {
        key: "calendar",
        title: "Calendario",
        desc: "Citas · Visitas · Eventos · Cumpleaños",
        tone: "navy",
        size: "span1",
        icon: <TbCalendarMonth />
      },
      {
        key: "quotes",
        title: "Cotizaciones",
        desc: "Clientes · Envíos · Aprobación",
        tone: "forest",
        size: "span1",
        icon: <TbFileInvoice />
      },
      {
        key: "invoices",
        title: "Facturación",
        desc: "PDF · Excel · XML · Cobro",
        tone: "teal",
        size: "span1",
        icon: <TbReceipt2 />
      },
      {
        key: "forms",
        title: "Formularios",
        desc: "Dinámicos · Respuestas · Export",
        tone: "violet",
        size: "span1",
        icon: <TbClipboardText />
      },
      {
        key: "clients",
        title: "Clientes",
        desc: "Catálogo · Historial · Facturación",
        tone: "steel",
        size: "span2",
        icon: <TbBuilding />
      },
      {
        key: "weeklyReports",
        title: "Reportes Generales",
        desc: "KPIs · Gráficas · Exportación",
        tone: "navy",
        size: "span2",
        icon: <TbReportAnalytics />
      },
      {
        key: "admin",
        title: "Admin Panel",
        desc: "Usuarios · Deptos · Niveles",
        tone: "slate",
        size: "span4",
        icon: <TbUsers />
      }
    ],
    []
  );

  return (
    <div className="app-shell">
      <Navbar worker={worker} active={tab} onChange={goTab} onLogout={onLogout} />

      <main className={`app-main ${tab === "home" ? "app-main--home" : ""}`}>
        {tab === "home" && (
          <section className="dash dash--fit">
            <div className="dash-head dash-head--center dash-head--tight"></div>

            <div className="mosaic mosaic--fit">
              {modules.map((m) => (
                <button
                  key={m.key}
                  className={`mTile mTile--big mTile--${m.key} ${m.tone} ${m.size}`}
                  onClick={() => goTab(m.key)}
                  type="button"
                >
                  <div className="mTile-hero">
                    <span className="mTile-ico mTile-ico--big" aria-hidden>
                      {m.icon}
                    </span>
                    <div className="mTile-text">
                      <div className="mTile-title mTile-title--big">{m.title}</div>
                      <div className="mTile-desc mTile-desc--big">{m.desc}</div>
                    </div>
                    <span className="mTile-go mTile-go--big" aria-hidden>›</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === "admin" && (
          <section className="module">
            <div className="module-head"></div>
            <AdminPanel currentWorker={worker} />
          </section>
        )}

        {tab === "inventory" && (
          <section className="module">
            <div className="module-head"></div>
            <Inventory currentWorker={worker} />
          </section>
        )}

        {tab === "forms" && (
          <section className="module">
            <div className="module-head"></div>
            <FormsModule currentWorker={worker} />
          </section>
        )}

        {tab === "calendar" && (
          <section className="module">
            <div className="module-head"></div>
            <CalendarModule currentWorker={worker} />
          </section>
        )}

        {tab === "quotes" && (
          <section className="module">
            <div className="module-head"></div>
            <QuotesModule currentWorker={worker} />
          </section>
        )}

        {tab === "clients" && (
          <section className="module">
            <div className="module-head"></div>
            <ClientsModule currentWorker={worker} />
          </section>
        )}

        {tab === "invoices" && (
          <section className="module">
            <div className="module-head"></div>
            <InvoicesModule currentWorker={worker} />
          </section>
        )}

        {tab === "serviceSheets" && (
          <section className="module">
            <div className="module-head"></div>
            <ServiceSheetsModule currentWorker={worker} />
          </section>
        )}

        {tab === "weeklyReports" && (
          <section className="module">
            <div className="module-head"></div>
            <WeeklyReportsModule currentWorker={worker} />
          </section>
        )}

        {tab === "operations" && (
          <section className="module">
            <div className="module-head"></div>
            <OperationsModule currentWorker={worker} />
          </section>
        )}

        {tab !== "home" &&
          tab !== "admin" &&
          tab !== "inventory" &&
          tab !== "forms" &&
          tab !== "calendar" &&
          tab !== "clients" &&
          tab !== "quotes" &&
          tab !== "invoices" &&
          tab !== "serviceSheets" &&
          tab !== "weeklyReports" &&
          tab !== "operations" && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", minHeight: "60vh",
              gap: "24px", textAlign: "center",
            }}>
              <img src="/assets/ESPERA.gif" alt="En desarrollo"
                style={{ width: "clamp(180px, 40vw, 320px)", height: "auto", borderRadius: "24px" }} />
              <div>
                <p style={{ margin: 0, fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 900, color: "rgba(10,12,14,0.85)", letterSpacing: "-0.04em" }}>
                  En desarrollo
                </p>
                <p style={{ margin: "8px 0 0", fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: 700, color: "rgba(10,12,14,0.45)" }}>
                  Este módulo estará disponible próximamente
                </p>
              </div>
            </div>
          )}
      </main>
    </div>
  );
}