import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  TbFileInvoice, TbPlus, TbEye, TbEdit, TbTrash, TbSearch,
  TbUserCircle,
} from 'react-icons/tb';
import Swal from 'sweetalert2';
import { apiFetch } from '../api';
import QuoteFormModal   from './quotes/QuoteFormModal';
import QuoteDetailModal from './quotes/QuoteDetailModal';
import { formatCurrency, formatDate, isExpired } from './quotes/quotes.helpers';
import './QuotesModule.css';
const TABS = [
  { key: 'all',       label: 'Todas'      },
  { key: 'pending',   label: 'En espera'  },
  { key: 'approved',  label: 'Aprobadas'  },
  { key: 'invoiced',  label: 'Facturadas' },
  { key: 'rejected',  label: 'Rechazadas' },
  { key: 'cancelled', label: 'Canceladas' },
];

const SEMAPHORE = {
  draft:     { color: '#475569', bg: '#f8fafc', border: '#cbd5e1', dot: '#94a3b8', label: 'Borrador'    },
  pending:   { color: '#b45309', bg: '#fffbeb', border: '#fbbf24', dot: '#f59e0b', label: 'En espera'   },
  sent:      { color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', dot: '#8b5cf6', label: 'Enviada'     },
  approved:  { color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', dot: '#3b82f6', label: 'Aprobada'    },
  invoiced:  { color: '#0f766e', bg: '#ecfeff', border: '#67e8f9', dot: '#06b6d4', label: 'Facturada'   },
  rejected:  { color: '#b91c1c', bg: '#fef2f2', border: '#f87171', dot: '#ef4444', label: 'Rechazada'   },
  paid:      { color: '#15803d', bg: '#dcfce7', border: '#4ade80', dot: '#22c55e', label: 'Pagada'      },
  cancelled: { color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', dot: '#9ca3af', label: 'Cancelada'   },
  expired:   { color: '#b91c1c', bg: '#fff1f2', border: '#fda4af', dot: '#e11d48', label: 'Expirada'    },
};

/* ══════════════════════════════════════════════════════
   CREATOR CELL
══════════════════════════════════════════════════════ */
function CreatorCell({ creator, createdAt }) {
  if (!creator) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9', display: 'grid', placeItems: 'center', color: '#94a3b8', flexShrink: 0 }}>
        <TbUserCircle size={18} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>Sin asignar</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(createdAt)}</div>
      </div>
    </div>
  );

  const deptColor = creator.department?.color || '#64748b';
  const deptName  = creator.department?.name  || '';
  const levelName = creator.level?.name       || '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: '#f1f5f9', flexShrink: 0,
        border: `2px solid ${deptColor}44`,
        overflow: 'hidden', position: 'relative',
        display: 'grid', placeItems: 'center', color: '#94a3b8',
      }}>
        {creator.profile_photo_url ? (
          <img src={creator.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none'; }} />
        ) : <TbUserCircle size={18} />}
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {creator.full_name || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
          {deptName && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999,
              background: `${deptColor}22`, color: deptColor,
              border: `1px solid ${deptColor}44`, whiteSpace: 'nowrap',
            }}>
              {deptName}
            </span>
          )}
          {levelName && (
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
              {levelName}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 1 }}>
          {formatDate(createdAt)}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   INLINE STATUS SELECT
══════════════════════════════════════════════════════ */
function QuoteInlineStatus({ quote, canApprove, onReload, worker }) {
  const [open,         setOpen]         = useState(false);
  const [dropPos,      setDropPos]      = useState({ top: 0, left: 0 });
  const [showReason,   setShowReason]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading,      setLoading]      = useState(false);
  const triggerRef = useRef(null);
  const dropRef    = useRef(null);

  const expired       = isExpired(quote.valid_until) && !['approved','rejected'].includes(quote.status);
  const displayStatus = expired ? 'expired' : quote.status;
  const sc            = SEMAPHORE[displayStatus] || {
    color: '#475569',
    bg: '#f8fafc',
    border: '#cbd5e1',
    dot: '#94a3b8',
    label: displayStatus || 'Sin estado',
  };

