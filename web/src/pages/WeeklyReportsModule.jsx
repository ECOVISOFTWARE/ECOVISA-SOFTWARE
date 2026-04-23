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

// ─── Form state ───────────────────────────────────────────────
function emptyWeeklyReport(worker) {
  return {
    week_label: "", branch_name: "", month_label: "", start_date: "", end_date: "",
    sales_2025: 0, budget_2026: 0, sales_2026: 0, weekly_billing: 0, sales_without_invoice: 0,
    total_sales: 0, total_collected: 0,
    collection_entries: [],
    weekly_goals: DEFAULT_GOALS.map((g) => ({ ...g })),
    prospecting_entries: [], portfolio_issues: [], vehicle_entries: [],
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
    collection_entries:   Array.isArray(row.collection_entries)   ? row.collection_entries   : [],
    weekly_goals:         Array.isArray(row.weekly_goals) && row.weekly_goals.length > 0 ? row.weekly_goals : DEFAULT_GOALS.map((g) => ({ ...g })),
    prospecting_entries:  Array.isArray(row.prospecting_entries)  ? row.prospecting_entries  : [],
    portfolio_issues:     Array.isArray(row.portfolio_issues)     ? row.portfolio_issues      : [],
    vehicle_entries:      Array.isArray(row.vehicle_entries)      ? row.vehicle_entries       : [],
    extra_expenses:       Array.isArray(row.extra_expenses)       ? row.extra_expenses        : [],
    unit_reports:         Array.isArray(row.unit_reports)         ? row.unit_reports          : [],
    inventory_snapshot:   row.inventory_snapshot && typeof row.inventory_snapshot === "object" ? row.inventory_snapshot : EMPTY_SNAPSHOT(),
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

  const snap = form.inventory_snapshot || EMPTY_SNAPSHOT();
  const totalCobranza    = (form.collection_entries || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalGastos      = (form.extra_expenses     || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalCombustible = (form.vehicle_entries    || []).reduce((s, r) => s + Number(r.fuel_amount || 0), 0);
  const totalMtto        = (form.vehicle_entries    || []).reduce((s, r) => s + Number(r.maintenance_amount || 0), 0);
  const totalInv         = Number(snap.obra_service || 0) + Number(snap.evento_service || 0) + Number(snap.obra_patios || 0) + Number(snap.evento_patios || 0);
  const pctAlcance       = Number(form.budget_2026) > 0 ? ((Number(form.sales_2026 || 0) / Number(form.budget_2026)) * 100).toFixed(1) : null;

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