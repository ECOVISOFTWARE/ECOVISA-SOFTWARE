import React, { useEffect, useRef, useState } from "react";
import { TbSearch, TbUser, TbChevronDown, TbX } from "react-icons/tb";
import { apiFetch } from "../api";

export default function ClientSelectPro({
  value = "",
  selectedClient = null,
  onSelect,
  placeholder = "Buscar cliente por nombre...",
  disabled = false,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(selectedClient?.name || "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    setQ(selectedClient?.name || "");
  }, [selectedClient?.id, selectedClient?.name]);

  useEffect(() => {
    function handleOutside(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

useEffect(() => {
    if (!open) return;
    const text = String(q || "").trim();

    // Sin texto → carga inmediata todos los clientes; con texto → debounce 220ms
    const delay = text ? 220 : 0;

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = text ? `?q=${encodeURIComponent(text)}` : "";
        const resp = await apiFetch(`/api/clients${qs}`);
        setResults(resp?.data || []);
      } catch (_) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [q, open]);

  function handlePick(client) {
    setQ(client?.name || "");
    setOpen(false);
    onSelect?.(client);
  }

  function handleClear() {
    setQ("");
    setResults([]);
    setOpen(false);
    onSelect?.(null);
    inputRef.current?.focus();
  }

  return (
    <div className="clientPro" ref={rootRef}>
      <div
        className={`clientPro-control ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <TbSearch className="clientPro-searchIcon" />

        <input
          ref={inputRef}
          className="clientPro-input"
          value={q}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />

        {value ? (
          <button
            type="button"
            className="clientPro-clear"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            title="Limpiar cliente"
            aria-label="Limpiar cliente"
          >
            <TbX />
          </button>
        ) : (
          <TbChevronDown className="clientPro-caret" />
        )}
      </div>

      {open && !disabled && (
        <div className="clientPro-menu">
          {loading ? (
            <div className="clientPro-state">Buscando clientes...</div>
) : results.length === 0 ? (
            <div className="clientPro-state">
              {String(q || "").trim() ? "Sin resultados para esa búsqueda" : "Sin clientes registrados"}
            </div>
          ) : (
            results.map((client) => (
              <button
                key={client.id}
                type="button"
                className="clientPro-option"
                onClick={() => handlePick(client)}
              >
                <div className="clientPro-optionIcon">
                  <TbUser />
                </div>

                <div className="clientPro-optionText">
                  <div className="clientPro-optionTitle">{client.name || "Sin nombre"}</div>
                  <div className="clientPro-optionMeta">
                    {[client.company, client.phone, client.email].filter(Boolean).join(" · ") || "Sin datos extra"}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}