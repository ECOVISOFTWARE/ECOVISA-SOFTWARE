import React, { useEffect, useMemo, useState } from "react";
import {
  TbUsers,
  TbPlus,
  TbSearch,
  TbEdit,
  TbTrash,
  TbFileInvoice,
  TbReceipt2,
  TbTruck,
  TbMail,
  TbPhone,
  TbMapPin,
  TbBuilding,
  TbNotes,
  TbClock,
  TbCalendarTime,
  TbChevronRight,
  TbX,
} from "react-icons/tb";
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { LineChart, PieChart, BarChart } from "@mui/x-charts";
import Swal from "sweetalert2";
import { apiFetch } from "../api";
import "./ClientsModule.css";

const EMPTY_FORM = {
  name: "",
  company: "",
  rfc: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  logo_url: "",
  industry: "",
  website: "",
  company_size: "",
  client_status: "ACTIVO",
  billing_contact_name: "",
  billing_email: "",
  billing_phone: "",
  billing_address: "",
  billing_city: "",
  billing_state: "",
  billing_zip: "",
  payment_terms: "",
  credit_limit: "",
  preferred_currency: "MXN",
  tax_regime: "",
  cfdi_use: "",
  internal_notes: "",
};
function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActivityTone(client) {
  const invoices = Number(client?.metrics?.invoices_count || 0);
  const quotes = Number(client?.metrics?.quotes_count || 0);

  if (invoices > 0) {
    return {
      label: "Activo",
      bg: "#ecfdf5",
      color: "#15803d",
      border: "#86efac",
    };
  }

  if (quotes > 0) {
    return {
      label: "Prospecto",
      bg: "#eff6ff",
      color: "#1d4ed8",
      border: "#93c5fd",
    };
  }

  return {
    label: "Sin actividad",
    bg: "#f8fafc",
    color: "#64748b",
    border: "#cbd5e1",
  };
}

function buildMonthlySeries(clients = []) {
  const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const acc = new Array(12).fill(0);

  clients.forEach((client) => {
    const d = new Date(client.created_at);
    if (!Number.isNaN(d.getTime())) acc[d.getMonth()] += 1;
  });

  return labels.map((label, index) => ({
    label,
    value: acc[index],
  }));
}

function buildTopBilledClients(clients = []) {
  return [...clients]
    .sort((a, b) => Number(b?.metrics?.total_billed || 0) - Number(a?.metrics?.total_billed || 0))
    .slice(0, 6);
}

