'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronDown, X, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PlayerPanel, { type PlayerForPanel } from '@/components/dashboard/PlayerPanel';
import Link from 'next/link';

type Player = PlayerForPanel & { team_name: string; age_group: string | null };

export default function PlayersPage() {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [players,    setPlayers]    = useState<Player[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [teamFilter, setTeamFilter] = useState('');
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
    if (search     && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (teamFilter && p.team_id  !== teamFilter) return false;
    if (ageFilter  && p.age_group !== ageFilter) return false;
    return true;
  });

  const hasFilters = !!(teamFilter || ageFilter);

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <style>{`
        @media (max-width: 768px) {
          .players-header { padding: 12px 16px !important; }
          .players-content { padding: 14px 16px !important; }
          .players-filters { flex-wrap: wrap !important; }
          .players-stat-cards { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .players-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
        @media (max-width: 480px) {
          .players-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Sticky header */}
      <div className="players-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Club</div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>Players</h1>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="players-content" style={{ padding: '24px 32px' }}>

      {/* Search + filters */}
      <div className="players-filters" style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search players…"
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', outline: 'none', background: '#fff', boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#94A3B8' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: '#E2E8F0', flexShrink: 0 }} />

        {/* Team filter */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
            style={{ appearance: 'none', WebkitAppearance: 'none', padding: '10px 32px 10px 14px', borderRadius: '10px', border: `1.5px solid ${teamFilter ? primary : '#E2E8F0'}`, fontSize: '13px', fontWeight: teamFilter ? '700' : '500', color: teamFilter ? primary : '#64748B', background: teamFilter ? `${primary}08` : '#fff', cursor: 'pointer', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <option value="">All teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: teamFilter ? primary : '#94A3B8' }} />
        </div>

        {/* Age filter */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)}
            style={{ appearance: 'none', WebkitAppearance: 'none', padding: '10px 32px 10px 14px', borderRadius: '10px', border: `1.5px solid ${ageFilter ? primary : '#E2E8F0'}`, fontSize: '13px', fontWeight: ageFilter ? '700' : '500', color: ageFilter ? primary : '#64748B', background: ageFilter ? `${primary}08` : '#fff', cursor: 'pointer', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <option value="">All ages</option>
            {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: ageFilter ? primary : '#94A3B8' }} />
        </div>

        {/* Clear */}
        {hasFilters && (
          <button onClick={() => { setTeamFilter(''); setAgeFilter(''); }}
            style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #FCA5A5', background: '#FEF2F2', fontSize: '12.5px', fontWeight: '700', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            <X size={12} /> Clear filters
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="players-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Players', value: players.length, color: primary },
          { label: 'Showing',       value: filtered.length, color: '#64748B' },
          { label: 'Teams',         value: teams.length,   color: '#8B5CF6' },
          { label: 'Age Groups',    value: ageGroups.length, color: '#F59E0B' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: '28px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontWeight: '600' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ height: '56px', borderRadius: '10px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite', border: '1px solid #E2E8F0' }} />
          ))}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '56px 32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Users size={22} color="#94A3B8" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
            {search || hasFilters ? 'No players match your filters' : 'No players yet'}
          </div>
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            {search || hasFilters ? 'Try clearing your search or filters.' : 'Add players to your teams to see them here.'}
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
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
      </div> {/* end scrollable content */}
    </div>
  );
}
