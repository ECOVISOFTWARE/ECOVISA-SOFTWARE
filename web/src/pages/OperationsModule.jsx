import React, { useEffect, useMemo, useState, useCallback } from "react";
import Swal from "sweetalert2";
import { apiFetch } from "../api";
import ClientSelectPro from "../components/ClientSelectPro";
import "./OperationsModule.css";
import {
  TbTruck, TbPlus, TbSearch, TbEdit, TbTrash, TbRefresh,
  TbX, TbMapPin, TbBath, TbClipboardList,
  TbCurrencyDollar, TbFileInvoice,
  TbFilter, TbBuildingStore,
  TbUser, TbArrowRight, TbClock, TbActivity,
  TbAlertTriangle, TbNotes, TbEye,
  TbMapSearch, TbReceipt2,
} from "react-icons/tb";

// ─── Constants ────────────────────────────────────────────────
const STATUSES = {
  pending:    { label: "Pendiente",      color: "#64748b", bg: "#f1f5f9" },
  scheduled:  { label: "Programado",     color: "#2563eb", bg: "#eff6ff" },
  preparing:  { label: "En preparación", color: "#d97706", bg: "#fffbeb" },
  on_way:     { label: "En camino",      color: "#ea580c", bg: "#fff7ed" },
  on_site:    { label: "En sitio",       color: "#0d9488", bg: "#f0fdfa" },
  loading:    { label: "Cargando",       color: "#7c3aed", bg: "#f5f3ff" },
  unloading:  { label: "Descargando",    color: "#4f46e5", bg: "#eef2ff" },
  completed:  { label: "Finalizado",     color: "#16a34a", bg: "#f0fdf4" },
  incident:   { label: "Incidencia",     color: "#dc2626", bg: "#fef2f2" },
  cancelled:  { label: "Cancelado",      color: "#9ca3af", bg: "#f9fafb" },
};

const STATUS_FLOW = [
  "all","pending","scheduled","preparing","on_way",
  "on_site","loading","unloading","completed","incident","cancelled",
];

const INCIDENT_TYPES = {
  delay:              "Retraso",
  mechanical:         "Falla mecánica",
  client_unavailable: "Cliente no disponible",
  route_blocked:      "Ruta bloqueada",
  missing_document:   "Documento faltante",
  fuel:               "Combustible",
  other:              "Otro",
};

const PRIORITIES = {
  low:      { label: "Baja",    color: "#16a34a" },
  medium:   { label: "Media",   color: "#d97706" },
  high:     { label: "Alta",    color: "#ea580c" },
  critical: { label: "Crítica", color: "#dc2626" },
};

const EVENT_TYPES = [
  { value: "unit_assigned",     label: "Unidad asignada" },
  { value: "departed",          label: "Operador salió de base" },
  { value: "arrived_client",    label: "Llegó a cliente" },
  { value: "delay",             label: "Se presentó retraso" },
  { value: "loading_started",   label: "Inició carga" },
  { value: "loading_done",      label: "Carga completada" },
  { value: "unloading_started", label: "Inició descarga" },
  { value: "service_done",      label: "Servicio completado" },
  { value: "incident",          label: "Incidencia reportada" },
  { value: "custom",            label: "Nota personalizada" },
];

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function toInputDT(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 16);
}

function StatusBadge({ status }) {
  const s = STATUSES[status] || STATUSES.pending;
  return <span className="opsBadge" style={{ color: s.color, background: s.bg }}>{s.label}</span>;
}

function PriorityBadge({ priority }) {
  const p = PRIORITIES[priority] || PRIORITIES.medium;
  return <span className="opsBadge" style={{ color: p.color, background: p.color + "18" }}>{p.label}</span>;
}

function emptyOperation(worker) {
  return {
    title: "",
    status: "scheduled",
    priority: "medium",
    unit_name: "",
    operator_name: "",
    client_id: "",
    client_name: "",
    origin: "",
    destination: "",
    scheduled_at: "",
    real_departure_at: "",
    real_arrival_at: "",
    observations: "",

    control_date: new Date().toISOString().slice(0, 10),
    branch: "MOCHIS",
    city: "",
    location: "",
    full_address: "",
    latitude: "",
    longitude: "",
    google_maps_url: "",
    warehouse_exit: "",
    delivery_date: "",
    removed: false,

    sanitary_qty: 0,
    sanitary_owned: 0,
    sanitary_external: 0,
    sink_qty: 0,
    trailer_qty: 0,

    unit_price: 0,
    total_price: 0,
    service_frequency: 1,
    service_days: 0,
    billing_period: 1,
    billing_start: "",
    billing_end: "",
    billing_alert: "------",
    invoice_number: "",
    invoice_id: "",
    invoice_status: "pending",

    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: false,

    created_by: worker?.id || null,
  };
}

