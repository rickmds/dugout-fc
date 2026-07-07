'use client';

import { useState } from 'react';
import { MapPin, Plus, X, Trash2, Pencil } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type SurfaceType = 'Natural Grass' | 'Artificial 3G' | 'Artificial 4G' | '5-a-side' | 'Indoor';

type Field = {
  id: string;
  name: string;
  address: string;
  surface: SurfaceType;
};

const SURFACE_COLORS: Record<SurfaceType, { bg: string; color: string }> = {
  'Natural Grass': { bg: '#F0FDF4', color: '#16A34A' },
  'Artificial 3G': { bg: '#EFF6FF', color: '#2563EB' },
  'Artificial 4G': { bg: '#EEF2FF', color: '#6366F1' },
  '5-a-side':      { bg: '#FFF7ED', color: '#EA580C' },
  'Indoor':        { bg: '#F5F3FF', color: '#7C3AED' },
};

const SURFACES: SurfaceType[] = ['Natural Grass', 'Artificial 3G', 'Artificial 4G', '5-a-side', 'Indoor'];

const MOCK_FIELDS: Field[] = [
  { id: '1', name: 'Riverside Training Ground', address: '12 Riverside Dr, Springfield', surface: 'Natural Grass' },
  { id: '2', name: 'Academy 3G Pitch',          address: '45 Academy Way, Springfield', surface: 'Artificial 3G' },
  { id: '3', name: 'Indoor Arena',              address: '88 Leisure Centre Rd, Springfield', surface: 'Indoor' },
];

const emptyForm = { name: '', address: '', surface: 'Natural Grass' as SurfaceType };

export default function FieldsPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [fields,     setFields]     = useState<Field[]>(MOCK_FIELDS);
  const [showModal,  setShowModal]  = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState(emptyForm);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [hoverAdd,   setHoverAdd]   = useState(false);

  function openAdd() {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(f: Field) {
    setEditId(f.id);
    setForm({ name: f.name, address: f.address, surface: f.surface });
    setShowModal(true);
  }

  function saveField() {
    if (!form.name.trim()) return;
    if (editId) {
      setFields(prev => prev.map(f => f.id === editId ? { ...f, ...form } : f));
    } else {
      setFields(prev => [...prev, { id: Date.now().toString(), ...form }]);
    }
    setShowModal(false);
  }

  function confirmDelete() {
    if (!deleteId) return;
    setFields(prev => prev.filter(f => f.id !== deleteId));
    setDeleteId(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Fields &amp; Venues</h1>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748B' }}>Manage training grounds and game venues</p>
        </div>
        <button
          onClick={openAdd}
          onMouseEnter={() => setHoverAdd(true)}
          onMouseLeave={() => setHoverAdd(false)}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', background: hoverAdd ? `${primary}dd` : primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'background 0.15s', fontFamily: 'inherit' }}
        >
          <Plus size={15} /> Add Field
        </button>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px', maxWidth: '560px' }}>
          {[
            { label: 'Total Venues',    value: fields.length,                                      color: primary },
            { label: 'Grass Pitches',   value: fields.filter(f => f.surface === 'Natural Grass').length, color: '#16A34A' },
            { label: 'Artificial / Indoor', value: fields.filter(f => f.surface !== 'Natural Grass').length, color: '#6366F1' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px', fontWeight: '600' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Fields list */}
        {fields.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px 32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <MapPin size={22} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No venues yet</div>
            <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, marginBottom: '20px' }}>
              Add your training grounds and game venues — assign them directly when creating events.
            </div>
            <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={14} /> Add your first field
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {fields.map(f => {
              const sc = SURFACE_COLORS[f.surface];
              return (
                <div key={f.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  {/* Icon */}
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MapPin size={20} color={sc.color} />
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '3px' }}>{f.name}</div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.address || <span style={{ color: '#CBD5E1' }}>No address set</span>}</div>
                  </div>
                  {/* Surface badge */}
                  <span style={{ fontSize: '11.5px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px', background: sc.bg, color: sc.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {f.surface}
                  </span>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <ActionIcon title="Edit" onClick={() => openEdit(f)} color="#64748B" hoverBg="#F1F5F9">
                      <Pencil size={14} />
                    </ActionIcon>
                    <ActionIcon title="Delete" onClick={() => setDeleteId(f.id)} color="#EF4444" hoverBg="#FEF2F2">
                      <Trash2 size={14} />
                    </ActionIcon>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <Modal title={editId ? 'Edit Field' : 'Add Field'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="Field name *">
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Riverside Training Ground"
                style={inputSt}
              />
            </Field>
            <Field label="Address">
              <input
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="e.g. 12 Riverside Dr, Springfield"
                style={inputSt}
              />
            </Field>
            <Field label="Surface type">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                {SURFACES.map(s => {
                  const sc = SURFACE_COLORS[s];
                  const active = form.surface === s;
                  return (
                    <button key={s} onClick={() => setForm(f => ({ ...f, surface: s }))}
                      style={{ padding: '6px 14px', borderRadius: '20px', border: `2px solid ${active ? sc.color : '#E2E8F0'}`, background: active ? sc.bg : '#fff', fontSize: '12.5px', fontWeight: active ? '700' : '500', color: active ? sc.color : '#64748B', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit' }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowModal(false)} style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={saveField} disabled={!form.name.trim()} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: form.name.trim() ? primary : '#E2E8F0', color: form.name.trim() ? '#fff' : '#94A3B8', fontSize: '13px', fontWeight: '700', cursor: form.name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              {editId ? 'Save changes' : 'Add field'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <Modal title="Delete field?" onClose={() => setDeleteId(null)}>
          <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.6, margin: '0 0 20px' }}>
            This will permanently remove the field. Events that referenced this venue will keep their address text.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setDeleteId(null)} style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={confirmDelete} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#EF4444', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Delete field</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '18px', border: '1px solid #E2E8F0', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', color: '#94A3B8' }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  );
}

function ActionIcon({ title, onClick, color, hoverBg, children }: { title: string; onClick: () => void; color: string; hoverBg: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '7px', border: 'none', background: hover ? hoverBg : 'transparent', color, cursor: 'pointer', transition: 'background 0.12s' }}
    >
      {children}
    </button>
  );
}

const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px',
  padding: '10px 13px', fontSize: '14px', color: '#0F172A', outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
