'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, DollarSign, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Fine = {
  id: string;
  ncsa_fine_id: string;
  ncsa_game_id: string | null;
  team_raw_name: string | null;
  reason: string | null;
  submitted_by: string | null;
  fine_date: string | null;
  amount: number | null;
  status: string | null;
};

// Maps a fine's free-text reason to the actual rule behind it, a plain-
// English explanation of why it fires, and whether it's realistically
// worth appealing — sourced from the NCSA Rules of Competition (Fall
// 2026-Spring 2027). Regex-matched rather than hardcoded to the exact
// strings seen so far, since the wording NCSA uses varies by fine type.
type FineInfo = { rule: string; explanation: string; appeal: string; appealable: boolean };

function classifyFine(reason: string): FineInfo {
  const r = reason.toLowerCase();
  const citedRule = reason.match(/R\.?\s?(\d+(?:\.\d+)*[a-z]?)/i)?.[1];

  if (/score/.test(r) && /(not calling|delayed|late|incorrect)/.test(r)) {
    return {
      rule: citedRule ? `Rule ${citedRule}` : 'Rule 6.12',
      explanation: 'The winning team (home team if tied) must enter the score online within 4 hours of the final whistle. This fine fires automatically once that window passes without a score, or if the score entered was wrong.',
      appeal: 'Worth appealing if it was actually the opponent\'s responsibility to report (they won), or there\'s a real system/access issue on record. If the score was just genuinely missed, appeals rarely succeed.',
      appealable: true,
    };
  }
  if (/assigning fee|schedule change|day prior|game day|gap/.test(r) || (citedRule && citedRule.startsWith('5.3'))) {
    return {
      rule: citedRule ? `Rule ${citedRule}` : 'Rule 5.3.6 / 5.3.7a',
      explanation: 'NCSA charges an escalating fee when a game is changed close to kickoff — the closer to game day, the higher the fee (up to $125 for a same-day change). Whoever initiates a change that creates a referee gap owes that fee, factoring in other fields at the same complex, not just the one field.',
      appeal: 'Check who actually initiated the change first. If the opponent requested it, or the league itself moved the game (weather, a field closure), the fee likely doesn\'t belong to this team. A change the club itself asked for is much harder to appeal.',
      appealable: true,
    };
  }
  if (/\btbs\b/.test(r)) {
    return {
      rule: citedRule ? `Rule ${citedRule}` : 'Rule 5.3.5',
      explanation: 'Each team gets 1 free TBS (to-be-scheduled) game in Fall and 2 in Spring. This is the $25 charge for using one beyond that free allocation.',
      appeal: 'Not really appealable — it\'s a flat per-use fee once the free allocation for the season is used up.',
      appealable: false,
    };
  }
  if (/forfeit/.test(r)) {
    return {
      rule: citedRule ? `Rule ${citedRule}` : 'Forfeit rules',
      explanation: 'A team fee for forfeiting a scheduled game (not enough players, didn\'t show, etc).',
      appeal: 'Only worth appealing if there\'s a genuine dispute about whether the forfeit was properly called — e.g. the opponent also didn\'t show, or the game was already cancelled by the league.',
      appealable: true,
    };
  }
  if (/card|caution|ejection|red|yellow/.test(r)) {
    return {
      rule: citedRule ? `Rule ${citedRule}` : 'Discipline rules',
      explanation: 'A fee tied to a card/ejection incident report.',
      appeal: 'Discipline-related fines are the hardest to appeal successfully — they\'re usually based on the referee\'s own match report.',
      appealable: true,
    };
  }
  return {
    rule: citedRule ? `Rule ${citedRule}` : 'Not identified',
    explanation: 'No specific pattern matched this reason automatically — check the exact wording against the Rules of Competition, or open it directly on NCSA\'s site for the full detail.',
    appeal: 'Log into ncsanj.com -> Administrative Area -> View/Appeal Fines to see the specific appeal option NCSA offers for this one.',
    appealable: true,
  };
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FinesPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid'>('unpaid');

  const load = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase.from('ncsa_fines').select('*').eq('club_id', club.id).order('fine_date', { ascending: false });
    setFines((data ?? []) as Fine[]);
    setLoading(false);
  }, [club]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; sets state from a real network call, not derivable at render time
  useEffect(() => { load(); }, [load]);

  if (club && !club.ncsa_partner) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
        <ShieldAlert size={32} style={{ marginBottom: '12px' }} />
        <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>NCSA Fines isn&apos;t available for this club</div>
        <div style={{ fontSize: '13px', marginTop: '4px' }}>This only applies to clubs flagged as an NCSA partner in Settings.</div>
      </div>
    );
  }

  const unpaid = fines.filter(f => f.status?.toLowerCase() === 'unpaid');
  const shown = statusFilter === 'unpaid' ? unpaid : fines;
  const unpaidTotal = unpaid.reduce((s, f) => s + (f.amount ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `3px solid ${primary}`, padding: '14px 32px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Club</div>
        <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>NCSA Fines</h1>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={20} color="#DC2626" />
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#DC2626', lineHeight: 1 }}>{unpaid.length}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Unpaid fines</div>
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '18px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DollarSign size={20} color="#B45309" />
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: '900', color: '#B45309', lineHeight: 1 }}>${unpaidTotal.toFixed(2)}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', marginTop: '3px' }}>Unpaid total</div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px', gap: '2px', width: 'fit-content', marginBottom: '16px' }}>
          {(['unpaid', 'all'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '700', fontFamily: 'inherit', textTransform: 'capitalize', background: statusFilter === f ? '#fff' : 'transparent', color: statusFilter === f ? primary : '#64748B', boxShadow: statusFilter === f ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
              {f === 'all' ? 'All fines' : 'Unpaid'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>{statusFilter === 'unpaid' ? 'No unpaid fines' : 'No fines on record'}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {shown.map(f => {
              const info = classifyFine(f.reason ?? '');
              const isUnpaid = f.status?.toLowerCase() === 'unpaid';
              return (
                <div key={f.id} style={{ background: '#fff', borderRadius: '10px', border: '1.5px solid #E2E8F0', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: isUnpaid ? '#fff' : '#64748B', background: isUnpaid ? '#DC2626' : '#F1F5F9', borderRadius: '4px', padding: '2px 7px' }}>
                      {f.status?.toUpperCase() ?? '?'}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{f.reason}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '17px', fontWeight: '900', color: '#B45309' }}>${f.amount?.toFixed(2) ?? '?'}</span>
                  </div>
                  <div style={{ padding: '12px 18px', display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px', color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>
                    {f.team_raw_name && <span><strong style={{ color: '#0F172A' }}>Team:</strong> {f.team_raw_name}</span>}
                    {f.fine_date && <span><strong style={{ color: '#0F172A' }}>Dated:</strong> {fmtDate(f.fine_date)}</span>}
                    {f.submitted_by && <span><strong style={{ color: '#0F172A' }}>Submitted by:</strong> {f.submitted_by}</span>}
                    {f.ncsa_game_id && <span><strong style={{ color: '#0F172A' }}>Game:</strong> {f.ncsa_game_id}</span>}
                  </div>
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: primary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{info.rule}</div>
                      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>{info.explanation}</div>
                    </div>
                    <div style={{ borderRadius: '8px', background: info.appealable ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${info.appealable ? '#BBF7D0' : '#E2E8F0'}`, padding: '10px 14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: info.appealable ? '#15803D' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                        {info.appealable ? 'Worth appealing?' : 'Appeal likelihood'}
                      </div>
                      <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>{info.appeal}</div>
                    </div>
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
