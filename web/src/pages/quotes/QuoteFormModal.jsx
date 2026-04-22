import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  TbX, TbPlus, TbTrash, TbUser, TbSearch,
  TbPackage, TbTool, TbFileInvoice, TbCurrencyDollar,
  TbCalendar, TbChevronDown,
} from 'react-icons/tb';
import Swal from 'sweetalert2';
import { apiFetch } from '../../api';
import ProSelect from '../../components/ProSelect/ProSelect';
import ClientSelectPro from '../../components/ClientSelectPro';
import MiniDatePicker from './MiniDatePicker';
import {
  createEmptyItem, calculateTotals, calculateItemAmount, formatCurrency,
  titleCaseLive,
} from './quotes.helpers';
import { CURRENCIES, TAX_RATES, UNIT_OPTIONS } from './quotes.constants';

/* ══════════════════════════════════════════════
   PRODUCT / SERVICE PICKER — via Portal
══════════════════════════════════════════════ */
function ProductPicker({ anchorEl, onSelect, onClose }) {
  const [tab,     setTab]     = useState('product');
  const [q,       setQ]       = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pos,     setPos]     = useState({ top: 0, left: 0, width: 320 });
  const dropRef = useRef(null);

// Centrado en pantalla
  useEffect(() => {
    const w = Math.min(360, window.innerWidth - 32);
    setPos({
      top:   Math.max(80, (window.innerHeight - 380) / 2),
      left:  (window.innerWidth - w) / 2,
      width: w,
    });
  }, [anchorEl]);

  // Search
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        let data = [];
        if (tab === 'product') {
          const resp = await apiFetch(
            `/api/inventory/products?q=${encodeURIComponent(q)}&limit=20`
          ).catch(() => null);
          data = resp?.data || resp?.products || [];
        } else {
          const resp = await apiFetch(
            `/api/services?q=${encodeURIComponent(q)}&limit=20`
          ).catch(() => null);
          data = resp?.data || [];
        }
        setResults(data);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [q, tab]);

  useEffect(() => { setResults([]); setQ(''); }, [tab]);

  const getName  = it => it.name || it.product_name || it.service_name || it.title || '—';
  const getSku   = it => it.sku  || it.serial_number || it.code || it.service_code || '';
  const getUnit  = it => it.unit || (tab === 'service' ? 'servicio' : 'pieza');

  return createPortal(
    <>
      {/* Overlay */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
        onMouseDown={onClose}
      />
      {/* Picker */}
      <div
        ref={dropRef}
        style={{
          position:  'fixed',
          top:       pos.top,
          left:      pos.left,
          width:     pos.width,
          zIndex:    99999,
          background: '#fff',
          border:    '1px solid #e2e8f0',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(15,23,42,0.22)',
          overflow:  'hidden',
          animation: 'qtPopIn 160ms ease',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
          {[
            { key: 'product', icon: <TbPackage size={13} />, label: 'Productos' },
            { key: 'service', icon: <TbTool     size={13} />, label: 'Servicios' },
          ].map(t => (
            <button
              key={t.key} type="button"
              style={{
                flex: 1, border: 0, padding: '11px 0',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'transparent',
                color:       tab === t.key ? '#2563eb' : '#94a3b8',
                borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'color 120ms, border-color 120ms',
              }}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderBottom: '1px solid #f1f5f9',
        }}>
          <TbSearch size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            autoFocus
            style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#0f172a', width: '100%' }}
            placeholder={tab === 'product' ? 'Nombre, SKU o número de serie...' : 'Nombre o código de servicio...'}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {/* Results */}
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
              Buscando...
            </div>
          )}
          {!loading && !q.trim() && (
            <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
              Escribe para buscar {tab === 'product' ? 'productos' : 'servicios'}
            </div>
          )}
          {!loading && q.trim() && results.length === 0 && (
            <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
              {tab === 'service'
                ? '📦 Módulo de servicios próximamente'
                : `Sin resultados para "${q}"`}
            </div>
          )}
          {results.map((item, idx) => (
            <button
              key={item.id || idx}
              type="button"
              style={{
                width: '100%', border: 0, background: 'transparent',
                padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 12, borderBottom: '1px solid #f8fafc', transition: 'background 100ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => onSelect({
                name:       getName(item),
                unit:       getUnit(item),
                product_id: item.id || null,
              })}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getName(item)}
                </div>
                {getSku(item) && (
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, fontFamily: 'monospace', marginTop: 2 }}>
                    {tab === 'product' ? 'SKU' : 'Cód'}: {getSku(item)}
                    {item.unit ? ` · ${item.unit}` : ''}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {tab === 'product' ? 'Producto' : 'Servicio'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

/* ══════════════════════════════════════════════
   MAIN MODAL
══════════════════════════════════════════════ */
export default function QuoteFormModal({ quote, worker, onClose, onSaved }) {
const [form, setForm] = useState({
    title: '', client_id: '',
    notes: '',
    terms: 'Precios sujetos a cambio sin previo aviso. Vigencia: 15 días.',
    currency: 'MXN', tax_rate: 16, discount_amount: 0, valid_until: '',
    intro_text:         '',
    service_checklist:  '',
    price_notes:        '',
    closing_text:       'Sin más por el momento y en espera de poder servirles, quedamos a sus órdenes.',
    signer_name:        '',
    signer_title:       '',
    signer_phone:       '',
  });
  const [items,   setItems]   = useState([createEmptyItem(0)]);
  const [totals,  setTotals]  = useState({ subtotal: 0, taxAmount: 0, total: 0 });
  const [isDirty, setIsDirty] = useState(false);
  const [closing, setClosing] = useState(false);

  const [selectedClient, setSelectedClient] = useState(null);

  const [pickerOpenFor,  setPickerOpenFor]  = useState(null);
  const [pickerAnchor,   setPickerAnchor]   = useState(null);
  const [saving, setSaving] = useState(false);

  const pickerBtnRefs = useRef({});

  /* ── init ── */
useEffect(() => {
    if (!quote) return;
    setForm({
      title:             quote.title             || '',
      client_id:         quote.client_id         || '',
      notes:             quote.notes             || '',
      terms:             quote.terms             || '',
      currency:          quote.currency          || 'MXN',
      tax_rate:          quote.tax_rate          ?? 16,
      discount_amount:   quote.discount_amount   || 0,
      valid_until:       quote.valid_until       || '',
      intro_text:        quote.intro_text        || '',
      service_checklist: quote.service_checklist || '',
      price_notes:       quote.price_notes       || '',
      closing_text:      quote.closing_text      || 'Sin más por el momento y en espera de poder servirles, quedamos a sus órdenes.',
      signer_name:       quote.signer_name       || '',
      signer_title:      quote.signer_title      || '',
      signer_phone:      quote.signer_phone      || '',
    });
    if (quote.items?.length)
      setItems(quote.items.map((it, i) => ({ ...it, _id: it.id || `item_${i}` })));
    if (quote.client) setSelectedClient(quote.client);
    setIsDirty(false);
  }, [quote]);

  /* ── totals ── */
  useEffect(() => {
    setTotals(calculateTotals(items, form.tax_rate, form.discount_amount));
  }, [items, form.tax_rate, form.discount_amount]);

  /* ── helpers ── */
  function patchForm(patch) { setForm(p => ({ ...p, ...patch })); setIsDirty(true); }
  function patchItem(id, patch) {
    setItems(prev => prev.map(it => {
      if (it._id !== id) return it;
      const u = { ...it, ...patch };
      u.amount = calculateItemAmount(u);
      return u;
    }));
    setIsDirty(true);
  }

  const addItem    = useCallback(() => { setItems(p => [...p, createEmptyItem(p.length)]); setIsDirty(true); }, []);
  const removeItem = useCallback(id => { setItems(p => p.filter(it => it._id !== id)); setIsDirty(true); }, []);

function fillFromProduct(itemId, product) {
    patchItem(itemId, {
      description: product.name       || '',
      unit:        product.unit       || 'pieza',
      quantity:    product.quantity   || 1,
      product_id:  product.product_id || product.id || null,
    });
    setPickerOpenFor(null);
    setPickerAnchor(null);
  }

  function openPicker(itemId) {
    if (pickerOpenFor === itemId) { setPickerOpenFor(null); setPickerAnchor(null); return; }
    setPickerAnchor(pickerBtnRefs.current[itemId] || null);
    setPickerOpenFor(itemId);
  }

  /* ── animated close ── */
  async function doClose() {
    setClosing(true);
    await new Promise(r => setTimeout(r, 180));
    setClosing(false);
    onClose();
  }

  async function handleClose() {
    if (!isDirty) { doClose(); return; }
const res = await Swal.fire({
      title: '¿Salir sin guardar?',
      text: 'Si cierras ahora, los cambios no guardados se perderán.',
     iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#fff7ed;border:2px solid #fed7aa;display:flex;align-items:center;justify-content:center;color:#f97316"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>',
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
        htmlContainer: 'swal-quote-text',
        confirmButton: 'swal-quote-cancel',
        cancelButton: 'swal-quote-confirm',
      },
      buttonsStyling: false,
      showCancelButton: true,
      confirmButtonText: 'Sí, cerrar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });
    if (res.isConfirmed) doClose();
  }

  /* ── save ── */
  async function handleSave() {
    if (!form.title.trim()) {
      Swal.fire({ icon: 'error', title: 'Falta el título', text: 'Escribe un título para la cotización.', confirmButtonColor: '#2563eb' });
      return;
    }
    if (!items.some(it => it.description.trim())) {
      Swal.fire({ icon: 'error', title: 'Sin conceptos', text: 'Agrega al menos un concepto.', confirmButtonColor: '#2563eb' });
      return;
    }
    const isEdit = Boolean(quote?.id);
const confirm = await Swal.fire({
      title: isEdit ? '¿Guardar cambios?' : '¿Crear cotización?',
      text:  isEdit ? `Actualizarás "${form.title}".` : `Crearás la cotización "${form.title}".`,
      iconHtml: isEdit
? '<div style="width:56px;height:56px;border-radius:50%;background:#eff6ff;border:2px solid #bfdbfe;display:flex;align-items:center;justify-content:center;color:#2563eb"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>'
        : '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #bbf7d0;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>',
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
        htmlContainer: 'swal-quote-text',
        confirmButton: 'swal-quote-confirm',
        cancelButton: 'swal-quote-cancel',
      },
      buttonsStyling: false,
      showCancelButton: true,
      confirmButtonText: isEdit ? 'Guardar cambios' : 'Crear cotización',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    setSaving(true);
    try {
      const payload = {
        worker_id: worker.id,
        ...form,
        client_id: form.client_id || selectedClient?.id || null,
        discount_amount: Number(form.discount_amount) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        items: items.filter(it => it.description.trim()),
      };
      const resp = isEdit
        ? await apiFetch(`/api/quotes/${quote.id}`, { method: 'PUT',  body: JSON.stringify(payload) })
        : await apiFetch('/api/quotes',              { method: 'POST', body: JSON.stringify(payload) });
      if (resp?.error) throw new Error(resp.error);
      setIsDirty(false);
      onSaved(resp?.data);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Error al guardar', text: e.message || 'Error inesperado.', confirmButtonColor: '#dc2626' });
    } finally { setSaving(false); }
  }

  /* ── derived ── */
  const clientName = selectedClient?.name || '';

  return (
    <>
      <style>{`
        @keyframes qtBackIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes qtBackOut { from { opacity:1; } to { opacity:0; } }
        @keyframes qtPopIn   { from { opacity:0; transform: scale(.94) translateY(16px); } to { opacity:1; transform: scale(1) translateY(0); } }
        @keyframes qtPopOut  { from { opacity:1; transform: scale(1)  translateY(0);    } to { opacity:0; transform: scale(.94) translateY(16px); } }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(2,6,23,0.52)',
          display: 'grid', placeItems: 'center',
          padding: 16,
          animation: `${closing ? 'qtBackOut' : 'qtBackIn'} 180ms ease`,
        }}
        onMouseDown={handleClose}
      >
        {/* Modal */}
        <div
          style={{
            width: 'min(1020px, 100%)',
            maxHeight: 'min(92vh, 880px)',
            background: '#fff',
            borderRadius: 22,
            border: '1px solid #e2e8f0',
            boxShadow: '0 32px 100px rgba(2,6,23,0.28)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            animation: `${closing ? 'qtPopOut' : 'qtPopIn'} 200ms cubic-bezier(.2,.8,.2,1)`,
            zIndex: 9001,
          }}
          onMouseDown={e => e.stopPropagation()}
        >

          {/* ── HEAD ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '18px 24px',
            borderBottom: '1px solid #f1f5f9',
            background: 'linear-gradient(180deg,#f8fbff 0%,#fff 100%)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                display: 'grid', placeItems: 'center', color: '#fff',
                boxShadow: '0 8px 20px rgba(37,99,235,0.28)',
              }}>
                <TbFileInvoice size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a', letterSpacing: '-0.03em' }}>
                  {quote ? 'Editar cotización' : 'Nueva cotización'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                  {quote ? `Folio: ${quote.folio || '—'}` : 'Completa los datos para crear la cotización'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isDirty && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#d97706',
                  background: '#fffbeb', border: '1px solid #fbbf24',
                  borderRadius: 999, padding: '3px 10px',
                }}>
                  Sin guardar
                </span>
              )}
              <button
                type="button"
                onClick={handleClose}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}
              >
                <TbX size={16} />
              </button>
            </div>
          </div>

          {/* ── BODY (2 columns) ── */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

            {/* LEFT — main form */}
            <div style={{ flex: 1, minWidth: 0, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

              {/* SECCIÓN: CLIENTE */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'grid', placeItems: 'center', color: '#2563eb' }}>
                    <TbUser size={14} />
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Cliente</span>
                </div>

                <ClientSelectPro
                  worker={worker}
                  value={selectedClient}
                  onChange={(client) => {
                    setSelectedClient(client || null);
                    patchForm({ client_id: client?.id || "" });
                  }}
                />
              </div>

              {/* SECCIÓN: DETALLES */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f0fdf4', display: 'grid', placeItems: 'center', color: '#16a34a' }}>
                    <TbFileInvoice size={14} />
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Detalles</span>
                </div>
                <div className="qt-form-grid">
                  <div className="qt-field span2">
                    <label className="qt-label">Título *</label>
<input className="qt-input" placeholder="Describe el servicio o producto cotizado"
                      value={form.title}
                      onChange={e => patchForm({ title: titleCaseLive(e.target.value) })}
                    />
                  </div>
                  <div className="qt-field">
                    <MiniDatePicker label="Válida hasta" value={form.valid_until}
                      onChange={v => patchForm({ valid_until: v })}
                      placeholder="Seleccionar fecha de vencimiento"
                    />
                  </div>
                  <div className="qt-field">
                    <label className="qt-label">Moneda</label>
                    <ProSelect value={form.currency} onChange={e => patchForm({ currency: e.target.value })} ariaLabel="Moneda">
                      {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </ProSelect>
                  </div>
                </div>
              </div>

              {/* SECCIÓN: CONCEPTOS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#faf5ff', display: 'grid', placeItems: 'center', color: '#7c3aed' }}>
                      <TbPackage size={14} />
                    </div>
                    <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Conceptos</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', background: '#f1f5f9', borderRadius: 999, padding: '2px 8px' }}>
                      {items.length}
                    </span>
                  </div>
                  <button className="qt-btn" type="button" style={{ fontSize: 12, height: 32 }} onClick={addItem}>
                    <TbPlus size={13} /> Agregar línea
                  </button>
                </div>

                {/* Table */}
                <div style={{
                  border: '1px solid #e2e8f0', borderRadius: 14,
                  overflow: 'hidden', background: '#fff',
                }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 100px 60px 88px 60px 90px 32px',
                    gap: 0, background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                  }}>
                    {['', 'Descripción', 'Unidad', 'Cant.', 'P. Unit.', 'Desc.%', 'Importe', ''].map((h, i) => (
                      <div key={i} style={{
                        padding: '10px 8px', fontSize: 10, fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.2px',
                        color: '#64748b', textAlign: i > 2 ? 'right' : 'left',
                      }}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  {items.map((item, idx) => (
                    <div
                      key={item._id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr 100px 60px 88px 60px 90px 32px',
                        gap: 0, alignItems: 'center',
                        borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: idx % 2 === 0 ? '#fff' : '#fafbff',
                      }}
                    >
                      {/* Picker button */}
                      <div style={{ padding: '6px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button
                          ref={el => { pickerBtnRefs.current[item._id] = el; }}
                          type="button"
                          title="Buscar en inventario o servicios"
                          onMouseDown={e => { e.stopPropagation(); openPicker(item._id); }}
                          style={{
                            width: 26, height: 26, border: '1px solid',
                            borderColor: pickerOpenFor === item._id ? '#93c5fd' : '#e2e8f0',
                            borderRadius: 8, background: pickerOpenFor === item._id ? '#eff6ff' : '#fff',
                            color: pickerOpenFor === item._id ? '#2563eb' : '#94a3b8',
                            display: 'grid', placeItems: 'center', cursor: 'pointer',
                            transition: 'all 120ms',
                          }}
                        >
                          <TbSearch size={12} />
                        </button>
                      </div>

                      <div style={{ padding: '4px 6px 4px 0' }}>
<input
                          value={item.description}
                          placeholder="Descripción del concepto"
                          onChange={e => patchItem(item._id, { description: titleCaseLive(e.target.value) })}
                          style={{ width: '100%', border: '1px solid transparent', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontWeight: 700, color: '#0f172a', background: 'transparent', outline: 'none', transition: 'border-color 150ms, background 150ms' }}
                          onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.42)'; e.target.style.background = '#fff'; }}
                          onBlur={e =>  { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
                        />
                      </div>

<div style={{ padding: '4px 4px 4px 0' }}>
                        <select
                          value={item.unit}
                          onChange={e => patchItem(item._id, { unit: e.target.value })}
                          style={{
                            width: '100%', height: 36,
                            padding: '0 8px',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            fontSize: 12, fontWeight: 700,
                            background: '#fff', color: '#0f172a',
                            outline: 'none', cursor: 'pointer',
                            appearance: 'auto',
                          }}
                          onFocus={e => e.target.style.borderColor = 'rgba(37,99,235,0.42)'}
                          onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
                        >
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>

                      {[
                        { key: 'quantity',    step: '0.01' },
                        { key: 'unit_price',  step: '0.01' },
                        { key: 'discount_pct',step: '0.01', max: '100' },
                      ].map(({ key, step, max }) => (
                        <div key={key} style={{ padding: '4px 4px 4px 0' }}>
                          <input
                            type="number" min="0" step={step} max={max}
                            value={item[key]}
                            onChange={e => patchItem(item._id, { [key]: e.target.value })}
                            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 8px', fontSize: 12, fontWeight: 700, color: '#0f172a', background: '#fff', outline: 'none', textAlign: 'right' }}
                            onFocus={e => e.target.style.borderColor = 'rgba(37,99,235,0.42)'}
                            onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
                          />
                        </div>
                      ))}

                      <div style={{ padding: '4px 4px 4px 0' }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', textAlign: 'right', padding: '7px 8px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          {formatCurrency(item.amount, form.currency)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                        <button type="button" disabled={items.length === 1}
                          style={{ width: 26, height: 26, border: '1px solid', borderColor: items.length > 1 ? '#fca5a5' : '#e2e8f0', borderRadius: 8, background: '#fff', color: items.length > 1 ? '#dc2626' : '#d1d5db', display: 'grid', placeItems: 'center', cursor: items.length > 1 ? 'pointer' : 'not-allowed', transition: 'all 120ms' }}
                          onClick={() => removeItem(item._id)}>
                          <TbTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

{/* NOTAS / TÉRMINOS */}
              <div className="qt-form-grid">
                <div className="qt-field">
                  <label className="qt-label">Notas internas</label>
                  <textarea className="qt-textarea" style={{ minHeight: 80 }}
                    placeholder="Notas para uso interno..."
                    value={form.notes}
                    onChange={e => patchForm({ notes: titleCaseLive(e.target.value) })}
                  />
                </div>
                <div className="qt-field">
                  <label className="qt-label">Términos y condiciones</label>
                  <textarea className="qt-textarea" style={{ minHeight: 80 }}
                    placeholder="Condiciones de la cotización..."
                    value={form.terms}
                    onChange={e => patchForm({ terms: titleCaseLive(e.target.value) })}
                  />
                </div>
              </div>

              {/* PÁRRAFO INTRODUCTORIO */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f0f9ff', display: 'grid', placeItems: 'center', color: '#0ea5e9' }}>
                    <TbFileInvoice size={14} />
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Párrafo introductorio</span>
                </div>
                <textarea className="qt-textarea" style={{ minHeight: 70 }}
                  placeholder='Ej: Por este conducto me permito presentarle la cotización de 2 Sanitarios portátiles para ubicar en el área de Tierritas Blancas, Sinaloa.'
                  value={form.intro_text}
                  onChange={e => patchForm({ intro_text: e.target.value })}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Si está vacío se genera automáticamente del título y cliente.
                </div>
              </div>

              {/* CHECKLIST DE SERVICIOS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f0fdf4', display: 'grid', placeItems: 'center', color: '#16a34a' }}>
                    <TbPackage size={14} />
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Checklist "Servicio consiste en"</span>
                </div>
                <textarea className="qt-textarea" style={{ minHeight: 90 }}
                  placeholder={'Una línea por ítem:\nLimpieza de Sanitario\nQuímico biodegradable eliminador de aroma\nCalca Hombre / Mujer a sanitario'}
                  value={form.service_checklist}
                  onChange={e => patchForm({ service_checklist: e.target.value })}
                />
              </div>

              {/* NOTAS DE PRECIO */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fffbeb', display: 'grid', placeItems: 'center', color: '#d97706' }}>
                    <TbCurrencyDollar size={14} />
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Advertencias de precio</span>
                </div>
                <textarea className="qt-textarea" style={{ minHeight: 70 }}
                  placeholder={'Una advertencia por línea:\nEste precio se respeta a una distancia de 20 km a la redonda\nPrecio sujeto a cambio en base a la cantidad solicitada'}
                  value={form.price_notes}
                  onChange={e => patchForm({ price_notes: e.target.value })}
                />
              </div>

              {/* CIERRE Y FIRMANTE */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'grid', placeItems: 'center', color: '#2563eb' }}>
                    <TbUser size={14} />
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>Cierre y firmante</span>
                </div>
                <textarea className="qt-textarea" style={{ minHeight: 60, marginBottom: 10 }}
                  placeholder="Texto de cierre formal..."
                  value={form.closing_text}
                  onChange={e => patchForm({ closing_text: e.target.value })}
                />
                <div className="qt-form-grid">
                  <div className="qt-field">
                    <label className="qt-label">Nombre del firmante</label>
                    <input className="qt-input" placeholder="Nombre del Firmante"
                      value={form.signer_name}
                      onChange={e => patchForm({ signer_name: titleCaseLive(e.target.value) })}
                    />
                  </div>
                  <div className="qt-field">
                    <label className="qt-label">Cargo</label>
                    <input className="qt-input" placeholder="Ingrese el Cargo del Firmante"
                      value={form.signer_title}
                      onChange={e => patchForm({ signer_title: titleCaseLive(e.target.value) })}
                    />
                  </div>
                  <div className="qt-field">
                    <label className="qt-label">Teléfono del firmante</label>
                    <input className="qt-input" placeholder="668 123 4567"
                      value={form.signer_phone}
                      onChange={e => patchForm({ signer_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT — summary panel */}
            <div style={{
              width: 260, flexShrink: 0,
              borderLeft: '1px solid #f1f5f9',
              background: 'linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)',
              padding: '20px 18px',
              display: 'flex', flexDirection: 'column', gap: 16,
              overflowY: 'auto',
            }}>

              {/* Preview icon */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 20,
                  background: '#fff', border: '1px solid #e2e8f0',
                  display: 'grid', placeItems: 'center', color: '#2563eb',
                  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
                }}>
                  <TbFileInvoice size={32} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textAlign: 'center', maxWidth: 200 }}>
                  {form.title || 'Cotización sin título'}
                </div>
              </div>

              {/* Client */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 6 }}>Cliente</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: clientName ? '#0f172a' : '#94a3b8' }}>
                  {clientName || 'Sin cliente seleccionado'}
                </div>
              </div>

              {/* Detalles */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 6 }}>Detalles</div>
                {[
                  ['Moneda',   form.currency || 'MXN'],
                  ['Conceptos', `${items.filter(it => it.description.trim()).length} línea(s)`],
                  ['Válida hasta', form.valid_until ? new Date(form.valid_until + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) : '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e9eef5', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#64748b' }}>{label}</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 6 }}>Resumen</div>

                {[
                  ['Subtotal', formatCurrency(totals.subtotal, form.currency)],
                  ...(Number(form.discount_amount) > 0 ? [['Descuento', `−${formatCurrency(form.discount_amount, form.currency)}`]] : []),
                  [`IVA ${form.tax_rate || 0}%`, formatCurrency(totals.taxAmount, form.currency)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e9eef5', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#64748b' }}>{label}</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{value}</span>
                  </div>
                ))}

                {/* Total grande */}
                <div style={{
                  marginTop: 10, background: '#1a3c5e', borderRadius: 12,
                  padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>TOTAL</span>
                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: '-0.04em' }}>
                    {formatCurrency(totals.total, form.currency)}
                  </span>
                </div>

                {/* IVA selector compacto */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Tasa IVA</span>
<select
                    value={String(form.tax_rate)}
                    onChange={e => patchForm({ tax_rate: e.target.value })}
                    style={{
                      height: 30, padding: '0 8px', minWidth: 80,
                      border: '1px solid #e2e8f0', borderRadius: 8,
                      fontSize: 12, fontWeight: 700,
                      background: '#fff', color: '#0f172a',
                      outline: 'none', cursor: 'pointer',
                    }}
                  >
                    {TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>

                {/* Descuento extra */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Desc. extra</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.discount_amount}
                    onChange={e => patchForm({ discount_amount: e.target.value })}
                    style={{ width: 90, height: 30, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: 'right', background: '#fff', color: '#0f172a', outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = 'rgba(37,99,235,0.42)'}
                    onBlur={e =>  e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '14px 24px', borderTop: '1px solid #f1f5f9',
            background: '#fafbff', flexShrink: 0,
          }}>
            <button className="qt-btn" type="button" onClick={handleClose} disabled={saving}>
              Cancelar
            </button>
            <button className="qt-btn qt-btn--primary" type="button" onClick={handleSave} disabled={saving}
              style={{ minWidth: 160 }}>
              {saving ? 'Guardando...' : (quote ? 'Guardar cambios' : 'Crear cotización')}
            </button>
          </div>

        </div>
      </div>

      {/* Product picker via portal */}
      {pickerOpenFor !== null && (
        <ProductPicker
          anchorEl={pickerAnchor}
          onSelect={p => fillFromProduct(pickerOpenFor, p)}
          onClose={() => { setPickerOpenFor(null); setPickerAnchor(null); }}
        />
      )}
    </>
  );
}