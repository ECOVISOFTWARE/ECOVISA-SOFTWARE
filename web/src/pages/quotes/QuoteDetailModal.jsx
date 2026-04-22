import React, { useState } from 'react';
import {
  TbX, TbSend, TbCheck, TbBan, TbEdit,
  TbPhone, TbMail, TbBuilding, TbArrowBack,
  TbFileTypePdf, TbFileTypeXls, TbCode,
  TbRouteSquare, TbCurrencyDollar,
} from 'react-icons/tb';
import Swal from 'sweetalert2';
import { apiFetch } from '../../api';
import { formatCurrency, formatDate } from './quotes.helpers';
import { QUOTE_STATUSES } from './quotes.constants';

export default function QuoteDetailModal({ quote, worker, onClose, onUpdated, onEdit, canApprove }) {
  const [loading,        setLoading]       = useState(false);
  const [rejectReason,   setRejectReason]  = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const quoteStatus = String(quote?.status || 'draft').toLowerCase();

  const status =
    QUOTE_STATUSES?.[quoteStatus] ||
    QUOTE_STATUSES?.draft ||
    {
      label: quoteStatus === 'sent'
        ? 'Enviada'
        : quoteStatus === 'approved'
        ? 'Aprobada'
        : quoteStatus === 'rejected'
        ? 'Rechazada'
        : quoteStatus === 'cancelled'
        ? 'Cancelada'
        : quoteStatus === 'paid'
        ? 'Pagada'
        : quoteStatus === 'invoiced'
        ? 'Facturada'
        : quoteStatus === 'pending'
        ? 'En espera'
        : 'Borrador',
    };

  const canEdit       = quoteStatus === 'draft';
  const canSend       = quoteStatus === 'draft';
  const canApproveBtn = canApprove && quoteStatus === 'sent';
  const canRejectBtn  = canApprove && quoteStatus === 'sent';
  const canReopen     = quoteStatus === 'rejected';
  const client        = quote?.client || quote?.client_snapshot || {};

async function doAction(action, body = {}) {
  setLoading(true);
  try {
    const resp = await apiFetch(`/api/quotes/${quote.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ worker_id: worker.id, ...body }),
    });

    if (resp?.error) throw new Error(resp.error);

    onUpdated(resp?.data);
    setShowRejectForm(false);

    const successTitleMap = {
      send: 'Cotización marcada como enviada',
      approve: 'Cotización aprobada',
      reject: 'Cotización rechazada',
      reopen: 'Cotización reabierta',
      pay: 'Cotización marcada como pagada',
      cancel: 'Cotización cancelada',
    };

    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>',
      title: successTitleMap[action] || 'Acción realizada',
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
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;color:#dc2626"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>',
      title: 'Error',
      text: e.message || 'No se pudo completar la acción',
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
      },
      buttonsStyling: false,
      confirmButtonText: 'Entendido',
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
        confirmButton: 'swal-quote-confirm',
      },
    });
  } finally {
    setLoading(false);
  }
}

async function exportQuote(format) {
  const ext = format === 'excel' ? 'xlsx' : format;
  const mimeMap = {
    pdf: 'application/pdf',
    excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xml: 'application/xml',
  };

  const labelMap = {
    pdf: 'PDF',
    excel: 'Excel',
    xml: 'XML',
  };

  try {
    // SIN await — solo abre el spinner, no bloquea la ejecución
    Swal.fire({
      title: `Exportando ${labelMap[format]}...`,
      text: 'Espera un momento',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
      customClass: {
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
      },
    });

    const resp = await fetch(`/api/quotes/${quote.id}/export/${format}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!resp.ok) {
      throw new Error(`Error ${resp.status}`);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: mimeMap[format] }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quote.folio || 'cotizacion'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Cierra el spinner y muestra éxito
    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>',
      title: `${labelMap[format]} exportado`,
      text: `La cotización ${quote.folio || ''} se descargó correctamente.`,
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
        confirmButton: 'swal-quote-confirm',
      },
      buttonsStyling: false,
      confirmButtonText: 'Aceptar',
    });
  } catch (e) {
    // Cierra el spinner y muestra error
    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#fef2f2;border:2px solid #fca5a5;display:flex;align-items:center;justify-content:center;color:#dc2626"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>',
      title: 'Error al exportar',
      text: e.message || 'Ocurrió un error desconocido al exportar la cotización.',
      customClass: {
        icon: 'swal-no-border',
        popup: 'swal-quote-popup',
        title: 'swal-quote-title',
        confirmButton: 'swal-quote-confirm',
      },
      buttonsStyling: false,
      confirmButtonText: 'Aceptar',
    });
  }
}

