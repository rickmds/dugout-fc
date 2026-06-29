'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Check, Trash2, AlertTriangle, Users, Calendar,
  Search, Pencil, RefreshCw, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type TeamStats = {
  id: string;
  name: string;
  age_group: string | null;
  season: string | null;
  player_count: number;
  coach_count: number;
  next_event_date: string | null;
  next_event_title: string | null;
  warnings: ('no_coach' | 'no_players' | 'no_schedule')[];
};

type TeamForm  = { name: string; age_group: string; season: string };
type RolloverModal = { team: TeamStats; newSeason: string; copyRoster: boolean; saving: boolean };

const emptyForm = (): TeamForm => ({ name: '', age_group: '', season: '' });

export default function TeamsPage() {
  const { club, reload } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [teams, setTeams]           = useState<TeamStats[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');

  // Create/edit modal
  const [formModal, setFormModal]   = useState<{ mode: 'create' | 'edit'; teamId?: string } | null>(null);
  const [form, setForm]             = useState<TeamForm>(emptyForm());
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError]   = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Season rollover
  const [rollover, setRollover]     = useState<RolloverModal | null>(null);

  const loadTeams = useCallback(async () => {
    if (!club) return;
    setLoading(true);

    const { data: teamRows } = await supabase
      .from('teams')
      .select('id, name, age_group, season')
      .eq('club_id', club.id)
      .order('name');

    if (!teamRows || !teamRows.length) { setTeams([]); setLoading(false); return; }

    const ids = teamRows.map((t) => t.id);
    const today = new Date().toISOString().split('T')[0];

    const [playerRes, coachRes, eventRes] = await Promise.all([
      supabase.from('players').select('team_id').in('team_id', ids),
      supabase.from('team_members').select('team_id').in('team_id', ids).in('role', ['coach', 'org_admin']),
      supabase.from('events')
        .select('team_id, event_date, title')
        .in('team_id', ids)
        .gte('event_date', today)
        .order('event_date')
        .limit(ids.length * 3),
    ]);

    // Count per team
    const playerCounts: Record<string, number> = {};
    const coachCounts:  Record<string, number> = {};
    const nextEvents:   Record<string, { date: string; title: string }> = {};

    for (const p of playerRes.data ?? []) playerCounts[p.team_id] = (playerCounts[p.team_id] ?? 0) + 1;
    for (const c of coachRes.data ?? [])  coachCounts[c.team_id]  = (coachCounts[c.team_id]  ?? 0) + 1;
    for (const e of eventRes.data ?? []) {
      if (!nextEvents[e.team_id]) nextEvents[e.team_id] = { date: e.event_date, title: e.title };
    }

    const withStats: TeamStats[] = teamRows.map((t) => {
      const players = playerCounts[t.id] ?? 0;
      const coaches = coachCounts[t.id] ?? 0;
      const next = nextEvents[t.id] ?? null;
      const warnings: TeamStats['warnings'] = [];
      if (coaches === 0) warnings.push('no_coach');
      if (players === 0) warnings.push('no_players');
      if (!next) warnings.push('no_schedule');
      return { ...t, player_count: players, coach_count: coaches, next_event_date: next?.date ?? null, next_event_title: next?.title ?? null, warnings };
    });

    setTeams(withStats);
    setLoading(false);
  }, [club]);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  // ── Create / Edit ───────────────────────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm());
    setFormError('');
    setFormModal({ mode: 'create' });
  }

  function openEdit(t: TeamStats) {
    setForm({ name: t.name, age_group: t.age_group ?? '', season: t.season ?? '' });
    setFormError('');
    setFormModal({ mode: 'edit', teamId: t.id });
  }

  async function saveForm() {
    if (!form.name.trim() || !club) return;
    setFormSaving(true);
    setFormError('');

    if (formModal?.mode === 'create') {
      const { error } = await supabase.from('teams').insert({
        club_id: club.id,
        name: form.name.trim(),
        age_group: form.age_group.trim() || null,
        season: form.season.trim() || null,
      });
      if (error) { setFormError(error.message); setFormSaving(false); return; }
    } else {
      await supabase.from('teams').update({
        name: form.name.trim(),
        age_group: form.age_group.trim() || null,
        season: form.season.trim() || null,
      }).eq('id', formModal!.teamId!);
    }

    setFormSaving(false);
    setFormModal(null);
    reload(); // refresh context so sidebar team list updates
    loadTeams();
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function confirmDelete(id: string) {
    await supabase.from('teams').delete().eq('id', id);
    setDeleteConfirm(null);
    reload();
    loadTeams();
  }

  // ── Season rollover ─────────────────────────────────────────────────────────
  async function doRollover() {
    if (!rollover || !club) return;
    setRollover((r) => r ? { ...r, saving: true } : null);

    const { data: newTeam } = await supabase
      .from('teams')
      .insert({
        club_id: club.id,
        name: rollover.team.name,
        age_group: rollover.team.age_group,
        season: rollover.newSeason.trim() || null,
      })
      .select('id')
      .single();

    if (newTeam && rollover.copyRoster) {
      const { data: players } = await supabase
        .from('players')
        .select('full_name, jersey_number, position')
        .eq('team_id', rollover.team.id);

      if (players?.length) {
        await supabase.from('players').insert(
          players.map((p) => ({ ...p, team_id: newTeam.id }))
        );
      }
    }

    setRollover(null);
    reload();
    loadTeams();
  }

  const filtered = teams.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.age_group ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPlayers  = teams.reduce((s, t) => s + t.player_count, 0);
  const teamsWithIssues = teams.filter((t) => t.warnings.length > 0).length;

  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: '1100px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Teams</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Manage all teams, spot gaps, start a new season</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={16} /> Add team
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total teams',   value: teams.length,   color: primary,    bg: `${primary}10` },
          { label: 'Total players', value: totalPlayers,    color: '#3B82F6',  bg: '#EFF6FF' },
          { label: 'Need attention', value: teamsWithIssues, color: teamsWithIssues > 0 ? '#D97706' : '#22C55E', bg: teamsWithIssues > 0 ? '#FFFBEB' : '#F0FDF4' },
        ].map((c) => (
          <div key={c.label} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '28px', fontWeight: '800', color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', fontWeight: '500' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '9px 14px', marginBottom: '16px', maxWidth: '360px' }}>
        <Search size={15} color="#94A3B8" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams or age groups…"
          style={{ border: 'none', background: 'none', outline: 'none', fontSize: '14px', color: '#0F172A', flex: 1, fontFamily: 'inherit' }}
        />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} color="#94A3B8" /></button>}
      </div>

      {/* Teams table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚽</div>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748B', marginBottom: '20px' }}>{search ? 'No teams match' : 'No teams yet'}</div>
          {!search && (
            <button onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 20px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={15} /> Add first team
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px 80px 160px 120px', padding: '10px 20px', background: '#FAFAFA', borderBottom: '1px solid #F1F5F9' }}>
            {['Team', 'Age group', 'Season', 'Players', 'Coaches', 'Next event', ''].map((h, i) => (
              <div key={i} style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
            ))}
          </div>

          {filtered.map((t, idx) => (
            <div
              key={t.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 80px 80px 160px 120px', padding: '13px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FAFBFF'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {/* Name + warnings */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <Link href={`/dashboard/teams/${t.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: primary, flexShrink: 0 }}>
                  {t.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  {t.warnings.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {t.warnings.map((w) => (
                        <span key={w} style={{ fontSize: '10px', fontWeight: '700', color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '4px', padding: '1px 5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <AlertTriangle size={9} /> {w === 'no_coach' ? 'No coach' : w === 'no_players' ? 'No players' : 'No events'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                </Link>
              </div>

              {/* Age group */}
              <div style={{ fontSize: '13px', color: '#64748B' }}>{t.age_group ?? <span style={{ color: '#CBD5E1' }}>—</span>}</div>

              {/* Season */}
              <div style={{ fontSize: '13px', color: '#64748B' }}>{t.season ?? <span style={{ color: '#CBD5E1' }}>—</span>}</div>

              {/* Players */}
              <div style={{ fontSize: '14px', fontWeight: t.player_count > 0 ? '600' : '400', color: t.player_count > 0 ? '#0F172A' : '#CBD5E1' }}>
                {t.player_count}
              </div>

              {/* Coaches */}
              <div style={{ fontSize: '14px', fontWeight: t.coach_count > 0 ? '600' : '400', color: t.coach_count > 0 ? '#0F172A' : '#EF4444' }}>
                {t.coach_count === 0 ? <span style={{ color: '#EF4444' }}>0</span> : t.coach_count}
              </div>

              {/* Next event */}
              <div style={{ fontSize: '13px', color: '#64748B' }}>
                {t.next_event_date
                  ? <><span style={{ fontWeight: '600', color: '#0F172A' }}>{fmtDate(t.next_event_date)}</span><span style={{ color: '#94A3B8', fontSize: '11px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.next_event_title}</span></>
                  : <span style={{ color: '#CBD5E1' }}>None scheduled</span>}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRollover({ team: t, newSeason: '', copyRoster: true, saving: false })}
                  title="New season"
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '5px 9px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${primary}10`; (e.currentTarget as HTMLElement).style.color = primary; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.color = '#64748B'; }}
                >
                  <RefreshCw size={11} /> New season
                </button>
                <button onClick={() => openEdit(t)} title="Edit team" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '7px', display: 'flex', color: '#CBD5E1' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#64748B'; (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteConfirm({ id: t.id, name: t.name })} title="Delete team" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '7px', display: 'flex', color: '#CBD5E1' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {formModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={() => setFormModal(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', margin: 0 }}>{formModal.mode === 'create' ? 'Add team' : 'Edit team'}</h2>
              <button onClick={() => setFormModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelSt}>Team name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. U10 Boys Premier" style={inputSt} autoFocus />
              </div>
              <div>
                <label style={labelSt}>Age group</label>
                <input value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} placeholder="e.g. U10, U14 Girls" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Season</label>
                <input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} placeholder="e.g. 2025-26, Spring 2026" style={inputSt} />
              </div>
              {formError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#DC2626' }}>{formError}</div>}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px' }}>
              <button onClick={() => setFormModal(null)} style={{ flex: 1, padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveForm} disabled={formSaving || !form.name.trim()} style={{ flex: 2, padding: '10px', background: formSaving || !form.name.trim() ? '#CBD5E1' : primary, border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: formSaving || !form.name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {formSaving ? 'Saving…' : formModal.mode === 'create' ? 'Add team' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Season rollover modal ───────────────────────────────────────────── */}
      {rollover && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={() => setRollover(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Start new season</h2>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '2px 0 0' }}>{rollover.team.name}</p>
              </div>
              <button onClick={() => setRollover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelSt}>New season name</label>
                <input
                  value={rollover.newSeason}
                  onChange={(e) => setRollover((r) => r ? { ...r, newSeason: e.target.value } : null)}
                  placeholder="e.g. 2025-26"
                  style={inputSt}
                  autoFocus
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 16px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rollover.copyRoster}
                  onChange={(e) => setRollover((r) => r ? { ...r, copyRoster: e.target.checked } : null)}
                  style={{ width: '16px', height: '16px', marginTop: '1px', accentColor: primary, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Copy roster to new team</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Copies player names and positions. Parent links and past events are left in the current season.
                  </div>
                </div>
              </label>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#1D4ED8' }}>
                This creates a <strong>new team</strong> for the new season. The current season ({rollover.team.season ?? 'no season'}) is kept intact — nothing is deleted.
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px' }}>
              <button onClick={() => setRollover(null)} style={{ flex: 1, padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={doRollover} disabled={rollover.saving || !rollover.newSeason.trim()} style={{ flex: 2, padding: '10px', background: rollover.saving || !rollover.newSeason.trim() ? '#CBD5E1' : primary, border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: rollover.saving || !rollover.newSeason.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                {rollover.saving
                  ? <><div style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Creating…</>
                  : <><RefreshCw size={13} />Create new season</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Trash2 size={20} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete team?</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong style={{ color: '#0F172A' }}>{deleteConfirm.name}</strong> and all its players, events, and RSVPs will be permanently deleted.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => confirmDelete(deleteConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const labelSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};
const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
