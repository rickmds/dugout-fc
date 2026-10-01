'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// Mirrors SHOUTOUT_TAGS in components/shoutout/ShoutoutSheet.tsx (mobile) —
// a tiny fixed constant, not worth sharing across the mobile/web codebases.
const SHOUTOUT_TAGS: { tag: string; emoji: string; label: string }[] = [
  { tag: 'hustle',      emoji: '💪', label: 'Hustle' },
  { tag: 'teamwork',    emoji: '🤝', label: 'Great Teamwork' },
  { tag: 'improvement', emoji: '📈', label: 'Big Improvement' },
  { tag: 'attitude',    emoji: '😊', label: 'Great Attitude' },
  { tag: 'leadership',  emoji: '🧭', label: 'Leadership' },
];

type ShoutoutRow = {
  id: string;
  tag: string;
  note: string | null;
  created_at: string;
  coach_id: string;
  events: { title: string | null; event_date: string } | null;
  coachName: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ShoutoutsPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [rows, setRows] = useState<ShoutoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);

    // A direct embedded `profiles` join on coach_id hits the same RLS wall
    // mobile's equivalent screen already documented — get_team_coaches
    // resolves coach names instead, same fix reused here.
    const [{ data: playerRow }, { data }] = await Promise.all([
      supabase.from('players').select('team_id').eq('id', playerId).single(),
      supabase.from('player_shoutouts')
        .select('id,tag,note,created_at,coach_id,events(title,event_date)')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false }),
    ]);
    const { data: coachRows } = playerRow?.team_id
      ? await supabase.rpc('get_team_coaches', { p_team_id: playerRow.team_id })
      : { data: null };
    const nameByCoachId = new Map<string, string | null>(
      (coachRows ?? []).map((c: { profile_id: string; full_name: string | null }) => [c.profile_id, c.full_name])
    );

    setRows((data ?? []).map((r) => ({
      ...r,
      events: r.events as unknown as { title: string | null; event_date: string } | null,
      coachName: nameByCoachId.get(r.coach_id) ?? null,
    })));
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Shoutouts</div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Star size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No shoutouts yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map((r) => {
              const meta = SHOUTOUT_TAGS.find((t) => t.tag === r.tag);
              return (
                <div key={r.id} style={{ display: 'flex', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '22px', flexShrink: 0 }}>{meta?.emoji ?? '⭐'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{meta?.label ?? r.tag}</div>
                    {r.note && <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{r.note}</p>}
                    <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '5px' }}>
                      {r.coachName ?? 'Coach'}{r.events?.title ? ` · ${r.events.title}` : ''} · {fmtDate(r.created_at)}
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
