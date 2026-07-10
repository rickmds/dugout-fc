'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Users, Plus, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PlayerPanel, { type PlayerForPanel } from '@/components/dashboard/PlayerPanel';
import { useRouter } from 'next/navigation';

type Player = PlayerForPanel & { parent_email: string | null };
type Invite  = { player_id: string; email: string; accepted_at: string | null };
type Coach   = { profile_id: string; full_name: string | null; avatar_url: string | null };

export default function TeamRosterPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { profile, club, teams } = useDashboard();
  const router   = useRouter();
  const primary  = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const teamName = teams.find(t => t.id === teamId)?.name ?? 'Team';
  const clubName = club?.name ?? '';

  const [players, setPlayers] = useState<Player[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel,   setPanel]   = useState<Player | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const [playersRes, invitesRes, coachesRes] = await Promise.all([
      supabase.from('players').select('id,full_name,jersey_number,position').eq('team_id', teamId).order('jersey_number', { ascending: true, nullsFirst: false }).order('full_name'),
      supabase.from('invites').select('player_id,email,accepted_at').eq('team_id', teamId),
      supabase.from('team_members').select('profile_id, profiles(full_name, avatar_url)').eq('team_id', teamId).eq('role', 'coach'),
    ]);

    const inviteMap = Object.fromEntries((invitesRes.data ?? []).map((i: any) => [i.player_id, i]));
    setPlayers(((playersRes.data ?? []) as Omit<Player, 'team_id' | 'parent_email'>[]).map(p => ({
      ...p, team_id: teamId, parent_email: inviteMap[p.id]?.email ?? null,
    })));
    setInvites(invitesRes.data ?? []);
    setCoaches((coachesRes.data ?? []).map((m: any) => ({
      profile_id: m.profile_id,
      full_name:  m.profiles?.full_name ?? null,
      avatar_url: m.profiles?.avatar_url ?? null,
    })));
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const inviteStatus = (p: Player) => {
    const inv = invites.find(i => i.player_id === p.id);
    if (!inv) return null;
    return inv.accepted_at
      ? { label: 'Joined',  color: '#166534', bg: '#F0FDF4' }
      : { label: 'Invited', color: '#92400E', bg: '#FFFBEB' };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: '#64748B' }}>{players.length} player{players.length !== 1 ? 's' : ''}</div>
        <button
          onClick={() => router.push(`/dashboard/roster?team=${teamId}`)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '9px', background: primary, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit' }}>
          <Plus size={14} /> Add Player
        </button>
      </div>

      {/* Coaching staff */}
      {!loading && coaches.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Coaching Staff</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {coaches.map(c => (
              <div key={c.profile_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: `${primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', color: primary, flexShrink: 0 }}>
                  {c.full_name ? c.full_name[0].toUpperCase() : '?'}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{c.full_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: '500' }}>Coach</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <>
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[1,2,3,4,5].map(i => <div key={i} style={{ height: '60px', borderRadius: '10px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />)}
          </div>
        </>
      ) : players.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '56px 48px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Users size={26} color="#94A3B8" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No players yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Add your first player to get started with this roster.</div>
          <button onClick={() => router.push(`/dashboard/roster?team=${teamId}`)} style={{ display: 'inline-block', padding: '9px 22px', borderRadius: '9px', background: primary, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit' }}>Add first player</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {['Player', '#', 'Position', 'Parent status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => {
                const status = inviteStatus(p);
                return (
                  <tr key={p.id}
                    onClick={() => setPanel(p)}
                    style={{ borderBottom: i < players.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `${primary}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: primary, flexShrink: 0 }}>
                          {p.full_name[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A' }}>{p.full_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#64748B' }}>
                      {p.jersey_number != null ? `#${p.jersey_number}` : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {p.position
                        ? <span style={{ fontSize: '11.5px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', background: `${primary}15`, color: primary }}>{p.position}</span>
                        : <span style={{ color: '#CBD5E1', fontSize: '13px' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {status
                        ? <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '5px', background: status.bg, color: status.color }}>{status.label}</span>
                        : <span style={{ color: '#CBD5E1', fontSize: '13px' }}>Not invited</span>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <ChevronRight size={14} color="#CBD5E1" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panel && (
        <PlayerPanel
          player={panel}
          teamName={teamName}
          clubName={clubName}
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
