'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Plus, Edit2, Trash2, X, Check, RefreshCw, ArrowRight, DollarSign, Copy } from 'lucide-react';

type TryoutTeam = {
  id: string;
  name: string;
  color: string;
  age_group: string | null;
  gender: string | null;
  format: string | null;
  tier: string | null;
  season_fee: string | null;
  deposit_amount: string | null;
  sort_order: number;
  is_active: boolean;
};

type ClubTeam = { id: string; name: string; age_group: string | null };
type BulkRow  = { id: string; name: string; age_group: string | null; format: string | null; tier: string | null; season_fee: string; deposit_amount: string; changed: boolean };

function incrementAgeGroup(ag: string | null): string | null {
  if (!ag) return ag;
  return ag.replace(/U(\d+)/gi, (_, n) => `U${parseInt(n) + 1}`);
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', CAD: 'CA$', AUD: 'A$' };

const AGE_GROUPS = ['U7','U8','U9','U10','U11','U12','U13','U14'];
const FORMATS = ['7v7','9v9','11v11'];
const TIERS = ['A','B','C','D'];

const blank = (): Omit<TryoutTeam,'id'|'sort_order'|'is_active'> => ({
  name: '', color: '#22C55E', age_group: null, gender: null, format: null, tier: null,
  season_fee: null, deposit_amount: null,
});

export default function TryoutTeamsSettingsPage() {
  const { club } = useDashboard();
  const currSym = CURRENCY_SYMBOLS[club?.currency ?? 'USD'] ?? '$';

  const [teams, setTeams]       = useState<TryoutTeam[]>([]);
  const [clubTeams, setClubTeams] = useState<ClubTeam[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState(blank());
  const [saving, setSaving]     = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showSync, setShowSync]       = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [showBulkFees, setShowBulkFees] = useState(false);
  const [bulkRows, setBulkRows]       = useState<BulkRow[]>([]);
  const [bulkApplyFee, setBulkApplyFee]         = useState('');
  const [bulkApplyDeposit, setBulkApplyDeposit] = useState('');
  const [bulkSaving, setBulkSaving]   = useState(false);

  async function load() {
    if (!club) return;
    const [{ data }, { data: ct }] = await Promise.all([
      supabase.from('tryout_teams').select('*').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('teams').select('id, name, age_group').eq('club_id', club.id).order('name'),
    ]);
    setTeams(data ?? []);
    setClubTeams(ct ?? []);
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
    setForm({ name: t.name, color: t.color, age_group: t.age_group, gender: t.gender, format: t.format, tier: t.tier, season_fee: t.season_fee, deposit_amount: t.deposit_amount });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.gender || !club) return;
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

  // Teams from club that are not yet in tryout_teams (matched by name, case-insensitive)
  const teamsToSync = clubTeams
    .filter(ct => !teams.some(tt => tt.name.toLowerCase() === ct.name.toLowerCase()))
    .map(ct => ({ ...ct, new_age_group: incrementAgeGroup(ct.age_group) }));

  async function doSync() {
    if (!club || teamsToSync.length === 0) return;
    setSyncing(true);
    await supabase.from('tryout_teams').insert(
      teamsToSync.map((ct, i) => ({
        club_id: club.id,
        name: ct.name,
        age_group: ct.new_age_group,
        color: '#22C55E',
        sort_order: (teams.length + i) * 10,
        is_active: true,
      }))
    );
    setSyncing(false);
    setShowSync(false);
    load();
  }

  function openBulkFees() {
    setBulkApplyFee('');
    setBulkApplyDeposit('');
    setBulkRows(teams.map(t => ({
      id: t.id, name: t.name, age_group: t.age_group, format: t.format, tier: t.tier,
      season_fee: t.season_fee ?? '', deposit_amount: t.deposit_amount ?? '', changed: false,
    })));
    setShowBulkFees(true);
  }

  function updateBulkRow(id: string, field: 'season_fee' | 'deposit_amount', value: string) {
    setBulkRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value, changed: true } : r));
  }

  function applyToAll() {
    setBulkRows(prev => prev.map(r => ({
      ...r,
      season_fee:     bulkApplyFee     ? bulkApplyFee     : r.season_fee,
      deposit_amount: bulkApplyDeposit ? bulkApplyDeposit : r.deposit_amount,
      changed: (bulkApplyFee || bulkApplyDeposit) ? true : r.changed,
    })));
  }

  function applyToEmpty() {
    setBulkRows(prev => prev.map(r => ({
      ...r,
      season_fee:     (!r.season_fee     && bulkApplyFee)     ? bulkApplyFee     : r.season_fee,
      deposit_amount: (!r.deposit_amount && bulkApplyDeposit) ? bulkApplyDeposit : r.deposit_amount,
      changed: ((!r.season_fee && bulkApplyFee) || (!r.deposit_amount && bulkApplyDeposit)) ? true : r.changed,
    })));
  }

  function copyFeeToFormat(row: BulkRow) {
    if (!row.format) return;
    setBulkRows(prev => prev.map(r =>
      r.format === row.format
        ? { ...r, season_fee: row.season_fee, deposit_amount: row.deposit_amount, changed: true }
        : r
    ));
  }

  async function saveBulkFees() {
    const changed = bulkRows.filter(r => r.changed);
    if (!changed.length) { setShowBulkFees(false); return; }
    setBulkSaving(true);
    await Promise.all(changed.map(r =>
      supabase.from('tryout_teams').update({ season_fee: r.season_fee || null, deposit_amount: r.deposit_amount || null }).eq('id', r.id)
    ));
    setBulkSaving(false);
    setShowBulkFees(false);
    load();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* sticky header */}
      <div style={{ padding: '20px 28px 16px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>Tryout Setup</div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Teams</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>Define the team slots used in the Team Builder.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {clubTeams.length > 0 && (
            <button onClick={() => setShowSync(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '9px 16px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              <RefreshCw size={13} /> Sync from Club
            </button>
          )}
          {teams.length > 0 && (
            <button onClick={openBulkFees} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '9px 16px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              <DollarSign size={13} /> Set Fees
            </button>
          )}
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
            <Plus size={15} /> Add Team
          </button>
        </div>
      </div>

      {/* scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#F8FAFC' }}>
        {loading ? (
          <div style={{ color: '#94A3B8', fontSize: '14px' }}>Loading…</div>
        ) : teams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No tryout teams yet</div>
            {clubTeams.length > 0 ? (
              <>
                <div style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '6px' }}>
                  You have <strong>{clubTeams.length} club team{clubTeams.length !== 1 ? 's' : ''}</strong> — import them with age groups shifted up by one year.
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '24px' }}>You can also add teams manually or edit them after import.</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={() => setShowSync(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
                    <RefreshCw size={14} /> Import from Club Teams
                  </button>
                  <button onClick={openAdd} style={{ padding: '10px 18px', background: '#fff', color: '#374151', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Add manually</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13.5px', color: '#94A3B8', marginBottom: '24px' }}>Add your first team slot to start building rosters.</div>
                <button onClick={openAdd} style={{ padding: '10px 20px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>Add First Team</button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* summary bar */}
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '10px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#15803D' }}>{teams.filter(t => t.is_active).length} active teams</span>
              <span style={{ width: '1px', height: '16px', background: '#BBF7D0' }} />
              <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>{teams.length} total</span>
              {teams.some(t => !t.season_fee) && (
                <>
                  <span style={{ width: '1px', height: '16px', background: '#BBF7D0' }} />
                  <span style={{ fontSize: '12px', color: '#D97706', fontWeight: '600' }}>⚠ {teams.filter(t => !t.season_fee).length} team{teams.filter(t => !t.season_fee).length !== 1 ? 's' : ''} missing fee</span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {teams.map(t => (
                <div key={t.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderLeft: `5px solid ${t.color}`, borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${t.color}20`, border: `2px solid ${t.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: t.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '6px' }}>{t.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[t.age_group, t.gender, t.format, t.tier ? `Tier ${t.tier}` : null].filter(Boolean).map((tag, i) => (
                        <span key={i} style={{ fontSize: '11px', background: '#F1F5F9', color: '#64748B', borderRadius: '20px', padding: '2px 9px', fontWeight: '600' }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '100px' }}>
                    {t.season_fee ? (
                      <>
                        <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>{currSym}{t.season_fee}</div>
                        {t.deposit_amount && <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '1px' }}>{currSym}{t.deposit_amount} deposit</div>}
                      </>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#D97706', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '5px', padding: '2px 8px' }}>No fee set</span>
                    )}
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
          </>
        )}
      </div>

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
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Gender *</label>
                  <select value={form.gender ?? ''} onChange={e => setForm(f => ({ ...f, gender: e.target.value || null }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: `1px solid ${!form.gender ? '#FCA5A5' : '#E2E8F0'}`, fontSize: '14px', color: form.gender ? '#0F172A' : '#94A3B8', background: '#fff', outline: 'none' }}>
                    <option value="">Select gender…</option>
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

              {/* Fees — divider */}
              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Fees ({currSym}) — leave blank if no fee for this team</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Season Fee</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94A3B8', pointerEvents: 'none' }}>{currSym}</span>
                      <input value={form.season_fee ?? ''} onChange={e => setForm(f => ({ ...f, season_fee: e.target.value || null }))}
                        placeholder="1,200" style={{ width: '100%', padding: '9px 12px 9px 26px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Deposit Amount</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#94A3B8', pointerEvents: 'none' }}>{currSym}</span>
                      <input value={form.deposit_amount ?? ''} onChange={e => setForm(f => ({ ...f, deposit_amount: e.target.value || null }))}
                        placeholder="200" style={{ width: '100%', padding: '9px 12px 9px 26px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.gender} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: saving || !form.name.trim() || !form.gender ? 'default' : 'pointer', opacity: saving || !form.name.trim() || !form.gender ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Fees modal */}
      {showBulkFees && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }}>
          <div style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '760px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: '900', fontSize: '17px', color: '#0F172A' }}>Set Fees</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>{teams.length} teams — edit inline, save once at the bottom</div>
              </div>
              <button onClick={() => setShowBulkFees(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={16} color="#64748B" /></button>
            </div>

            {/* Quick-fill bar */}
            <div style={{ padding: '12px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', flexShrink: 0 }}>Quick-fill:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>{currSym} Fee</span>
                <input value={bulkApplyFee} onChange={e => setBulkApplyFee(e.target.value)} placeholder="e.g. 1200" type="number"
                  style={{ width: '80px', border: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', background: 'transparent' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600' }}>{currSym} Deposit</span>
                <input value={bulkApplyDeposit} onChange={e => setBulkApplyDeposit(e.target.value)} placeholder="e.g. 200" type="number"
                  style={{ width: '80px', border: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', background: 'transparent' }} />
              </div>
              <button onClick={applyToAll} disabled={!bulkApplyFee && !bulkApplyDeposit}
                style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: (!bulkApplyFee && !bulkApplyDeposit) ? '#F1F5F9' : '#0F172A', color: (!bulkApplyFee && !bulkApplyDeposit) ? '#94A3B8' : '#fff', fontSize: '12px', fontWeight: '700', cursor: (!bulkApplyFee && !bulkApplyDeposit) ? 'default' : 'pointer' }}>
                Apply to all
              </button>
              <button onClick={applyToEmpty} disabled={!bulkApplyFee && !bulkApplyDeposit}
                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', color: '#374151', fontSize: '12px', fontWeight: '600', cursor: (!bulkApplyFee && !bulkApplyDeposit) ? 'default' : 'pointer', opacity: (!bulkApplyFee && !bulkApplyDeposit) ? 0.5 : 1 }}>
                Fill empty only
              </button>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Age</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tier</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Season fee ({currSym})</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deposit ({currSym})</th>
                    <th style={{ width: '36px' }} />
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, i) => (
                    <tr key={row.id}
                      style={{ borderBottom: '1px solid #F1F5F9', background: row.changed ? '#FEFCE8' : i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '8px 16px' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{row.name}</div>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '12.5px', color: '#64748B', whiteSpace: 'nowrap' }}>{row.age_group ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: '12.5px', color: '#64748B' }}>{row.format ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: '12.5px', color: '#64748B' }}>{row.tier ?? '—'}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <input value={row.season_fee} onChange={e => updateBulkRow(row.id, 'season_fee', e.target.value)} type="number" placeholder="—"
                          style={{ width: '90px', padding: '6px 8px', border: '1.5px solid', borderColor: row.changed && row.season_fee ? '#22C55E' : '#E2E8F0', borderRadius: '7px', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit' }} />
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input value={row.deposit_amount} onChange={e => updateBulkRow(row.id, 'deposit_amount', e.target.value)} type="number" placeholder="—"
                          style={{ width: '90px', padding: '6px 8px', border: '1.5px solid', borderColor: row.changed && row.deposit_amount ? '#22C55E' : '#E2E8F0', borderRadius: '7px', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {row.format && (
                          <button onClick={() => copyFeeToFormat(row)} title={`Copy to all ${row.format} teams`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8', display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#0F172A'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94A3B8'}>
                            <Copy size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fff' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                {bulkRows.filter(r => r.changed).length > 0
                  ? <span style={{ color: '#D97706', fontWeight: '600' }}>{bulkRows.filter(r => r.changed).length} unsaved change{bulkRows.filter(r => r.changed).length !== 1 ? 's' : ''} — rows highlighted in yellow</span>
                  : 'No changes yet'}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowBulkFees(false)} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveBulkFees} disabled={bulkSaving || !bulkRows.some(r => r.changed)}
                  style={{ padding: '9px 20px', borderRadius: '9px', background: bulkRows.some(r => r.changed) ? '#22C55E' : '#94A3B8', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '700', cursor: bulkRows.some(r => r.changed) ? 'pointer' : 'default', opacity: bulkSaving ? 0.7 : 1 }}>
                  {bulkSaving ? 'Saving…' : `Save ${bulkRows.filter(r => r.changed).length || ''} changes`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync from Club modal */}
      {showSync && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setShowSync(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#0F172A' }}>Sync from Club Teams</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>Age groups shift up by 1 year for the new season</div>
              </div>
              <button onClick={() => setShowSync(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {teamsToSync.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontSize: '13.5px' }}>
                  <Check size={32} color="#22C55E" style={{ display: 'block', margin: '0 auto 10px' }} />
                  All club teams are already in Tryout Teams.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {teamsToSync.map(ct => (
                    <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', borderRadius: '10px', padding: '10px 14px' }}>
                      <div style={{ flex: 1, fontWeight: '600', fontSize: '14px', color: '#0F172A' }}>{ct.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', background: '#F1F5F9', borderRadius: '5px', padding: '2px 8px' }}>{ct.age_group ?? '—'}</span>
                        <ArrowRight size={13} color="#94A3B8" />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#22C55E', background: '#F0FDF4', borderRadius: '5px', padding: '2px 8px' }}>{ct.new_age_group ?? '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {teamsToSync.length > 0 && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A', fontSize: '12px', color: '#92400E' }}>
                  You can edit individual teams after import to adjust colors, format, tier, and fees.
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowSync(false)} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={doSync} disabled={syncing || teamsToSync.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 20px', borderRadius: '9px', background: teamsToSync.length === 0 ? '#94A3B8' : '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '700', cursor: teamsToSync.length === 0 ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1 }}>
                {syncing ? 'Importing…' : `Import ${teamsToSync.length} team${teamsToSync.length !== 1 ? 's' : ''}`}
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
