'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Hash, Pencil, AlertTriangle, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { positionStyle, hex2rgb, initials } from '@/lib/playerDisplay';
import EditDetailsModal from '@/components/dashboard/player-profile/EditDetailsModal';
import { PLAYER_CARD_ENABLED } from '@/lib/featureFlags';

export type PlayerMeta = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  secondary_position: string | null;
  preferred_foot: string | null;
  date_of_birth: string | null;
  photo_url: string | null;
  team_id: string;
  is_private: boolean;
  is_injured: boolean;
  notes: string | null;
  team_name: string | null;
  age_group: string | null;
};

const PLAYER_SELECT = 'id,full_name,jersey_number,position,secondary_position,preferred_foot,date_of_birth,photo_url,team_id,is_private,is_injured,notes,teams(name,age_group)';

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age--;
  return age;
}

export default function PlayerProfileLayout({ children }: { children: React.ReactNode }) {
  const { playerId } = useParams<{ playerId: string }>();
  const pathname = usePathname();
  const { profile, club, teams } = useDashboard();
  const [player, setPlayer] = useState<PlayerMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const base = `/dashboard/players/${playerId}`;
  const { r, g, b } = hex2rgb(primary);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    const { data } = await supabase.from('players').select(PLAYER_SELECT).eq('id', playerId).single();
    if (data) {
      const t = data.teams as unknown as { name: string; age_group: string | null } | null;
      setPlayer({ ...data, team_name: t?.name ?? null, age_group: t?.age_group ?? null });
    }
    setLoading(false);
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from a real network call, not derivable at render time
  useEffect(() => { load(); }, [load]);

  const posStyle = positionStyle(player?.position ?? null);
  const age = ageFromDob(player?.date_of_birth ?? null);

  const TABS = [
    { label: 'Overview',           suffix: '' },
    { label: 'Development',        suffix: '/development' },
    { label: 'Shoutouts',          suffix: '/shoutouts' },
    { label: 'Guardians & Safety', suffix: '/guardians' },
    { label: 'Financials',         suffix: '/financials' },
    { label: 'Documents',          suffix: '/documents' },
    ...(PLAYER_CARD_ENABLED || profile?.role === 'app_admin' ? [{ label: 'Player Card', suffix: '/card' }] : []),
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ padding: '16px 32px 0' }}>

          <Link href="/dashboard/players" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#64748B', textDecoration: 'none', marginBottom: '14px' }}>
            <ChevronLeft size={13} /> All Players
          </Link>

          {/* Identity row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px', flexShrink: 0, overflow: 'hidden',
                background: `linear-gradient(135deg, rgba(${r},${g},${b},0.15), rgba(${r},${g},${b},0.08))`,
                border: `1.5px solid rgba(${r},${g},${b},0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: '900', color: primary, letterSpacing: '-0.5px',
              }}>
                {player?.photo_url
                  ? <img src={player.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (player ? initials(player.full_name) : '')}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '21px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {loading ? ' ' : (player?.full_name ?? 'Player not found')}
                  </div>
                  {player?.is_injured && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', background: '#FEF2F2', color: '#DC2626', fontSize: '10.5px', fontWeight: '700' }}>
                      <AlertTriangle size={10} /> Injured
                    </span>
                  )}
                  {player?.is_private && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', background: '#F1F5F9', color: '#64748B', fontSize: '10.5px', fontWeight: '700' }}>
                      <Lock size={10} /> Private
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px', minHeight: '22px' }}>
                  {player?.jersey_number != null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '20px', background: `rgba(${r},${g},${b},0.1)`, color: primary, fontSize: '11.5px', fontWeight: '800' }}>
                      <Hash size={9} strokeWidth={3} />{player.jersey_number}
                    </span>
                  )}
                  {player?.position && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: posStyle.color, background: posStyle.bg, borderRadius: '20px', padding: '2px 8px' }}>{player.position}</span>
                  )}
                  {player?.team_name && (
                    <Link href={`/dashboard/teams/${player.team_id}`} style={{ fontSize: '12.5px', color: '#64748B', textDecoration: 'none' }}>
                      {player.team_name}{player.age_group ? ` · ${player.age_group}` : ''}
                    </Link>
                  )}
                  {age != null && <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>{age} yrs</span>}
                  {player?.preferred_foot && <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>{player.preferred_foot} foot</span>}
                </div>
              </div>
            </div>

            <button onClick={() => setShowEdit(true)} disabled={!player}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#374151', cursor: player ? 'pointer' : 'default', opacity: player ? 1 : 0.5 }}>
              <Pencil size={13} /> Edit
            </button>
          </div>

          {player?.notes && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', fontSize: '12.5px', color: '#78350F', marginBottom: '14px' }}>
              <strong style={{ flexShrink: 0 }}>Coach notes:</strong><span style={{ whiteSpace: 'pre-wrap' }}>{player.notes}</span>
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display: 'flex', overflowX: 'auto', gap: '0', marginBottom: '-1px' }}>
            {TABS.map(({ label, suffix }) => {
              const href = base + suffix;
              const active = suffix === '' ? pathname === base : pathname.startsWith(href);
              return (
                <Link key={label} href={href} style={{ textDecoration: 'none', flexShrink: 0 }}>
                  <div style={{
                    padding: '9px 16px',
                    borderBottom: active ? `2px solid ${primary}` : '2px solid transparent',
                    fontSize: '13.5px', fontWeight: active ? '700' : '500',
                    color: active ? primary : '#64748B',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.1s',
                  }}>
                    {label}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '28px 32px' }}>
        {children}
      </div>

      {showEdit && player && (
        <EditDetailsModal
          player={player}
          teams={teams}
          primary={primary}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setPlayer((prev) => prev ? { ...prev, ...updated } : prev); setShowEdit(false); }}
        />
      )}
    </div>
  );
}