function getBillingRange(deliveryDate, billingPeriod = 1) {
  if (!deliveryDate) {
    return { billing_start: "", billing_end: "", billing_alert: "------" };
  }

  const start = new Date(`${deliveryDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return { billing_start: "", billing_end: "", billing_alert: "------" };
  }

  const period = Math.max(1, Number(billingPeriod || 1));
  const billingStart = new Date(start);
  billingStart.setDate(billingStart.getDate() + ((period - 1) * 28));

  const billingEnd = new Date(billingStart);
  billingEnd.setDate(billingEnd.getDate() + 27);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fórmula Excel: =SI(Y(Final<=HOY, Periodo>0), "Facturar", "------")
  const shouldBill = billingEnd <= today && period > 0;

  return {
    billing_start : billingStart.toISOString().slice(0, 10),
    billing_end   : billingEnd.toISOString().slice(0, 10),
    billing_alert : shouldBill ? "Facturar" : "------",
  };
}

function normalizeCity(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("GUASAVE")) return "GUASAVE";
  if (text.includes("MOCHIS") || text.includes("LOS MOCHIS")) return "LOS MOCHIS";
  return text || "SIN CIUDAD";
}

function isLMV(row) {
  return Boolean(row.monday || row.wednesday || row.friday);
}

function isMJS(row) {
  return Boolean(row.tuesday || row.thursday || row.saturday);
}

function buildRouteRows(rows, city, group) {
  return (rows || [])
    .filter((row) => !row.removed)
    .filter((row) => normalizeCity(row.city) === city)
    .filter((row) => group === "LMV" ? isLMV(row) : isMJS(row))
    .map((row) => ({
      id: row.id,
      client_name: row.client_name || "—",
      sanitary_qty: Number(row.sanitary_qty || row.quantity || 0),
      sink_qty: Number(row.sink_qty || 0),
      trailer_qty: Number(row.trailer_qty || 0),
      location: row.location || row.destination || "—",
      invoice_number: row.invoice_number || "",
      billing_alert: row.billing_alert || "------",
      status: row.status || "pending",
    }));
}

function RouteExcelBlock({ title, subtitle, cityLabel, color = "yellow", rows }) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.sanitary += Number(row.sanitary_qty || 0);
      acc.sink += Number(row.sink_qty || 0);
      acc.trailer += Number(row.trailer_qty || 0);
      return acc;
    },
    { sanitary: 0, sink: 0, trailer: 0 }
  );

  return (
    <div className="opsRouteExcelBlock">
      <div className={`opsRouteExcelTitle opsRouteExcelTitle--${color}`}>{title}</div>

      <table className="opsRouteExcelTable">
        <thead>
          <tr>
            <th>{subtitle}</th>
            <th>B</th>
            <th>L</th>
            <th>REM</th>
            <th>{cityLabel}</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="opsRouteExcelEmpty">
                Sin servicios activos para esta ruta.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={row.billing_alert === "Facturar" ? "opsRouteExcelRow--bill" : ""}
              >
                <td>{row.client_name}</td>
                <td>{row.sanitary_qty || ""}</td>
                <td>{row.sink_qty || ""}</td>
                <td>{row.trailer_qty || ""}</td>
                <td>{row.location}</td>
              </tr>
            ))
          )}

          <tr className="opsRouteExcelTotal">
            <td></td>
            <td>{totals.sanitary}</td>
            <td>{totals.sink}</td>
            <td>{totals.trailer}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LocationMapPicker({ form, setForm, readOnly }) {
  const [query, setQuery]       = useState(form.location || "");
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [coords, setCoords]     = useState(
    form.latitude && form.longitude
      ? { lat: Number(form.latitude), lng: Number(form.longitude) }
      : null
  );

  async function handleSearch() {
    const text = String(query || "").trim();
    if (!text) return;
    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(text + ", Sinaloa, México")}`,
        { headers: { Accept: "application/json" } }
      );
      setResults(await resp.json());
    } catch {
      Swal.fire("Error", "No se pudo buscar la ubicación.", "error");
    } finally {
      setSearching(false);
    }
  }

  function pickPlace(place) {
    const lat  = Number(place.lat);
    const lng  = Number(place.lon);
    const name = place.display_name?.split(",")[0] || query;
    const city =
      place.address?.city        ||
      place.address?.town        ||
      place.address?.municipality||
      place.address?.county      || "";

    setCoords({ lat, lng });
    setResults([]);
    setQuery(name);

    setForm((prev) => ({
      ...prev,
      location     : prev.location || name,
      city         : city ? String(city).toUpperCase() : prev.city,
      latitude     : lat,
      longitude    : lng,
      full_address : place.display_name || "",
    }));
  }

  const mapSrc = coords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.016}%2C${coords.lat - 0.016}%2C${coords.lng + 0.016}%2C${coords.lat + 0.016}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`
    : "";

  return (
    <div className="opsLocPicker">
      {/* Barra de búsqueda */}
      <div className="opsLocSearchRow">
        <div className="opsLocSearchBar">
          <TbMapSearch className="opsLocSearchIcon" />
          <input
            className="opsLocInput"
            value={query}
            readOnly={readOnly}
            placeholder="Escribe colonia, obra, calle o ciudad…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !readOnly && handleSearch()}
          />
        </div>
        {!readOnly && (
          <button
            type="button"
            className="opsLocSearchBtn"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? "…" : "Buscar"}
          </button>
        )}
      </div>

      {/* Resultados dropdown */}
      {results.length > 0 && (
        <div className="opsLocResults">
          {results.map((place) => (
            <button
              key={place.place_id}
              type="button"
              className="opsLocResult"
              onClick={() => pickPlace(place)}
            >
              <TbMapPin className="opsLocResultPin" />
              <div className="opsLocResultText">
                <strong>{place.display_name?.split(",")[0]}</strong>
                <span>{place.display_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Mini mapa */}
      <div className="opsLocMap">
        {mapSrc ? (
          <>
            <iframe
              title="Mapa"
              src={mapSrc}
              className="opsLocMapFrame"
              loading="lazy"
            />
            <div className="opsLocMapOverlay">
              <TbMapPin className="opsLocMapPin" />
              <span>{query || form.location}</span>
            </div>
          </>
        ) : (
          <div className="opsLocMapEmpty">
            <div className="opsLocMapEmptyIcon"><TbMapPin /></div>
            <p>Busca una ubicación para mostrar el mapa</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Service Form Modal ─────────────────────────────────────
function OperationFormModal({ open, mode, form, setForm, onClose, onSave, selectedClient, setSelectedClient }) {
  if (!open) return null;
  const ro = mode === "view";

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "delivery_date" || key === "billing_period") {
        const billing = getBillingRange(
          key === "delivery_date" ? value : prev.delivery_date,
          key === "billing_period" ? value : prev.billing_period
        );

        next.billing_start = billing.billing_start;
        next.billing_end = billing.billing_end;
        next.billing_alert = billing.billing_alert;
      }

      if (key === "sanitary_qty" || key === "sink_qty" || key === "trailer_qty" || key === "unit_price") {
        const sanitary = Number(key === "sanitary_qty" ? value : prev.sanitary_qty || 0);
        const sink = Number(key === "sink_qty" ? value : prev.sink_qty || 0);
        const trailer = Number(key === "trailer_qty" ? value : prev.trailer_qty || 0);
        const price = Number(key === "unit_price" ? value : prev.unit_price || 0);

        next.total_price = Number(((sanitary + sink + trailer) * price).toFixed(2));
      }

      next.title = `${next.client_name || "Servicio"} · ${next.city || ""} · ${next.location || ""}`.trim();
      next.destination = next.location || "";
      next.status = next.removed ? "cancelled" : "scheduled";

      return next;
    });
  };

  const input = (label, key, type = "text", placeholder = "") => (
    <div className="opsField">
      <label>{label}</label>
      <input
        className="opsInput"
        type={type}
        value={form[key] ?? ""}
        readOnly={ro}
        placeholder={placeholder}
        onChange={(e) => !ro && updateField(key, e.target.value)}
      />
    </div>
  );

  const check = (label, key) => (
    <label className="opsDayCheck">
      <input
        type="checkbox"
        checked={Boolean(form[key])}
        disabled={ro}
        onChange={(e) => !ro && updateField(key, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="opsModalBack" onMouseDown={onClose}>
      <div className="opsModal opsServiceModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="opsModalTop">
          <div>
            <div className="opsModalTitle">
              {mode === "edit" ? "Editar servicio sanitario" : "Nuevo servicio sanitario"}
            </div>
            <div className="opsModalSub">
              Datos base para facturación automática y generación de bitácora de ruta.
            </div>
          </div>

          <button type="button" className="opsIconBtn" onClick={onClose}>
            <TbX />
          </button>
        </div>

        <div className="opsModalBody">
<div className="opsFormSection">
  <div className="opsFormSectionTitle">
    <TbBuildingStore /> Cliente y ubicación
  </div>

  <div className="opsGrid">
    <div className="opsField">
      <label>Cliente registrado</label>
      <ClientSelectPro
        value={form.client_id || ""}
        selectedClient={selectedClient}
        onSelect={(client) => {
          if (!client) {
            setSelectedClient(null);
            setForm((prev) => ({
              ...prev,
              client_id: "",
              client_name: "",
            }));
            return;
          }

          setSelectedClient(client);
          setForm((prev) => ({
            ...prev,
            client_id: client.id,
            client_name: client.name || "",
            origin: client.client_code || prev.origin || "",
            city: client.billing_city || prev.city || "",
            full_address: client.address || prev.full_address || "",
          }));
        }}
        placeholder="Buscar cliente registrado..."
      />
    </div>

    {input("# Cliente", "origin", "text", "Ej. M25 / M604 / V S/F")}
    {input("Sucursal", "branch", "text", "MOCHIS / GUASAVE")}
    {input("Ciudad", "city", "text", "LOS MOCHIS / GUASAVE")}
    {input("Ubicación visible en tabla", "location", "text", "Ej. CAÑAVERAL / TOPO / AGUA FRÍA")}
    {input("Salida de almacén", "warehouse_exit", "text", "Número o referencia")}
    {input("Fecha de control", "control_date", "date")}
    {input("Fecha de salida", "delivery_date", "date")}

<div className="opsField opsField--span2">
      <label>Ubicación en mapa</label>
      <LocationMapPicker form={form} setForm={setForm} readOnly={ro} />
    </div>
  </div>
</div>

          <div className="opsFormSection">
            <div className="opsFormSectionTitle">
              <TbBath /> Cantidades y precio
            </div>

<div className="opsGrid opsGrid--four">
  {input("B / Sanitarios total", "sanitary_qty", "number", "0")}
  {input("Sanitarios propios", "sanitary_owned", "number", "0")}
  {input("Sanitarios no propios", "sanitary_external", "number", "0")}
  {input("L / Lavamanos", "sink_qty", "number", "0")}
  {input("REM / Remolques", "trailer_qty", "number", "0")}
  {input("Servicios", "service_frequency", "number", "1")}
  {input("Días", "service_days", "number", "0")}
  {input("Precio unitario", "unit_price", "number", "0.00")}
</div>

            <div className="opsCalculatedBox">
              <TbCurrencyDollar />
              <div>
                <span>Total calculado</span>
                <strong>
                  {Number(form.total_price || 0).toLocaleString("es-MX", {
                    style: "currency",
                    currency: "MXN",
                  })}
                </strong>
              </div>
            </div>
          </div>

<div className="opsFormSection">
            <div className="opsFormSectionTitle">
              <TbFileInvoice /> Facturación
            </div>

            <div className="opsGrid">
              {input("Periodo", "billing_period", "number", "1")}

              {/* Folio: solo lectura, generado automáticamente */}
              <div className="opsField">
                <label>Folio factura</label>
                {form.invoice_number ? (
                  <div className="opsFolioBox">
                    <TbReceipt2 />
                    <span>{form.invoice_number}</span>
                    <span className="opsFolioBoxTag">Auto-generado</span>
                  </div>
                ) : (
                  <div className="opsFolioBox opsFolioBox--empty">
                    <TbReceipt2 />
                    <span>Se asigna al generar factura</span>
                  </div>
                )}
              </div>

              {input("Inicio factura", "billing_start", "date")}
              {input("Fin factura", "billing_end", "date")}

              <div className="opsField">
                <label>Alerta de cobro</label>
                <div className={`opsBillingAlertBox ${
                  form.invoice_id
                    ? "opsBillingAlertBox--done"
                    : form.billing_alert === "Facturar"
                    ? "opsBillingAlertBox--bill"
                    : "opsBillingAlertBox--ok"
                }`}>
                  {form.invoice_id
                    ? "✓ Facturado"
                    : form.billing_alert === "Facturar"
                    ? "⚠ Facturar"
                    : "------"}
                </div>
              </div>

              <label className="opsRemovedCheck">
                <input
                  type="checkbox"
                  checked={Boolean(form.removed)}
                  disabled={ro}
                  onChange={(e) => !ro && updateField("removed", e.target.checked)}
                />
                <span>Retirado</span>
              </label>
            </div>
          </div>

          <div className="opsFormSection">
            <div className="opsFormSectionTitle">
              <TbClipboardList /> Días de servicio
            </div>

            <div className="opsDaysGrid">
              {check("LUN", "monday")}
              {check("MAR", "tuesday")}
              {check("MIE", "wednesday")}
              {check("JUE", "thursday")}
              {check("VIE", "friday")}
              {check("SAB", "saturday")}
              {check("DOM", "sunday")}
            </div>
          </div>

          <div className="opsFormSection">
            <div className="opsFormSectionTitle">
              Observaciones
            </div>

            <textarea
              className="opsTextarea"
              value={form.observations ?? ""}
              readOnly={ro}
              placeholder="Notas, pendientes, referencias o comentarios del servicio..."
              onChange={(e) => !ro && updateField("observations", e.target.value)}
            />
          </div>
        </div>

        <div className="opsModalActions">
          <button type="button" className="opsBtn opsBtnGhost" onClick={onClose}>
            Cerrar
          </button>

          {!ro && (
            <button type="button" className="opsBtn opsBtnPrimary" onClick={onSave}>
              Guardar servicio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
// ─── Detail Drawer ────────────────────────────────────────────
function OperationDetailDrawer({ open, operation, onClose, currentWorker, onRefresh }) {
  const [events, setEvents] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newEvent, setNewEvent] = useState({ event_type: "custom", description: "" });
  const [newIncident, setNewIncident] = useState({ incident_type: "delay", priority: "medium", description: "" });
  const [addingEvent, setAddingEvent] = useState(false);
  const [addingIncident, setAddingIncident] = useState(false);
  const [tab, setTab] = useState("timeline");

  const loadDetail = useCallback(async () => {
    if (!operation?.id) return;
    setLoadingDetail(true);
    try {
      const resp = await apiFetch(`/api/operations/${operation.id}`);
      setEvents(resp?.data?.events || []);
      setIncidents(resp?.data?.incidents || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  }, [operation?.id]);

  useEffect(() => {
    if (open) { loadDetail(); setTab("timeline"); setAddingEvent(false); setAddingIncident(false); }
  }, [open, loadDetail]);

  async function saveEvent() {
    if (!newEvent.description.trim()) {
      Swal.fire("Falta descripción", "Escribe una descripción para el evento.", "warning"); return;
    }
    try {
      await apiFetch(`/api/operations/${operation.id}/events`, {
        method: "POST", body: JSON.stringify({ ...newEvent, created_by: currentWorker?.id }),
      });
      setNewEvent({ event_type: "custom", description: "" });
      setAddingEvent(false); loadDetail();
    } catch (e) { Swal.fire("Error", e.message, "error"); }
  }

  async function saveIncident() {
    if (!newIncident.description.trim()) {
      Swal.fire("Falta descripción", "Escribe una descripción de la incidencia.", "warning"); return;
    }
    try {
      await apiFetch(`/api/operations/${operation.id}/incidents`, {
        method: "POST", body: JSON.stringify({ ...newIncident, created_by: currentWorker?.id }),
      });
      setNewIncident({ incident_type: "delay", priority: "medium", description: "" });
      setAddingIncident(false); loadDetail(); onRefresh();
    } catch (e) { Swal.fire("Error", e.message, "error"); }
  }

  async function resolveIncident(incidentId) {
    try {
      await apiFetch(`/api/operations/${operation.id}/incidents/${incidentId}`, {
        method: "PUT", body: JSON.stringify({ resolved: true }),
      });
      loadDetail();
    } catch (e) { Swal.fire("Error", e.message, "error"); }
  }

  if (!open || !operation) return null;

  const unresolvedCount = incidents.filter((i) => !i.resolved).length;

  return (
    <div className="opsDrawerBack" onMouseDown={onClose}>
      <div className="opsDrawer" onMouseDown={(e) => e.stopPropagation()}>

        <div className="opsDrawerTop">
          <div>
            <div className="opsDrawerTitle">{operation.title || "Operación sin título"}</div>
            <div className="opsDrawerSub">
              <StatusBadge status={operation.status} />
              <PriorityBadge priority={operation.priority} />
              {operation.unit_name && (
                <span className="opsDrawerMeta">
                  <TbTruck /> {operation.unit_name}
                </span>
              )}
              {operation.operator_name && (
                <span className="opsDrawerMeta">
                  <TbUser /> {operation.operator_name}
                </span>
              )}
            </div>
          </div>
          <button type="button" className="opsIconBtn" onClick={onClose}><TbX /></button>
        </div>

        <div className="opsInfoRow">
          {operation.client_name && <div className="opsInfoItem"><TbUser /><span>{operation.client_name}</span></div>}
          {operation.origin && <div className="opsInfoItem"><TbMapPin /><span>{operation.origin}</span></div>}
          {operation.destination && <div className="opsInfoItem"><TbArrowRight /><span>{operation.destination}</span></div>}
          {operation.scheduled_at && <div className="opsInfoItem"><TbClock /><span>{formatDate(operation.scheduled_at)}</span></div>}
        </div>

        <div className="opsDetailTabs">
          <button type="button" className={`opsDetailTab${tab === "timeline" ? " active" : ""}`} onClick={() => setTab("timeline")}>
            <TbActivity /> Línea de tiempo {events.length > 0 && <span className="opsTabBadge">{events.length}</span>}
          </button>
          <button type="button" className={`opsDetailTab${tab === "incidents" ? " active" : ""}`} onClick={() => setTab("incidents")}>
            <TbAlertTriangle /> Incidencias
            {unresolvedCount > 0 && <span className="opsTabBadge opsTabBadgeRed">{unresolvedCount}</span>}
          </button>
        </div>

        <div className="opsDrawerBody">
          {loadingDetail ? (
            <div className="opsDetailEmpty">Cargando...</div>
          ) : tab === "timeline" ? (
            <>
              <div className="opsTimeline">
                {events.length === 0 && <div className="opsDetailEmpty">Sin eventos registrados. Agrega el primero.</div>}
                {events.map((ev, i) => (
                  <div key={ev.id || i} className="opsTimelineItem">
                    <div className="opsTimelineDot" />
                    <div className="opsTimelineContent">
                      <div className="opsTimelineLabel">
                        {EVENT_TYPES.find((e) => e.value === ev.event_type)?.label || ev.event_type}
                      </div>
                      <div className="opsTimelineDesc">{ev.description}</div>
                      <div className="opsTimelineTime">{formatDate(ev.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {!addingEvent ? (
                <button type="button" className="opsBtn opsBtnGhost opsAddBtn" onClick={() => setAddingEvent(true)}>
                  <TbPlus /> Registrar evento
                </button>
              ) : (
                <div className="opsAddForm">
                  <div className="opsField">
                    <label>Tipo de evento</label>
                    <select className="opsInput" value={newEvent.event_type}
                      onChange={(e) => setNewEvent((p) => ({ ...p, event_type: e.target.value }))}>
                      {EVENT_TYPES.map((et) => <option key={et.value} value={et.value}>{et.label}</option>)}
                    </select>
                  </div>
                  <div className="opsField">
                    <label>Descripción</label>
                    <textarea className="opsTextarea opsTextareaSm" value={newEvent.description}
                      placeholder="Descripción del evento..."
                      onChange={(e) => setNewEvent((p) => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="opsAddFormActions">
                    <button type="button" className="opsBtn opsBtnGhost" onClick={() => setAddingEvent(false)}>Cancelar</button>
                    <button type="button" className="opsBtn opsBtnPrimary" onClick={saveEvent}>Guardar evento</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="opsIncidentsList">
                {incidents.length === 0 && <div className="opsDetailEmpty">Sin incidencias registradas.</div>}
                {incidents.map((inc, i) => (
                  <div key={inc.id || i} className={`opsIncidentCard${inc.resolved ? " resolved" : ""}`}>
                    <div className="opsIncidentHeader">
                      <span className="opsIncidentType">{INCIDENT_TYPES[inc.incident_type] || inc.incident_type}</span>
                      <PriorityBadge priority={inc.priority} />
                      {inc.resolved
                        ? <span className="opsResolvedTag">✓ Resuelta</span>
                        : <button type="button" className="opsResolveBtn" onClick={() => resolveIncident(inc.id)}>Marcar resuelta</button>
                      }
                    </div>
                    <div className="opsIncidentDesc">{inc.description}</div>
                    <div className="opsIncidentTime">{formatDate(inc.created_at)}</div>
                  </div>
                ))}
              </div>

              {!addingIncident ? (
                <button type="button" className="opsBtn opsBtnGhost opsAddBtn" onClick={() => setAddingIncident(true)}>
                  <TbPlus /> Registrar incidencia
                </button>
              ) : (
                <div className="opsAddForm">
                  <div className="opsField">
                    <label>Tipo de incidencia</label>
                    <select className="opsInput" value={newIncident.incident_type}
                      onChange={(e) => setNewIncident((p) => ({ ...p, incident_type: e.target.value }))}>
                      {Object.entries(INCIDENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="opsField">
                    <label>Prioridad</label>
                    <select className="opsInput" value={newIncident.priority}
                      onChange={(e) => setNewIncident((p) => ({ ...p, priority: e.target.value }))}>
                      {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="opsField">
                    <label>Descripción</label>
                    <textarea className="opsTextarea opsTextareaSm" value={newIncident.description}
                      placeholder="Descripción de la incidencia..."
                      onChange={(e) => setNewIncident((p) => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="opsAddFormActions">
                    <button type="button" className="opsBtn opsBtnGhost" onClick={() => setAddingIncident(false)}>Cancelar</button>
                    <button type="button" className="opsBtn opsBtnDanger" onClick={saveIncident}>Registrar incidencia</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {operation.observations && (
          <div className="opsDrawerObs">
            <TbNotes /> <span>{operation.observations}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────
export default function OperationsModule({ currentWorker }) {
  const worker = currentWorker || null;

  // ── Pestaña principal del módulo ──────────────────────────────────────────
  const [moduleTab, setModuleTab] = useState("services"); // services | operations | log

const [rows, setRows] = useState([]);
const [loading, setLoading] = useState(false);
const [q, setQ] = useState("");
const [dateFrom, setDateFrom] = useState("");
const [dateTo, setDateTo] = useState("");

const routeFilteredRows = useMemo(() => {
  return rows.filter((row) => {
    if (row.removed) return false;

    const search = q.trim().toLowerCase();
    if (search) {
      const haystack = [
        row.client_name,
        row.city,
        row.location,
        row.destination,
        row.origin,
      ].join(" ").toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    if (row.delivery_date) {
      if (dateFrom && row.delivery_date < dateFrom) return false;
      if (dateTo && row.delivery_date > dateTo) return false;
    }

    return true;
  });
}, [rows, q, dateFrom, dateTo]);

const [modalOpen, setModalOpen] = useState(false);
const [modalMode, setModalMode] = useState("create");
const [editingId, setEditingId] = useState(null);
const [form, setForm] = useState(emptyOperation(worker));
const [selectedClient, setSelectedClient] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOp, setSelectedOp] = useState(null);

const loadRows = useCallback(async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());

    const resp = await apiFetch(`/api/operations?${params.toString()}`);
    setRows(resp?.data || []);
  } catch (e) {
    Swal.fire("Error", e.message || "No se pudieron cargar los servicios", "error");
  } finally {
    setLoading(false);
  }
}, [q]);

  useEffect(() => { loadRows(); }, [loadRows]);

function openCreate() {
  setModalMode("create");
  setEditingId(null);
  setSelectedClient(null);
  setForm(emptyOperation(worker));
  setModalOpen(true);
}

function openEdit(row) {
  setModalMode("edit");
  setEditingId(row.id);
  setSelectedClient(
    row?.client_id
      ? {
          id: row.client_id,
          name: row.client_name || "",
        }
      : null
  );
  setForm({
    ...emptyOperation(worker),
    ...row,
    client_id: row.client_id || "",
    latitude: row.latitude ?? "",
    longitude: row.longitude ?? "",
    scheduled_at: toInputDT(row.scheduled_at),
    real_departure_at: toInputDT(row.real_departure_at),
    real_arrival_at: toInputDT(row.real_arrival_at),
  });
  setModalOpen(true);
}

function openDetail(row) { setSelectedOp(row); setDrawerOpen(true); }

function closeModal() {
  setModalOpen(false);
  setEditingId(null);
  setSelectedClient(null);
  setForm(emptyOperation(worker));
}

  async function saveRow() {
    if (!String(form.title || "").trim()) {
      Swal.fire("Falta título", "Escribe un título para la operación.", "warning"); return;
    }
    const payload = { ...form, created_by: worker?.id || null };
    try {
      if (modalMode === "edit" && editingId) {
        await apiFetch(`/api/operations/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/api/operations`, { method: "POST", body: JSON.stringify(payload) });
      }
      closeModal(); await loadRows();
      Swal.fire("Guardado", modalMode === "edit" ? "Operación actualizada." : "Operación creada.", "success");
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo guardar la operación", "error");
    }
  }

async function generateInvoiceFromService(row) {
  if (!row?.id) return;

  if (!row.client_id && !row.client_name) {
    Swal.fire("Falta cliente", "El servicio necesita un cliente para generar factura.", "warning");
    return;
  }

  const result = await Swal.fire({
    title: "¿Generar factura?",
    text: `Se creará una factura para ${row.client_name || "este servicio"}.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí, generar",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
  });

  if (!result.isConfirmed) return;

  try {
    const resp = await apiFetch(`/api/operations/${row.id}/invoice`, {
      method: "POST",
      body: JSON.stringify({
        created_by: worker?.id || null,
        status: "draft",
      }),
    });

    await loadRows();

    Swal.fire(
      "Factura generada",
      `Se creó la factura ${resp?.data?.invoice?.folio || resp?.data?.invoice_folio || ""}.`,
      "success"
    );
  } catch (e) {
    Swal.fire("Error", e.message || "No se pudo generar la factura", "error");
  }
}

