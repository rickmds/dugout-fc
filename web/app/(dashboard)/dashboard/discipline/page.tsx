'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, AlertOctagon, Flag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type DisciplineRecord = {
  id: string;
  team_raw_name: string | null;
  division: string | null;
  player_name: string;
  referee_name: string | null;
  filed_on: string | null;
  game_date: string | null;
  ncsa_game_id: string;
  misconduct: string | null;
  event: string;
  served_at: string | null;
};

// Confirmed real event values from NCSA's own report: "Cautioned" and
// "Sent off" — not "Ejected", despite the report itself being named
// "Caution Ejection Reports". Matched loosely in case NCSA ever uses a
// third label.
function isEjection(event: string) {
  return /sent off|eject|red/i.test(event);
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DisciplinePage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [records, setRecords] = useState<DisciplineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'suspensions' | 'all'>('suspensions');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase.from('ncsa_discipline_records').select('*').eq('club_id', club.id).order('game_date', { ascending: false });
    setRecords((data ?? []) as DisciplineRecord[]);
    setLoading(false);
  }, [club]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; sets state from a real network call, not derivable at render time
  useEffect(() => { load(); }, [load]);

  if (club && !club.ncsa_partner) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
        <ShieldAlert size={32} style={{ marginBottom: '12px' }} />
        <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>NCSA Discipline isn&apos;t available for this club</div>
        <div style={{ fontSize: '13px', marginTop: '4px' }}>This only applies to clubs flagged as an NCSA partner in Settings.</div>
      </div>
    );
  }

  const activeSuspensions = records.filter(r => isEjection(r.event) && !r.served_at);
  const cautionsThisSeason = records.filter(r => !isEjection(r.event)).length;
  const shown = filter === 'suspensions' ? activeSuspensions : records;

  async function markServed(id: string) {
    setSavingId(id);
    await supabase.from('ncsa_discipline_records').update({ served_at: new Date().toISOString() }).eq('id', id);
    await load();
    setSavingId(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>NCSA Discipline</h1>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertOctagon size={20} color="#DC2626" />
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#DC2626', lineHeight: 1 }}>{activeSuspensions.length}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Active suspensions</div>
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Flag size={20} color="#B45309" />
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#B45309', lineHeight: 1 }}>{cautionsThisSeason}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Cautions on record</div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px', width: 'fit-content', marginBottom: '16px' }}>
          {(['suspensions', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '700', fontFamily: 'inherit', background: filter === f ? '#fff' : 'transparent', color: filter === f ? primary : '#64748B', boxShadow: filter === f ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              {f === 'suspensions' ? 'Active suspensions' : 'All records'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>
              {filter === 'suspensions' ? 'No active suspensions' : 'No caution/ejection records on file'}
            </div>
            <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px' }}>
              {filter === 'suspensions' ? 'Every sent-off player has been marked served, or none are on record.' : 'Nothing filed against the club this season.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {shown.map(r => {
              const ejection = isEjection(r.event);
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: '10px', border: `1.5px solid ${ejection && !r.served_at ? '#FCA5A5' : '#E2E8F0'}`, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: ejection ? '#fff' : '#92400E', background: ejection ? '#DC2626' : '#FEF3C7', borderRadius: '4px', padding: '2px 7px' }}>
                      {r.event.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{r.player_name}</span>
                    <span style={{ marginLeft: 'auto' }}>
                      {ejection && (
                        r.served_at ? (
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#15803D' }}>Served {fmtDate(r.served_at.slice(0, 10))}</span>
                        ) : (
                          <button onClick={() => markServed(r.id)} disabled={savingId === r.id}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: '11.5px', fontWeight: '700', fontFamily: 'inherit', cursor: savingId === r.id ? 'default' : 'pointer', opacity: savingId === r.id ? 0.6 : 1 }}>
                            {savingId === r.id ? 'Saving…' : 'Mark suspension served'}
                          </button>
                        )
                      )}
                    </span>
                  </div>
                  <div style={{ padding: '12px 18px', display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px', color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>
                    {r.team_raw_name && <span><strong style={{ color: '#0F172A' }}>Team:</strong> {r.team_raw_name}</span>}
                    {r.game_date && <span><strong style={{ color: '#0F172A' }}>Game:</strong> {fmtDate(r.game_date)}</span>}
                    {r.referee_name && <span><strong style={{ color: '#0F172A' }}>Referee:</strong> {r.referee_name}</span>}
                    {r.ncsa_game_id && <span><strong style={{ color: '#0F172A' }}>Game ID:</strong> {r.ncsa_game_id}</span>}
                  </div>
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>{r.misconduct}</div>
                    {ejection && !r.served_at && (
                      <div style={{ borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '10px 14px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Barred from all NCSA activity</div>
                        <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>
                          Per NCSA&apos;s Rules of Competition, a sent-off player is barred from all NCSA activity — including reffing — until the suspension is served. NCSA doesn&apos;t expose a games-served counter, so mark this served once confirmed.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