async function createServiceSheetFromQuote() {
  try {
    await apiFetch('/api/service-sheets', {
      method: 'POST',
      body: JSON.stringify({
        client_id: quote.client_id || null,
        client_name: client.name || '',
        city: client.city || '',
        location: client.address || '',
        quantity: 1,
        unit_price: Number(quote.total || 0),
        total_price: Number(quote.total || 0),
        delivery_date: quote.valid_until || null,
        service_type: 'Servicio desde cotización',
        status: 'pending',
        notes: `Generado desde cotización ${quote.folio || ''}`,
        created_by: worker.id,
        quote_id: quote.id,
      }),
    });

    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>',
      title: 'Hoja de servicio creada',
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
      text: e.message || 'No se pudo crear la hoja de servicio',
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

async function createInvoiceFromQuote() {
  try {
    const subtotal = Number(quote.subtotal || 0);
    const tax = Number(quote.tax_amount || 0);
    const total = Number(quote.total || 0);

    await apiFetch('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        client_id: quote.client_id || null,
        client_name: client.name || '',
        quote_id: quote.id,
        service_location: client.address || '',
        delivery_date: quote.valid_until || null,
        subtotal,
        tax,
        total,
        status: 'draft',
        notes: `Factura generada desde cotización ${quote.folio || ''}`,
        created_by: worker.id,
      }),
    });

    await Swal.fire({
      iconHtml: '<div style="width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #86efac;display:flex;align-items:center;justify-content:center;color:#16a34a"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>',
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

  return (
    <div className="qt-modal-back" onMouseDown={onClose}>
      <div className="qt-modal" onMouseDown={e => e.stopPropagation()}>

        {/* Head */}
        <div className="qt-modal__head">
          <div className="qt-modal__title">
            {quote?.folio || 'Cotización'}
            <span className={`qt-status qt-status--${quoteStatus}`}>{status?.label || 'Borrador'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Exportar */}
            <button className="qt-btn qt-btn--icon" type="button" title="Exportar PDF"
              style={{ color: '#dc2626' }} onClick={() => exportQuote('pdf')}>
              <TbFileTypePdf size={40} />
            </button>
            <button className="qt-btn qt-btn--icon" type="button" title="Exportar Excel"
              style={{ color: '#16a34a' }} onClick={() => exportQuote('excel')}>
              <TbFileTypeXls size={40} />
            </button>
            <button className="qt-btn qt-btn--icon" type="button" title="Exportar XML"
              style={{ color: '#7c3aed' }} onClick={() => exportQuote('xml')}>
              <TbCode size={40} />
            </button>
            {canEdit && (
              <button className="qt-btn" type="button" onClick={onEdit}>
                <TbEdit size={14} /> Editar
              </button>
            )}

            <button
              className="qt-btn"
              type="button"
              onClick={createServiceSheetFromQuote}
            >
              <TbRouteSquare size={14} /> Crear hoja
            </button>

            <button
              className="qt-btn qt-btn--primary"
              type="button"
              onClick={createInvoiceFromQuote}
            >
              <TbCurrencyDollar size={14} /> Facturar
            </button>
            <button className="qt-modal__close" type="button" onClick={onClose}><TbX /></button>
          </div>
        </div>

        {/* Body */}
        <div className="qt-modal__body">

          {/* Header info */}
          <div className="qt-detail-header">
            <div className="qt-detail-folio">{quote.folio}</div>
            <div className="qt-detail-title">{quote.title}</div>
            <div className="qt-detail-meta">
              <span>Creado: {formatDate(quote.created_at)}</span>
              {quote.valid_until && <span>Válida hasta: {formatDate(quote.valid_until)}</span>}
              {quote.creator?.full_name && <span>Por: {quote.creator.full_name}</span>}
            </div>
          </div>

          {/* Client + Totals */}
          <div className="qt-detail-grid">
            <div className="qt-section" style={{ margin: 0 }}>
              <div className="qt-section__title">Cliente</div>
              {client.name ? (
                <>
                  <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a', marginBottom: 8 }}>{client.name}</div>
                  {client.company && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                      <TbBuilding size={12} /> {client.company}
                    </div>
                  )}
                  {client.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                      <TbPhone size={12} /> {client.phone}
                    </div>
                  )}
                  {client.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                      <TbMail size={12} /> {client.email}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>Sin cliente asignado</span>
              )}
            </div>

            <div className="qt-section" style={{ margin: 0 }}>
              <div className="qt-section__title">Resumen financiero</div>
              <div className="qt-totals">
                <div className="qt-totals__row">
                  <span className="qt-totals__label">Subtotal</span>
                  <span className="qt-totals__value">{formatCurrency(quote.subtotal, quote.currency)}</span>
                </div>
                {Number(quote.discount_amount) > 0 && (
                  <div className="qt-totals__row">
                    <span className="qt-totals__label">Descuento</span>
                    <span className="qt-totals__value">−{formatCurrency(quote.discount_amount, quote.currency)}</span>
                  </div>
                )}
                <div className="qt-totals__row">
                  <span className="qt-totals__label">IVA ({quote.tax_rate}%)</span>
                  <span className="qt-totals__value">{formatCurrency(quote.tax_amount, quote.currency)}</span>
                </div>
                <div className="qt-totals__row">
                  <span className="qt-totals__label">Total</span>
                  <span className="qt-totals__value" style={{ fontSize: 18 }}>
                    {formatCurrency(quote.total, quote.currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="qt-section">
            <div className="qt-section__title">Conceptos ({quote.items?.length || 0})</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="qt-items">
                <thead>
                  <tr>
                    <th>Descripción</th><th>Unidad</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>P. Unit.</th>
                    <th style={{ textAlign: 'right' }}>Desc.%</th>
                    <th style={{ textAlign: 'right' }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(quote.items || []).map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td style={{ fontWeight: 800, color: '#0f172a' }}>{item.description}</td>
                      <td style={{ color: '#64748b' }}>{item.unit}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(item.unit_price, quote.currency)}</td>
                      <td style={{ textAlign: 'right' }}>{Number(item.discount_pct) > 0 ? `${item.discount_pct}%` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 900, color: '#0f172a' }}>
                        {formatCurrency(item.amount, quote.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes / Terms */}
          {(quote.notes || quote.terms) && (
            <div className="qt-detail-grid">
              {quote.notes && (
                <div className="qt-section" style={{ margin: 0 }}>
                  <div className="qt-section__title">Notas</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{quote.notes}</p>
                </div>
              )}
              {quote.terms && (
                <div className="qt-section" style={{ margin: 0 }}>
                  <div className="qt-section__title">Términos y condiciones</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{quote.terms}</p>
                </div>
              )}
            </div>
          )}

          {/* Status info */}
          {quoteStatus === 'approved' && (
            <div className="qt-section" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#15803d', fontWeight: 700 }}>
                ✓ Aprobada {quote?.approver?.full_name ? `por ${quote.approver.full_name}` : ''} el {formatDate(quote?.approved_at)}
              </p>
            </div>
          )}
          {quoteStatus === 'rejected' && quote?.rejection_reason && (
            <div className="qt-section" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>
                Rechazada — {quote.rejection_reason}
              </p>
            </div>
          )}

          {/* Sin permiso de aprobar */}
          {quoteStatus === 'sent' && !canApprove && (
            <div className="qt-section" style={{ borderColor: '#fcd34d', background: '#fffbeb' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#92400e', fontWeight: 700 }}>
                ⏳ Esta cotización está pendiente de aprobación por personal autorizado.
              </p>
            </div>
          )}

          {/* Reject form */}
          {showRejectForm && (
            <div className="qt-section" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
              <div className="qt-section__title" style={{ color: '#b91c1c' }}>Motivo de rechazo</div>
              <textarea className="qt-textarea" style={{ background: '#fff' }}
                placeholder="Explica brevemente el motivo..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                <button className="qt-btn" type="button" onClick={() => setShowRejectForm(false)}>Cancelar</button>
                <button className="qt-btn qt-btn--danger" type="button" disabled={loading}
                  onClick={() => doAction('reject', { reason: rejectReason })}>
                  Confirmar rechazo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="qt-modal__footer">
          {canReopen && (
            <button className="qt-btn" type="button" disabled={loading} onClick={() => doAction('reopen')}>
              <TbArrowBack size={14} /> Reabrir borrador
            </button>
          )}
          {canSend && (
            <button className="qt-btn qt-btn--primary" type="button" disabled={loading} onClick={() => doAction('send')}>
              <TbSend size={14} /> Marcar como enviada
            </button>
          )}
          {canApproveBtn && (
            <button className="qt-btn qt-btn--success" type="button" disabled={loading} onClick={() => doAction('approve')}>
              <TbCheck size={14} /> Aprobar
            </button>
          )}
          {canRejectBtn && !showRejectForm && (
            <button className="qt-btn qt-btn--danger" type="button" disabled={loading} onClick={() => setShowRejectForm(true)}>
              <TbBan size={14} /> Rechazar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}