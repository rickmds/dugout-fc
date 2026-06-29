'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react';

type TryoutTeam = {
  id: string;
  name: string;
  color: string;
  age_group: string | null;
  gender: string | null;
  format: string | null;
  tier: string | null;
  sort_order: number;
  is_active: boolean;
};

const AGE_GROUPS = ['U7','U8','U9','U10','U11','U12','U13','U14'];
const FORMATS = ['7v7','9v9','11v11'];
const TIERS = ['A','B','C','D'];

const blank = (): Omit<TryoutTeam,'id'|'sort_order'|'is_active'> => ({
  name: '', color: '#22C55E', age_group: null, gender: null, format: null, tier: null,
});

export default function TryoutTeamsSettingsPage() {
  const { club } = useDashboard();

  const [teams, setTeams] = useState<TryoutTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    if (!club) return;
    const { data } = await supabase
      .from('tryout_teams')
      .select('*')
      .eq('club_id', club.id)
      .order('sort_order')
      .order('name');
    setTeams(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [club]);

  function openAdd() {
    setEditId(null);
    setForm(blank());
    setShowModal(true);
  }

  function openEdit(t: TryoutTeam) {
    setEditId(t.id);
    setForm({ name: t.name, color: t.color, age_group: t.age_group, gender: t.gender, format: t.format, tier: t.tier });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !club) return;
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), club_id: club.id };
    if (editId) {
      await supabase.from('tryout_teams').update(payload).eq('id', editId);
    } else {
      await supabase.from('tryout_teams').insert({ ...payload, sort_order: teams.length * 10 });
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('tryout_teams').delete().eq('id', id);
    setDeleteId(null);
    load();
  }

  const s = (obj: React.CSSProperties) => obj;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Tryout Teams</h1>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0' }}>
            Define the team slots used in the Team Builder.
          </p>
        </div>
        <button onClick={openAdd} style={s({ display: 'flex', alignItems: 'center', gap: '6px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 16px', fontWeight: '600', fontSize: '13.5px', cursor: 'pointer' })}>
          <Plus size={15} /> Add Team
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#94A3B8', fontSize: '14px' }}>Loading…</div>
      ) : teams.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
          <div style={{ fontSize: '14px' }}>No teams yet. Add your first team to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {teams.map(t => (
            <div key={t.id} style={s({ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' })}>
              <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: t.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#0F172A' }}>{t.name}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                  {[t.age_group, t.gender, t.format, t.tier ? `Tier ${t.tier}` : null].filter(Boolean).join(' · ') || 'No details set'}
                </div>
              </div>
              {!t.is_active && <span style={{ fontSize: '11px', background: '#FEF9C3', color: '#92400E', borderRadius: '6px', padding: '2px 8px', fontWeight: '600' }}>Inactive</span>}
              <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: '#64748B' }}>
                <Edit2 size={14} />
              </button>
              <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', color: '#EF4444' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{editId ? 'Edit Team' : 'Add Team'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Team name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Madrid" style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Age group</label>
                  <select value={form.age_group ?? ''} onChange={e => setForm(f => ({ ...f, age_group: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none' }}>
                    <option value="">Any</option>
                    {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Gender</label>
                  <select value={form.gender ?? ''} onChange={e => setForm(f => ({ ...f, gender: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none' }}>
                    <option value="">Any</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Mixed</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Format</label>
                  <select value={form.format ?? ''} onChange={e => setForm(f => ({ ...f, format: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none' }}>
                    <option value="">—</option>
                    {FORMATS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Tier</label>
                  <select value={form.tier ?? ''} onChange={e => setForm(f => ({ ...f, tier: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none' }}>
                    <option value="">—</option>
                    {TIERS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Team color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: '40px', height: '36px', padding: '2px', border: '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }} />
                  <span style={{ fontSize: '13px', color: '#64748B' }}>{form.color}</span>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '8px' }}>Delete team?</div>
            <div style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '20px' }}>This won't delete players — just the team slot.</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: '13.5px' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} style={{ padding: '9px 20px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13.5px' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
