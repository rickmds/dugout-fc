'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import {
  MapPin, Plus, Trash2, ChevronDown, ChevronRight, X,
  Lightbulb, Car, DoorOpen, Droplets, Users, Utensils, Pencil,
} from 'lucide-react';

type TryoutField = {
  id: string; club_id: string; name: string; sub_zones: string[];
  is_active: boolean; is_closed: boolean; sort_order: number;
  address: string | null; surface: string | null; has_lights: boolean;
  field_size: string | null; dimensions: string | null; facilities: string[];
  rental_cost_per_hour: number | null;
  facility_contact_name: string | null; facility_contact_phone: string | null;
  field_notes: string | null;
};

const SURFACES = ['Natural Grass', 'Artificial 3G', 'Artificial 4G', 'Hybrid', 'Indoor'] as const;
const FIELD_SIZES = ['Full 11v11', '9v9', '7v7', '5v5', 'Futsal'] as const;
const FACILITIES_LIST = [
  { key: 'Changing Rooms',    icon: DoorOpen },
  { key: 'Restrooms',         icon: Droplets },
  { key: 'Covered Seating',   icon: Users },
  { key: 'Parking On-site',   icon: Car },
  { key: 'Concessions',       icon: Utensils },
] as const;

const SURFACE_COLORS: Record<string, { bg: string; color: string }> = {
  'Natural Grass': { bg: '#F0FDF4', color: '#16A34A' },
  'Artificial 3G': { bg: '#EFF6FF', color: '#2563EB' },
  'Artificial 4G': { bg: '#EEF2FF', color: '#6366F1' },
  'Hybrid':        { bg: '#FFF7ED', color: '#EA580C' },
  'Indoor':        { bg: '#F5F3FF', color: '#7C3AED' },
};

const blank = (): FormState => ({
  name: '', address: '', surface: '', has_lights: false,
  field_size: '', dimensions: '', facilities: [],
  rental_cost_per_hour: '', facility_contact_name: '',
  facility_contact_phone: '', field_notes: '',
  is_active: true, is_closed: false, sub_zones: [], newZone: '',
});

type FormState = {
  name: string; address: string; surface: string; has_lights: boolean;
  field_size: string; dimensions: string; facilities: string[];
  rental_cost_per_hour: string; facility_contact_name: string;
  facility_contact_phone: string; field_notes: string;
  is_active: boolean; is_closed: boolean; sub_zones: string[]; newZone: string;
};

const inp: React.CSSProperties = {
  padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0',
  fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
};

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', display: 'block', marginBottom: '6px' }}>{children}</label>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: '20px', borderBottom: '1px solid #F1F5F9', marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '14px' }}>{title}</div>
      {children}
    </div>
  );
}

