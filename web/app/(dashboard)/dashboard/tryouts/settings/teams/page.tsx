'use client';

import { useState, useEffect, useRef } from 'react';
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
  const autoSyncedRef = useRef(false);

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

  // Auto-sync from club teams on first load when no tryout teams exist yet
  useEffect(() => {
    if (loading) return;
    if (autoSyncedRef.current) return;
    if (teams.length === 0 && clubTeams.length > 0) {
      autoSyncedRef.current = true;
      doSync();
    }
  }, [loading, teams.length, clubTeams.length]);

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

  function openAddWithDefaults(gender?: string, age_group?: string, tier?: string) {
    setEditId(null);
    setForm({ ...blank(), gender: gender ?? null, age_group: age_group ?? null, tier: tier ?? null });
    setShowModal(true);
  }

  function renderGenderGrid(gender: 'Male' | 'Female', label: string) {
    const genderTeams = teams.filter(t => t.gender === gender);
    const fromData = genderTeams.filter(t => t.tier).map(t => t.tier as string);
    const tiers = Array.from(new Set(['A', 'B', 'C', 'D', ...fromData])).sort();
    const lastTier = tiers[tiers.length - 1];
    const nextTierLabel = lastTier && /^[A-Z]$/.test(lastTier)
      ? String.fromCharCode(lastTier.charCodeAt(0) + 1)
      : String(tiers.length + 1);
    const cols = `64px repeat(${tiers.length + 1}, 1fr)`;
    const ungrouped = genderTeams.filter(t => !t.age_group);
    const notier    = genderTeams.filter(t => t.age_group && !t.tier);
    const accent = gender === 'Male' ? '#3B82F6' : '#EC4899';

    return (
      <div key={gender} style={{ marginBottom: '28px' }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '3px', height: '20px', background: accent, borderRadius: '2px' }} />
            <span style={{ fontSize: '15px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.3px' }}>{label}</span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>{genderTeams.length} team{genderTeams.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={() => openAddWithDefaults(gender)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', background: '#fff', border: `1.5px solid ${accent}40`, borderRadius: '6px', fontSize: '12px', fontWeight: '700', color: accent, cursor: 'pointer' }}>
            <Plus size={12} /> Add {label} team
          </button>
        </div>

        {/* Tier column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', marginBottom: '6px', paddingLeft: '4px' }}>
          <div />
          {tiers.map(tier => (
            <div key={tier} style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', textAlign: 'center' }}>
              Tier {tier}
            </div>
          ))}
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>
            + Tier {nextTierLabel}
          </div>
        </div>

        {/* Age group rows */}
        {AGE_GROUPS.map(ag => (
          <div key={ag} style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', marginBottom: '8px', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '900', color: '#0F172A', background: '#F1F5F9', borderRadius: '6px', padding: '4px 8px', letterSpacing: '-0.3px' }}>{ag}</span>
            </div>
            {tiers.map(tier => {
              const team = genderTeams.find(t => t.age_group === ag && t.tier === tier);
              if (!team) return (
                <div key={tier} onClick={() => openAddWithDefaults(gender, ag, tier)}
                  style={{ background: '#fff', border: '1px dashed #E2E8F0', borderRadius: '8px', minHeight: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0.6, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.6'}>
                  <Plus size={13} color="#CBD5E1" />
                </div>
              );
              return (
                <div key={tier} style={{ background: '#fff', border: '1px solid #E2E8F0', borderTop: `3px solid ${team.color}`, borderRadius: '8px', padding: '10px 12px', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0F172A', marginBottom: '5px', paddingRight: '36px' }}>{team.name}</div>
                  {team.format && (
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 5px', fontWeight: '600' }}>{team.format}</span>
                    </div>
                  )}
                  {team.season_fee
                    ? <div style={{ fontSize: '12px', fontWeight: '800', color: '#15803D' }}>{currSym}{team.season_fee}{team.deposit_amount ? <span style={{ fontWeight: '500', color: '#94A3B8', fontSize: '10px' }}> / {currSym}{team.deposit_amount} dep</span> : null}</div>
                    : <div style={{ fontSize: '10px', color: '#D97706', fontWeight: '600' }}>No fee</div>}
                  <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '1px' }}>
                    <button onClick={() => openEdit(team)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#94A3B8' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#0F172A'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94A3B8'}>
                      <Edit2 size={11} />
                    </button>
                    <button onClick={() => setDeleteId(team.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#94A3B8' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#EF4444'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94A3B8'}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
            {/* New tier slot */}
            <div onClick={() => openAddWithDefaults(gender, ag, nextTierLabel)}
              style={{ background: '#FAFBFC', border: '1px dashed #E2E8F0', borderRadius: '8px', minHeight: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0.4, transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.9'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.4'}>
              <Plus size={11} color="#94A3B8" />
            </div>
          </div>
        ))}

        {/* Teams with age group but no tier */}
        {notier.length > 0 && (
          <div style={{ marginTop: '10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '10px 14px' }}>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#92400E', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              ⚠ No tier assigned — edit to place in the grid
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {notier.map(t => (
                <div key={t.id} style={{ background: '#fff', border: '1px solid #FDE68A', borderLeft: `4px solid ${t.color}`, borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, fontWeight: '700', fontSize: '13px', color: '#0F172A' }}>{t.name}</div>
                  <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 6px', fontWeight: '600' }}>{t.age_group}</span>
                  {t.format && <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 6px', fontWeight: '600' }}>{t.format}</span>}
                  {t.season_fee ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803D' }}>{currSym}{t.season_fee}</span> : <span style={{ fontSize: '10px', color: '#D97706', fontWeight: '600' }}>No fee</span>}
                  <button onClick={() => openEdit(t)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer', fontSize: '11.5px', fontWeight: '700', color: '#92400E' }}>
                    <Edit2 size={10} /> Set tier
                  </button>
                  <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8' }}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ungrouped teams for this gender */}
        {ungrouped.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>No age group</div>
            {ungrouped.map(t => (
              <div key={t.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderLeft: `4px solid ${t.color}`, borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ flex: 1, fontWeight: '700', fontSize: '13px', color: '#0F172A' }}>{t.name}</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[t.format, t.tier ? `Tier ${t.tier}` : null].filter(Boolean).map((tag, i) => (
                    <span key={i} style={{ fontSize: '10px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 6px', fontWeight: '600' }}>{tag}</span>
                  ))}
                </div>
                {t.season_fee ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803D' }}>{currSym}{t.season_fee}</span> : <span style={{ fontSize: '10px', color: '#D97706', fontWeight: '600' }}>No fee</span>}
                <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8' }}><Edit2 size={13} /></button>
                <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: '1px', background: '#E2E8F0', marginTop: '12px' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* sticky header */}
      <div style={{ padding: '14px 32px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '2px' }}>Tryout Setup</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Teams</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>Define the team slots used in the Team Builder.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {clubTeams.length > 0 && (
            <button onClick={() => setShowSync(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1.5px solid #E2E8F0', borderRadius: '6px', padding: '8px 16px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              <RefreshCw size={13} /> Sync from Club
            </button>
          )}
          {teams.length > 0 && (
            <button onClick={openBulkFees} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#374151', border: '1.5px solid #E2E8F0', borderRadius: '6px', padding: '8px 16px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              <DollarSign size={13} /> Set Fees
            </button>
          )}
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
            <Plus size={15} /> Add Team
          </button>
        </div>
      </div>

      {/* scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#F0F2F5' }}>
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
            {/* Summary bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>{teams.filter(t => t.is_active).length} active · {teams.length} total</span>
              {teams.some(t => !t.season_fee) && (
                <span style={{ fontSize: '12px', color: '#D97706', fontWeight: '600', background: '#FEF3C7', borderRadius: '4px', padding: '2px 8px' }}>⚠ {teams.filter(t => !t.season_fee).length} missing fee</span>
              )}
            </div>

            {renderGenderGrid('Male', 'Boys')}
            {renderGenderGrid('Female', 'Girls')}

            {/* Mixed / ungrouped by gender */}
            {(() => {
              const other = teams.filter(t => t.gender !== 'Male' && t.gender !== 'Female');
              if (other.length === 0) return null;
              return (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>Mixed / No gender set</div>
                  {other.map(t => (
                    <div key={t.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderLeft: `4px solid ${t.color}`, borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <div style={{ flex: 1, fontWeight: '700', fontSize: '13px', color: '#0F172A' }}>{t.name}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[t.age_group, t.gender, t.format, t.tier ? `Tier ${t.tier}` : null].filter(Boolean).map((tag, i) => (
                          <span key={i} style={{ fontSize: '10px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 6px', fontWeight: '600' }}>{tag}</span>
                        ))}
                      </div>
                      {t.season_fee ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803D' }}>{currSym}{t.season_fee}</span> : <span style={{ fontSize: '10px', color: '#D97706', fontWeight: '600' }}>No fee</span>}
                      <button onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8' }}><Edit2 size={13} /></button>
                      <button onClick={() => setDeleteId(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#94A3B8' }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
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
                  <input value={form.tier ?? ''} onChange={e => setForm(f => ({ ...f, tier: e.target.value || null }))}
                    placeholder="A, B, C, D, E…"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '14px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>Any letter — more tiers auto-appear in the grid</div>
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
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '760px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

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
                  <tr style={{ background: '#0F172A', borderBottom: 'none' }}>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Team</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Age</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Format</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Tier</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Season fee ({currSym})</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Deposit ({currSym})</th>
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
          <div style={{ background: '#fff', borderRadius: '8px', width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
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
          <div style={{ background: '#fff', borderRadius: '8px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
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
