'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PlayerPanel, { type PlayerForPanel } from '@/components/dashboard/PlayerPanel';
import Link from 'next/link';

type Player = PlayerForPanel & { team_name: string; age_group: string | null };

const POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST','CF'];

export default function PlayersPage() {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [players,    setPlayers]    = useState<Player[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [posFilter,  setPosFilter]  = useState('');
  const [ageFilter,  setAgeFilter]  = useState('');
  const [panel,      setPanel]      = useState<Player | null>(null);

  const ageGroups = [...new Set(teams.map(t => t.age_group).filter(Boolean))] as string[];

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase
      .from('players')
      .select('id,full_name,jersey_number,position,team_id,teams(name,age_group)')
      .in('team_id', teams.map(t => t.id))
      .order('full_name');

    setPlayers((data ?? []).map((p: any) => ({
      ...p, team_name: p.teams?.name ?? '—', age_group: p.teams?.age_group ?? null,
    })));
    setLoading(false);
  }, [club, teams]);

  useEffect(() => { load(); }, [load]);

  const filtered = players.filter(p => {
    if (search   && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (teamFilter && p.team_id !== teamFilter) return false;
    if (posFilter  && p.position !== posFilter)  return false;
    if (ageFilter  && p.age_group !== ageFilter) return false;
    return true;
  });

  const hasFilters = teamFilter || posFilter || ageFilter;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Players</h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0' }}>{players.length} players across {teams.length} teams</p>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
          />
        </div>

        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', color: teamFilter ? '#0F172A' : '#94A3B8', background: '#fff', cursor: 'pointer' }}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', color: ageFilter ? '#0F172A' : '#94A3B8', background: '#fff', cursor: 'pointer' }}>
          <option value="">All ages</option>
          {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={posFilter} onChange={e => setPosFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', color: posFilter ? '#0F172A' : '#94A3B8', background: '#fff', cursor: 'pointer' }}>
          <option value="">All positions</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {hasFilters && (
          <button onClick={() => { setTeamFilter(''); setPosFilter(''); setAgeFilter(''); }}
            style={{ padding: '9px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Players', value: players.length, color: primary },
          { label: 'Showing',       value: filtered.length, color: '#64748B' },
          { label: 'Teams',         value: teams.length,   color: '#8B5CF6' },
          { label: 'Age Groups',    value: ageGroups.length, color: '#F59E0B' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '12px 16px' }}>
            <div style={{ fontSize: '22px', fontWeight: '800', color, letterSpacing: '-0.5px' }}>{value}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height: '56px', borderRadius: '10px', background: '#E2E8F0' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
          {search || hasFilters ? 'No players match your filters.' : 'No players found.'}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Player','#','Position','Team','Age Group',''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                  onClick={() => setPanel(p)}
                >
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `${primary}20`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: primary }}>
                        {p.full_name[0]}
                      </div>
                      <span style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{p.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '13px', color: '#64748B', fontWeight: '600' }}>{p.jersey_number ?? '—'}</td>
                  <td style={{ padding: '11px 16px' }}>
                    {p.position ? <span style={{ fontSize: '11.5px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', background: `${primary}15`, color: primary }}>{p.position}</span> : <span style={{ color: '#CBD5E1', fontSize: '13px' }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <Link href={`/dashboard/teams/${p.team_id}`} onClick={e => e.stopPropagation()} style={{ fontSize: '13px', color: primary, textDecoration: 'none', fontWeight: '600' }}>{p.team_name}</Link>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '13px', color: '#64748B' }}>{p.age_group ?? '—'}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <ChevronDown size={13} color="#CBD5E1" style={{ transform: 'rotate(-90deg)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {panel && (
        <PlayerPanel
          player={panel}
          teamName={panel.team_name}
          clubName={club?.name ?? ''}
          primary={primary}
          profileId={profile?.id}
          onClose={() => setPanel(null)}
          onSaved={updated => {
            setPlayers(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
            setPanel(prev => prev ? { ...prev, ...updated } : null);
          }}
          onDeleted={id => {
            setPlayers(prev => prev.filter(p => p.id !== id));
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