export default function TryoutFieldsPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [fields, setFields]         = useState<TryoutField[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(blank());
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  async function load() {
    if (!club) return;
    const { data } = await supabase.from('tryout_fields').select('*').eq('club_id', club.id).order('sort_order').order('name');
    setFields((data ?? []) as TryoutField[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [club]);

  function openAdd() {
    setEditId(null);
    setForm(blank());
    setPanelOpen(true);
  }

  function openEdit(f: TryoutField) {
    setEditId(f.id);
    setForm({
      name: f.name, address: f.address ?? '', surface: f.surface ?? '',
      has_lights: f.has_lights ?? false, field_size: f.field_size ?? '',
      dimensions: f.dimensions ?? '', facilities: f.facilities ?? [],
      rental_cost_per_hour: f.rental_cost_per_hour != null ? String(f.rental_cost_per_hour) : '',
      facility_contact_name: f.facility_contact_name ?? '',
      facility_contact_phone: f.facility_contact_phone ?? '',
      field_notes: f.field_notes ?? '',
      is_active: f.is_active ?? true, is_closed: f.is_closed ?? false,
      sub_zones: f.sub_zones ?? [], newZone: '',
    });
    setPanelOpen(true);
  }

  function closePanel() { setPanelOpen(false); setEditId(null); }

  async function save() {
    if (!club || !form.name.trim()) return;
    setSaving(true);
    const payload = {
      club_id: club.id,
      name: form.name.trim(),
      address: form.address || null,
      surface: form.surface || null,
      has_lights: form.has_lights,
      field_size: form.field_size || null,
      dimensions: form.dimensions || null,
      facilities: form.facilities,
      rental_cost_per_hour: form.rental_cost_per_hour ? parseFloat(form.rental_cost_per_hour) : null,
      facility_contact_name: form.facility_contact_name || null,
      facility_contact_phone: form.facility_contact_phone || null,
      field_notes: form.field_notes || null,
      is_active: form.is_active,
      is_closed: form.is_closed,
      sub_zones: form.sub_zones,
      sort_order: editId ? undefined : fields.length,
    };
    if (editId) {
      await supabase.from('tryout_fields').update(payload).eq('id', editId);
    } else {
      await supabase.from('tryout_fields').insert(payload);
    }
    setSaving(false);
    closePanel();
    await load();
  }

  function toggleFacility(key: string) {
    setForm(f => ({
      ...f,
      facilities: f.facilities.includes(key) ? f.facilities.filter(x => x !== key) : [...f.facilities, key],
    }));
  }

  function addZone() {
    const z = form.newZone.trim();
    if (!z || form.sub_zones.includes(z)) return;
    setForm(f => ({ ...f, sub_zones: [...f.sub_zones, z], newZone: '' }));
  }

  function removeZone(z: string) {
    setForm(f => ({ ...f, sub_zones: f.sub_zones.filter(x => x !== z) }));
  }

  async function deleteField(id: string) {
    await supabase.from('tryout_fields').delete().eq('id', id);
    setDeleteId(null);
    await load();
  }

  async function toggleActive(f: TryoutField) {
    await supabase.from('tryout_fields').update({ is_active: !f.is_active }).eq('id', f.id);
    await load();
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
      <div style={{ fontSize: '13px', color: '#94A3B8' }}>Loading fields…</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Tryouts · Setup</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Fields &amp; Zones</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>Define fields and their zones — used in the Practice Schedule</p>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={15} /> Add Field
        </button>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: '860px' }}>
        {/* Hint */}
        <div style={{ background: `${primary}12`, border: `1px solid ${primary}30`, borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12.5px', color: '#374151', lineHeight: 1.5 }}>
          <strong>How it works:</strong> Add each field with full details, then define its zones (e.g. &quot;North Half&quot;, &quot;1A&quot;). Zones appear as columns in the Practice Schedule. Rental cost auto-creates expense entries when slots are assigned.
        </div>

        {fields.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '64px 32px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <MapPin size={22} color="#94A3B8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No fields yet</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Add your first field to get started.</div>
            <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={14} /> Add field
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {fields.map(field => {
              const open = expanded.has(field.id);
              const sc = field.surface ? SURFACE_COLORS[field.surface] : null;
              return (
                <div key={field.id} style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${field.is_closed ? '#FCA5A5' : '#E2E8F0'}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  {/* Field row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px' }}>
                    {/* Icon */}
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: sc ? sc.bg : `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={18} color={sc ? sc.color : primary} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '800', fontSize: '14px', color: '#0F172A' }}>{field.name}</span>
                        {field.is_closed && <span style={{ fontSize: '10px', fontWeight: '700', background: '#FEF2F2', color: '#EF4444', padding: '1px 7px', borderRadius: '20px' }}>CLOSED</span>}
                        {!field.is_active && !field.is_closed && <span style={{ fontSize: '10px', fontWeight: '700', background: '#F1F5F9', color: '#94A3B8', padding: '1px 7px', borderRadius: '20px' }}>INACTIVE</span>}
                        {field.surface && sc && <span style={{ fontSize: '10.5px', fontWeight: '700', background: sc.bg, color: sc.color, padding: '1px 8px', borderRadius: '20px' }}>{field.surface}</span>}
                        {field.has_lights && <span title="Has lights" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', fontWeight: '700', background: '#FEFCE8', color: '#CA8A04', padding: '1px 8px', borderRadius: '20px' }}><Lightbulb size={10} /> Lights</span>}
                        {field.field_size && <span style={{ fontSize: '10.5px', fontWeight: '700', background: '#F0F9FF', color: '#0284C7', padding: '1px 8px', borderRadius: '20px' }}>{field.field_size}</span>}
                        {field.rental_cost_per_hour != null && <span style={{ fontSize: '10.5px', fontWeight: '700', background: '#F0FDF4', color: '#16A34A', padding: '1px 8px', borderRadius: '20px' }}>${field.rental_cost_per_hour}/hr</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>
                        {[field.address, field.sub_zones.length > 0 ? `${field.sub_zones.length} zone${field.sub_zones.length !== 1 ? 's' : ''}` : 'No zones'].filter(Boolean).join(' · ')}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => openEdit(field)} title="Edit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; (e.currentTarget as HTMLElement).style.color = '#374151'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteId(field.id)} title="Delete" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLElement).style.color = '#EF4444'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}>
                        <Trash2 size={13} />
                      </button>
                      <button onClick={() => setExpanded(prev => { const next = new Set(prev); next.has(field.id) ? next.delete(field.id) : next.add(field.id); return next; })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}>
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Zones panel */}
                  {open && (
                    <div style={{ borderTop: '1px solid #F1F5F9', padding: '14px 18px', background: '#FAFBFC' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Zones</div>
                      {field.sub_zones.length === 0
                        ? <div style={{ fontSize: '12.5px', color: '#CBD5E1', fontStyle: 'italic', marginBottom: '10px' }}>No zones defined — click Edit to add zones.</div>
                        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                            {field.sub_zones.map(z => (
                              <span key={z} style={{ fontSize: '12.5px', fontWeight: '600', background: '#fff', border: '1.5px solid #E2E8F0', color: '#0F172A', padding: '4px 12px', borderRadius: '8px' }}>{z}</span>
                            ))}
                          </div>
                      }
                      <button onClick={() => openEdit(field)} style={{ fontSize: '12px', fontWeight: '600', color: primary, background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontFamily: 'inherit', textDecoration: 'underline' }}>
                        Edit zones
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Side panel ── */}
      {panelOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100 }} onClick={closePanel} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', background: '#fff', zIndex: 101, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)', overflowY: 'auto' }}>
            {/* Panel header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>{editId ? 'Edit Field' : 'Add Field'}</div>
              <button onClick={closePanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex' }}><X size={18} /></button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>

              {/* Identity */}
              <Section title="Identity">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <Label>Field name *</Label>
                    <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Superdome Sports, Maple Field" style={inp} />
                  </div>
                  <div>
                    <Label>Address</Label>
                    <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Springfield, NJ" style={inp} />
                  </div>
                </div>
              </Section>

              {/* Surface */}
              <Section title="Surface">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {SURFACES.map(s => {
                    const sc = SURFACE_COLORS[s];
                    const active = form.surface === s;
                    return (
                      <button key={s} onClick={() => setForm(f => ({ ...f, surface: active ? '' : s }))}
                        style={{ padding: '6px 14px', borderRadius: '20px', border: `2px solid ${active ? sc.color : '#E2E8F0'}`, background: active ? sc.bg : '#fff', fontSize: '12.5px', fontWeight: active ? '700' : '500', color: active ? sc.color : '#64748B', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit' }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Physical */}
              <Section title="Physical">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <Label>Size / Format</Label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {FIELD_SIZES.map(s => {
                        const active = form.field_size === s;
                        return (
                          <button key={s} onClick={() => setForm(f => ({ ...f, field_size: active ? '' : s }))}
                            style={{ padding: '6px 14px', borderRadius: '20px', border: `2px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}15` : '#fff', fontSize: '12.5px', fontWeight: active ? '700' : '500', color: active ? primary : '#64748B', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit' }}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <Label>Dimensions (optional)</Label>
                    <input value={form.dimensions} onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))} placeholder="e.g. 115 × 75 yds" style={inp} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <div
                      onClick={() => setForm(f => ({ ...f, has_lights: !f.has_lights }))}
                      style={{ width: '42px', height: '24px', borderRadius: '12px', background: form.has_lights ? '#CA8A04' : '#E2E8F0', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '3px', left: form.has_lights ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '5px' }}><Lightbulb size={14} color={form.has_lights ? '#CA8A04' : '#94A3B8'} /> Floodlights available</div>
                      <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>Enables evening session scheduling</div>
                    </div>
                  </label>
                </div>
              </Section>

              {/* Facilities */}
              <Section title="Facilities">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {FACILITIES_LIST.map(({ key, icon: Icon }) => {
                    const active = form.facilities.includes(key);
                    return (
                      <button key={key} onClick={() => toggleFacility(key)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', border: `2px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}12` : '#fff', fontSize: '12.5px', fontWeight: active ? '700' : '500', color: active ? primary : '#64748B', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit' }}>
                        <Icon size={12} />{key}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Financial */}
              <Section title="Financial">
                <div>
                  <Label>Rental cost per hour ($)</Label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.rental_cost_per_hour}
                    onChange={e => setForm(f => ({ ...f, rental_cost_per_hour: e.target.value }))}
                    placeholder="e.g. 150"
                    style={inp}
                  />
                  <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '5px' }}>When a practice slot is assigned to this field, an expense entry is automatically created in Finances.</div>
                </div>
              </Section>

              {/* Contact */}
              <Section title="Facility Contact">
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <Label>Name</Label>
                    <input value={form.facility_contact_name} onChange={e => setForm(f => ({ ...f, facility_contact_name: e.target.value }))} placeholder="John Smith" style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Phone</Label>
                    <input value={form.facility_contact_phone} onChange={e => setForm(f => ({ ...f, facility_contact_phone: e.target.value }))} placeholder="(555) 000-0000" style={inp} />
                  </div>
                </div>
              </Section>

              {/* Zones */}
              <Section title="Zones">
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#64748B' }}>Define sub-areas of this field. Each zone becomes a column in the field view scheduler.</div>
                {form.sub_zones.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {form.sub_zones.map(z => (
                      <div key={z} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '5px 10px 5px 12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{z}</span>
                        <button onClick={() => removeZone(z)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', padding: '0', display: 'flex', lineHeight: 1 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#EF4444'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#CBD5E1'}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={form.newZone}
                    onChange={e => setForm(f => ({ ...f, newZone: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addZone(); } }}
                    placeholder="e.g. North Half, 1A, Quarter 3…"
                    style={{ ...inp, flex: 1, width: 'auto' }}
                  />
                  <button onClick={addZone} disabled={!form.newZone.trim()} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 14px', borderRadius: '8px', background: form.newZone.trim() ? primary : '#E2E8F0', color: form.newZone.trim() ? '#fff' : '#94A3B8', border: 'none', fontSize: '13px', fontWeight: '700', cursor: form.newZone.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0 }}>
                    <Plus size={13} /> Add
                  </button>
                </div>
              </Section>

              {/* Notes & Status */}
              <Section title="Notes &amp; Status">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <Label>Notes</Label>
                    <textarea value={form.field_notes} onChange={e => setForm(f => ({ ...f, field_notes: e.target.value }))} placeholder="Parking notes, access codes, anything useful…" rows={3} style={{ ...inp, resize: 'vertical', lineHeight: '1.5' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: '#374151' }}>
                      <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: primary }} />
                      Active
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: '#EF4444' }}>
                      <input type="checkbox" checked={form.is_closed} onChange={e => setForm(f => ({ ...f, is_closed: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: '#EF4444' }} />
                      Closed / Unavailable
                    </label>
                  </div>
                </div>
              </Section>
            </div>

            {/* Panel footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', background: '#fff', display: 'flex', justifyContent: 'flex-end', gap: '10px', position: 'sticky', bottom: 0 }}>
              <button onClick={closePanel} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()} style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: form.name.trim() ? primary : '#E2E8F0', color: form.name.trim() ? '#fff' : '#94A3B8', fontSize: '13px', fontWeight: '700', cursor: form.name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add field'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }} onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginBottom: '10px' }}>Delete field?</div>
            <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.6, margin: '0 0 20px' }}>
              This removes the field, its zones, and any associated expense entries. Practice slots that referenced this field will keep their text values.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => deleteField(deleteId)} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#EF4444', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