const transitions = useMemo(() => {
    const t = [];
    // pending
    if (quote.status === 'pending' && canApprove)
      t.push({ to: 'approved', label: 'Aprobar cotización'  });
    if (quote.status === 'pending' && canApprove)
      t.push({ to: 'rejected', label: 'Rechazar cotización' });
    // approved
    if (quote.status === 'approved' && canApprove)
      t.push({ to: 'cancelled', label: 'Cancelar cotización' });
    if (quote.status === 'approved' && canApprove)
      t.push({ to: 'rejected', label: 'Rechazar cotización' });
    // rejected
    if (quote.status === 'rejected' && canApprove)
      t.push({ to: 'pending', label: 'Volver a en espera' });
    // cancelled
    if (quote.status === 'cancelled' && canApprove)
      t.push({ to: 'pending', label: 'Volver a en espera' });
    return t;
  }, [quote.status, canApprove]);

  function handleOpen(e) {
    e.stopPropagation();
    if (transitions.length === 0) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setDropPos({ top: rect.bottom + 6, left: rect.left });
    setOpen(true);
    setShowReason(false);
    setRejectReason('');
  }

  useEffect(() => {
    function handle(e) {
      if (!open) return;
      if (dropRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  async function doTransition(to, reason = '') {
    const ACTIONS = { approved:'approve', rejected:'reject', pending:'reopen', cancelled:'cancel' };
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/quotes/${quote.id}/${ACTIONS[to]}`, {
        method: 'POST',
        body: JSON.stringify({ worker_id: worker?.id, reason }),
      });
      if (resp?.error) throw new Error(resp.error);
      setOpen(false);
      setShowReason(false);
      onReload();
    } catch (e) {
      Swal.fire('Error', e.message || 'No se pudo actualizar', 'error');
    } finally { setLoading(false); }
  }

  return (
    <div className="qt-inline-status">
      <button
        ref={triggerRef}
        type="button"
        style={{
          color: sc.color, background: sc.bg, borderColor: sc.border,
          cursor: transitions.length > 0 ? 'pointer' : 'default',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 900,
          border: '1px solid', whiteSpace: 'nowrap',
        }}
        onClick={handleOpen}
        title={transitions.length > 0 ? 'Clic para cambiar estado' : sc.label}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
        {sc.label}
        {transitions.length > 0 && (
          <span style={{ fontSize: 9, opacity: 0.65, marginLeft: 1 }}>▾</span>
        )}
      </button>

      {open && createPortal(
        <div ref={dropRef} className="qt-inline-status__dropdown"
          style={{ top: dropPos.top, left: dropPos.left }}>
          {!showReason ? (
            transitions.map((t, i) => {
              const tc = SEMAPHORE[t.to] || SEMAPHORE.draft;
              return (
                <button key={`${t.to}-${i}`} type="button"
                  className="qt-inline-status__option" disabled={loading}
                  onClick={() => {
                    if (t.to === 'rejected') { setShowReason(true); return; }
                    doTransition(t.to);
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: tc.dot, flexShrink: 0 }} />
                  {t.label}
                </button>
              );
            })
          ) : (
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>Motivo del rechazo</div>
              <input autoFocus
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                placeholder="Escribe el motivo..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                <button className="qt-btn" type="button" style={{ height: 30, fontSize: 12 }}
                  onClick={() => setShowReason(false)}>Cancelar</button>
                <button className="qt-btn qt-btn--danger" type="button" style={{ height: 30, fontSize: 12 }}
                  disabled={loading}
                  onClick={() => doTransition('rejected', rejectReason)}>Confirmar rechazo</button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN MODULE
══════════════════════════════════════════════════════ */
export default function QuotesModule({ currentWorker }) {
  const [quotes,   setQuotes]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [tab,      setTab]      = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editQ,    setEditQ]    = useState(null);
  const [viewQ,    setViewQ]    = useState(null);

  const canApprove = useMemo(() => {
    if (!currentWorker) return false;
    const isDireccion = String(currentWorker.department_name || '').toUpperCase() === 'DIRECCION';
    return isDireccion || Boolean(currentWorker.can_approve_quotes) || Number(currentWorker.authority) >= 5;
  }, [currentWorker]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      if (search.trim()) params.set('q', search.trim());
      const resp = await apiFetch(`/api/quotes?${params.toString()}`);
      setQuotes(resp?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const es = new EventSource('/api/quotes/stream');
    es.onmessage = (e) => {
      try { if (JSON.parse(e.data)?.event === 'change') loadRef.current(); }
      catch { /* ignore */ }
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

async function openDetail(id) {
    // Abre inmediatamente con datos de la tabla
    const preview = quotes.find(q => q.id === id);
    if (preview) setViewQ(preview);

    // Carga completa (con items) en background
    try {
      const resp = await apiFetch(`/api/quotes/${id}`);
      if (resp?.data) setViewQ(resp.data);
    } catch (e) {
      if (!preview) Swal.fire('Error', e.message || 'No se pudo cargar', 'error');
    }
  }
async function openEdit(id) {
    try {
      const resp = await apiFetch(`/api/quotes/${id}`);
      setEditQ(resp?.data); setShowForm(true);
    } catch (e) { Swal.fire('Error', e.message || 'No se pudo cargar', 'error'); }
  }

  async function handleEditWithConfirm(q) {
    if (q.status !== 'draft') {
      const res = await Swal.fire({
        title: '¿Editar cotización?',
        html: `<div style="font-size:14px;color:#64748b">La cotización <b>${q.folio}</b> tiene estado <b>${q.status === 'sent' ? 'Enviada' : q.status === 'approved' ? 'Aprobada' : 'Rechazada'}</b>.<br/>Al editar regresará a <b>Borrador</b>.</div>`,
        iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#eff6ff;border:2px solid #bfdbfe;display:flex;align-items:center;justify-content:center;color:#2563eb"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>',
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
        confirmButtonText: 'Sí, editar',
        cancelButtonText: 'Cancelar',
      });
      if (!res.isConfirmed) return;

      // Regresa a draft antes de abrir el editor
      try {
        await apiFetch(`/api/quotes/${q.id}/reopen`, {
          method: 'POST',
          body: JSON.stringify({ worker_id: currentWorker?.id }),
        });
      } catch (e) { /* continúa de todas formas */ }
    }
    openEdit(q.id);
  }

async function handleCreateInvoiceFromQuote(q) {
    const client = q.client || q.client_snapshot || {};

    const res = await Swal.fire({
      title: '¿Crear factura?',
      html: `<div style="font-size:14px;color:#64748b">Se generará una factura nueva desde la cotización <b>${q.folio || '—'}</b>.</div>`,
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#eff6ff;border:2px solid #bfdbfe;display:flex;align-items:center;justify-content:center;color:#2563eb"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg></div>',
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
      confirmButtonText: 'Sí, facturar',
      cancelButtonText: 'Cancelar',
    });

    if (!res.isConfirmed) return;

    try {
      const subtotal = Number(q.subtotal || 0);
      const tax = Number(q.tax_amount || 0);
      const total = Number(q.total || 0);

      await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          client_id: q.client_id || null,
          client_name: client.name || '',
          quote_id: q.id,
          service_location: client.address || '',
          delivery_date: q.valid_until || null,
          subtotal,
          tax,
          total,
          status: 'draft',
          notes: `Factura generada desde cotización ${q.folio || ''}`,
          created_by: currentWorker?.id || null,
        }),
      });

      await apiFetch(`/api/quotes/${q.id}/invoice`, {
        method: 'POST',
        body: JSON.stringify({ worker_id: currentWorker?.id || null }),
      });

      await load();

      await Swal.fire({
        iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>',
        title: 'Factura creada correctamente',
        customClass: {
          icon: 'swal-no-border',
          popup: 'swal-quote-popup',
          title: 'swal-quote-title',
        },
        buttonsStyling: false,
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e) {
      await Swal.fire({
        iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;color:#dc2626"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>',
        title: 'Error',
        text: e.message || 'No se pudo crear la factura',
        customClass: {
          icon: 'swal-no-border',
          popup: 'swal-quote-popup',
          title: 'swal-quote-title',
          confirmButton: 'swal-quote-confirm',
        },
        buttonsStyling: false,
        confirmButtonText: 'Entendido',
      });
    }
  }
async function handleDelete(q) {
  const res = await Swal.fire({
    title: '¿Eliminar cotización?',
    html: `<div style="font-size:14px;color:#64748b">Se eliminará permanentemente <b>${q.folio}</b>.<br/>Esta acción no se puede deshacer.</div>`,
    iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;color:#dc2626"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></div>',
    customClass: {
      icon: 'swal-no-border',
      popup: 'swal-quote-popup',
      title: 'swal-quote-title',
      htmlContainer: 'swal-quote-text',
    },
    buttonsStyling: false,
    showCancelButton: true,
    confirmButtonText: 'Eliminar',
    cancelButtonText: 'Cancelar',
  });

  if (!res.isConfirmed) return;

  try {
    await apiFetch(`/api/quotes/${q.id}?worker_id=${currentWorker?.id}`, {
      method: 'DELETE',
    });

    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>',
      title: 'Eliminada',
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
      },
      buttonsStyling: false,
      timer: 1400,
      showConfirmButton: false,
    });

    load(); // 🔥 refresca tabla
  } catch (e) {
    Swal.fire('Error', e.message || 'No se pudo eliminar', 'error');
  }
}
  const counts = useMemo(() => {
    const c = { all: quotes.length };
    quotes.forEach(q => { c[q.status] = (c[q.status] || 0) + 1; });
    return c;
  }, [quotes]);

const kpis = useMemo(() => {
    const approved  = quotes.filter(q => q.status === 'approved');
    const pending   = quotes.filter(q => q.status === 'pending');
    const invoiced  = quotes.filter(q => q.status === 'invoiced');
    return {
      total:          quotes.length,
      approvedCount:  approved.length,
      pendingCount:   pending.length,
      invoicedCount:  invoiced.length,
      approvedValue:  approved.reduce((s, q) => s + Number(q.total || 0), 0),
      pendingValue:   pending.reduce((s,  q) => s + Number(q.total || 0), 0),
      invoicedValue:  invoiced.reduce((s, q) => s + Number(q.total || 0), 0),
    };
  }, [quotes]);

  const filtered = useMemo(() =>
    tab === 'all' ? quotes : quotes.filter(q => q.status === tab),
    [quotes, tab]
  );

  return (
    <div className="qt-wrap">

      <div className="qt-topbar">
        <div>
          <h1 className="qt-title"><TbFileInvoice /> Cotizaciones</h1>
          <p className="qt-title-sub">Gestión y seguimiento · Tiempo real</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="qt-btn qt-btn--primary" type="button"
            onClick={() => { setEditQ(null); setShowForm(true); }}>
            <TbPlus size={14} /> Nueva cotización
          </button>
        </div>
      </div>

      <>
          {/* KPIs */}
          <div className="qt-kpiRow">
            <div className="qt-kpi" style={{ '--qt-kpi-accent': '#2563eb' }}>
              <div className="qt-kpi__label">Total</div>
              <div className="qt-kpi__value">{kpis.total}</div>
            </div>
<div className="qt-kpi" style={{ '--qt-kpi-accent': '#f59e0b' }}>
              <div className="qt-kpi__label">En espera</div>
              <div className="qt-kpi__value">{kpis.pendingCount}</div>
              <div className="qt-kpi__sub">{formatCurrency(kpis.pendingValue)}</div>
            </div>
            <div className="qt-kpi" style={{ '--qt-kpi-accent': '#3b82f6' }}>
              <div className="qt-kpi__label">Aprobadas</div>
              <div className="qt-kpi__value">{kpis.approvedCount}</div>
              <div className="qt-kpi__sub">{formatCurrency(kpis.approvedValue)}</div>
            </div>
<div className="qt-kpi" style={{ '--qt-kpi-accent': '#06b6d4' }}>
              <div className="qt-kpi__label">Facturadas</div>
              <div className="qt-kpi__value">{kpis.invoicedCount}</div>
              <div className="qt-kpi__sub">{formatCurrency(kpis.invoicedValue)}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="qt-filters">
            <div className="qt-search">
              <TbSearch size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
              <input placeholder="Buscar por folio, título o cliente..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="qt-tabs">
              {TABS.map(t => (
                <button key={t.key} type="button"
                  className={`qt-tab ${tab === t.key ? 'active' : ''}`}
                  onClick={() => setTab(t.key)}>
                  {t.label}
                  {counts[t.key] > 0 && <span className="qt-tab__count">{counts[t.key]}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="qt-card">
            <div className="qt-table-wrap">
              <table className="qt-table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Título</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th>Válida hasta</th>
                    <th>Creada por</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                        Cargando cotizaciones...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="qt-empty">
                          <div className="qt-empty__icon"><TbFileInvoice size={30} /></div>
                          <div className="qt-empty__title">Sin cotizaciones</div>
                          <div className="qt-empty__sub">
                            {search ? 'No se encontraron resultados' : 'Crea tu primera cotización con el botón superior'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(q => {
                      const client  = q.client || q.client_snapshot || {};
                      const expired = isExpired(q.valid_until) && !['approved','rejected'].includes(q.status);
                      return (
                        <tr key={q.id}>
                          <td>
                            <span style={{ fontWeight: 900, color: '#0f172a', fontSize: 13 }}>
                              {q.folio || '—'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, color: '#0f172a', maxWidth: 180 }}>
                            {q.title}
                          </td>
                          <td>
                            {client.name ? (
                              <div>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>{client.name}</div>
                                {client.company && <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{client.company}</div>}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 13 }}>Sin cliente</span>
                            )}
                          </td>
                          <td>
                            <QuoteInlineStatus quote={q} canApprove={canApprove} onReload={load} worker={currentWorker} />
                          </td>
                          <td>
                            <span style={{ fontWeight: 900, color: '#0f172a' }}>
                              {formatCurrency(q.total, q.currency)}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, fontWeight: 700, color: expired ? '#b91c1c' : '#64748b' }}>
                              {formatDate(q.valid_until)}
                            </span>
                          </td>
                          {/* ── CREATOR COLUMN ── */}
                          <td style={{ minWidth: 160 }}>
                            <CreatorCell creator={q.creator} createdAt={q.created_at} />
                          </td>
<td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="qt-btn qt-btn--icon" type="button"
                                title="Ver detalle" style={{ color: '#2563eb' }}
                                onClick={() => openDetail(q.id)}>
                                <TbEye size={14} />
                              </button>

                              <button className="qt-btn qt-btn--icon" type="button"
                                title="Facturar cotización" style={{ color: '#16a34a' }}
                                onClick={() => handleCreateInvoiceFromQuote(q)}>
                                <TbFileInvoice size={14} />
                              </button>

                              <button className="qt-btn qt-btn--icon" type="button"
                                title="Editar cotización"
                                onClick={() => handleEditWithConfirm(q)}>
                                <TbEdit size={14} />
                              </button>

                              <button className="qt-btn qt-btn--icon" type="button"
                                title="Eliminar cotización" style={{ color: '#dc2626' }}
                                onClick={() => handleDelete(q)}>
                                <TbTrash size={14} />
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
        </>
    

      {showForm && (
        <QuoteFormModal
          quote={editQ}
          worker={currentWorker}
          onClose={() => { setShowForm(false); setEditQ(null); }}
          onSaved={() => {
            setShowForm(false);
            const wasEdit = Boolean(editQ);
            setEditQ(null);
            load();
            Swal.fire({
              iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>',
              title: wasEdit ? 'Cotización actualizada' : 'Cotización creada',
              customClass: { icon: 'swal-no-border', popup: 'swal-quote-popup', title: 'swal-quote-title' },
              buttonsStyling: false,
              timer: 1400, showConfirmButton: false,
            });
          }}
        />
      )}

      {viewQ && (
        <QuoteDetailModal
          quote={viewQ}
          worker={currentWorker}
          canApprove={canApprove}
          onClose={() => setViewQ(null)}
          onUpdated={updated => { setViewQ(p => ({ ...p, ...updated })); load(); }}
          onEdit={() => { setEditQ(viewQ); setShowForm(true); setViewQ(null); }}
        />
      )}
    </div>
  );
}