import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import { apiFetch } from "../api";
import ClientSelectPro from "../components/ClientSelectPro";
import "./InvoicesModule.css";
import {
  TbReceipt2,
  TbPlus,
  TbSearch,
  TbEdit,
  TbTrash,
  TbRefresh,
  TbFileInvoice,
  TbCalendarEvent,
  TbMapPin,
  TbUser,
  TbCurrencyDollar,
  TbEye,
  TbFileTypePdf,
  TbFileTypeXls,
  TbCode,
  TbRouteSquare,
  TbX,
} from "react-icons/tb";

const STATUS_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Borrador" },
  { value: "pending", label: "Pendiente" },
  { value: "issued", label: "Emitida" },
  { value: "paid", label: "Pagada" },
  { value: "cancelled", label: "Cancelada" },
];

const STATUS_STYLES = {
  draft: {
    label: "Borrador",
    bg: "#f8fafc",
    color: "#475569",
    border: "#cbd5e1",
    dot: "#94a3b8",
  },
  pending: {
    label: "Pendiente",
    bg: "#fff7ed",
    color: "#c2410c",
    border: "#fdba74",
    dot: "#f97316",
  },
  issued: {
    label: "Emitida",
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "#93c5fd",
    dot: "#3b82f6",
  },
  paid: {
    label: "Pagada",
    bg: "#ecfdf5",
    color: "#047857",
    border: "#6ee7b7",
    dot: "#10b981",
  },
  cancelled: {
    label: "Cancelada",
    bg: "#f8fafc",
    color: "#64748b",
    border: "#cbd5e1",
    dot: "#94a3b8",
  },
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.draft;
}

