'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type PlayerCard = {
  xp: number;
  tier_key: string;
  tier_label: string;
  skill_points_available: number;
  pac: number; sho: number; pas: number; dri: number; def: number; phy: number;
  overall: number;
};

const STATS: { key: keyof PlayerCard; label: string }[] = [
  { key: 'pac', label: 'Pace' },
  { key: 'sho', label: 'Shooting' },
  { key: 'pas', label: 'Passing' },
  { key: 'dri', label: 'Dribbling' },
  { key: 'def', label: 'Defending' },
  { key: 'phy', label: 'Physical' },
];

export default function PlayerCardPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [card, setCard] = useState<PlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    const { data, error: err } = await supabase.rpc('get_player_card', { p_player_id: playerId }).maybeSingle();
    if (err) { setError(err.message); setLoading(false); return; }
    setCard(data as unknown as PlayerCard);
    setError(null);
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from a real network call, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const card6: React.CSSProperties = { background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px' };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{ width: '22px', height: '22px', border: `2.5px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
  }

  if (error || !card) {
    return (
      <div style={{ maxWidth: '560px', ...card6 }}>
        <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>
          {error ?? 'No Player Card data yet — this player needs some tracked attendance first.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={card6}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '800', color: primary, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{card.tier_label}</div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>{card.xp} XP · {card.skill_points_available} skill point{card.skill_points_available !== 1 ? 's' : ''} available</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{card.overall}</div>
            <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: '700' }}>OVR</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {STATS.map(({ key, label }) => {
            const value = card[key] as number;
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12.5px', color: '#374151', fontWeight: '600' }}>{label}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#0F172A' }}>{value}</span>
                </div>
                <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${value}%`, background: primary, borderRadius: '99px' }} />
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '18px', marginBottom: 0 }}>
          View only here — card photo, country, and skill-point spending are managed by the player/guardian in the app.
        </p>
      </div>
    </div>
  );
}
