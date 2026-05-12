import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Swal from "sweetalert2";
import { BarChart, PieChart, LineChart } from "@mui/x-charts";
import { Switch } from "@mui/material";
import { apiFetch, apiDownload, API_BASE } from "../api";
import "./WeeklyReportsModule.css";
import {
  TbReportAnalytics, TbPlus, TbSearch, TbEdit, TbTrash, TbRefresh,
  TbCalendarEvent, TbCurrencyDollar, TbNotes, TbFileText, TbX,
  TbChevronDown, TbChevronUp, TbChevronLeft, TbChevronRight,
  TbTruck, TbUsers, TbPackage, TbChartBar, TbChartPie, TbChartLine,
  TbTarget, TbReceipt, TbUserSearch, TbAlertTriangle, TbClipboardList,
  TbBuilding, TbFileTypePdf, TbFileTypeXls, TbCode,
} from "react-icons/tb";
// ─── Formatters ───────────────────────────────────────────────
function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

// ─── Row templates ────────────────────────────────────────────
const EMPTY_COLLECTION_ROW = () => ({ client_name: "", amount: 0, observations: "" });
const EMPTY_PROSPECT_ROW   = () => ({ prospect_name: "", follow_up_date: "", observations: "" });
const EMPTY_PORTFOLIO_ROW  = () => ({ client_name: "", amount: 0, observations: "" });
const EMPTY_VEHICLE_ROW    = () => ({ unit_name: "", km_initial: 0, km_final: 0, km_total: 0, fuel_amount: 0, performance: 0, maintenance_amount: 0, observations: "" });
const EMPTY_EXPENSE_ROW    = () => ({ concept: "", amount: 0, observations: "" });
const EMPTY_UNIT_ROW       = () => ({ unit_name: "", observations: "" });
const EMPTY_GOAL_ROW       = (concept = "") => ({ concept, objective: 0, real: 0, amount: 0, next_week_goal: 0, observations: "" });
const DEFAULT_GOALS        = ["Sanitarios", "Fosas", "Traila", "Lavamanos"].map(EMPTY_GOAL_ROW);
const EMPTY_SNAPSHOT       = () => ({ obra_service: 0, evento_service: 0, obra_patios: 0, evento_patios: 0, total_units: 0, observations: "" });

// ─── Servicios Sanitarios ─────────────────────────────────────────────────────
// Formato = CONTROL DE SERVICIOS SANITARIOS
const EMPTY_SERVICE_ENTRY = () => ({
  client_code     : "",        // # Cliente (M25, M195…)
  client_name     : "",        // Nombre del cliente
  city            : "LOS MOCHIS", // CIUDAD
  unit_folio      : "",        // Salida de almacén
  price           : 0,         // Precio renta
  location        : "",        // Ubicación / Lote
  delivery_date   : "",        // Fecha de Salida
  baños           : 1,         // Sanitarios propios
  lavamanos       : 0,
  remolque        : 0,
  service_freq    : 3,         // servicios/semana
  billing_periods : 1,         // Periodo
  billing_days    : 28,        // días = periods * 28
  billing_start   : "",        // Inicio factura
  billing_end     : "",        // Final factura
  billing_status  : "------",  // Alerta: Facturar | ------
  invoice_number  : "",        // No. Factura
  service_lun     : false,
  service_mar     : false,
  service_mie     : false,
  service_jue     : false,
  service_vie     : false,
  service_sab     : false,
  unit_status     : "Activo",  // Activo | RETIRADO
  notes           : "",
});

// Formato = RUTA 2026 (una fila por ubicación por día programado)
const EMPTY_OPERATION_ENTRY = () => ({
  client_code    : "",
  client_name    : "",
  city           : "",
  unit_folio     : "",
  baños          : 0,
  lavamanos      : 0,
  remolque       : 0,
  location       : "",
  day            : "LUN",        // LUN | MAR | MIÉ | JUE | VIE | SÁB
  billing_status : "------",
  invoice_number : "",
  status         : "pendiente",  // pendiente | completado | incidencia
  worker_name    : "",
  notes          : "",
});

// Auto-genera operaciones desde los servicios (preserva ediciones manuales al combinar)
function generateOperationsFromServices(services) {
  const DAYS = [
    { key: "service_lun", label: "LUN" },
    { key: "service_mar", label: "MAR" },
    { key: "service_mie", label: "MIÉ" },
    { key: "service_jue", label: "JUE" },
    { key: "service_vie", label: "VIE" },
    { key: "service_sab", label: "SÁB" },
  ];
  const ops = [];
  (services || []).forEach((svc) => {
    if (svc.unit_status === "RETIRADO") return;
    DAYS.forEach(({ key, label }) => {
      if (svc[key]) {
        ops.push({
          client_code    : svc.client_code,
          client_name    : svc.client_name,
          city           : svc.city,
          unit_folio     : svc.unit_folio,
          baños          : Number(svc.baños     || 0),
          lavamanos      : Number(svc.lavamanos  || 0),
          remolque       : Number(svc.remolque   || 0),
          location       : svc.location,
          day            : label,
          billing_status : svc.billing_status,
          invoice_number : svc.invoice_number,
          status         : "pendiente",
          worker_name    : "",
          notes          : "",
        });
      }
    });
  });
  return ops;
}

// Combina ops nuevas con existentes preservando status/worker/notes donde coincidan
function mergeOps(newOps, existingOps) {
  return newOps.map((op) => {
    const ex = (existingOps || []).find(
      (o) =>
        o.client_code === op.client_code &&
        o.location    === op.location    &&
        o.day         === op.day
    );
    return ex
      ? { ...op, status: ex.status, worker_name: ex.worker_name, notes: ex.notes }
      : op;
  });
}

// ─── Form state ───────────────────────────────────────────────
function emptyWeeklyReport(worker) {
  return {
    week_label: "", branch_name: "", month_label: "", start_date: "", end_date: "",
    sales_2025: 0, budget_2026: 0, sales_2026: 0, weekly_billing: 0, sales_without_invoice: 0,
    total_sales: 0, total_collected: 0,
    collection_entries: [],
    weekly_goals: DEFAULT_GOALS.map((g) => ({ ...g })),
    prospecting_entries: [], portfolio_issues: [],
    services_entries  : [],   // ← NUEVO: Control de Servicios Sanitarios
    operations_entries: [],   // ← NUEVO: Ruta operativa semanal
    vehicle_entries: [],
    extra_expenses: [], unit_reports: [],
    inventory_snapshot: EMPTY_SNAPSHOT(),
    summary: "", notes: "", report_observations: "", team_observations: "",
    created_by: worker?.id || null,
  };
}

function hydrateRow(row, worker) {
  return {
    ...emptyWeeklyReport(worker), ...row,
    total_sales: Number(row.total_sales || 0),
    total_collected: Number(row.total_collected || 0),
    sales_2025: Number(row.sales_2025 || 0),
    budget_2026: Number(row.budget_2026 || 0),
    sales_2026: Number(row.sales_2026 || 0),
    weekly_billing: Number(row.weekly_billing || 0),
    sales_without_invoice: Number(row.sales_without_invoice || 0),
    collection_entries  : Array.isArray(row.collection_entries)   ? row.collection_entries   : [],
    weekly_goals        : Array.isArray(row.weekly_goals) && row.weekly_goals.length > 0 ? row.weekly_goals : DEFAULT_GOALS.map((g) => ({ ...g })),
    prospecting_entries : Array.isArray(row.prospecting_entries)  ? row.prospecting_entries  : [],
    portfolio_issues    : Array.isArray(row.portfolio_issues)     ? row.portfolio_issues      : [],
    services_entries    : Array.isArray(row.services_entries)     ? row.services_entries      : [],   // ← NUEVO
    operations_entries  : Array.isArray(row.operations_entries)   ? row.operations_entries    : [],   // ← NUEVO
    vehicle_entries     : Array.isArray(row.vehicle_entries)      ? row.vehicle_entries       : [],
    extra_expenses      : Array.isArray(row.extra_expenses)       ? row.extra_expenses        : [],
    unit_reports        : Array.isArray(row.unit_reports)         ? row.unit_reports          : [],
    inventory_snapshot  : row.inventory_snapshot && typeof row.inventory_snapshot === "object" ? row.inventory_snapshot : EMPTY_SNAPSHOT(),
  };
}