function SummaryStat({ label, value, sub, accent = "blue" }) {
  return (
    <Card className={`crm-kpi-card crm-kpi-card--${accent}`}>
      <CardContent className="crm-kpi-card__content">
        <div className="crm-kpi-card__label">{label}</div>
        <div className="crm-kpi-card__value">{value}</div>
        {sub ? <div className="crm-kpi-card__sub">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function MetricMiniCard({ label, value, sub, accent = "blue" }) {
  return (
    <div className={`crm-mini-card crm-mini-card--${accent}`}>
      <div className="crm-mini-card__label">{label}</div>
      <div className="crm-mini-card__value">{value}</div>
      {sub ? <div className="crm-mini-card__sub">{sub}</div> : null}
    </div>
  );
}

function TimelineItem({ title, sub, extra, date }) {
  return (
    <div className="crm-timeline-item">
      <div className="crm-timeline-dot" />
      <div className="crm-timeline-copy">
        <div className="crm-timeline-title">{title}</div>
        {sub ? <div className="crm-timeline-sub">{sub}</div> : null}
        {extra ? <div className="crm-timeline-extra">{extra}</div> : null}
      </div>
      <div className="crm-timeline-date">{formatDate(date)}</div>
    </div>
  );
}

export default function ClientsModule({ currentWorker }) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState(0);
  const [clientDetail, setClientDetail] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formTab, setFormTab] = useState("general");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: "Todos",
    industry: "Todas",
    company_size: "Todas",
    min_billed: "",
    max_billed: "",
    created_from: "",
    created_to: "",
  });

  const [expandedClientId, setExpandedClientId] = useState(null);

  async function loadClients() {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (search.trim()) params.set("q", search.trim());
      if (filters.status && filters.status !== "Todos") params.set("status", filters.status);
      if (filters.industry && filters.industry !== "Todas") params.set("industry", filters.industry);
      if (filters.company_size && filters.company_size !== "Todas") params.set("company_size", filters.company_size);
      if (filters.min_billed !== "") params.set("min_billed", filters.min_billed);
      if (filters.max_billed !== "") params.set("max_billed", filters.max_billed);
      if (filters.created_from) params.set("created_from", filters.created_from);
      if (filters.created_to) params.set("created_to", filters.created_to);

      const resp = await apiFetch(`/api/clients?${params.toString()}`);
      setClients(resp?.data || []);
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e.message || "No se pudieron cargar los clientes", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, [search, filters]);
  async function openDetail(clientId) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailTab(0);
    try {
      const resp = await apiFetch(`/api/clients/${clientId}`);
      setClientDetail(resp?.data || null);
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo cargar el detalle del cliente", "error");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCreate() {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setFormTab("general");
    setFormOpen(true);
  }

  function handleEdit(client) {
    setEditingClient(client);
    setFormTab("general");
    setForm({
      name: client?.name || "",
      company: client?.company || "",
      rfc: client?.rfc || "",
      phone: client?.phone || "",
      email: client?.email || "",
      address: client?.address || "",
      notes: client?.notes || "",
      logo_url: client?.logo_url || "",
      industry: client?.industry || "",
      website: client?.website || "",
      company_size: client?.company_size || "",
      client_status: client?.client_status || "ACTIVO",
      billing_contact_name: client?.billing_contact_name || "",
      billing_email: client?.billing_email || "",
      billing_phone: client?.billing_phone || "",
      billing_address: client?.billing_address || "",
      billing_city: client?.billing_city || "",
      billing_state: client?.billing_state || "",
      billing_zip: client?.billing_zip || "",
      payment_terms: client?.payment_terms || "",
      credit_limit: client?.credit_limit || "",
      preferred_currency: client?.preferred_currency || "MXN",
      tax_regime: client?.tax_regime || "",
      cfdi_use: client?.cfdi_use || "",
      internal_notes: client?.internal_notes || "",
    });
    setFormOpen(true);
  }

  async function handleSaveClient() {
    if (!form.name.trim()) {
      Swal.fire("Falta el nombre", "El nombre del cliente es obligatorio.", "warning");
      return;
    }

    setSaving(true);
    try {
      if (editingClient?.id) {
        await apiFetch(`/api/clients/${editingClient.id}`, {
          method: "PUT",
          body: JSON.stringify({
            worker_id: currentWorker?.id || null,
            ...form,
          }),
        });
      } else {
        await apiFetch("/api/clients", {
          method: "POST",
          body: JSON.stringify({
            worker_id: currentWorker?.id || null,
            ...form,
          }),
        });
      }

      setFormOpen(false);
      setEditingClient(null);
      setForm(EMPTY_FORM);
      await loadClients();

      if (clientDetail?.id && editingClient?.id === clientDetail.id) {
        const refreshed = await apiFetch(`/api/clients/${clientDetail.id}`);
        setClientDetail(refreshed?.data || null);
      }
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo guardar el cliente", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(client) {
    const res = await Swal.fire({
      title: "¿Eliminar cliente?",
      text: `Se eliminará ${client?.name || "este cliente"}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc2626",
    });

    if (!res.isConfirmed) return;

    try {
      await apiFetch(`/api/clients/${client.id}`, { method: "DELETE" });
      await loadClients();

      if (clientDetail?.id === client.id) {
        setDetailOpen(false);
        setClientDetail(null);
      }
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo eliminar el cliente", "error");
    }
  }
  function toggleExpandedClient(clientId) {
    setExpandedClientId((prev) => (prev === clientId ? null : clientId));
  }

  function openView(clientId) {
    openDetail(clientId);
  }

  function renderClientLogo(client) {
    if (client?.logo_url) {
      return (
        <img
          src={client.logo_url}
          alt={client.name || "Logo cliente"}
          className="crm-client-logo"
        />
      );
    }

    return (
      <div className="crm-client-logo crm-client-logo--fallback">
        {(client?.name || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }
  const dashboard = useMemo(() => {
    const totalClients = clients.length;
    const clientsWithQuotes = clients.filter((c) => Number(c?.metrics?.quotes_count || 0) > 0).length;
    const clientsWithInvoices = clients.filter((c) => Number(c?.metrics?.invoices_count || 0) > 0).length;
    const totalBilled = clients.reduce((sum, c) => sum + Number(c?.metrics?.total_billed || 0), 0);
    const totalQuoted = clients.reduce((sum, c) => sum + Number(c?.metrics?.total_quoted || 0), 0);

    const clientsWithOnlyQuotes = clients.filter((c) => {
      const quotes = Number(c?.metrics?.quotes_count || 0);
      const invoices = Number(c?.metrics?.invoices_count || 0);
      return quotes > 0 && invoices === 0;
    }).length;

    const inactiveClients = clients.filter((c) => {
      const quotes = Number(c?.metrics?.quotes_count || 0);
      const invoices = Number(c?.metrics?.invoices_count || 0);
      return quotes === 0 && invoices === 0;
    }).length;

    const monthly = buildMonthlySeries(clients);
    const topClients = buildTopBilledClients(clients);

    const distribution = [
  {
    id: 0,
    value: clientsWithInvoices,
    label: `Con factura (${clientsWithInvoices})`,
  },
  {
    id: 1,
    value: clientsWithOnlyQuotes,
    label: `Solo cotización (${clientsWithOnlyQuotes})`,
  },
  {
    id: 2,
    value: inactiveClients,
    label: `Sin actividad (${inactiveClients})`,
  },
];

    return {
      totalClients,
      clientsWithQuotes,
      clientsWithInvoices,
      totalBilled,
      totalQuoted,
      inactiveClients,
      monthly,
      topClients,
      distribution,
    };
  }, [clients]);

  const detailTimeline = useMemo(() => {
    if (!clientDetail) return [];

    const items = [
      ...((clientDetail.active_quotes || clientDetail.quotes || []).map((q) => ({
        id: `q-${q.id}`,
        kind: "quote",
        title: `${q.folio || "Cotización"} · ${q.title || "Sin título"}`,
        sub: `Cotización · ${q.status || "sin estado"} · ${formatCurrency(q.total)}`,
        extra: [
          q.valid_until ? `Válida hasta: ${formatDate(q.valid_until)}` : null,
        ].filter(Boolean).join(" · "),
        date: q.created_at,
      }))),

      ...(clientDetail.invoices || []).map((inv) => ({
        id: `i-${inv.id}`,
        kind: "invoice",
        title: `${inv.folio || "Factura"} · ${formatCurrency(inv.total)}`,
        sub: `Factura · ${inv.status || "sin estado"}`,
        extra: [
          inv.billing_period ? `Periodo: ${inv.billing_period}` : null,
          inv.service_location ? `Ubicación: ${inv.service_location}` : null,
        ].filter(Boolean).join(" · "),
        date: inv.created_at,
      })),

      ...(clientDetail.service_sheets || []).map((sheet) => ({
        id: `s-${sheet.id}`,
        kind: "service",
        title: `${sheet.service_type || "Servicio"} · ${formatCurrency(sheet.total_price)}`,
        sub: `Servicio · ${sheet.status || "sin estado"}`,
        extra: [
          sheet.route_name ? `Ruta: ${sheet.route_name}` : null,
          sheet.location || sheet.city ? `Ubicación: ${sheet.location || sheet.city}` : null,
          sheet.quantity ? `Cantidad: ${sheet.quantity}` : null,
        ].filter(Boolean).join(" · "),
        date: sheet.created_at || sheet.delivery_date,
      })),
    ];

    return items
      .filter((x) => x.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);
  }, [clientDetail]);

  return (
    <div className="crm-wrap">
      <div className="crm-topbar">
        <div>
          <h1 className="crm-title">
            <TbUsers />
            Clientes
          </h1>
          <p className="crm-sub">
            Catálogo central · Historial comercial · Relación con cotizaciones y facturación
          </p>
        </div>

        <div className="crm-actions">
          <div className="crm-search">
            <TbSearch size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente por nombre, empresa o RFC..."
            />
          </div>

          <button
            className="crm-filter-btn"
            type="button"
            onClick={() => setFiltersOpen(true)}
          >
            Filtros
          </button>

          <button className="crm-primary-btn" type="button" onClick={handleCreate}>
            <TbPlus size={16} />
            Nuevo cliente
          </button>
        </div>
      </div>

      <div className="crm-kpis">
        <SummaryStat
          label="Total de clientes"
          value={dashboard.totalClients}
          sub="Base comercial registrada"
          accent="blue"
        />
        <SummaryStat
          label="Con cotizaciones"
          value={dashboard.clientsWithQuotes}
          sub="Clientes con intención activa"
          accent="amber"
        />
        <SummaryStat
          label="Con facturas"
          value={dashboard.clientsWithInvoices}
          sub="Clientes con venta consolidada"
          accent="green"
        />
        <SummaryStat
          label="Facturado histórico"
          value={formatCurrency(dashboard.totalBilled)}
          sub="Acumulado del catálogo"
          accent="cyan"
        />
      </div>

      <Card className="crm-table-card crm-table-card--hero">
        <CardContent className="crm-panel__content crm-panel__content--table">
          <div className="crm-panel__head crm-panel__head--table">
            <div>
              <div className="crm-panel__eyebrow">Listado principal</div>
              <div className="crm-panel__title crm-panel__title--table">Cartera de clientes</div>
              <div className="crm-panel__subhead">
                Vista central del catálogo comercial con actividad, facturación y seguimiento.
              </div>
            </div>
          </div>

          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Empresa</th>
                  <th>Estado</th>
                  <th>Cotizaciones</th>
                  <th>Facturas</th>
                  <th>Facturado</th>
                  <th>Última actividad</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="crm-empty-cell">
                      Cargando clientes...
                    </td>
                  </tr>
                ) : clients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="crm-empty-cell">
                      No hay clientes registrados.
                    </td>
                  </tr>
                ) : (
                  clients.flatMap((client) => {
                    const tone = getActivityTone(client);
                    const isExpanded = expandedClientId === client.id;

                    return [
                      <tr key={client.id} className="crm-client-row">
                        <td>
                          <button
                            className="crm-client-main"
                            type="button"
                            onClick={() => toggleExpandedClient(client.id)}
                          >
                            {renderClientLogo(client)}
                            <span className="crm-client-main__copy">
                              <span className="crm-link-btn__main">{client.name || "Sin nombre"}</span>
                              <span className="crm-link-btn__sub">
                                {client.company || client.email || client.phone || "Sin información adicional"}
                              </span>
                            </span>
                          </button>
                        </td>

                        <td>
                          <div className="crm-cell-stack">
                            <strong>{client.company || "—"}</strong>
                            <span>{client.rfc || "Sin RFC"}</span>
                          </div>
                        </td>

                        <td>
                          <span
                            className="crm-chip"
                            style={{
                              background: tone.bg,
                              color: tone.color,
                              borderColor: tone.border,
                            }}
                          >
                            {tone.label}
                          </span>
                        </td>

                        <td>{client?.metrics?.quotes_count || 0}</td>
                        <td>{client?.metrics?.invoices_count || 0}</td>
                        <td>{formatCurrency(client?.metrics?.total_billed || 0)}</td>
                        <td>{formatDate(client?.metrics?.last_activity_at)}</td>

                        <td>
                          <div className="crm-row-actions">
                            <button
                              type="button"
                              className="crm-icon-btn crm-icon-btn--view"
                              title="Ver cliente"
                              onClick={() => openView(client.id)}
                            >
                              👁
                            </button>
                            <button
                              type="button"
                              className="crm-icon-btn"
                              title="Editar cliente"
                              onClick={() => handleEdit(client)}
                            >
                              <TbEdit size={15} />
                            </button>
                            <button
                              type="button"
                              className="crm-icon-btn crm-icon-btn--danger"
                              title="Eliminar cliente"
                              onClick={() => handleDelete(client)}
                            >
                              <TbTrash size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>,

                      isExpanded ? (
                        <tr key={`${client.id}-expanded`} className="crm-expand-row">
                          <td colSpan={8} className="crm-expand-cell">
                            <div className="crm-expand-grid">
                              <div className="crm-expand-card">
                                <div className="crm-expand-card__title">Actividad reciente</div>
                                <div className="crm-expand-card__timeline">
                                  <div className="crm-expand-timeline-item">
                                    <span className="crm-expand-dot" />
                                    <div>
                                      <strong>Última actividad</strong>
                                      <p>{formatDateTime(client?.metrics?.last_activity_at)}</p>
                                    </div>
                                  </div>
                                  <div className="crm-expand-timeline-item">
                                    <span className="crm-expand-dot" />
                                    <div>
                                      <strong>Cotizaciones</strong>
                                      <p>{client?.metrics?.quotes_count || 0} registradas</p>
                                    </div>
                                  </div>
                                  <div className="crm-expand-timeline-item">
                                    <span className="crm-expand-dot" />
                                    <div>
                                      <strong>Facturación</strong>
                                      <p>{formatCurrency(client?.metrics?.total_billed || 0)} acumulado</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="crm-expand-card">
                                <div className="crm-expand-card__title">Resumen comercial</div>
                                <div className="crm-expand-info">
                                  <div><strong>Contacto:</strong> {client.email || client.phone || "—"}</div>
                                  <div><strong>RFC:</strong> {client.rfc || "—"}</div>
                                  <div><strong>Sitio web:</strong> {client.website || "—"}</div>
                                  <div><strong>Industria:</strong> {client.industry || "—"}</div>
                                  <div><strong>Dirección:</strong> {client.address || "—"}</div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ].filter(Boolean);
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="crm-analytics-grid">
        <Card className="crm-panel crm-panel--trend">
          <CardContent className="crm-panel__content">
            <div className="crm-panel__head">
              <div>
                <div className="crm-panel__eyebrow">Tendencia</div>
                <div className="crm-panel__title">Clientes nuevos</div>
                <div className="crm-panel__subhead">Altas mensuales del catálogo</div>
              </div>
            </div>

            <LineChart
              height={230}
              xAxis={[{ scaleType: "point", data: dashboard.monthly.map((m) => m.label) }]}
              series={[
                {
                  data: dashboard.monthly.map((m) => m.value),
                  area: true,
                  showMark: true,
                },
              ]}
              margin={{ top: 20, right: 20, bottom: 24, left: 36 }}
            />
          </CardContent>
        </Card>

        <Card className="crm-panel crm-panel--donut">
          <CardContent className="crm-panel__content">
            <div className="crm-panel__head">
              <div>
                <div className="crm-panel__eyebrow">Actividad</div>
                <div className="crm-panel__title">Estado del catálogo</div>
                <div className="crm-panel__subhead">Distribución de cartera</div>
              </div>
            </div>

            <PieChart
              height={230}
              series={[
                {
                  data: dashboard.distribution,
                  innerRadius: 54,
                  outerRadius: 88,
                  paddingAngle: 3,
                  cornerRadius: 5,
                },
              ]}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            />

          </CardContent>
        </Card>

        <Card className="crm-panel crm-panel--wide crm-panel--bar">
          <CardContent className="crm-panel__content">
            <div className="crm-panel__head">
              <div>
                <div className="crm-panel__eyebrow">Ingresos</div>
                <div className="crm-panel__title">Top clientes por facturación</div>
                <div className="crm-panel__subhead">Ranking acumulado del catálogo</div>
              </div>
            </div>

            <BarChart
              height={250}
              xAxis={[
                {
                  scaleType: "band",
                  data: dashboard.topClients.map((c) => c.name || "Cliente"),
                },
              ]}
              series={[
                {
                  data: dashboard.topClients.map((c) => Number(c?.metrics?.total_billed || 0)),
                },
              ]}
              margin={{ top: 20, right: 20, bottom: 50, left: 56 }}
            />
          </CardContent>
        </Card>
      </div>
      <Drawer
        anchor="right"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        PaperProps={{ className: "crm-filters-drawer" }}
      >
        <div className="crm-filters-wrap">
          <div className="crm-filters-head">
            <div className="crm-filters-title">Filtros</div>
            <IconButton onClick={() => setFiltersOpen(false)}>
              <TbX />
            </IconButton>
          </div>

          <div className="crm-filters-grid">
            <TextField
              label="Estado"
              value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Industria"
              value={filters.industry}
              onChange={(e) => setFilters((p) => ({ ...p, industry: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Tamaño empresa"
              value={filters.company_size}
              onChange={(e) => setFilters((p) => ({ ...p, company_size: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Ingreso mínimo"
              value={filters.min_billed}
              onChange={(e) => setFilters((p) => ({ ...p, min_billed: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Ingreso máximo"
              value={filters.max_billed}
              onChange={(e) => setFilters((p) => ({ ...p, max_billed: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Desde"
              type="date"
              value={filters.created_from}
              onChange={(e) => setFilters((p) => ({ ...p, created_from: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Hasta"
              type="date"
              value={filters.created_to}
              onChange={(e) => setFilters((p) => ({ ...p, created_to: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </div>

          <div className="crm-filters-actions">
            <Button
              variant="outlined"
              onClick={() =>
                setFilters({
                  status: "Todos",
                  industry: "Todas",
                  company_size: "Todas",
                  min_billed: "",
                  max_billed: "",
                  created_from: "",
                  created_to: "",
                })
              }
            >
              Limpiar
            </Button>
            <Button variant="contained" onClick={() => setFiltersOpen(false)}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </Drawer>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ className: "crm-dialog-paper" }}
      >
        <DialogTitle className="crm-dialog-title">
          {editingClient ? "Editar cliente" : "Nuevo cliente"}
        </DialogTitle>

        <DialogContent className="crm-dialog-content">
          <div className="crm-form-tabs">
            {[
              ["general", "Información general"],
              ["contact", "Contacto"],
              ["address", "Dirección"],
              ["billing", "Facturación"],
              ["notes", "Notas"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`crm-form-tab ${formTab === key ? "is-active" : ""}`}
                onClick={() => setFormTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {formTab === "general" && (
            <div className="crm-form-grid">
              <TextField
                label="Nombre *"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Empresa"
                value={form.company}
                onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                fullWidth
              />
              <TextField
                label="RFC"
                value={form.rfc}
                onChange={(e) => setForm((p) => ({ ...p, rfc: e.target.value.toUpperCase() }))}
                fullWidth
              />
              <TextField
                label="Logo URL"
                value={form.logo_url}
                onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Industria"
                value={form.industry}
                onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Sitio web"
                value={form.website}
                onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Tamaño de empresa"
                value={form.company_size}
                onChange={(e) => setForm((p) => ({ ...p, company_size: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Estado del cliente"
                value={form.client_status}
                onChange={(e) => setForm((p) => ({ ...p, client_status: e.target.value }))}
                fullWidth
              />
            </div>
          )}

          {formTab === "contact" && (
            <div className="crm-form-grid">
              <TextField
                label="Teléfono"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Contacto facturación"
                value={form.billing_contact_name}
                onChange={(e) => setForm((p) => ({ ...p, billing_contact_name: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Email facturación"
                value={form.billing_email}
                onChange={(e) => setForm((p) => ({ ...p, billing_email: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Teléfono facturación"
                value={form.billing_phone}
                onChange={(e) => setForm((p) => ({ ...p, billing_phone: e.target.value }))}
                fullWidth
              />
            </div>
          )}

          {formTab === "address" && (
            <div className="crm-form-grid">
              <TextField
                label="Dirección general"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                fullWidth
                className="crm-form-grid__full"
              />
              <TextField
                label="Dirección fiscal"
                value={form.billing_address}
                onChange={(e) => setForm((p) => ({ ...p, billing_address: e.target.value }))}
                fullWidth
                className="crm-form-grid__full"
              />
              <TextField
                label="Ciudad"
                value={form.billing_city}
                onChange={(e) => setForm((p) => ({ ...p, billing_city: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Estado"
                value={form.billing_state}
                onChange={(e) => setForm((p) => ({ ...p, billing_state: e.target.value }))}
                fullWidth
              />
              <TextField
                label="CP"
                value={form.billing_zip}
                onChange={(e) => setForm((p) => ({ ...p, billing_zip: e.target.value }))}
                fullWidth
              />
            </div>
          )}

          {formTab === "billing" && (
            <div className="crm-form-grid">
              <TextField
                label="Régimen fiscal"
                value={form.tax_regime}
                onChange={(e) => setForm((p) => ({ ...p, tax_regime: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Uso CFDI"
                value={form.cfdi_use}
                onChange={(e) => setForm((p) => ({ ...p, cfdi_use: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Términos de pago"
                value={form.payment_terms}
                onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Límite de crédito"
                value={form.credit_limit}
                onChange={(e) => setForm((p) => ({ ...p, credit_limit: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Moneda preferida"
                value={form.preferred_currency}
                onChange={(e) => setForm((p) => ({ ...p, preferred_currency: e.target.value }))}
                fullWidth
              />
            </div>
          )}

          {formTab === "notes" && (
            <div className="crm-form-grid">
              <TextField
                label="Notas"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                fullWidth
                multiline
                minRows={4}
                className="crm-form-grid__full"
              />
              <TextField
                label="Notas internas"
                value={form.internal_notes}
                onChange={(e) => setForm((p) => ({ ...p, internal_notes: e.target.value }))}
                fullWidth
                multiline
                minRows={4}
                className="crm-form-grid__full"
              />
            </div>
          )}

          <div className="crm-dialog-actions">
            <Button variant="outlined" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button variant="contained" onClick={handleSaveClient} disabled={saving}>
              {saving ? "Guardando..." : editingClient ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Drawer
        anchor="right"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        PaperProps={{ className: "crm-detail-drawer" }}
      >
        <div className="crm-detail-wrap">
          <div className="crm-detail-head">
            <div className="crm-detail-head__copy">
              <div className="crm-detail-avatar">
                {(clientDetail?.name || "C").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="crm-detail-name">{clientDetail?.name || "Cliente"}</div>
                <div className="crm-detail-meta">
                  {clientDetail?.company || "Sin empresa"} · Cliente desde {formatDate(clientDetail?.created_at)}
                </div>
              </div>
            </div>

            <IconButton onClick={() => setDetailOpen(false)}>
              <TbX />
            </IconButton>
          </div>

          {detailLoading ? (
            <div className="crm-detail-loading">Cargando detalle...</div>
          ) : !clientDetail ? (
            <div className="crm-detail-loading">Sin información del cliente.</div>
          ) : (
            <>
              <Box className="crm-detail-tabs-wrap">
                <Tabs
                  value={detailTab}
                  onChange={(_, value) => setDetailTab(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                >
                  <Tab label="Resumen" />
                  <Tab label="Información" />
                  <Tab label="Cotizaciones" />
                  <Tab label="Facturación" />
                  <Tab label="Servicios" />
                  <Tab label="Historial" />
                </Tabs>
              </Box>

              {detailTab === 0 && (
                <div className="crm-detail-body">
                  <div className="crm-detail-kpis">
                    <MetricMiniCard
                      label="Cotizaciones"
                      value={clientDetail?.summary?.quotes_count || 0}
                      sub="Histórico del cliente"
                      accent="blue"
                    />
                    <MetricMiniCard
                      label="Facturas"
                      value={clientDetail?.summary?.invoices_count || 0}
                      sub="Documentos emitidos"
                      accent="green"
                    />
                    <MetricMiniCard
                      label="Facturado"
                      value={formatCurrency(clientDetail?.summary?.total_billed || 0)}
                      sub="Monto histórico"
                      accent="cyan"
                    />
                    <MetricMiniCard
                      label="Frecuencia"
                      value={
                        clientDetail?.summary?.frequency_days
                          ? `${clientDetail.summary.frequency_days} días`
                          : "—"
                      }
                      sub="Promedio entre cotizaciones"
                      accent="amber"
                    />
                  </div>

                  <div className="crm-detail-grid">
                    <Card className="crm-detail-card">
                      <CardContent>
                        <div className="crm-panel__title">Actividad reciente</div>
                        <div className="crm-timeline">
                          {detailTimeline.length === 0 ? (
                            <div className="crm-empty-soft">Sin actividad registrada.</div>
                          ) : (
                            detailTimeline.map((item) => (
                              <TimelineItem
                                key={item.id}
                                title={item.title}
                                sub={item.sub}
                                extra={item.extra}
                                date={item.date}
                              />
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="crm-detail-card">
                      <CardContent>
                        <div className="crm-panel__title">Información de contacto</div>
                        <div className="crm-contact-list">
                          <div className="crm-contact-item">
                            <TbBuilding size={15} />
                            <span>{clientDetail.company || "Sin empresa"}</span>
                          </div>
                          <div className="crm-contact-item">
                            <TbMail size={15} />
                            <span>{clientDetail.email || "Sin email"}</span>
                          </div>
                          <div className="crm-contact-item">
                            <TbPhone size={15} />
                            <span>{clientDetail.phone || "Sin teléfono"}</span>
                          </div>
                          <div className="crm-contact-item">
                            <TbMapPin size={15} />
                            <span>{clientDetail.address || "Sin dirección"}</span>
                          </div>
                          <div className="crm-contact-item">
                            <TbNotes size={15} />
                            <span>{clientDetail.notes || "Sin notas"}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {detailTab === 1 && (
                <div className="crm-detail-body">
                  <Card className="crm-detail-card crm-detail-card--full">
                    <CardContent>
                      <div className="crm-info-grid">
                        <div><strong>Nombre:</strong> {clientDetail.name || "—"}</div>
                        <div><strong>Empresa:</strong> {clientDetail.company || "—"}</div>
                        <div><strong>RFC:</strong> {clientDetail.rfc || "—"}</div>
                        <div><strong>Email:</strong> {clientDetail.email || "—"}</div>
                        <div><strong>Teléfono:</strong> {clientDetail.phone || "—"}</div>
                        <div><strong>Dirección:</strong> {clientDetail.address || "—"}</div>
                        <div className="crm-info-grid__full"><strong>Notas:</strong> {clientDetail.notes || "—"}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {detailTab === 2 && (
                <div className="crm-detail-body">
                  <Card className="crm-detail-card crm-detail-card--full">
                    <CardContent>
                      <div className="crm-panel__title">Cotizaciones del cliente</div>
                      <div className="crm-subtable-wrap">
                        <table className="crm-subtable">
                          <thead>
                            <tr>
                              <th>Folio</th>
                              <th>Título</th>
                              <th>Estado</th>
                              <th>Total</th>
                              <th>Fecha</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(clientDetail.quotes || []).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="crm-empty-cell">Sin cotizaciones.</td>
                              </tr>
                            ) : (
                              (clientDetail.quotes || []).map((quote) => (
                                <tr key={quote.id}>
                                  <td>{quote.folio || "—"}</td>
                                  <td>{quote.title || "—"}</td>
                                  <td>{quote.status || "—"}</td>
                                  <td>{formatCurrency(quote.total)}</td>
                                  <td>{formatDate(quote.created_at)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {detailTab === 3 && (
                <div className="crm-detail-body">
                  <Card className="crm-detail-card crm-detail-card--full">
                    <CardContent>
                      <div className="crm-panel__title">Facturación del cliente</div>
                      <div className="crm-subtable-wrap">
                        <table className="crm-subtable">
                          <thead>
                            <tr>
                              <th>Folio</th>
                              <th>Estado</th>
                              <th>Total</th>
                              <th>Periodo</th>
                              <th>Fecha</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(clientDetail.invoices || []).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="crm-empty-cell">Sin facturas.</td>
                              </tr>
                            ) : (
                              (clientDetail.invoices || []).map((invoice) => (
                                <tr key={invoice.id}>
                                  <td>{invoice.folio || "—"}</td>
                                  <td>{invoice.status || "—"}</td>
                                  <td>{formatCurrency(invoice.total)}</td>
                                  <td>{invoice.billing_period || "—"}</td>
                                  <td>{formatDate(invoice.created_at)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {detailTab === 4 && (
                <div className="crm-detail-body">
                  <Card className="crm-detail-card crm-detail-card--full">
                    <CardContent>
                      <div className="crm-panel__title">Servicios / hojas de servicio</div>
                      <div className="crm-subtable-wrap">
                        <table className="crm-subtable">
                          <thead>
                            <tr>
                              <th>Tipo</th>
                              <th>Ubicación</th>
                              <th>Estado</th>
                              <th>Total</th>
                              <th>Entrega</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(clientDetail.service_sheets || []).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="crm-empty-cell">Sin servicios.</td>
                              </tr>
                            ) : (
                              (clientDetail.service_sheets || []).map((sheet) => (
                                <tr key={sheet.id}>
                                  <td>{sheet.service_type || "—"}</td>
                                  <td>{sheet.location || sheet.city || "—"}</td>
                                  <td>{sheet.status || "—"}</td>
                                  <td>{formatCurrency(sheet.total_price)}</td>
                                  <td>{formatDate(sheet.delivery_date)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {detailTab === 5 && (
                <div className="crm-detail-body">
                  <Card className="crm-detail-card crm-detail-card--full">
                    <CardContent>
                      <div className="crm-panel__title">Historial consolidado</div>
                      <div className="crm-history-list">
                        {detailTimeline.length === 0 ? (
                          <div className="crm-empty-soft">Sin historial consolidado.</div>
                        ) : (
                          detailTimeline.map((item) => (
                            <TimelineItem
                              key={item.id}
                              title={item.title}
                              sub={item.sub}
                              extra={item.extra}
                              date={item.date}
                            />
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}