async function exportInvoice(invoice, format) {
  if (!invoice?.id) {
    await Swal.fire("Error", "No se encontró el identificador de la factura.", "error");
    return;
  }

  const ext = format === "excel" ? "xlsx" : format;
  const mimeMap = {
    pdf: "application/pdf",
    excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xml: "application/xml",
  };

  const labelMap = {
    pdf: "PDF",
    excel: "Excel",
    xml: "XML",
  };

  try {
    Swal.fire({
      title: `Exportando ${labelMap[format]}...`,
      text: "Espera un momento",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
      customClass: {
        popup: "swal-quote-popup",
        title: "swal-quote-title",
      },
    });

    const resp = await fetch(`/api/invoices/${invoice.id}/export/${format}`, {
      method: "GET",
      credentials: "include",
    });

    if (!resp.ok) {
      throw new Error(`Error ${resp.status}`);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: mimeMap[format] }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.folio || "factura"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>',
      title: `${labelMap[format]} exportado`,
      text: `La factura ${invoice.folio || ""} se descargó correctamente.`,
      customClass: {
        icon: "swal-no-border",
        popup: "swal-quote-popup",
        title: "swal-quote-title",
        confirmButton: "swal-quote-confirm",
      },
      buttonsStyling: false,
      confirmButtonText: "Aceptar",
    });
  } catch (e) {
    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;color:#dc2626"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>',
      title: "Error al exportar",
      text: e.message || "Ocurrió un error desconocido al exportar la factura.",
      customClass: {
        icon: "swal-no-border",
        popup: "swal-quote-popup",
        title: "swal-quote-title",
        confirmButton: "swal-quote-confirm",
      },
      buttonsStyling: false,
      confirmButtonText: "Aceptar",
    });
  }
}
function InvoiceInlineStatus({ row, worker, onReload }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef(null);
  const dropRef = useRef(null);

  const ui = getStatusStyle(row.status);

  const transitions = useMemo(() => {
    switch (row.status) {
      case "draft":
        return [
          { to: "pending", label: "Marcar como pendiente" },
          { to: "issued", label: "Marcar como emitida" },
          { to: "cancelled", label: "Cancelar factura" },
        ];
      case "pending":
        return [
          { to: "draft", label: "Volver a borrador" },
          { to: "issued", label: "Marcar como emitida" },
          { to: "paid", label: "Marcar como pagada" },
          { to: "cancelled", label: "Cancelar factura" },
        ];
      case "issued":
        return [
          { to: "pending", label: "Volver a pendiente" },
          { to: "paid", label: "Marcar como pagada" },
          { to: "cancelled", label: "Cancelar factura" },
        ];
      case "cancelled":
        return [
          { to: "draft", label: "Reabrir como borrador" },
          { to: "pending", label: "Reabrir como pendiente" },
        ];
      case "paid":
      default:
        return [];
    }
  }, [row.status]);

  function handleOpen(e) {
    e.stopPropagation();
    if (transitions.length === 0 || loading) return;

    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setDropPos({
        top: rect.bottom + 6,
        left: rect.left,
      });
    }

    setOpen(true);
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (!open) return;
      if (dropRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function updateStatus(nextStatus) {
    setLoading(true);

    try {
      await apiFetch(`/api/invoices/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...row,
          status: nextStatus,
          created_by: row.created_by || worker?.id || null,
          subtotal: Number(row.subtotal || 0),
          tax: Number(row.tax || 0),
          total: Number(row.total || 0),
        }),
      });

      setOpen(false);
      await onReload();
    } catch (e) {
      Swal.fire(
        "Error",
        e.message || "No se pudo actualizar el estado de la factura",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="invInlineStatus">
      <button
        ref={triggerRef}
        type="button"
        className="invInlineStatus__trigger"
        style={{
          background: ui.bg,
          color: ui.color,
          borderColor: ui.border,
          cursor: transitions.length > 0 ? "pointer" : "default",
        }}
        onClick={handleOpen}
        title={transitions.length > 0 ? "Clic para cambiar estado" : ui.label}
        disabled={loading}
      >
        <span
          className="invInlineStatus__dot"
          style={{ background: ui.dot }}
        />
        {ui.label}
        {transitions.length > 0 && (
          <span className="invInlineStatus__caret">▾</span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={dropRef}
            className="invInlineStatus__dropdown"
            style={{ top: dropPos.top, left: dropPos.left }}
          >
            {transitions.map((item) => {
              const itemUi = getStatusStyle(item.to);

              return (
                <button
                  key={item.to}
                  type="button"
                  className="invInlineStatus__option"
                  onClick={() => updateStatus(item.to)}
                  disabled={loading}
                >
                  <span
                    className="invInlineStatus__dot"
                    style={{ background: itemUi.dot }}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
function emptyInvoice(worker) {
  return {
    folio: "",
    client_id: "",
    client_name: "", // solo visual
    quote_id: "",
    service_sheet_id: "",
    delivery_date: "",
    billing_period: "",
    service_location: "",
    subtotal: 0,
    tax: 0,
    total: 0,
    status: "draft",
    notes: "",
    created_by: worker?.id || null,
  };
}

function InvoiceModal({
  open,
  mode,
  form,
  setForm,
  onClose,
  onSave,
  selectedClient,
  setSelectedClient,
  serviceSheets,
  selectedServiceSheet,
  setSelectedServiceSheet,
}) {
  if (!open) return null;

  const readOnly = mode === "view";
  const normalizedForm = {
    ...form,
    id: form?.id ?? "",
    folio: form?.folio ?? "",
    client_id: form?.client_id ?? "",
    client_name: form?.client_name ?? "",
    quote_id: form?.quote_id ?? "",
    service_sheet_id: form?.service_sheet_id ?? "",
    delivery_date: form?.delivery_date ?? "",
    billing_period: form?.billing_period ?? "",
    service_location: form?.service_location ?? "",
    subtotal: form?.subtotal ?? 0,
    tax: form?.tax ?? 0,
    total: form?.total ?? 0,
    status: form?.status ?? "draft",
    notes: form?.notes ?? "",
  };

  const detailStatus = getStatusStyle(normalizedForm.status);

  if (readOnly) {
    return (
      <div className="invModalBack" onMouseDown={onClose}>
        <div
          className="invModal invModal--detail"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="invModalTop invModalTop--detail">
            <div>
              <div className="invModalTitle">Detalle de factura</div>
              <div className="invDetailTopMeta">
                <span>{normalizedForm.folio || "Sin folio"}</span>
                <span>•</span>
                <span>{normalizedForm.client_name || "Sin cliente"}</span>
              </div>
            </div>

            <div className="invDetailHeadActions">
              <button
                className="invIconBtn"
                type="button"
                title="Exportar PDF"
                style={{ color: "#dc2626" }}
                onClick={() => exportInvoice(normalizedForm, "pdf")}
              >
                <TbFileTypePdf size={24} />
              </button>

              <button
                className="invIconBtn"
                type="button"
                title="Exportar Excel"
                style={{ color: "#16a34a" }}
                onClick={() => exportInvoice(normalizedForm, "excel")}
              >
                <TbFileTypeXls size={24} />
              </button>

              <button
                className="invIconBtn"
                type="button"
                title="Exportar XML"
                style={{ color: "#7c3aed" }}
                onClick={() => exportInvoice(normalizedForm, "xml")}
              >
                <TbCode size={24} />
              </button>

              <button
                type="button"
                className="invIconBtn"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar"
              >
                <TbX />
              </button>
            </div>
          </div>

          <div className="invModalBody invModalBody--detail">
            <div className="invDetailHero">
              <div className="invDetailHero__icon">
                <TbFileInvoice />
              </div>

              <div className="invDetailHero__content">
                <div className="invDetailHero__folio">
                  {normalizedForm.folio || "Factura sin folio"}
                </div>
                <div className="invDetailHero__client">
                  {normalizedForm.client_name || "Sin cliente asignado"}
                </div>
                <div className="invDetailHero__meta">
                  <span>Entrega: {formatDate(normalizedForm.delivery_date)}</span>
                  <span>Ubicación: {normalizedForm.service_location || "—"}</span>
                </div>
              </div>

              <div
                className="invDetailStatusPill"
                style={{
                  background: detailStatus.bg,
                  color: detailStatus.color,
                  borderColor: detailStatus.border,
                }}
              >
                <span
                  className="invDetailStatusPill__dot"
                  style={{ background: detailStatus.dot }}
                />
                {detailStatus.label}
              </div>
            </div>

            <div className="invDetailGrid">
              <div className="invDetailCard">
                <div className="invDetailCard__title">Información general</div>

                <div className="invDetailInfoList">
                  <div className="invDetailInfoItem">
                    <span>Folio</span>
                    <strong>{normalizedForm.folio || "Sin folio"}</strong>
                  </div>

                  <div className="invDetailInfoItem">
                    <span>Cliente</span>
                    <strong>{normalizedForm.client_name || "Sin cliente"}</strong>
                  </div>

                  <div className="invDetailInfoItem">
                    <span>Hoja de servicio</span>
                    <strong>
                      {selectedServiceSheet
                        ? `${selectedServiceSheet.client_name || "Servicio"} · ${selectedServiceSheet.service_type || "Sin tipo"}`
                        : "Sin hoja vinculada"}
                    </strong>
                  </div>

                  <div className="invDetailInfoItem">
                    <span>Fecha de entrega</span>
                    <strong>{formatDate(normalizedForm.delivery_date)}</strong>
                  </div>

                  <div className="invDetailInfoItem">
                    <span>Periodo de facturación</span>
                    <strong>{normalizedForm.billing_period || "—"}</strong>
                  </div>

                  <div className="invDetailInfoItem">
                    <span>Ubicación del servicio</span>
                    <strong>{normalizedForm.service_location || "—"}</strong>
                  </div>
                </div>
              </div>

              <div className="invDetailCard">
                <div className="invDetailCard__title">Resumen financiero</div>

                <div className="invDetailTotals">
                  <div className="invDetailTotals__row">
                    <span>Subtotal</span>
                    <strong>{formatCurrency(normalizedForm.subtotal)}</strong>
                  </div>

                  <div className="invDetailTotals__row">
                    <span>Impuesto</span>
                    <strong>{formatCurrency(normalizedForm.tax)}</strong>
                  </div>

                  <div className="invDetailTotals__row is-total">
                    <span>Total</span>
                    <strong>{formatCurrency(normalizedForm.total)}</strong>
                  </div>
                </div>
              </div>

              <div className="invDetailCard invDetailCard--full">
                <div className="invDetailCard__title">Notas</div>
                <div className="invDetailNotes">
                  {normalizedForm.notes || "Sin observaciones"}
                </div>
              </div>
            </div>
          </div>

          <div className="invModalActions">
            <button type="button" className="invBtn invBtnGhost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="invModalBack" onMouseDown={onClose}>
      <div
        className="invModal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="invModalTop">
          <div className="invModalTitle">
            {mode === "create" && "Nueva factura"}
            {mode === "edit" && "Editar factura"}
          </div>

          <button
            type="button"
            className="invIconBtn"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
          >
            <TbX />
          </button>
        </div>

        <div className="invModalBody">
          <div className="invFormGrid">
            <div className="invField">
              <label>Folio</label>
              <input
                className="invInput"
                value={normalizedForm.folio}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, folio: e.target.value }))
                }
                placeholder="Ej. FAC-2026-001"
              />
            </div>

            <div className="invField">
              <label>Cliente</label>
              <ClientSelectPro
                value={normalizedForm.client_id}
                selectedClient={selectedClient}
                onSelect={(client) => {
                  if (!client) {
                    setSelectedClient(null);
                    setSelectedServiceSheet(null);
                    setForm((prev) => ({
                      ...prev,
                      client_id: "",
                      client_name: "",
                      service_sheet_id: "",
                    }));
                    return;
                  }

                  setSelectedClient(client);
                  setForm((prev) => ({
                    ...prev,
                    client_id: client.id,
                    client_name: client.name || "",
                  }));
                }}
                placeholder="Buscar cliente por nombre..."
              />
            </div>

            <div className="invField">
              <label>Hoja de servicio</label>

              {normalizedForm.service_sheet_id && (
                <div className="invLinkedBadge">
                  Factura generada desde hoja de servicio
                </div>
              )}

              <select
                className="invInput"
                value={normalizedForm.service_sheet_id}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const sheet =
                    serviceSheets.find((item) => item.id === nextId) || null;

                  if (!sheet) {
                    setSelectedServiceSheet(null);
                    setForm((prev) => ({
                      ...prev,
                      service_sheet_id: "",
                    }));
                    return;
                  }

                  setSelectedServiceSheet(sheet);
                  setSelectedClient(
                    sheet.client_id
                      ? {
                          id: sheet.client_id,
                          name: sheet.client_name || "",
                        }
                      : null
                  );

                  setForm((prev) => {
                    const base = Number(sheet.total_price || 0);
                    const autoTax = Number((base * 0.16).toFixed(2));
                    const autoTotal = Number((base + autoTax).toFixed(2));

                    return {
                      ...prev,
                      service_sheet_id: sheet.id,
                      client_id: sheet.client_id || prev.client_id || "",
                      client_name: sheet.client_name || prev.client_name || "",
                      delivery_date: sheet.delivery_date || prev.delivery_date || "",
                      service_location: sheet.location || prev.service_location || "",
                      subtotal: base,
                      tax: autoTax,
                      total: autoTotal,
                    };
                  });
                }}
              >
                <option value="">Seleccionar hoja de servicio</option>
                {serviceSheets
                  .filter((sheet) => {
                    if (!normalizedForm.client_id) return true;
                    return sheet.client_id === normalizedForm.client_id;
                  })
                  .map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {(sheet.client_name || "Sin cliente") +
                        " · " +
                        (sheet.service_type || "Sin tipo") +
                        " · " +
                        (sheet.location || "Sin ubicación")}
                    </option>
                  ))}
              </select>
            </div>

            <div className="invField">
              <label>Fecha de entrega</label>
              <input
                className="invInput"
                type="date"
                value={normalizedForm.delivery_date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, delivery_date: e.target.value }))
                }
              />
            </div>

            <div className="invField">
              <label>Periodo de facturación</label>
              <input
                className="invInput"
                value={normalizedForm.billing_period}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, billing_period: e.target.value }))
                }
                placeholder="Ej. Semanal / Mensual / 19 al 24 Ene"
              />
            </div>

            <div className="invField">
              <label>Ubicación del servicio</label>
              <input
                className="invInput"
                value={normalizedForm.service_location}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, service_location: e.target.value }))
                }
                placeholder="Ubicación o ruta"
              />
            </div>

            <div className="invField">
              <label>Estado</label>
              <select
                className="invInput"
                value={normalizedForm.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value }))
                }
              >
                {STATUS_OPTIONS.filter((x) => x.value !== "all").map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="invField">
              <label>Subtotal</label>
              <input
                className="invInput"
                type="number"
                step="0.01"
                value={normalizedForm.subtotal}
                readOnly={!!normalizedForm.service_sheet_id}
                onChange={(e) =>
                  setForm((prev) => {
                    const nextSubtotal = Number(e.target.value || 0);
                    const nextTax = Number(prev.tax || 0);

                    return {
                      ...prev,
                      subtotal: e.target.value,
                      total: Number((nextSubtotal + nextTax).toFixed(2)),
                    };
                  })
                }
                placeholder="0.00"
              />
            </div>

            <div className="invField">
              <label>Impuesto</label>
              <input
                className="invInput"
                type="number"
                step="0.01"
                value={normalizedForm.tax}
                onChange={(e) =>
                  setForm((prev) => {
                    const nextTax = Number(e.target.value || 0);
                    const nextSubtotal = Number(prev.subtotal || 0);

                    return {
                      ...prev,
                      tax: e.target.value,
                      total: Number((nextSubtotal + nextTax).toFixed(2)),
                    };
                  })
                }
                placeholder="0.00"
              />
            </div>

            <div className="invField">
              <label>Total</label>
              <input
                className="invInput"
                type="number"
                step="0.01"
                value={normalizedForm.total}
                readOnly
                placeholder="0.00"
              />
            </div>

            <div className="invField invField--span2">
              <label>Notas</label>
              <textarea
                className="invTextarea"
                value={normalizedForm.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Observaciones, condiciones, comentarios..."
              />
            </div>
          </div>
        </div>

        <div className="invModalActions">
          <button type="button" className="invBtn invBtnGhost" onClick={onClose}>
            Cerrar
          </button>

          <button type="button" className="invBtn invBtnPrimary" onClick={onSave}>
            Guardar factura
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesModule({ currentWorker }) {
  const worker = currentWorker || null;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyInvoice(worker));
  const [selectedClient, setSelectedClient] = useState(null);
  const [serviceSheets, setServiceSheets] = useState([]);
  const [selectedServiceSheet, setSelectedServiceSheet] = useState(null);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());

      const resp = await apiFetch(`/api/invoices?${params.toString()}`);
      setRows(resp?.data || []);
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudieron cargar las facturas", "error");
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  const loadServiceSheets = useCallback(async () => {
    try {
      const resp = await apiFetch("/api/service-sheets?status=all");
      setServiceSheets(resp?.data || []);
    } catch (e) {
      console.error("Error cargando hojas de servicio:", e);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    loadServiceSheets();
  }, [loadServiceSheets]);

  function openCreate() {
    setModalMode("create");
    setEditingId(null);
    setSelectedClient(null);
    setSelectedServiceSheet(null);
    setForm(emptyInvoice(worker));
    setModalOpen(true);
  }

  function openView(row) {
    setModalMode("view");
    setEditingId(row.id);
    setSelectedClient(
      row?.client_id
        ? {
            id: row.client_id,
            name: row.client_name || "",
          }
        : null
    );
    setSelectedServiceSheet(
      row?.service_sheet_id
        ? serviceSheets.find((item) => item.id === row.service_sheet_id) || null
        : null
    );
    setForm({
      ...emptyInvoice(worker),
      ...row,
      subtotal: Number(row.subtotal || 0),
      tax: Number(row.tax || 0),
      total: Number(row.total || 0),
    });
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
    setSelectedServiceSheet(
      row?.service_sheet_id
        ? serviceSheets.find((item) => item.id === row.service_sheet_id) || null
        : null
    );
    setForm({
      ...emptyInvoice(worker),
      ...row,
      subtotal: Number(row.subtotal || 0),
      tax: Number(row.tax || 0),
      total: Number(row.total || 0),
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setSelectedClient(null);
    setSelectedServiceSheet(null);
    setForm(emptyInvoice(worker));
  }

  async function saveInvoice() {
    if (!form.client_id) {
      Swal.fire("Falta cliente", "Selecciona un cliente válido.", "warning");
      return;
    }

    const safeSubtotal = Number(form.subtotal || 0);
    const safeTax = Number(form.tax || 0);
    const safeTotal = Number((safeSubtotal + safeTax).toFixed(2));

    const payload = {
      ...form,
      client_id: form.client_id,
      client_name: form.client_name || selectedClient?.name || "",
      service_sheet_id: form.service_sheet_id || null,
      created_by: worker?.id || null,
      subtotal: safeSubtotal,
      tax: safeTax,
      total: safeTotal,
    };

    try {
      if (modalMode === "edit" && editingId) {
        await apiFetch(`/api/invoices/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/invoices`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      closeModal();
      await loadInvoices();

      Swal.fire(
        "Guardado",
        modalMode === "edit"
          ? "La factura fue actualizada correctamente."
          : "La factura fue creada correctamente.",
        "success"
      );
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo guardar la factura", "error");
    }
  }

  async function deleteInvoice(row) {
    const result = await Swal.fire({
      title: "¿Eliminar factura?",
      text: `Se eliminará ${row.folio || "la factura seleccionada"}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    try {
      await apiFetch(`/api/invoices/${row.id}`, {
        method: "DELETE",
      });

      await loadInvoices();

      Swal.fire("Eliminada", "La factura fue eliminada correctamente.", "success");
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo eliminar la factura", "error");
    }
  }

  const kpis = useMemo(() => {
    const totalInvoices = rows.length;
    const totalAmount = rows.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const paidAmount = rows
      .filter((item) => item.status === "paid")
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
    const pendingCount = rows.filter(
      (item) => item.status === "pending" || item.status === "issued"
    ).length;

    return {
      totalInvoices,
      totalAmount,
      paidAmount,
      pendingCount,
    };
  }, [rows]);

  return (
    <div className="invWrap">
      <div className="invTopbar">
        <div>
          <h1 className="invTitle">
            <TbReceipt2 />
            Facturación
          </h1>
          <p className="invSub">
            Gestión de facturas, periodos de cobro y seguimiento de pagos
          </p>
        </div>

        <div className="invTopActions">
          <button
            type="button"
            className="invBtn invBtnGhost"
            onClick={loadInvoices}
            title="Recargar"
          >
            <TbRefresh />
            Recargar
          </button>

          <button
            type="button"
            className="invBtn invBtnPrimary"
            onClick={openCreate}
          >
            <TbPlus />
            Nueva factura
          </button>
        </div>
      </div>

      <div className="invKpis">
        <div className="invKpiCard">
          <div className="invKpiLabel">Facturas</div>
          <div className="invKpiValue">{kpis.totalInvoices}</div>
        </div>

        <div className="invKpiCard">
          <div className="invKpiLabel">Monto total</div>
          <div className="invKpiValue">{formatCurrency(kpis.totalAmount)}</div>
        </div>

        <div className="invKpiCard">
          <div className="invKpiLabel">Pagado</div>
          <div className="invKpiValue">{formatCurrency(kpis.paidAmount)}</div>
        </div>

        <div className="invKpiCard">
          <div className="invKpiLabel">Pendientes</div>
          <div className="invKpiValue">{kpis.pendingCount}</div>
        </div>
      </div>

      <div className="invFilters">
        <div className="invSearch">
          <TbSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por folio, cliente o ubicación..."
          />
        </div>

        <select
          className="invSelect"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="invCard">
        <div className="invTableWrap">
          <table className="invTable">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Entrega</th>
                <th>Periodo</th>
                <th>Ubicación</th>
                <th>Total</th>
                <th>Estado</th>
                <th className="invThRight">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="invEmpty">
                    Cargando facturas...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="invEmpty">
                    No hay facturas registradas.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="invPrimaryCell">
                          <div className="invPrimaryIcon">
                            <TbFileInvoice />
                          </div>
                          <div>
                            <div className="invPrimaryTitle">
                              {row.folio || "Sin folio"}
                            </div>
                            <div className="invPrimarySub">
                              {formatDate(row.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="invInlineMeta">
                          <TbUser />
                          <span>{row.client_name || "—"}</span>
                        </div>
                      </td>

                      <td>
                        <div className="invInlineMeta">
                          <TbCalendarEvent />
                          <span>{formatDate(row.delivery_date)}</span>
                        </div>
                      </td>

                      <td>{row.billing_period || "—"}</td>

                      <td>
                        <div className="invInlineMeta">
                          <TbMapPin />
                          <span>{row.service_location || "—"}</span>
                        </div>
                      </td>

                      <td>
                        <div className="invMoneyCell">
                          <TbCurrencyDollar />
                          <span>{formatCurrency(row.total)}</span>
                        </div>
                      </td>

                        <td>
                        <InvoiceInlineStatus
                          row={row}
                          worker={worker}
                          onReload={loadInvoices}
                        />
                      </td>
                      <td className="invTdRight">
                        <div className="invActions">
                          <button
                            type="button"
                            className="invIconBtn"
                            onClick={() => openView(row)}
                            title="Ver detalle"
                          >
                            <TbEye />
                          </button>

                          <button
                            type="button"
                            className="invIconBtn"
                            onClick={() => openEdit(row)}
                            title="Editar"
                          >
                            <TbEdit />
                          </button>

                          <button
                            type="button"
                            className="invIconBtn invIconBtnDanger"
                            onClick={() => deleteInvoice(row)}
                            title="Eliminar"
                          >
                            <TbTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InvoiceModal
        open={modalOpen}
        mode={modalMode}
        form={form}
        setForm={setForm}
        onClose={closeModal}
        onSave={saveInvoice}
        selectedClient={selectedClient}
        setSelectedClient={setSelectedClient}
        serviceSheets={serviceSheets}
        selectedServiceSheet={selectedServiceSheet}
        setSelectedServiceSheet={setSelectedServiceSheet}
      />
    </div>
  );
}