async function deleteRow(row) {
    const result = await Swal.fire({
      title: "¿Eliminar operación?",
      text: `Se eliminará "${row.title || "la operación seleccionada"}".`,
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Sí, eliminar", cancelButtonText: "Cancelar", reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await apiFetch(`/api/operations/${row.id}`, { method: "DELETE" });
      await loadRows();
      Swal.fire("Eliminada", "La operación fue eliminada.", "success");
    } catch (e) { Swal.fire("Error", e.message, "error"); }
  }

  const kpis = useMemo(() => ({
    total:      rows.length,
    programmed: rows.filter((r) => ["scheduled","preparing"].includes(r.status)).length,
    active:     rows.filter((r) => ["on_way","on_site","loading","unloading"].includes(r.status)).length,
    completed:  rows.filter((r) => r.status === "completed").length,
    incidents:  rows.filter((r) => r.status === "incident").length,
  }), [rows]);

return (
    <div className="opsWrap">

      {/* ── Encabezado del módulo ───────────────────────────────────────────── */}
<div className="opsModuleHeader">
  <div>
    <h1 className="opsTitle">
      <TbTruck />
      Servicios Sanitarios
    </h1>

    <p className="opsSub">
      Control de rentas · Facturación · Bitácora automática de ruta
    </p>
  </div>

  <div className="opsTopMiniTabs">

    <button
      type="button"
      className={`opsTopMiniTab ${moduleTab === "services" ? "active" : ""}`}
      onClick={() => setModuleTab("services")}
    >
      <TbBath />
      Servicios
    </button>

    <button
      type="button"
      className={`opsTopMiniTab ${moduleTab === "log" ? "active" : ""}`}
      onClick={() => setModuleTab("log")}
    >
      <TbClipboardList />
      Bitácora
    </button>

  </div>
</div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PESTAÑA 1 — Servicios Sanitarios (CONTROL DE SERVICIOS format)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
{moduleTab === "services" && (
  <div className="opsInnerWrap">
    <div className="opsTopbar">
      <div>
        <h2 className="opsTitle" style={{ fontSize: 18 }}>
          <TbBath /> Control de Servicios Sanitarios
        </h2>
        <p className="opsSub">
          Captura base tipo Excel: cliente, ubicación, cantidades, precio, facturación y días de ruta.
        </p>
      </div>

      <div className="opsTopActions">
        <button type="button" className="opsBtn opsBtnGhost" onClick={loadRows}>
          <TbRefresh /> Recargar
        </button>

        <button type="button" className="opsBtn opsBtnPrimary" onClick={openCreate}>
          <TbPlus /> Nuevo servicio
        </button>
      </div>
    </div>

    <div className="opsCard">
      <div className="opsTableWrap">
        <table className="opsTable opsServicesExcelTable">
          <thead>
            <tr>
<th>Control</th>
<th># Cliente</th>
<th>Cliente</th>
<th>Sucursal</th>
<th>Ciudad</th>
<th>Salida almacén</th>
<th>Precio</th>
<th>Ubicación</th>
<th>Fecha salida</th>
<th>Retirado</th>
<th>B</th>
<th>Propios</th>
<th>No propios</th>
<th>L</th>
<th>REM</th>
<th>Servicios</th>
<th>Periodo</th>
<th>Días</th>
<th>Inicio</th>
<th>Final</th>
<th>Alerta</th>
<th>Factura</th>
<th>LUN</th>
<th>MAR</th>
<th>MIE</th>
<th>JUE</th>
<th>VIE</th>
<th>SAB</th>
<th>Status</th>
<th className="opsThRight">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={30} className="opsEmpty">Cargando servicios...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={30} className="opsEmpty">No hay servicios registrados.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={row.billing_alert === "Facturar" ? "opsServiceRow--bill" : ""}>
<td>{row.control_date || "—"}</td>
<td>{row.origin || "—"}</td>
<td>{row.client_name || "—"}</td>
<td>{row.branch || "MOCHIS"}</td>
<td>{row.city || "—"}</td>
<td>{row.warehouse_exit || "—"}</td>
<td>{Number(row.unit_price || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</td>
<td>
  <button
    type="button"
    className="opsLocationCell"
    onClick={() => {
      const url =
        row.google_maps_url ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          row.full_address || row.location || row.city || ""
        )}`;

      window.open(url, "_blank", "noopener,noreferrer");
    }}
  >
    <TbMapPin />
    {row.city || "—"}
  </button>
</td>
<td>{row.delivery_date || "—"}</td>
<td>{row.removed ? "Sí" : ""}</td>
<td>{row.sanitary_qty || 0}</td>
<td>{row.sanitary_owned || 0}</td>
<td>{row.sanitary_external || 0}</td>
<td>{row.sink_qty || 0}</td>
<td>{row.trailer_qty || 0}</td>
<td>{row.service_frequency || 1}</td>
<td>{row.billing_period || 1}</td>
<td>{row.service_days || 0}</td>
<td>{row.billing_start || "—"}</td>
<td>{row.billing_end || "—"}</td>
<td>
  {row.invoice_id ? (
    /* Ya facturado: badge verde con el folio */
    <div className="opsBillingCell opsBillingCell--done">
      <TbReceipt2 />
      <span>{row.invoice_number || "Facturado"}</span>
    </div>
  ) : row.billing_alert === "Facturar" ? (
    /* Pendiente de facturar: badge rojo + botón */
    <button
      type="button"
      className="opsBillingCell opsBillingCell--bill"
      onClick={() => generateInvoiceFromService(row)}
      title="Clic para generar factura"
    >
      <TbReceipt2 />
      <span>Facturar</span>
    </button>
  ) : (
    /* Sin alerta */
    <span className="opsMuted">------</span>
  )}
</td>
<td className="opsMuted" style={{ fontSize: 11 }}>
  {row.invoice_number || "—"}
</td>
                  <td className="opsTdRight">
<div className="opsActions">
  <button type="button" className="opsIconBtn" onClick={() => openEdit(row)} title="Editar">
    <TbEdit />
  </button>

  <button type="button" className="opsIconBtn opsIconBtnDanger" onClick={() => deleteRow(row)} title="Eliminar">
    <TbTrash />
  </button>
</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

<OperationFormModal
  open={modalOpen}
  mode={modalMode}
  form={form}
  setForm={setForm}
  onClose={closeModal}
  onSave={saveRow}
  selectedClient={selectedClient}
  setSelectedClient={setSelectedClient}
/>
  </div>
)}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PESTAÑA 2 — Bitácora de Ruta (RUTA 2026 format)                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
{moduleTab === "log" && (
  <div className="opsInnerWrap">
    <div className="opsRouteHeader">
      <div>
        <h2 className="opsTitle opsRouteTitle">
          <TbClipboardList />
          Bitácora de Ruta
        </h2>

        <p className="opsSub">
          Se genera automáticamente desde Servicios Sanitarios según ciudad, ubicación, cantidades y días de servicio.
        </p>
      </div>

      <button
        type="button"
        className="opsBtn opsBtnGhost"
        onClick={loadRows}
      >
        <TbRefresh />
        Actualizar
      </button>
    </div>

    <div className="opsRouteFilters">
      <div className="opsSearch">
        <TbSearch />

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por cliente, ubicación, ciudad..."
        />
      </div>

      <div className="opsDateFilters">
        <input
          type="date"
          className="opsDateInput"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />

        <input
          type="date"
          className="opsDateInput"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="opsRouteClearBtn"
        onClick={() => {
          setQ("");
          setDateFrom("");
          setDateTo("");
        }}
      >
        Limpiar
      </button>

      <div className="opsRouteFilterPill">
        <TbFilter />
        <span>{routeFilteredRows.length} servicios activos</span>
      </div>
    </div>

    <div className="opsRouteBoard">
      <RouteExcelBlock
        title="Ruta Mochis"
        subtitle="Lunes · Miércoles · Viernes"
        cityLabel="Ubicación"
        color="dark"
        rows={buildRouteRows(routeFilteredRows, "LOS MOCHIS", "LMV")}
      />

      <RouteExcelBlock
        title="Ruta Mochis"
        subtitle="Martes · Jueves · Sábado"
        cityLabel="Ubicación"
        color="dark"
        rows={buildRouteRows(routeFilteredRows, "LOS MOCHIS", "MJS")}
      />

      <RouteExcelBlock
        title="Ruta Guasave"
        subtitle="Lunes · Miércoles · Viernes"
        cityLabel="Ubicación"
        color="green"
        rows={buildRouteRows(routeFilteredRows, "GUASAVE", "LMV")}
      />

      <RouteExcelBlock
        title="Ruta Guasave"
        subtitle="Martes · Jueves · Sábado"
        cityLabel="Ubicación"
        color="green"
        rows={buildRouteRows(routeFilteredRows, "GUASAVE", "MJS")}
      />
    </div>
  </div>
)}


    </div>
  );
}