// ─── Accordion Section ────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="wrSection">
      <button type="button" className="wrSectionHeader" onClick={() => setOpen((o) => !o)}>
        <span className="wrSectionIcon">{icon}</span>
        <span className="wrSectionTitle">{title}</span>
        <span className="wrSectionChevron">{open ? <TbChevronUp /> : <TbChevronDown />}</span>
      </button>
      {open && <div className="wrSectionBody">{children}</div>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────
function WeeklyReportModal({ open, mode, form, setForm, onClose, onSave }) {
  if (!open) return null;
  const ro = mode === "view";

  function addRow(field, template) {
    setForm((p) => ({ ...p, [field]: [...(p[field] || []), template()] }));
  }
  function updRow(field, i, key, val) {
    setForm((p) => {
      const arr = [...(p[field] || [])];
      arr[i] = { ...arr[i], [key]: val };
      return { ...p, [field]: arr };
    });
  }
  function delRow(field, i) {
    setForm((p) => {
      const arr = [...(p[field] || [])];
      arr.splice(i, 1);
      return { ...p, [field]: arr };
    });
  }
function updSnap(key, val) {
    setForm((p) => ({ ...p, inventory_snapshot: { ...(p.inventory_snapshot || EMPTY_SNAPSHOT()), [key]: val } }));
  }

  // ── Handlers especiales para Servicios (requieren re-generar operaciones) ──
  function handleSvcDayToggle(idx, dayKey, val) {
    setForm((p) => {
      const newSvcs = [...(p.services_entries || [])];
      newSvcs[idx] = { ...newSvcs[idx], [dayKey]: val };
      return {
        ...p,
        services_entries  : newSvcs,
        operations_entries: mergeOps(
          generateOperationsFromServices(newSvcs),
          p.operations_entries
        ),
      };
    });
  }

  function handleDelSvc(idx) {
    setForm((p) => {
      const newSvcs = [...(p.services_entries || [])];
      newSvcs.splice(idx, 1);
      return {
        ...p,
        services_entries  : newSvcs,
        operations_entries: generateOperationsFromServices(newSvcs),
      };
    });
  }

  function handleRegenOps() {
    setForm((p) => ({
      ...p,
      operations_entries: mergeOps(
        generateOperationsFromServices(p.services_entries || []),
        p.operations_entries
      ),
    }));
  }

  const snap = form.inventory_snapshot || EMPTY_SNAPSHOT();
const totalCobranza       = (form.collection_entries  || []).reduce((s, r) => s + Number(r.amount            || 0), 0);
  const totalGastos         = (form.extra_expenses      || []).reduce((s, r) => s + Number(r.amount            || 0), 0);
  const totalCombustible    = (form.vehicle_entries     || []).reduce((s, r) => s + Number(r.fuel_amount        || 0), 0);
  const totalMtto           = (form.vehicle_entries     || []).reduce((s, r) => s + Number(r.maintenance_amount || 0), 0);
  const totalInv            = Number(snap.obra_service  || 0) + Number(snap.evento_service || 0) + Number(snap.obra_patios || 0) + Number(snap.evento_patios || 0);
  const pctAlcance          = Number(form.budget_2026) > 0 ? ((Number(form.sales_2026 || 0) / Number(form.budget_2026)) * 100).toFixed(1) : null;
  // ── Servicios & Operaciones ─────────────────────────────────────────────
  const totalBaños          = (form.services_entries   || []).reduce((s, r) => s + Number(r.baños     || 0), 0);
  const totalLavamanos      = (form.services_entries   || []).reduce((s, r) => s + Number(r.lavamanos  || 0), 0);
  const totalRemolques      = (form.services_entries   || []).reduce((s, r) => s + Number(r.remolque   || 0), 0);
  const totalSvcsFacturar   = (form.services_entries   || []).filter(s => s.billing_status === "Facturar").length;
  const totalOpsCompletadas = (form.operations_entries || []).filter(o => o.status === "completado").length;
  const totalOpsIncidencias = (form.operations_entries || []).filter(o => o.status === "incidencia").length;

  const inp = (label, key, type = "text", placeholder = "") => (
    <div className="wrField">
      <label>{label}</label>
      <input className="wrInput" type={type} step={type === "number" ? "0.01" : undefined}
        value={form[key] ?? ""} readOnly={ro} placeholder={placeholder}
        onChange={(e) => !ro && setForm((p) => ({ ...p, [key]: e.target.value }))} />
    </div>
  );

  const ta = (label, key, placeholder = "") => (
    <div className="wrField wrField--span2">
      <label>{label}</label>
      <textarea className="wrTextarea" value={form[key] ?? ""} readOnly={ro} placeholder={placeholder}
        onChange={(e) => !ro && setForm((p) => ({ ...p, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="wrModalBack" onMouseDown={onClose}>
      <div className="wrModal wrModalLarge" onMouseDown={(e) => e.stopPropagation()}>

        <div className="wrModalTop">
          <div className="wrModalTitle">
            {mode === "create" && "Nueva bitácora semanal"}
            {mode === "edit"   && "Editar bitácora semanal"}
            {mode === "view"   && "Detalle de bitácora semanal"}
          </div>
          <button type="button" className="wrIconBtn" onClick={onClose} aria-label="Cerrar"><TbX /></button>
        </div>

        <div className="wrModalBody">

          {/* 1. ENCABEZADO */}
          <Section title="Encabezado" icon={<TbFileText />}>
            <div className="wrFormGrid">
              {inp("Etiqueta de semana", "week_label", "text", "Ej. Del 19 al 24 Enero 2026")}
              {inp("Sucursal", "branch_name", "text", "Ej. Culiacán")}
              {inp("Mes", "month_label", "text", "Ej. Enero 2026")}
              {inp("Fecha inicial", "start_date", "date")}
              {inp("Fecha final", "end_date", "date")}
            </div>
          </Section>

          {/* 2. VENTAS */}
          <Section title="Ventas" icon={<TbCurrencyDollar />}>
            <div className="wrFormGrid">
              {inp("Venta 2025", "sales_2025", "number", "0.00")}
              {inp("Presupuesto 2026", "budget_2026", "number", "0.00")}
              {inp("Venta 2026 (acumulado)", "sales_2026", "number", "0.00")}
              {inp("Facturación semanal", "weekly_billing", "number", "0.00")}
              {inp("Venta S/F (sin factura)", "sales_without_invoice", "number", "0.00")}
            </div>
            {pctAlcance !== null && (
              <div className="wrKpiInline">
                <span>% Alcance presupuesto:</span>
                <strong className={Number(pctAlcance) >= 100 ? "wrKpiGreen" : Number(pctAlcance) >= 80 ? "wrKpiYellow" : "wrKpiRed"}>
                  {pctAlcance}%
                </strong>
              </div>
            )}
          </Section>

          {/* 3. COBRANZA */}
          <Section title={`Cobranza${totalCobranza > 0 ? " — " + formatCurrency(totalCobranza) : ""}`} icon={<TbReceipt />}>
            <div className="wrDynTable">
              <table>
                <thead><tr>
                  <th>Cliente</th><th>Monto</th><th>Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.collection_entries || []).map((row, i) => (
                    <tr key={i}>
                      <td><input className="wrInput wrInputSm" value={row.client_name} readOnly={ro} placeholder="Nombre del cliente" onChange={(e) => updRow("collection_entries", i, "client_name", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.amount} readOnly={ro} onChange={(e) => updRow("collection_entries", i, "amount", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} onChange={(e) => updRow("collection_entries", i, "observations", e.target.value)} /></td>
                      {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("collection_entries", i)}><TbTrash /></button></td>}
                    </tr>
                  ))}
                  {(form.collection_entries || []).length === 0 && (
                    <tr><td colSpan={ro ? 3 : 4} className="wrDynEmpty">{ro ? "Sin registros." : "Agrega clientes cobrados esta semana."}</td></tr>
                  )}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("collection_entries", EMPTY_COLLECTION_ROW)}><TbPlus /> Agregar cliente</button>}
              {totalCobranza > 0 && <div className="wrTableTotal">Total cobrado / depositado: <strong>{formatCurrency(totalCobranza)}</strong></div>}
            </div>
          </Section>

          {/* 4. META SEMANAL */}
          <Section title="Meta Semanal" icon={<TbTarget />} defaultOpen={false}>
            <div className="wrDynTable wrDynTableWide">
              <table>
                <thead><tr>
                  <th>Concepto</th><th>Objetivo</th><th>Real</th><th>%</th>
                  <th>$ Venta</th><th>Meta próx. sem.</th><th>Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.weekly_goals || []).map((row, i) => {
                    const pct = Number(row.objective) > 0 ? ((Number(row.real) / Number(row.objective)) * 100).toFixed(1) + "%" : "—";
                    return (
                      <tr key={i}>
                        <td><input className="wrInput wrInputSm" value={row.concept} readOnly={ro} onChange={(e) => updRow("weekly_goals", i, "concept", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" value={row.objective} readOnly={ro} onChange={(e) => updRow("weekly_goals", i, "objective", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" value={row.real} readOnly={ro} onChange={(e) => updRow("weekly_goals", i, "real", e.target.value)} /></td>
                        <td className="wrTdMuted">{pct}</td>
                        <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.amount} readOnly={ro} onChange={(e) => updRow("weekly_goals", i, "amount", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" value={row.next_week_goal} readOnly={ro} onChange={(e) => updRow("weekly_goals", i, "next_week_goal", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} onChange={(e) => updRow("weekly_goals", i, "observations", e.target.value)} /></td>
                        {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("weekly_goals", i)}><TbTrash /></button></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("weekly_goals", () => EMPTY_GOAL_ROW())}><TbPlus /> Agregar concepto</button>}
            </div>
          </Section>

          {/* 5. PROSPECTOS */}
          <Section title="Prospectos" icon={<TbUserSearch />} defaultOpen={false}>
            <div className="wrDynTable">
              <table>
                <thead><tr>
                  <th>Prospecto</th><th>Fecha seguimiento</th><th>Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.prospecting_entries || []).map((row, i) => (
                    <tr key={i}>
                      <td><input className="wrInput wrInputSm" value={row.prospect_name} readOnly={ro} placeholder="Nombre del prospecto" onChange={(e) => updRow("prospecting_entries", i, "prospect_name", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" type="date" value={row.follow_up_date || ""} readOnly={ro} onChange={(e) => updRow("prospecting_entries", i, "follow_up_date", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} onChange={(e) => updRow("prospecting_entries", i, "observations", e.target.value)} /></td>
                      {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("prospecting_entries", i)}><TbTrash /></button></td>}
                    </tr>
                  ))}
                  {(form.prospecting_entries || []).length === 0 && (
                    <tr><td colSpan={ro ? 3 : 4} className="wrDynEmpty">{ro ? "Sin prospectos registrados." : "Agrega prospectos en seguimiento."}</td></tr>
                  )}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("prospecting_entries", EMPTY_PROSPECT_ROW)}><TbPlus /> Agregar prospecto</button>}
            </div>
          </Section>

{/* 6. CARTERA / POSTVENTA */}
          <Section title="Cartera / Reporte Postventa" icon={<TbAlertTriangle />} defaultOpen={false}>
            <div className="wrDynTable">
              <table>
                <thead><tr>
                  <th>Cliente</th><th>Monto en cartera</th><th>Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.portfolio_issues || []).map((row, i) => (
                    <tr key={i}>
                      <td><input className="wrInput wrInputSm" value={row.client_name} readOnly={ro} placeholder="Nombre del cliente" onChange={(e) => updRow("portfolio_issues", i, "client_name", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.amount} readOnly={ro} onChange={(e) => updRow("portfolio_issues", i, "amount", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} onChange={(e) => updRow("portfolio_issues", i, "observations", e.target.value)} /></td>
                      {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("portfolio_issues", i)}><TbTrash /></button></td>}
                    </tr>
                  ))}
                  {(form.portfolio_issues || []).length === 0 && (
                    <tr><td colSpan={ro ? 3 : 4} className="wrDynEmpty">{ro ? "Sin problemas de cartera." : "Agrega clientes con saldo pendiente o problemas de cobro."}</td></tr>
                  )}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("portfolio_issues", EMPTY_PORTFOLIO_ROW)}><TbPlus /> Agregar cliente en cartera</button>}
              {(form.portfolio_issues || []).length > 0 && (
                <div className="wrTableTotal">Total cartera: <strong>{formatCurrency((form.portfolio_issues || []).reduce((s, r) => s + Number(r.amount || 0), 0))}</strong></div>
              )}
            </div>
          </Section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 7. SERVICIOS SANITARIOS — Control de Servicios (formato Excel)    */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <Section
            title={`Servicios Sanitarios${totalBaños > 0 ? ` — ${totalBaños} baños · ${totalLavamanos} lav. · ${totalRemolques} rem.` : ""}`}
            icon={<TbPackage />}
            defaultOpen={false}
          >
            <div className="wrSvcHeader">
              <p className="wrInfoText">
                Registra los servicios activos de la semana. Al marcar los días (L/M/X/J/V/S) se genera automáticamente el plan de Operaciones.
              </p>
              {!ro && (
                <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={handleRegenOps}>
                  ⟳ Regenerar Operaciones
                </button>
              )}
            </div>

            <div className="wrDynTable wrDynTableXWide">
              <table className="wrSvcTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cód.</th>
                    <th>Cliente</th>
                    <th>Ciudad</th>
                    <th>Folio</th>
                    <th>Precio $</th>
                    <th>Ubicación</th>
                    <th>F. Salida</th>
                    <th title="Baños">🚽</th>
                    <th title="Lavamanos">🚿</th>
                    <th title="Remolque">🚐</th>
                    <th title="Frecuencia/sem">Frec.</th>
                    <th title="Período">Per.</th>
                    <th title="Días totales">Días</th>
                    <th>Ini.Fact.</th>
                    <th>Fin.Fact.</th>
                    <th>Alerta</th>
                    <th>Factura</th>
                    <th className="wrThDay">L</th>
                    <th className="wrThDay">M</th>
                    <th className="wrThDay">X</th>
                    <th className="wrThDay">J</th>
                    <th className="wrThDay">V</th>
                    <th className="wrThDay">S</th>
                    <th>Status</th>
                    {!ro && <th style={{ width: 36 }} />}
                  </tr>
                </thead>
                <tbody>
                  {(form.services_entries || []).map((svc, i) => (
                    <tr
                      key={i}
                      className={
                        svc.unit_status === "RETIRADO" ? "wrRowRetired"
                        : svc.billing_status === "Facturar" ? "wrRowToBill"
                        : ""
                      }
                    >
                      <td className="wrTdMuted wrTdCenter">{i + 1}</td>
                      <td>
                        <input className="wrInput wrInputXs" value={svc.client_code} readOnly={ro}
                          placeholder="M25"
                          onChange={(e) => updRow("services_entries", i, "client_code", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputMd" value={svc.client_name} readOnly={ro}
                          placeholder="Nombre del cliente"
                          onChange={(e) => updRow("services_entries", i, "client_name", e.target.value)} />
                      </td>
                      <td>
                        <select className="wrInput wrInputXs" value={svc.city} disabled={ro}
                          onChange={(e) => updRow("services_entries", i, "city", e.target.value)}>
                          <option>LOS MOCHIS</option>
                          <option>GUASAVE</option>
                          <option>MOCORITO</option>
                          <option>ESTACION BAMOA</option>
                        </select>
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" value={svc.unit_folio} readOnly={ro}
                          placeholder="685"
                          onChange={(e) => updRow("services_entries", i, "unit_folio", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="number" step="0.01" value={svc.price} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "price", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputMd" value={svc.location} readOnly={ro}
                          placeholder="CAÑAVERAL"
                          onChange={(e) => updRow("services_entries", i, "location", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="date" value={svc.delivery_date || ""} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "delivery_date", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="number" min="0" value={svc.baños} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "baños", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="number" min="0" value={svc.lavamanos} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "lavamanos", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="number" min="0" value={svc.remolque} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "remolque", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="number" min="1" max="7" value={svc.service_freq} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "service_freq", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="number" min="1" value={svc.billing_periods} readOnly={ro}
                          onChange={(e) => {
                            const p = Number(e.target.value) || 1;
                            updRow("services_entries", i, "billing_periods", p);
                            updRow("services_entries", i, "billing_days", p * 28);
                          }} />
                      </td>
                      <td className="wrTdMuted wrTdCenter">{Number(svc.billing_periods || 1) * 28}</td>
                      <td>
                        <input className="wrInput wrInputXs" type="date" value={svc.billing_start || ""} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "billing_start", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" type="date" value={svc.billing_end || ""} readOnly={ro}
                          onChange={(e) => updRow("services_entries", i, "billing_end", e.target.value)} />
                      </td>
                      <td>
                        <select className="wrInput wrInputXs" value={svc.billing_status} disabled={ro}
                          onChange={(e) => updRow("services_entries", i, "billing_status", e.target.value)}>
                          <option value="------">------</option>
                          <option value="Facturar">Facturar</option>
                        </select>
                      </td>
                      <td>
                        <input className="wrInput wrInputXs" value={svc.invoice_number} readOnly={ro}
                          placeholder="M576"
                          onChange={(e) => updRow("services_entries", i, "invoice_number", e.target.value)} />
                      </td>
                      {[
                        { key: "service_lun", label: "L" },
                        { key: "service_mar", label: "M" },
                        { key: "service_mie", label: "X" },
                        { key: "service_jue", label: "J" },
                        { key: "service_vie", label: "V" },
                        { key: "service_sab", label: "S" },
                      ].map(({ key }) => (
                        <td key={key} className="wrDayCell">
                          <button
                            type="button"
                            className={`wrDayCheckSm ${svc[key] ? "wrDayCheckSm--on" : ""}`}
                            onClick={() => !ro && handleSvcDayToggle(i, key, !svc[key])}
                            disabled={ro}
                          >
                            {svc[key] ? "✓" : "·"}
                          </button>
                        </td>
                      ))}
                      <td>
                        <select className="wrInput wrInputXs" value={svc.unit_status} disabled={ro}
                          onChange={(e) => updRow("services_entries", i, "unit_status", e.target.value)}>
                          <option value="Activo">Activo</option>
                          <option value="RETIRADO">RETIRADO</option>
                        </select>
                      </td>
                      {!ro && (
                        <td>
                          <button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => handleDelSvc(i)}>
                            <TbTrash />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {(form.services_entries || []).length === 0 && (
                    <tr>
                      <td colSpan={ro ? 25 : 26} className="wrDynEmpty">
                        {ro ? "Sin servicios registrados." : "Agrega los servicios activos de la semana."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {!ro && (
                <button type="button" className="wrBtn wrBtnGhost wrBtnSm"
                  onClick={() => addRow("services_entries", EMPTY_SERVICE_ENTRY)}>
                  <TbPlus /> Agregar servicio
                </button>
              )}

              {totalBaños > 0 && (
                <div className="wrTableTotalsRow">
                  <span>🚽 Baños: <strong>{totalBaños}</strong></span>
                  <span>🚿 Lavamanos: <strong>{totalLavamanos}</strong></span>
                  <span>🚐 Remolques: <strong>{totalRemolques}</strong></span>
                  <span>💲 A facturar: <strong style={{ color: "#f59e0b" }}>{totalSvcsFacturar}</strong></span>
                  <span>
                    Facturación estimada:&nbsp;
                    <strong>
                      {formatCurrency(
                        (form.services_entries || [])
                          .filter(s => s.unit_status === "Activo")
                          .reduce((sum, s) => sum + Number(s.price || 0), 0)
                      )}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 8. OPERACIONES DE LA SEMANA — Ruta operativa (formato RUTA 2026)  */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <Section
            title={`Operaciones de la Semana${(form.operations_entries || []).length > 0
              ? ` — ${(form.operations_entries || []).length} operaciones · ${totalOpsCompletadas} completadas · ${totalOpsIncidencias} incidencias`
              : ""
            }`}
            icon={<TbTruck />}
            defaultOpen={false}
          >
            {!ro && (
              <p className="wrInfoText">
                Generadas automáticamente desde los días marcados en Servicios. Actualiza el status al concluir la semana.
              </p>
            )}

            <div className="wrDynTable wrDynTableWide">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Ciudad</th>
                    <th>Ubicación</th>
                    <th>Folio</th>
                    <th title="Baños">🚽</th>
                    <th title="Lavamanos">🚿</th>
                    <th title="Remolque">🚐</th>
                    <th>Día</th>
                    <th>Alerta</th>
                    <th>Factura</th>
                    <th>Status</th>
                    <th>Trabajador</th>
                    <th>Observaciones</th>
                    {!ro && <th style={{ width: 36 }} />}
                  </tr>
                </thead>
                <tbody>
                  {(form.operations_entries || []).map((op, i) => (
                    <tr
                      key={i}
                      className={
                        op.status === "completado" ? "wrRowCompleted"
                        : op.status === "incidencia" ? "wrRowIncident"
                        : ""
                      }
                    >
                      <td className="wrTdBold">{op.client_name || "—"}</td>
                      <td>
                        <span className={`wrCityTag wrCityTag--${(op.city || "").toLowerCase().replace(/ /g, "")}`}>
                          {op.city || "—"}
                        </span>
                      </td>
                      <td className="wrTdLocation" title={op.location}>{op.location || "—"}</td>
                      <td className="wrTdMuted">{op.unit_folio || "—"}</td>
                      <td className="wrTdCenter">{op.baños    || 0}</td>
                      <td className="wrTdCenter">{op.lavamanos || 0}</td>
                      <td className="wrTdCenter">{op.remolque  || 0}</td>
                      <td>
                        <span className="wrDayBadge">{op.day}</span>
                      </td>
                      <td>
                        {op.billing_status === "Facturar"
                          ? <span className="wrBillBadge">Facturar</span>
                          : <span className="wrTdMuted">——</span>
                        }
                      </td>
                      <td className="wrTdMuted">{op.invoice_number || "—"}</td>
                      <td>
                        {ro ? (
                          <span className={`wrStatusBadge wrStatusBadge--${op.status}`}>{op.status}</span>
                        ) : (
                          <select
                            className={`wrInput wrInputXs wrStatusSelect wrStatusSelect--${op.status}`}
                            value={op.status}
                            onChange={(e) => updRow("operations_entries", i, "status", e.target.value)}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="completado">Completado</option>
                            <option value="incidencia">Incidencia</option>
                          </select>
                        )}
                      </td>
                      <td>
                        <input className="wrInput wrInputSm" value={op.worker_name} readOnly={ro}
                          placeholder="Responsable"
                          onChange={(e) => updRow("operations_entries", i, "worker_name", e.target.value)} />
                      </td>
                      <td>
                        <input className="wrInput wrInputSm" value={op.notes} readOnly={ro}
                          placeholder="Observación…"
                          onChange={(e) => updRow("operations_entries", i, "notes", e.target.value)} />
                      </td>
                      {!ro && (
                        <td>
                          <button type="button" className="wrIconBtn wrIconBtnDanger"
                            onClick={() => delRow("operations_entries", i)}>
                            <TbTrash />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {(form.operations_entries || []).length === 0 && (
                    <tr>
                      <td colSpan={ro ? 13 : 14} className="wrDynEmpty">
                        {ro
                          ? "Sin operaciones registradas."
                          : "Activa días de servicio en la sección Servicios para generar operaciones automáticamente."
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {!ro && (
                <button type="button" className="wrBtn wrBtnGhost wrBtnSm"
                  onClick={() => addRow("operations_entries", EMPTY_OPERATION_ENTRY)}>
                  <TbPlus /> Agregar operación manual
                </button>
              )}

              {(form.operations_entries || []).length > 0 && (
                <div className="wrTableTotalsRow">
                  <span>Total: <strong>{(form.operations_entries || []).length}</strong></span>
                  <span>✅ Completadas: <strong style={{ color: "#16a34a" }}>{totalOpsCompletadas}</strong></span>
                  <span>⚠️ Incidencias: <strong style={{ color: "#dc2626" }}>{totalOpsIncidencias}</strong></span>
                  <span>
                    Tasa de éxito:&nbsp;
                    <strong>
                      {(form.operations_entries || []).length > 0
                        ? Math.round((totalOpsCompletadas / (form.operations_entries || []).length) * 100) + "%"
                        : "—"
                      }
                    </strong>
                  </span>
                  <span>
                    🚽 Baños servidos:&nbsp;
                    <strong>
                      {(form.operations_entries || [])
                        .filter(o => o.status === "completado")
                        .reduce((s, o) => s + Number(o.baños || 0), 0)}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* 7. INVENTARIOS */}
          <Section title={`Inventarios${totalInv > 0 ? " — " + totalInv + " unidades" : ""}`} icon={<TbPackage />} defaultOpen={false}>
            <div className="wrFormGrid">
              <div className="wrField"><label>Campo / Obra — Servicio</label><input className="wrInput" type="number" value={snap.obra_service || 0} readOnly={ro} onChange={(e) => updSnap("obra_service", e.target.value)} /></div>
              <div className="wrField"><label>Evento — Servicio</label><input className="wrInput" type="number" value={snap.evento_service || 0} readOnly={ro} onChange={(e) => updSnap("evento_service", e.target.value)} /></div>
              <div className="wrField"><label>Obra — Patios</label><input className="wrInput" type="number" value={snap.obra_patios || 0} readOnly={ro} onChange={(e) => updSnap("obra_patios", e.target.value)} /></div>
              <div className="wrField"><label>Evento — Patios</label><input className="wrInput" type="number" value={snap.evento_patios || 0} readOnly={ro} onChange={(e) => updSnap("evento_patios", e.target.value)} /></div>
              <div className="wrField"><label>Total unidades (manual)</label><input className="wrInput" type="number" value={snap.total_units || 0} readOnly={ro} onChange={(e) => updSnap("total_units", e.target.value)} /></div>
              <div className="wrField wrField--span2"><label>Observaciones de inventario</label><textarea className="wrTextarea" value={snap.observations || ""} readOnly={ro} onChange={(e) => updSnap("observations", e.target.value)} /></div>
            </div>
            <div className="wrKpiInline"><span>Total calculado (suma):</span><strong>{totalInv} unidades</strong></div>
          </Section>

          {/* 8. VEHÍCULOS */}
          <Section title={`Vehículos${totalCombustible > 0 ? " — Combustible: " + formatCurrency(totalCombustible) : ""}`} icon={<TbTruck />} defaultOpen={false}>
            <div className="wrDynTable wrDynTableWide">
              <table>
                <thead><tr>
                  <th>Unidad</th><th>Km inicial</th><th>Km final</th><th>Km total</th>
                  <th>Combustible $</th><th>Rendimiento</th><th>Mtto $</th><th>Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.vehicle_entries || []).map((row, i) => {
                    const kmDiff = Number(row.km_final || 0) - Number(row.km_initial || 0);
                    return (
                      <tr key={i}>
                        <td><input className="wrInput wrInputSm" value={row.unit_name} readOnly={ro} placeholder="Ej. Unidad 84" onChange={(e) => updRow("vehicle_entries", i, "unit_name", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" value={row.km_initial} readOnly={ro} onChange={(e) => updRow("vehicle_entries", i, "km_initial", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" value={row.km_final} readOnly={ro} onChange={(e) => updRow("vehicle_entries", i, "km_final", e.target.value)} /></td>
                        <td className="wrTdMuted">{kmDiff > 0 ? kmDiff : "—"}</td>
                        <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.fuel_amount} readOnly={ro} onChange={(e) => updRow("vehicle_entries", i, "fuel_amount", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.performance} readOnly={ro} onChange={(e) => updRow("vehicle_entries", i, "performance", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.maintenance_amount} readOnly={ro} onChange={(e) => updRow("vehicle_entries", i, "maintenance_amount", e.target.value)} /></td>
                        <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} onChange={(e) => updRow("vehicle_entries", i, "observations", e.target.value)} /></td>
                        {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("vehicle_entries", i)}><TbTrash /></button></td>}
                      </tr>
                    );
                  })}
                  {(form.vehicle_entries || []).length === 0 && (
                    <tr><td colSpan={ro ? 8 : 9} className="wrDynEmpty">{ro ? "Sin vehículos registrados." : "Agrega las unidades de la flota."}</td></tr>
                  )}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("vehicle_entries", EMPTY_VEHICLE_ROW)}><TbPlus /> Agregar unidad</button>}
              {(totalCombustible > 0 || totalMtto > 0) && (
                <div className="wrTableTotalsRow">
                  {totalCombustible > 0 && <span>Combustible total: <strong>{formatCurrency(totalCombustible)}</strong></span>}
                  {totalMtto > 0 && <span>Mantenimiento total: <strong>{formatCurrency(totalMtto)}</strong></span>}
                </div>
              )}
            </div>
          </Section>

          {/* 9. GASTOS EXTRAS */}
          <Section title={`Gastos Extras${totalGastos > 0 ? " — " + formatCurrency(totalGastos) : ""}`} icon={<TbReceipt />} defaultOpen={false}>
            <div className="wrDynTable">
              <table>
                <thead><tr>
                  <th>Concepto</th><th>Monto</th><th>Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.extra_expenses || []).map((row, i) => (
                    <tr key={i}>
                      <td><input className="wrInput wrInputSm" value={row.concept} readOnly={ro} placeholder="Concepto del gasto" onChange={(e) => updRow("extra_expenses", i, "concept", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" type="number" step="0.01" value={row.amount} readOnly={ro} onChange={(e) => updRow("extra_expenses", i, "amount", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} onChange={(e) => updRow("extra_expenses", i, "observations", e.target.value)} /></td>
                      {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("extra_expenses", i)}><TbTrash /></button></td>}
                    </tr>
                  ))}
                  {(form.extra_expenses || []).length === 0 && (
                    <tr><td colSpan={ro ? 3 : 4} className="wrDynEmpty">{ro ? "Sin gastos extras registrados." : "Agrega gastos extraordinarios de la semana."}</td></tr>
                  )}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("extra_expenses", EMPTY_EXPENSE_ROW)}><TbPlus /> Agregar gasto</button>}
              {totalGastos > 0 && <div className="wrTableTotal">Total gastos extras: <strong>{formatCurrency(totalGastos)}</strong></div>}
            </div>
          </Section>

          {/* 10. REPORTE DE UNIDADES */}
          <Section title="Reporte de Unidades" icon={<TbClipboardList />} defaultOpen={false}>
            <div className="wrDynTable">
              <table>
                <thead><tr>
                  <th>Unidad</th><th>Estado / Observaciones</th>
                  {!ro && <th style={{ width: 40 }}></th>}
                </tr></thead>
                <tbody>
                  {(form.unit_reports || []).map((row, i) => (
                    <tr key={i}>
                      <td><input className="wrInput wrInputSm" value={row.unit_name} readOnly={ro} placeholder="Ej. Unidad 86" onChange={(e) => updRow("unit_reports", i, "unit_name", e.target.value)} /></td>
                      <td><input className="wrInput wrInputSm" value={row.observations} readOnly={ro} placeholder="Ej. En reparación" onChange={(e) => updRow("unit_reports", i, "observations", e.target.value)} /></td>
                      {!ro && <td><button type="button" className="wrIconBtn wrIconBtnDanger" onClick={() => delRow("unit_reports", i)}><TbTrash /></button></td>}
                    </tr>
                  ))}
                  {(form.unit_reports || []).length === 0 && (
                    <tr><td colSpan={ro ? 2 : 3} className="wrDynEmpty">{ro ? "Sin unidades reportadas." : "Reporta unidades fuera de servicio o con incidencias."}</td></tr>
                  )}
                </tbody>
              </table>
              {!ro && <button type="button" className="wrBtn wrBtnGhost wrBtnSm" onClick={() => addRow("unit_reports", EMPTY_UNIT_ROW)}><TbPlus /> Agregar unidad</button>}
            </div>
          </Section>

          {/* 11. COLABORADORES Y OBSERVACIONES */}
          <Section title="Colaboradores y Observaciones" icon={<TbUsers />} defaultOpen={false}>
            <div className="wrFormGrid">
              {ta("Observaciones del equipo / colaboradores", "team_observations", "Comentarios sobre el equipo, incidencias, reconocimientos...")}
              {ta("Observaciones del reporte", "report_observations", "Notas internas del reporte, situaciones importantes...")}
              {ta("Resumen general de la semana", "summary", "Resumen ejecutivo: logros, pendientes, contexto general...")}
              {ta("Notas adicionales", "notes", "Pendientes, incidencias, comentarios finales...")}
            </div>
          </Section>

        </div>

        <div className="wrModalActions">
          <button type="button" className="wrBtn wrBtnGhost" onClick={onClose}>Cerrar</button>
          {!ro && <button type="button" className="wrBtn wrBtnPrimary" onClick={onSave}>Guardar reporte</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Main module ──────────────────────────────────────────────
export default function WeeklyReportsModule({ currentWorker }) {
  const worker = currentWorker || null;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [chartIndex, setChartIndex] = useState(0);
  const [chartType, setChartType] = useState("bar");
  const [showCharts, setShowCharts] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [dateFrom, dateTo]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/general-reports/summary${buildQuery()}`);
      setSummary(resp?.data || null);
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudieron cargar los reportes generales", "error");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleExportExcel = useCallback(async () => {
    try {
      Swal.fire({
        title: "Exportando Excel...",
        text: "Estamos generando tu archivo, espera un momento.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const result = await apiDownload(
        `/api/general-reports/export/excel${buildQuery()}`,
        "reportes_generales.xlsx"
      );

      Swal.close();

      Swal.fire({
        icon: "success",
        title: "Excel exportado",
        text: `Se descargó correctamente: ${result?.fileName || "reportes_generales.xlsx"}`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.close();
      Swal.fire("Error", e.message || "No se pudo exportar el Excel", "error");
    }
  }, [buildQuery]);

  const handleExportPDF = useCallback(async () => {
    try {
      Swal.fire({
        title: "Exportando PDF...",
        text: "Estamos generando tu archivo, espera un momento.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const result = await apiDownload(
        `/api/general-reports/export/pdf${buildQuery()}`,
        "reportes_generales.pdf"
      );

      Swal.close();

      Swal.fire({
        icon: "success",
        title: "PDF exportado",
        text: `Se descargó correctamente: ${result?.fileName || "reportes_generales.pdf"}`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.close();
      Swal.fire("Error", e.message || "No se pudo exportar el PDF", "error");
    }
  }, [buildQuery]);

  const handleExportXML = useCallback(async () => {
    try {
      Swal.fire({
        title: "Exportando XML...",
        text: "Estamos generando tu archivo, espera un momento.",
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const result = await apiDownload(
        `/api/general-reports/export/xml${buildQuery()}`,
        "reportes_generales.xml"
      );

      Swal.close();

      Swal.fire({
        icon: "success",
        title: "XML exportado",
        text: `Se descargó correctamente: ${result?.fileName || "reportes_generales.xml"}`,
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.close();
      Swal.fire("Error", e.message || "No se pudo exportar el XML", "error");
    }
  }, [buildQuery]);
  const loadSummaryRef = useRef(loadSummary);

  useEffect(() => {
    loadSummaryRef.current = loadSummary;
  }, [loadSummary]);

  useEffect(() => {
    const base = String(API_BASE || "").replace(/\/+$/, "");
    const streamUrl = `${base}/api/general-reports/stream${buildQuery()}`;

    const es = new EventSource(streamUrl);

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");

        if (payload?.event === "change" || payload?.event === "connected") {
          loadSummaryRef.current();
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // EventSource reintenta automáticamente
    };

    return () => es.close();
  }, [buildQuery]);
const kpis = useMemo(() => {
  return {
    quotes: summary?.quotes?.count || 0,
    invoices: summary?.invoices?.count || 0,
    sales: Number(summary?.quotes?.total_amount || 0),
    billed: Number(summary?.invoices?.total_amount || 0),
    products: summary?.inventory?.products_count || 0,
    movements: summary?.inventory?.movements_count || 0,
    operations: summary?.operations?.count || 0,
    incidentOperations: summary?.operations?.incident_count || 0,

    clientsNew: summary?.clients?.new_count || 0,
    clientsQuoted: summary?.clients?.quoted_count || 0,
    clientsInvoiced: summary?.clients?.invoiced_count || 0,
    clientConversion: Number(summary?.clients?.conversion_rate || 0),
  };
}, [summary]);

const summaryRows = useMemo(() => ([
    {
      rowKey: "inventory-products",
      module: "INVENTARIO",
      indicator: "Productos activos",
      value: kpis.products,
      detail: "Total de productos registrados actualmente",
      icon: <TbPackage />,
      history: summary?.inventory?.products_rows || [],
    },
    {
      rowKey: "inventory-movements",
      module: "INVENTARIO",
      indicator: "Movimientos del período",
      value: kpis.movements,
      detail: "Entradas y salidas registradas dentro del rango filtrado",
      icon: <TbPackage />,
      history: summary?.inventory?.movements_rows || [],
    },
    {
      rowKey: "quotes-total",
      module: "COTIZACIONES",
      indicator: "Total cotizaciones",
      value: kpis.quotes,
      detail: `Monto cotizado: ${formatCurrency(kpis.sales)}`,
      icon: <TbFileText />,
      history: summary?.quotes?.recent_rows || [],
    },
    {
      rowKey: "invoices-total",
      module: "FACTURACIÓN",
      indicator: "Total facturas",
      value: kpis.invoices,
      detail: `Monto facturado: ${formatCurrency(kpis.billed)}`,
      icon: <TbReceipt />,
      history: summary?.invoices?.recent_rows || [],
    },
    {
      rowKey: "clients-new",
      module: "CLIENTES",
      indicator: "Clientes nuevos en el período",
      value: kpis.clientsNew,
      detail: `Con cotización: ${kpis.clientsQuoted} · Facturados: ${kpis.clientsInvoiced} · Conversión: ${kpis.clientConversion}%`,
      icon: <TbUsers />,
      history: summary?.clients?.recent_rows || [],
    },
    {
      rowKey: "operations-total",
      module: "OPERACIONES",
      indicator: "Total operaciones",
      value: kpis.operations,
      detail: `Incidencias: ${kpis.incidentOperations}`,
      icon: <TbTruck />,
      history: summary?.operations?.recent_rows || [],
    },
  ]), [kpis, summary]);

const chartSlides = useMemo(() => ([
    {
      key: "inventory",
      title: "Inventario",
      subtitle: "Productos activos y movimientos",
      labels: ["Productos", "Movimientos"],
      values: [Number(kpis.products || 0), Number(kpis.movements || 0)],
      colors: ["#2563eb", "#0ea5e9"],
    },
    {
      key: "operations",
      title: "Operaciones",
      subtitle: "Estado operativo",
      labels: ["Totales", "Incidencias"],
      values: [
        Number(kpis.operations || 0),
        Number(kpis.incidentOperations || 0),
      ],
      colors: ["#4f46e5", "#f59e0b"],
    },
    {
      key: "quotes",
      title: "Cotizaciones",
      subtitle: "Cantidad y monto cotizado",
      labels: ["Cantidad", "Monto"],
      values: [Number(kpis.quotes || 0), Number(kpis.sales || 0)],
      colors: ["#7c3aed", "#8b5cf6"],
    },
    {
      key: "invoices",
      title: "Facturación",
      subtitle: "Cantidad y monto facturado",
      labels: ["Cantidad", "Monto"],
      values: [Number(kpis.invoices || 0), Number(kpis.billed || 0)],
      colors: ["#0891b2", "#06b6d4"],
    },
    {
      key: "clients",
      title: "Clientes",
      subtitle: "Altas, pipeline y conversión",
      labels: ["Nuevos", "Con cotización", "Facturados", "Conversión %"],
      values: [
        Number(kpis.clientsNew || 0),
        Number(kpis.clientsQuoted || 0),
        Number(kpis.clientsInvoiced || 0),
        Number(kpis.clientConversion || 0),
      ],
      colors: ["#2563eb", "#7c3aed", "#16a34a", "#0ea5a0"],
    },
  ]), [kpis]);

  const currentSlide = chartSlides[chartIndex] || chartSlides[0];

  const pieSeriesData = useMemo(() => {
    return currentSlide.labels.map((label, idx) => ({
      id: idx,
      value: Number(currentSlide.values[idx] || 0),
      label,
      color: currentSlide.colors[idx % currentSlide.colors.length],
    }));
  }, [currentSlide]);

  const goPrevChart = useCallback(() => {
    setChartIndex((prev) => (prev === 0 ? chartSlides.length - 1 : prev - 1));
  }, [chartSlides.length]);

  const goNextChart = useCallback(() => {
    setChartIndex((prev) => (prev === chartSlides.length - 1 ? 0 : prev + 1));
  }, [chartSlides.length]);

  const renderCurrentChart = () => {
    if (chartType === "pie") {
      return (
        <PieChart
          height={260}
          series={[
            {
              data: pieSeriesData,
              innerRadius: 42,
              outerRadius: 82,
              paddingAngle: 3,
              cornerRadius: 6,
            },
          ]}
        />
      );
    }

    if (chartType === "line") {
      return (
        <LineChart
          height={260}
          xAxis={[
            {
              scaleType: "point",
              data: currentSlide.labels,
            },
          ]}
          series={[
            {
              data: currentSlide.values,
              label: currentSlide.title,
              color: currentSlide.colors[0],
            },
          ]}
        />
      );
    }

    return (
      <BarChart
        height={260}
        xAxis={[
          {
            scaleType: "band",
            data: currentSlide.labels,
          },
        ]}
        series={[
          {
            data: currentSlide.values,
            label: currentSlide.title,
            color: currentSlide.colors[0],
          },
        ]}
      />
    );
  };

  return (
    <div className="wrWrap">
      <div className="wrTopbar">
        <div>
          <h1 className="wrTitle"><TbReportAnalytics /> Reportes Generales</h1>
          <p className="wrSub">KPIs financieros, operativos e inventarios con exportación</p>
        </div>

        <div className="wrTopActions">
          <button
            type="button"
            className="wrIconOnlyBtn"
            onClick={loadSummary}
            title="Recargar"
            aria-label="Recargar"
          >
            <TbRefresh />
          </button>

          <button
            type="button"
            className="wrIconOnlyBtn wrIconOnlyBtn--pdf"
            onClick={handleExportPDF}
            title="Exportar PDF"
            aria-label="Exportar PDF"
          >
            <TbFileTypePdf />
          </button>

          <button
            type="button"
            className="wrIconOnlyBtn wrIconOnlyBtn--excel"
            onClick={handleExportExcel}
            title="Exportar Excel"
            aria-label="Exportar Excel"
          >
            <TbFileTypeXls />
          </button>

          <button
            type="button"
            className="wrIconOnlyBtn wrIconOnlyBtn--xml"
            onClick={handleExportXML}
            title="Exportar XML"
            aria-label="Exportar XML"
          >
            <TbCode />
          </button>
        </div>
      </div>

      <div className="wrOverviewGrid">
        <div className="wrToolbarCard wrToolbarCard--compact wrToolbarCard--side">
          <div className="wrMiniCardHead">
            <div className="wrMiniCardEyebrow">Período</div>
            <h3>Filtro de fechas</h3>
            <p>Consulta rápida por rango.</p>
          </div>

          <div className="wrMiniFieldRow wrMiniFieldRow--stack">
            <div className="wrMiniField">
              <label>Fecha inicial</label>
              <input
                className="wrMiniInput"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="wrMiniField">
              <label>Fecha final</label>
              <input
                className="wrMiniInput"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="wrMiniFieldActions wrMiniFieldActions--compact">
              <button
                type="button"
                className="wrApplyBtn"
                onClick={loadSummary}
                title="Aplicar filtros"
                aria-label="Aplicar filtros"
              >
                <TbSearch />
                Aplicar
              </button>
            </div>
          </div>
        </div>

<div className="wrKpiPanel wrKpiPanel--compact">
  <div className="wrKpiGrid wrKpiGrid--tight">
    <div className="wrKpiCardCompact wrKpiCardCompact--blue">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbFileText /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Cotizaciones</div>
          <div className="wrKpiCardCompact__sub">Registros</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.quotes}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--emerald">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbReceipt /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Facturas</div>
          <div className="wrKpiCardCompact__sub">Emitidas</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.invoices}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--violet">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbCurrencyDollar /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Cotizado</div>
          <div className="wrKpiCardCompact__sub">Monto</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{formatCurrency(kpis.sales)}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--cyan">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbCurrencyDollar /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Facturado</div>
          <div className="wrKpiCardCompact__sub">Monto</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{formatCurrency(kpis.billed)}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--amber">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbPackage /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Productos</div>
          <div className="wrKpiCardCompact__sub">Inventario</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.products}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--slate">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbPackage /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Movimientos</div>
          <div className="wrKpiCardCompact__sub">Período</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.movements}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--indigo">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbTruck /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Operaciones</div>
          <div className="wrKpiCardCompact__sub">Totales</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.operations}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--blue">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbUsers /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Clientes nuevos</div>
          <div className="wrKpiCardCompact__sub">Período</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.clientsNew}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--violet">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbUserSearch /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Clientes con cotización</div>
          <div className="wrKpiCardCompact__sub">Pipeline</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.clientsQuoted}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--green">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbBuilding /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Clientes facturados</div>
          <div className="wrKpiCardCompact__sub">Venta consolidada</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.clientsInvoiced}</div>
    </div>

    <div className="wrKpiCardCompact wrKpiCardCompact--cyan">
      <div className="wrKpiCardCompact__head">
        <div className="wrKpiCardCompact__icon"><TbTarget /></div>
        <div className="wrKpiCardCompact__meta">
          <div className="wrKpiCardCompact__title">Conversión cliente → venta</div>
          <div className="wrKpiCardCompact__sub">Eficiencia comercial</div>
        </div>
      </div>
      <div className="wrKpiCardCompact__value">{kpis.clientConversion}%</div>
    </div>
  </div>
</div>
      </div>

      <div className="wrSectionCard wrSectionCard--unified">
        <div className="wrUnifiedHead">
          <div>
            <div className="wrSectionCard__eyebrow">Detalle consolidado</div>
            <h2>Resumen general</h2>
            <p>Tabla de datos y carrusel de gráficas dentro del mismo contenedor.</p>
          </div>

          <div className="wrViewSwitch">
            <span className={!showCharts ? "isActive" : ""}>Tabla</span>
            <Switch
              checked={showCharts}
              onChange={(e) => setShowCharts(e.target.checked)}
              color="primary"
            />
            <span className={showCharts ? "isActive" : ""}>Gráficas</span>
          </div>
        </div>

        {!showCharts ? (
          <>
            <div className="wrTableWrap">
              <table className="wrTable wrTable--compact">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Indicador</th>
                    <th>Valor</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
<tbody>
  {loading ? (
    <tr>
      <td colSpan={4} className="wrEmpty">Cargando reportes generales...</td>
    </tr>
  ) : !summary ? (
    <tr>
      <td colSpan={4} className="wrEmpty">
        No se encontró información para el período seleccionado.
      </td>
    </tr>
  ) : (
    summaryRows.flatMap((row, idx) => {
      const prevModule = idx > 0 ? summaryRows[idx - 1].module : null;
      const showModule = prevModule !== row.module;
      const isOpen = Boolean(expandedRows[row.rowKey]);
      const history = Array.isArray(row.history) ? row.history : [];

      return [
        <tr
          key={`${row.rowKey}-main`}
          onClick={() =>
            setExpandedRows((prev) => ({
              ...prev,
              [row.rowKey]: !prev[row.rowKey],
            }))
          }
          style={{ cursor: "pointer" }}
        >
          <td>
            {showModule ? (
              <div className="wrPrimaryCell">
                <div className="wrPrimaryIcon">{row.icon}</div>
                <div>
                  <div className="wrPrimaryTitle">{row.module}</div>
                </div>
              </div>
            ) : (
              <div className="wrPrimaryCell wrPrimaryCell--continued">
                <div className="wrPrimarySpacer" />
              </div>
            )}
          </td>

          <td>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>{row.indicator}</span>
              <span
                style={{
                  width: 28,
                  height: 28,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  background: "#eef4ff",
                  color: "#2563eb",
                  border: "1px solid #dbe7ff",
                  flexShrink: 0,
                }}
              >
                {isOpen ? <TbChevronUp /> : <TbChevronDown />}
              </span>
            </div>
          </td>

          <td>{row.value}</td>
          <td>{row.detail}</td>
        </tr>,

        isOpen ? (
          <tr key={`${row.rowKey}-submenu`}>
            <td colSpan={4} style={{ padding: 0, background: "#f8fbff" }}>
              <div
                style={{
                  padding: "14px 18px 18px 18px",
                  borderTop: "1px solid #e5edf8",
                  borderBottom: "1px solid #e5edf8",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "#64748b",
                    marginBottom: 12,
                  }}
                >
                  Historial contabilizado
                </div>

                {history.length === 0 ? (
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: "#ffffff",
                      border: "1px solid #e5edf8",
                      color: "#64748b",
                      fontWeight: 600,
                    }}
                  >
                    No hay movimientos para desglosar en este indicador.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {history.map((item, itemIdx) => (
                      <div
                        key={`${row.rowKey}-item-${item.id || itemIdx}`}
                        style={{
                          display: "grid",
                          gap: 10,
                          padding: "14px 16px",
                          borderRadius: 14,
                          background: "#ffffff",
                          border: "1px solid #e5edf8",
                          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto auto",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 800,
                                color: "#0f172a",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title || "Movimiento"}
                            </div>

                            <div
                              style={{
                                color: "#64748b",
                                fontSize: 13,
                                marginTop: 2,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.subtitle || "Sin detalle adicional"}
                            </div>
                          </div>

                          {item.amount != null ? (
                            <div
                              style={{
                                fontWeight: 800,
                                color: "#16a34a",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatCurrency(item.amount)}
                            </div>
                          ) : (
                            <div />
                          )}

                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#64748b",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(item.created_at)}
                          </div>
                        </div>

                        {Array.isArray(item.meta) && item.meta.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            {item.meta.map((metaItem, metaIdx) => (
                              <div
                                key={`${row.rowKey}-item-${item.id || itemIdx}-meta-${metaIdx}`}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "7px 10px",
                                  borderRadius: 999,
                                  background: "#f8fbff",
                                  border: "1px solid #dbe7ff",
                                  color: "#334155",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  maxWidth: "100%",
                                }}
                              >
                                <span style={{ color: "#64748b", fontWeight: 800 }}>
                                  {metaItem.label}:
                                </span>
                                <span
                                  style={{
                                    color: "#0f172a",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {metaItem.value ?? "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </td>
          </tr>
        ) : null,
      ];
    })
  )}
</tbody>
              </table>
            </div>

            <div className="wrTableNote">
              La vista se actualiza automáticamente cuando el backend emite cambios del módulo.
            </div>
          </>
        ) : (
          <div className="wrCarouselShell">
            <button
              type="button"
              className="wrCarouselArrow wrCarouselArrow--side"
              onClick={goPrevChart}
              title="Gráfica anterior"
              aria-label="Gráfica anterior"
            >
              <TbChevronLeft />
            </button>

            <div className="wrCarouselCenter">
              <div className="wrCarouselTitleBox">
                <div className="wrCarouselTitle">{currentSlide.title}</div>
                <div className="wrCarouselSub">{currentSlide.subtitle}</div>
              </div>

              <div className="wrChartTypeSwitch">
                <button
                  type="button"
                  className={`wrChartTypeBtn ${chartType === "bar" ? "isActive" : ""}`}
                  onClick={() => setChartType("bar")}
                  title="Barras"
                  aria-label="Barras"
                >
                  <TbChartBar />
                </button>

                <button
                  type="button"
                  className={`wrChartTypeBtn ${chartType === "pie" ? "isActive" : ""}`}
                  onClick={() => setChartType("pie")}
                  title="Pastel"
                  aria-label="Pastel"
                >
                  <TbChartPie />
                </button>

                <button
                  type="button"
                  className={`wrChartTypeBtn ${chartType === "line" ? "isActive" : ""}`}
                  onClick={() => setChartType("line")}
                  title="Líneas"
                  aria-label="Líneas"
                >
                  <TbChartLine />
                </button>
              </div>

              <div className="wrCarouselCard wrCarouselCard--compact">
                {renderCurrentChart()}
              </div>

              <div className="wrCarouselDots">
                {chartSlides.map((slide, idx) => (
                  <button
                    key={slide.key}
                    type="button"
                    className={`wrCarouselDot ${idx === chartIndex ? "isActive" : ""}`}
                    onClick={() => setChartIndex(idx)}
                    aria-label={`Ir a gráfica ${slide.title}`}
                    title={slide.title}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              className="wrCarouselArrow wrCarouselArrow--side"
              onClick={goNextChart}
              title="Siguiente gráfica"
              aria-label="Siguiente gráfica"
            >
              <TbChevronRight />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}