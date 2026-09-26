'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Trash2, AlertTriangle, Users,
  Search, Pencil, RefreshCw, ChevronUp, ChevronDown,
  Shield,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

function teamColor(name: string): string {
  const palette = ['#3B82F6','#8B5CF6','#EC4899','#F59E0B','#10B981','#06B6D4','#EF4444','#6366F1'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

type TeamStats = {
  id: string;
  name: string;
  age_group: string | null;
  gender: string | null;
  season: string | null;
  player_count: number;
  coach_count: number;
  next_event_date: string | null;
  next_event_title: string | null;
  warnings: ('no_coach' | 'no_players' | 'no_schedule')[];
  has_ref_only_link: boolean;
};

type TeamForm  = { name: string; age_group: string; gender: string; season: string };
type RolloverModal = {
  team: TeamStats; newSeason: string; newName: string; newAgeGroup: string; newGender: string;
  copyRoster: boolean; copyStaff: boolean; saving: boolean;
};

const AGE_GROUPS = ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Senior'];
const GENDERS    = [
  { value: 'boys',  label: 'Boys'  },
  { value: 'girls', label: 'Girls' },
  { value: 'mixed', label: 'Mixed' },
];

const emptyForm = (): TeamForm => ({ name: '', age_group: '', gender: '', season: '' });

type SortField = 'name' | 'age_group' | 'player_count' | 'coach_count';

export default function TeamsPage() {
  const { club, reload } = useDashboard();
  const router = useRouter();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [teams, setTeams]           = useState<TeamStats[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [sortField, setSortField]   = useState<SortField>('age_group');
  const [sortAsc, setSortAsc]       = useState(true);
  const [attentionFilter, setAttentionFilter] = useState(false);
  // Quick age-group chips — a DOC thinks "show me the U9s," not "scroll
  // through 41 rows." Multi-select: click U9 and U10 to see both.
  const [ageFilter, setAgeFilter]   = useState<Set<string>>(new Set());
  const [genderFilter, setGenderFilter] = useState<Set<string>>(new Set());

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
      .select('id, name, age_group, gender, season')
      .eq('club_id', club.id)
      .order('name');

    if (!teamRows || !teamRows.length) { setTeams([]); setLoading(false); return; }

    const ids = teamRows.map((t) => t.id);
    const today = new Date().toISOString().split('T')[0];

    const [playerRes, coachRes, eventRes, ncsaLinkRes] = await Promise.all([
      supabase.from('players').select('team_id').in('team_id', ids),
      supabase.from('team_members').select('team_id').in('team_id', ids).in('role', ['coach', 'org_admin']),
      supabase.from('events')
        .select('team_id, event_date, title')
        .in('team_id', ids)
        .gte('event_date', today)
        .order('event_date')
        .limit(ids.length * 3),
      club?.ncsa_partner
        ? supabase.from('team_ncsa_links').select('team_id').in('team_id', ids).eq('competition', 'ref_only')
        : Promise.resolve({ data: [] as { team_id: string }[] }),
    ]);

    // Count per team
    const playerCounts: Record<string, number> = {};
    const coachCounts:  Record<string, number> = {};
    const nextEvents:   Record<string, { date: string; title: string }> = {};
    const refOnlyTeamIds = new Set((ncsaLinkRes.data ?? []).map((l) => l.team_id));

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
      return { ...t, gender: t.gender ?? null, player_count: players, coach_count: coaches, next_event_date: next?.date ?? null, next_event_title: next?.title ?? null, warnings, has_ref_only_link: refOnlyTeamIds.has(t.id) };
    });

    setTeams(withStats);
    setLoading(false);
  }, [club]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { loadTeams(); }, [loadTeams]);

  // ── Create / Edit ───────────────────────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm());
    setFormError('');
    setFormModal({ mode: 'create' });
  }

  function openEdit(t: TeamStats) {
    setForm({ name: t.name, age_group: t.age_group ?? '', gender: t.gender ?? '', season: t.season ?? '' });
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
        age_group: form.age_group || null,
        gender: form.gender || null,
        season: form.season.trim() || null,
      });
      if (error) { setFormError(error.message); setFormSaving(false); return; }
    } else {
      const { error } = await supabase.from('teams').update({
        name: form.name.trim(),
        age_group: form.age_group || null,
        gender: form.gender || null,
        season: form.season.trim() || null,
      }).eq('id', formModal!.teamId!);
      if (error) { setFormError(error.message); setFormSaving(false); return; }
    }

    setFormSaving(false);
    setFormModal(null);
    reload(); // refresh context so sidebar team list updates
    loadTeams();
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function confirmDelete(id: string) {
    // Raw delete used to fail hard the moment a team had any evaluations or
    // match-tracker data (same class of bug the club-delete flow had) —
    // routed through the same self-healing RPC used there.
    const { error } = await supabase.rpc('admin_delete_team', { p_team_id: id });
    if (error) { alert(`Could not delete team: ${error.message}`); return; }
    setDeleteConfirm(null);
    reload();
    loadTeams();
  }

  // ── Season rollover ─────────────────────────────────────────────────────────
  // Creates a new team row for the new season and, when copying the roster,
  // brings every player's full record along — not just name/position. The
  // original version only copied those two fields, which silently orphaned
  // parent access (players.profile_id, player_guardians), emergency
  // contacts, and medical notes on every rollover — a real duty-of-care
  // regression, not just missing convenience. Guardians and safety info
  // don't reset just because the roster moved to a new season/age group.
  async function doRollover() {
    if (!rollover || !club) return;
    setRollover((r) => r ? { ...r, saving: true } : null);
    try {
      const { data: newTeam, error: teamErr } = await supabase
        .from('teams')
        .insert({
          club_id: club.id,
          name: rollover.newName.trim() || rollover.team.name,
          age_group: rollover.newAgeGroup || null,
          gender: rollover.newGender || null,
          season: rollover.newSeason.trim() || null,
        })
        .select('id')
        .single();

      if (teamErr || !newTeam) {
        alert(`Could not create new season team: ${teamErr?.message ?? 'Unknown error'}`);
        setRollover((r) => r ? { ...r, saving: false } : null);
        return;
      }

      if (rollover.copyStaff) {
        const { data: staff } = await supabase
          .from('team_members')
          .select('profile_id, role')
          .eq('team_id', rollover.team.id)
          .in('role', ['coach', 'org_admin']);
        if (staff?.length) {
          await supabase.from('team_members').insert(
            staff.map((s) => ({ team_id: newTeam.id, profile_id: s.profile_id, role: s.role }))
          );
        }
      }

      if (rollover.copyRoster) {
        const { data: players } = await supabase
          .from('players')
          .select('id, full_name, jersey_number, position, secondary_position, preferred_foot, date_of_birth, notes, photo_url, is_private, is_injured, profile_id')
          .eq('team_id', rollover.team.id);

        if (players?.length) {
          const { data: newPlayers, error: playersErr } = await supabase.from('players').insert(
            players.map(({ id: _id, ...p }) => ({ ...p, team_id: newTeam.id }))
          ).select('id');
          if (playersErr || !newPlayers) throw playersErr ?? new Error('Could not copy roster');

          // Postgres preserves row order for a single multi-row INSERT...RETURNING,
          // so index-zipping the two arrays back together is safe here.
          const oldIds = players.map((p) => p.id);
          const newIds = newPlayers.map((p) => p.id as string);
          const idMap = new Map(oldIds.map((oldId, i) => [oldId, newIds[i]]));

          const [{ data: guardians }, { data: emergencyContacts }, { data: medicalNotes }] = await Promise.all([
            supabase.from('player_guardians').select('player_id, profile_id').in('player_id', oldIds),
            supabase.from('player_emergency_contacts').select('player_id, name, phone, relationship').in('player_id', oldIds),
            supabase.from('player_medical_notes').select('player_id, notes').in('player_id', oldIds),
          ]);

          if (guardians?.length) {
            await supabase.from('player_guardians').insert(
              guardians.map((g) => ({ player_id: idMap.get(g.player_id), profile_id: g.profile_id }))
            );
          }
          if (emergencyContacts?.length) {
            await supabase.from('player_emergency_contacts').insert(
              emergencyContacts.map((c) => ({ player_id: idMap.get(c.player_id), name: c.name, phone: c.phone, relationship: c.relationship }))
            );
          }
          if (medicalNotes?.length) {
            await supabase.from('player_medical_notes').insert(
              medicalNotes.map((m) => ({ player_id: idMap.get(m.player_id), notes: m.notes }))
            );
          }
        }
      }

      setRollover(null);
      reload();
      loadTeams();
    } catch (e) {
      alert(`Rollover failed: ${e instanceof Error ? e.message : String(e)}`);
      setRollover((r) => r ? { ...r, saving: false } : null);
    }
  }

  const totalPlayers    = teams.reduce((s, t) => s + t.player_count, 0);
  const teamsWithIssues = teams.filter((t) => t.warnings.length > 0).length;

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortAsc(true); }
  }

  // Present age groups only, in the standard U6..Senior order — no point
  // showing a U19 chip when nobody has a U19 team.
  const presentAgeGroups = AGE_GROUPS.filter((ag) => teams.some((t) => t.age_group === ag));
  const presentGenders = GENDERS.filter((g) => teams.some((t) => t.gender === g.value));
  const hasActiveFilter = !!search || ageFilter.size > 0 || genderFilter.size > 0;

  const filtered = teams
    .filter((t) => {
      if (attentionFilter && t.warnings.length === 0) return false;
      if (ageFilter.size > 0 && !ageFilter.has(t.age_group ?? '')) return false;
      if (genderFilter.size > 0 && !genderFilter.has(t.gender ?? '')) return false;
      if (!search) return true;
      return t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.age_group ?? '').toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortField === 'name')         { av = a.name;         bv = b.name; }
      // Youngest-first by actual age, not string order — a plain string
      // sort puts "U10" before "U9" (comparing '1' < '9' as characters).
      // Falls back to alphabetical for a rare age_group value that isn't
      // one of the known groups (e.g. blank), instead of throwing it to
      // one end of the list.
      if (sortField === 'age_group') {
        const ai = AGE_GROUPS.indexOf(a.age_group ?? '');
        const bi = AGE_GROUPS.indexOf(b.age_group ?? '');
        av = ai === -1 ? AGE_GROUPS.length : ai;
        bv = bi === -1 ? AGE_GROUPS.length : bi;
      }
      if (sortField === 'player_count') { av = a.player_count; bv = b.player_count; }
      if (sortField === 'coach_count')  { av = a.coach_count;  bv = b.coach_count; }
      if (typeof av === 'number') return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      <style>{`
        @media (max-width: 768px) {
          .teams-header { padding: 12px 16px !important; }
          .teams-content { padding: 14px 16px !important; }
          .teams-stat-cards { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .teams-table-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }
          .teams-table-inner { min-width: 640px !important; }
        }
      `}</style>

      {/* Sticky header */}
      <div className="teams-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Teams</h1>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={15} /> Add team
        </button>
      </div>

      {/* Content area */}
      <div className="teams-content" style={{ padding: '24px 32px' }}>

      {/* Summary cards */}
      <div className="teams-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={20} color={primary} />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: primary, lineHeight: 1 }}>{teams.length}</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Total teams</div>
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={20} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#3B82F6', lineHeight: 1 }}>{totalPlayers}</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Total players</div>
          </div>
        </div>
        <button
          onClick={() => setAttentionFilter(a => !a)}
          style={{ background: attentionFilter ? (teamsWithIssues > 0 ? '#FFFBEB' : '#F0FDF4') : '#fff', borderRadius: '8px', border: `1.5px solid ${attentionFilter ? (teamsWithIssues > 0 ? '#FDE68A' : '#86EFAC') : '#E2E8F0'}`, padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: teamsWithIssues > 0 ? '#FEF3C7' : '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} color={teamsWithIssues > 0 ? '#D97706' : '#22C55E'} />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: teamsWithIssues > 0 ? '#D97706' : '#22C55E', lineHeight: 1 }}>{teamsWithIssues}</div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>
              {teamsWithIssues > 0 ? (attentionFilter ? 'Showing issues ↑' : 'Need attention — click to filter') : 'All teams healthy'}
            </div>
          </div>
        </button>
      </div>

      {/* Search + sort bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams or age groups…"
            style={{ width: '100%', padding: '10px 36px', borderRadius: '8px', border: '1.5px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', background: '#fff', boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: 'inherit' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#94A3B8' }}><X size={13} /></button>}
        </div>
        {attentionFilter && (
          <button onClick={() => setAttentionFilter(false)} style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '6px', border: '1.5px solid #FCA5A5', background: '#FEF2F2', fontSize: '12.5px', fontWeight: '700', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <X size={12} /> Issues only
          </button>
        )}
      </div>

      {/* Age-group quick filter */}
      {presentAgeGroups.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {presentAgeGroups.map((ag) => {
            const active = ageFilter.has(ag);
            return (
              <button
                key={ag}
                onClick={() => setAgeFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(ag)) next.delete(ag); else next.add(ag);
                  return next;
                })}
                style={{ padding: '5px 13px', borderRadius: '20px', border: `1.5px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}15` : '#fff', fontSize: '12px', fontWeight: '700', color: active ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {ag}
              </button>
            );
          })}
          {ageFilter.size > 0 && (
            <button onClick={() => setAgeFilter(new Set())} style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '5px 4px' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Gender quick filter */}
      {presentGenders.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {presentGenders.map((g) => {
            const active = genderFilter.has(g.value);
            return (
              <button
                key={g.value}
                onClick={() => setGenderFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.value)) next.delete(g.value); else next.add(g.value);
                  return next;
                })}
                style={{ padding: '5px 13px', borderRadius: '20px', border: `1.5px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}15` : '#fff', fontSize: '12px', fontWeight: '700', color: active ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {g.label}
              </button>
            );
          })}
          {genderFilter.size > 0 && (
            <button onClick={() => setGenderFilter(new Set())} style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '5px 4px' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Teams table */}
      {loading ? (
        <>
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            {[1,2,3,4].map((i, idx) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: idx < 3 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ height: '36px', borderRadius: '8px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
        </>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Shield size={26} color="#94A3B8" />
          </div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>{hasActiveFilter ? 'No teams match' : 'No teams yet'}</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: !hasActiveFilter ? '20px' : '0' }}>
            {hasActiveFilter ? 'Try a different name, or clear the age/gender filters.' : 'Create your first team to get started.'}
          </div>
          {!hasActiveFilter && (
            <button onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '11px 22px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={15} /> Add first team
            </button>
          )}
        </div>
      ) : (
        <div className="teams-table-scroll"><div className="teams-table-inner" style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          {/* Sortable header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 170px 116px', padding: '10px 20px', background: '#0F172A', borderBottom: 'none' }}>
            {([
              { label: 'Team',    field: 'name' as SortField },
              { label: 'Age',     field: 'age_group' as SortField },
              { label: 'Players', field: 'player_count' as SortField },
              { label: 'Coaches', field: 'coach_count' as SortField },
              { label: 'Next event', field: null },
              { label: '',        field: null },
            ] as { label: string; field: SortField | null }[]).map((h) => (
              <div key={h.label}
                onClick={h.field ? () => toggleSort(h.field!) : undefined}
                style={{ fontSize: '10px', fontWeight: '800', color: sortField === h.field ? primary : 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px', cursor: h.field ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                {h.label}
                {h.field && sortField === h.field && (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
              </div>
            ))}
          </div>

          {filtered.map((t, idx) => {
            const tc = teamColor(t.name);
            return (
              <div
                key={t.id}
                onClick={() => router.push(`/dashboard/teams/${t.id}`)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 170px 116px', padding: '13px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                {/* Name + warnings */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: tc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '900', color: '#fff', flexShrink: 0, letterSpacing: '0.03em' }}>
                    {t.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    {(t.warnings.length > 0 || t.has_ref_only_link) && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                        {t.has_ref_only_link && (
                          <span title="This team also has an NCSA entry that exists only for referee assignment — its games are included in the league schedule."
                            style={{ fontSize: '10px', fontWeight: '700', color: '#3730A3', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '4px', padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Shield size={9} /> NCSA ref-only game
                          </span>
                        )}
                        {t.warnings.map((w) => (
                          <span key={w} style={{ fontSize: '10px', fontWeight: '700', color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '4px', padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <AlertTriangle size={9} /> {w === 'no_coach' ? 'No coach' : w === 'no_players' ? 'No players' : 'No events'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Age group + gender */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {t.age_group
                    ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#475569', background: '#F1F5F9', borderRadius: '4px', padding: '3px 8px', display: 'inline-block', width: 'fit-content' }}>{t.age_group}</span>
                    : <span style={{ color: '#CBD5E1', fontSize: '13px' }}>—</span>}
                  {t.gender && (
                    <span style={{ fontSize: '10px', fontWeight: '700', color: t.gender === 'boys' ? '#2563EB' : t.gender === 'girls' ? '#DB2777' : '#7C3AED', background: t.gender === 'boys' ? '#EFF6FF' : t.gender === 'girls' ? '#FDF2F8' : '#F5F3FF', borderRadius: '4px', padding: '2px 6px', display: 'inline-block', width: 'fit-content', textTransform: 'capitalize' }}>{t.gender}</span>
                  )}
                </div>

                {/* Players */}
                <div style={{ fontSize: '14px', fontWeight: '700', color: t.player_count > 0 ? '#0F172A' : '#CBD5E1' }}>
                  {t.player_count > 0 ? t.player_count : '—'}
                </div>

                {/* Coaches */}
                <div>
                  {t.coach_count === 0
                    ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', borderRadius: '4px', padding: '3px 8px' }}>0</span>
                    : <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{t.coach_count}</span>}
                </div>

                {/* Next event */}
                <div style={{ fontSize: '13px' }}>
                  {t.next_event_date
                    ? <>
                        <span style={{ fontWeight: '700', color: '#0F172A' }}>{fmtDate(t.next_event_date)}</span>
                        <span style={{ color: '#94A3B8', fontSize: '11px', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{t.next_event_title}</span>
                      </>
                    : <span style={{ color: '#CBD5E1' }}>None scheduled</span>}
                </div>

                {/* Actions — stop propagation so row click doesn't fire */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setRollover({ team: t, newSeason: '', newName: t.name, newAgeGroup: t.age_group ?? '', newGender: t.gender ?? '', copyRoster: true, copyStaff: true, saving: false })}
                    title="New season"
                    style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '3px' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${primary}10`; (e.currentTarget as HTMLElement).style.color = primary; (e.currentTarget as HTMLElement).style.borderColor = primary; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.color = '#64748B'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; }}
                  >
                    <RefreshCw size={10} /> Season
                  </button>
                  <button onClick={() => openEdit(t)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', color: '#CBD5E1' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#64748B'; (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteConfirm({ id: t.id, name: t.name })} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', color: '#CBD5E1' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div></div>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {formModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={() => setFormModal(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

            {/* Accent bar */}
            <div style={{ height: '3px', background: `linear-gradient(90deg, ${primary}, ${primary}66)` }} />

            {/* Header */}
            <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>{formModal.mode === 'create' ? 'Add team' : 'Edit team'}</h2>
                {form.name && <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>{form.name}</p>}
              </div>
              <button onClick={() => setFormModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                <X size={17} color="#94A3B8" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Team name */}
              <div>
                <label style={labelSt}>Team name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. U10 Boys Premier" style={inputSt} autoFocus />
              </div>

              {/* Gender pills */}
              <div>
                <label style={labelSt}>Gender</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {GENDERS.map(g => {
                    const active = form.gender === g.value;
                    return (
                      <button key={g.value}
                        onClick={() => setForm(f => ({ ...f, gender: active ? '' : g.value }))}
                        style={{ flex: 1, padding: '9px 0', borderRadius: '10px', border: `1.5px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}12` : '#F8FAFC', fontSize: '13px', fontWeight: '700', color: active ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Age group pills */}
              <div>
                <label style={labelSt}>Age group</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {AGE_GROUPS.map(ag => {
                    const active = form.age_group === ag;
                    return (
                      <button key={ag}
                        onClick={() => setForm(f => ({ ...f, age_group: active ? '' : ag }))}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: `1.5px solid ${active ? primary : '#E2E8F0'}`, background: active ? `${primary}12` : '#F8FAFC', fontSize: '12.5px', fontWeight: '700', color: active ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                        {ag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Season */}
              <div>
                <label style={labelSt}>Season</label>
                <input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} placeholder="e.g. 2025/26, Spring 2026" style={inputSt} />
              </div>

              {formError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#DC2626' }}>{formError}</div>}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px' }}>
              <button onClick={() => setFormModal(null)} style={{ flex: 1, padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={saveForm} disabled={formSaving || !form.name.trim()} style={{ flex: 2, padding: '10px', background: formSaving || !form.name.trim() ? '#CBD5E1' : primary, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: formSaving || !form.name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelSt}>Age group</label>
                  <select value={rollover.newAgeGroup} onChange={(e) => setRollover((r) => r ? { ...r, newAgeGroup: e.target.value } : null)} style={{ ...inputSt, cursor: 'pointer' }}>
                    <option value="">—</option>
                    {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>Gender</label>
                  <select value={rollover.newGender} onChange={(e) => setRollover((r) => r ? { ...r, newGender: e.target.value } : null)} style={{ ...inputSt, cursor: 'pointer' }}>
                    <option value="">—</option>
                    {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelSt}>Team name</label>
                <input value={rollover.newName} onChange={(e) => setRollover((r) => r ? { ...r, newName: e.target.value } : null)} style={inputSt} />
              </div>
              {club?.ncsa_partner && (() => {
                // NCSA Rule 9.1: a rolled-over team is charged full
                // registration fees again (not the reduced returning-team
                // rate) if it changes age group — unless it's moving up
                // solely on Fall performance, the one exception the rule
                // carves out — or changes gender, or ends up with over
                // half a new roster. Roster turnover can't be known yet at
                // rollover time, so this only checks what's already
                // decided on this form.
                const oldAge = rollover.team.age_group ?? '';
                const newAge = rollover.newAgeGroup;
                const ageChanged = !!oldAge && !!newAge && oldAge !== newAge;
                const genderChanged = !!rollover.team.gender && !!rollover.newGender && rollover.team.gender !== rollover.newGender;
                const oldIdx = AGE_GROUPS.indexOf(oldAge);
                const newIdx = AGE_GROUPS.indexOf(newAge);
                const isOneStepUp = ageChanged && oldIdx !== -1 && newIdx === oldIdx + 1;
                if (!ageChanged && !genderChanged) return null;
                return (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#92400E', marginBottom: '3px' }}>NCSA Rule 9.1 — possible reclassification</div>
                    <div style={{ fontSize: '12px', color: '#92400E', lineHeight: 1.6 }}>
                      {genderChanged && 'Changing gender always reclassifies this as a new team — full registration fee applies. '}
                      {ageChanged && isOneStepUp && 'Moving up one age group is only exempt from reclassification if it\'s solely due to Fall performance — otherwise this triggers full registration fees too.'}
                      {ageChanged && !isOneStepUp && 'This age-group change (not a simple one-level move up) triggers reclassification as a new team — full registration fee applies.'}
                    </div>
                  </div>
                );
              })()}
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
                    Copies each player&apos;s full record — including parent access, guardians, emergency contacts, and medical notes. Nobody needs to be re-invited. Past events stay in the current season.
                  </div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '14px 16px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rollover.copyStaff}
                  onChange={(e) => setRollover((r) => r ? { ...r, copyStaff: e.target.checked } : null)}
                  style={{ width: '16px', height: '16px', marginTop: '1px', accentColor: primary, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>Copy coaching staff</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Keeps the same coach(es) assigned to the new team.
                  </div>
                </div>
              </label>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#1D4ED8' }}>
                This creates a <strong>new team</strong> for the new season. The current season ({rollover.team.season ?? 'no season'}) is kept intact — nothing is deleted.
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px' }}>
              <button onClick={() => setRollover(null)} style={{ flex: 1, padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={doRollover} disabled={rollover.saving || !rollover.newSeason.trim()} style={{ flex: 2, padding: '10px', background: rollover.saving || !rollover.newSeason.trim() ? '#CBD5E1' : primary, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: rollover.saving || !rollover.newSeason.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
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
            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Trash2 size={20} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete team?</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong style={{ color: '#0F172A' }}>{deleteConfirm.name}</strong> and all its players, events, and RSVPs will be permanently deleted.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => confirmDelete(deleteConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>{/* end content area */}
    </div>
  );
}

const labelSt: React.CSSProperties = {
  fontSize: '10px', fontWeight: '800', color: '#94A3B8',
  letterSpacing: '1.5px', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};
const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
