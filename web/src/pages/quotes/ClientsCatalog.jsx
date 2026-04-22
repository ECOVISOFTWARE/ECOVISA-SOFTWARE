import React, { useState, useEffect, useCallback } from 'react';
import { TbPlus, TbEdit, TbTrash, TbSearch, TbX, TbUser } from 'react-icons/tb';
import Swal from 'sweetalert2';
import { apiFetch } from '../../api';
import { titleCaseLive } from './quotes.helpers';

export default function ClientsCatalog({ worker }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', rfc: '', address: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const resp = await apiFetch(`/api/clients?${params.toString()}`);
      setClients(resp?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name:'', email:'', phone:'', company:'', rfc:'', address:'', notes:'' });
    setShowModal(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({
      name:    c.name    || '',
      email:   c.email   || '',
      phone:   c.phone   || '',
      company: c.company || '',
      rfc:     c.rfc     || '',
      address: c.address || '',
      notes:   c.notes   || '',
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.name.trim()) { Swal.fire('Error', 'El nombre es requerido', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/clients/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ worker_id: worker?.id, ...form }),
        });
      } else {
        await apiFetch("/api/clients", {
          method: "POST",
          body: JSON.stringify({ worker_id: worker?.id, ...form }),
        });
      }
      setShowModal(false);
      load();
      Swal.fire({
        icon: 'success',
        title: editing ? 'Cliente actualizado' : 'Cliente creado',
        timer: 1400, showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire('Error', e.message || 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  }

  async function del(c) {
    const res = await Swal.fire({
      title: '¿Eliminar cliente?', text: c.name,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!res.isConfirmed) return;
    try {
            await apiFetch(`/api/clients/${c.id}`, { method: "DELETE" });
      load();
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1200, showConfirmButton: false });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
  }

  const FIELDS = [
    ['name',    'Nombre *',       'Nombre completo del cliente',     false],
    ['company', 'Empresa',        'Razón social',                    false],
    ['rfc',     'RFC',            'XXXXXXXXXXX000',                  true],
    ['phone',   'Teléfono',       '(000) 000-0000',                  false],
    ['email',   'Email',          'correo@empresa.com',              false],
    ['address', 'Dirección',      'Calle, Colonia, Ciudad, CP',      false],
  ];

  return (
    <div className="qt-catalog">

      {/* Top bar */}
      <div className="qt-catalog__topbar">
        <div className="qt-catalog__search">
          <TbSearch size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            placeholder="Buscar cliente por nombre, empresa o RFC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="qt-btn qt-btn--primary" type="button" onClick={openCreate}>
          <TbPlus size={14} /> Nuevo cliente
        </button>
      </div>

      {/* Table */}
      <div className="qt-card">
        <div className="qt-table-wrap">
          <table className="qt-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Empresa</th>
                <th>RFC</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Dirección</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    Cargando clientes...
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="qt-empty">
                      <div className="qt-empty__icon"><TbUser size={28} /></div>
                      <div className="qt-empty__title">Sin clientes</div>
                      <div className="qt-empty__sub">
                        {search ? 'No se encontraron resultados' : 'Crea tu primer cliente con el botón superior'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                clients.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 900, color: '#0f172a' }}>{c.name}</td>
                    <td style={{ color: '#475569' }}>{c.company || '—'}</td>
                    <td style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>
                      {c.rfc || '—'}
                    </td>
                    <td style={{ color: '#64748b' }}>{c.phone || '—'}</td>
                    <td style={{ color: '#64748b' }}>{c.email || '—'}</td>
                    <td style={{ color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.address || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="qt-btn qt-btn--icon" type="button"
                          title="Editar" onClick={() => openEdit(c)}>
                          <TbEdit size={14} />
                        </button>
                        <button className="qt-btn qt-btn--icon" type="button"
                          title="Eliminar" style={{ color: '#dc2626' }}
                          onClick={() => del(c)}>
                          <TbTrash size={14} />
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

      {/* Modal create/edit */}
      {showModal && (
        <div className="qt-modal-back" onMouseDown={() => setShowModal(false)}>
          <div className="qt-client-modal" onMouseDown={e => e.stopPropagation()}>

            <div className="qt-modal__head">
              <div className="qt-modal__title">
                <TbUser size={16} />
                {editing ? 'Editar cliente' : 'Nuevo cliente'}
              </div>
              <button className="qt-modal__close" type="button" onClick={() => setShowModal(false)}>
                <TbX />
              </button>
            </div>

            <div className="qt-modal__body">
              <div className="qt-form-grid">
                {FIELDS.map(([key, label, ph, uppercase]) => (
                  <div className="qt-field" key={key}>
                    <label className="qt-label">{label}</label>
<input
                      className="qt-input"
                      placeholder={ph}
                      value={form[key]}
                      onChange={e => setForm(p => ({
                        ...p,
                        [key]: uppercase ? e.target.value.toUpperCase() : titleCaseLive(e.target.value),
                      }))}
                    />
                  </div>
                ))}
                <div className="qt-field span2">
                  <label className="qt-label">Notas</label>
<textarea
                    className="qt-textarea"
                    placeholder="Observaciones o notas adicionales del cliente..."
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: titleCaseLive(e.target.value) }))}
                  />
                </div>
              </div>
            </div>

            <div className="qt-modal__footer">
              <button className="qt-btn" type="button"
                onClick={() => setShowModal(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="qt-btn qt-btn--primary" type="button"
                onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear cliente')}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}