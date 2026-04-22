import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  TbSearch,
  TbUsers,
  TbPlus,
  TbBuilding,
  TbMail,
  TbPhone,
  TbMapPin,
  TbX,
} from "react-icons/tb";
import Swal from "sweetalert2";
import { apiFetch } from "../api";

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

export default function ClientSelectPro({
  worker,
  value,
  onChange,
  placeholder = "Buscar cliente por nombre, empresa o RFC...",
}) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuery(value?.name || "");
  }, [value?.id, value?.name]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const text = String(query || "").trim();

    if (!open && !creating) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (text) params.set("q", text);
        const resp = await apiFetch(`/api/clients?${params.toString()}`);
        setOptions(resp?.data || []);
      } catch (e) {
        console.error(e);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, open, creating]);

  const normalizedOptions = useMemo(() => options || [], [options]);

  function selectClient(client) {
    onChange?.(client || null);
    setQuery(client?.name || "");
    setOpen(false);
    setCreating(false);
  }

  async function handleCreateClient() {
    if (!form.name.trim()) {
      Swal.fire("Falta el nombre", "El nombre del cliente es obligatorio.", "warning");
      return;
    }

    setSaving(true);
    try {
      const resp = await apiFetch("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          worker_id: worker?.id || null,
          ...form,
        }),
      });

      const created = resp?.data || null;
      if (created) {
        selectClient(created);
        setForm(EMPTY_FORM);
      }
    } catch (e) {
      Swal.fire("Error", e.message || "No se pudo crear el cliente", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="csp-root" ref={rootRef}>
      <div className={`csp-box ${open ? "is-open" : ""}`}>
        <TbSearch size={16} className="csp-icon" />
        <input
          className="csp-input"
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setCreating(false);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value?.id) onChange?.(null);
          }}
        />
        {value?.id && (
          <button
            type="button"
            className="csp-clear"
            onClick={() => {
              onChange?.(null);
              setQuery("");
              setOpen(true);
            }}
          >
            <TbX size={14} />
          </button>
        )}
      </div>

      {open && !creating && (
        <div className="csp-dropdown">
          <div className="csp-head">
            <div className="csp-head-title">
              <TbUsers size={14} />
              Clientes
            </div>
            <button
              type="button"
              className="csp-new"
              onClick={() => {
                setCreating(true);
                setForm((prev) => ({ ...prev, name: query || prev.name }));
              }}
            >
              <TbPlus size={14} />
              Nuevo cliente
            </button>
          </div>

          <div className="csp-list">
            {loading ? (
              <div className="csp-empty">Buscando clientes...</div>
            ) : normalizedOptions.length === 0 ? (
              <div className="csp-empty">No hay resultados</div>
            ) : (
              normalizedOptions.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="csp-option"
                  onClick={() => selectClient(client)}
                >
                  <div className="csp-option-main">
                    <div className="csp-avatar">
                      {(client.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="csp-meta">
                      <div className="csp-name">{client.name || "Sin nombre"}</div>
                      <div className="csp-sub">
                        {[client.company, client.rfc, client.email].filter(Boolean).join(" · ") || "Sin información adicional"}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {open && creating && (
        <div className="csp-dropdown csp-dropdown--form">
          <div className="csp-head">
            <div className="csp-head-title">
              <TbPlus size={14} />
              Nuevo cliente
            </div>
            <button
              type="button"
              className="csp-back"
              onClick={() => setCreating(false)}
            >
              Volver
            </button>
          </div>

          <div className="csp-form-grid">
            <label className="csp-field">
              <span>Nombre *</span>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nombre completo del cliente"
              />
            </label>

            <label className="csp-field">
              <span>Empresa</span>
              <input
                value={form.company}
                onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                placeholder="Razón social"
              />
            </label>

            <label className="csp-field">
              <span>RFC</span>
              <input
                value={form.rfc}
                onChange={(e) => setForm((p) => ({ ...p, rfc: e.target.value.toUpperCase() }))}
                placeholder="RFC"
              />
            </label>

            <label className="csp-field">
              <span>Teléfono</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="(000) 000-0000"
              />
            </label>

            <label className="csp-field">
              <span>Email</span>
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="correo@empresa.com"
              />
            </label>

            <label className="csp-field">
              <span>Dirección</span>
              <input
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Calle, colonia, ciudad"
              />
            </label>

            <label className="csp-field csp-field--full">
              <span>Notas</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Observaciones del cliente..."
              />
            </label>
          </div>

          <div className="csp-actions">
            <button type="button" className="csp-btn" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="csp-btn csp-btn--primary"
              onClick={handleCreateClient}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Crear cliente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}