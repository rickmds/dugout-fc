'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, UserPlus, RotateCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type GuestRow = {
  id: string;
  full_name: string;
  role: 'player' | 'coach';
  status: 'pending' | 'confirmed' | 'declined';
  player_id: string | null;
  profile_id: string | null;
  player_profile_id: string | null;
};

type PlayerResult = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  team_name: string;
  profile_id: string | null;
};

type CoachResult = {
  id: string;
  full_name: string;
};

const STATUS_CONFIG: Record<GuestRow['status'], { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#D97706', label: 'Invited'   },
  confirmed: { bg: '#F0FDF4', text: '#16A34A', label: 'Confirmed' },
  declined:  { bg: '#FEF2F2', text: '#DC2626', label: 'Declined'  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type ConfirmedGuest = { id: string; full_name: string; role: 'player' | 'coach' };

interface GuestSectionProps {
  eventId: string;
  teamId: string;
  teamName: string;
  eventTitle: string;
  primary: string;
  onConfirmedCount?: (n: number) => void;
  onConfirmedGuests?: (guests: ConfirmedGuest[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GuestSection({ eventId, teamId, teamName, eventTitle, primary, onConfirmedCount, onConfirmedGuests }: GuestSectionProps) {
  const { profile, club, teams } = useDashboard();
  const isCoach = ['coach', 'org_admin', 'app_admin'].includes(profile?.role ?? '');

  const [guests,    setGuests]    = useState<GuestRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [addTab,    setAddTab]    = useState<'player' | 'coach'>('player');
  const [query,     setQuery]     = useState('');
  const [playerRes, setPlayerRes] = useState<PlayerResult[]>([]);
  const [coachRes,  setCoachRes]  = useState<CoachResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding,    setAdding]    = useState<string | null>(null);
  const [removing,  setRemoving]  = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clubId   = club?.id   ?? '';
  const clubSlug = club?.slug ?? '';
  const coachName = profile?.full_name ?? 'Coach';

  // ── Load guests ──────────────────────────────────────────────────────────────

  const loadGuests = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const { data: raw } = await supabase
      .from('event_guests')
      .select('id, full_name, role, status, player_id, profile_id')
      .eq('event_id', eventId)
      .order('created_at');

    const rows = (raw ?? []) as any[];

    // Resolve profile_id for player guests
    const playerIds = rows.filter(g => g.player_id).map(g => g.player_id as string);
    const pidMap = new Map<string, string | null>();
    if (playerIds.length > 0) {
      const { data: playerRows } = await supabase
        .from('players').select('id, profile_id').in('id', playerIds);
      (playerRows ?? []).forEach((p: any) => pidMap.set(p.id, p.profile_id ?? null));
    }

    const resolved = rows.map(g => ({
      ...g,
      player_profile_id: g.player_id ? (pidMap.get(g.player_id) ?? null) : null,
    }));
    setGuests(resolved);
    const confirmedRows = resolved.filter(g => g.status === 'confirmed');
    onConfirmedCount?.(confirmedRows.length);
    onConfirmedGuests?.(confirmedRows.map(g => ({ id: g.id, full_name: g.full_name, role: g.role as 'player' | 'coach' })));
    setLoading(false);
  }, [eventId]);

  useEffect(() => { loadGuests(); }, [loadGuests]);

  // ── Reset & load results when modal opens or tab changes ─────────────────────

  useEffect(() => {
    if (!showAdd) { setQuery(''); setPlayerRes([]); setCoachRes([]); return; }
    setQuery('');
    if (addTab === 'player') fetchPlayers('');
    else fetchCoaches('');
  }, [showAdd, addTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player / coach search ─────────────────────────────────────────────────────

  async function fetchPlayers(q: string) {
    if (!clubId) return;
    setSearching(true);

    const { data: clubTeams } = await supabase
      .from('teams').select('id, name').eq('club_id', clubId).neq('id', teamId);
    const otherIds = (clubTeams ?? []).map((t: any) => t.id);
    if (!otherIds.length) { setPlayerRes([]); setSearching(false); return; }

    const existingPids = guests.filter(g => g.player_id).map(g => g.player_id as string);

    let pq = supabase.from('players')
      .select('id, full_name, jersey_number, position, profile_id, team_id')
      .in('team_id', otherIds)
      .order('full_name')
      .limit(40);
    if (q.trim()) pq = pq.ilike('full_name', `%${q.trim()}%`);
    if (existingPids.length) pq = pq.not('id', 'in', `(${existingPids.join(',')})`);

    const { data: players } = await pq;
    const nameMap = Object.fromEntries((clubTeams ?? []).map((t: any) => [t.id, t.name]));
    setPlayerRes(
      ((players ?? []) as any[]).map(p => ({ ...p, team_name: nameMap[p.team_id] ?? 'Other Team' }))
    );
    setSearching(false);
  }

  async function fetchCoaches(q: string) {
    if (!clubId) return;
    setSearching(true);

    const existingCids = guests.filter(g => g.profile_id).map(g => g.profile_id as string);

    let cq = supabase.from('profiles')
      .select('id, full_name')
      .eq('club_id', clubId)
      .in('role', ['coach', 'org_admin'])
      .neq('id', profile?.id ?? '')
      .order('full_name')
      .limit(40);
    if (q.trim()) cq = cq.ilike('full_name', `%${q.trim()}%`);
    if (existingCids.length) cq = cq.not('id', 'in', `(${existingCids.join(',')})`);

    const { data } = await cq;
    setCoachRes(((data ?? []) as any[]) as CoachResult[]);
    setSearching(false);
  }

  function handleQuery(q: string) {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (addTab === 'player') fetchPlayers(q);
      else fetchCoaches(q);
    }, 280);
  }

  // ── Send invite helpers ───────────────────────────────────────────────────────

  async function sendInvite(guestId: string, recipientProfileId: string, name: string, role: 'player' | 'coach') {
    await Promise.allSettled([
      supabase.functions.invoke('send-guest-invite', {
        body: {
          profile_id: recipientProfileId,
          player_name: name,
          event_id: eventId,
          guest_id: guestId,
          requesting_team_id: teamId,
          coach_name: coachName,
          role,
        },
      }),
      supabase.functions.invoke('send-push', {
        body: {
          profile_ids: [recipientProfileId],
          title: role === 'coach' ? 'Guest coaching invitation' : 'Guest player invitation',
          body: role === 'coach'
            ? `${coachName} invited you to guest coach — ${eventTitle}`
            : `You've been invited to guest play for ${teamName} — ${eventTitle}`,
          data: { type: 'guest_invite', event_id: eventId, club_slug: clubSlug },
        },
      }),
    ]);
  }

  // ── Add guest ─────────────────────────────────────────────────────────────────

  async function addPlayer(p: PlayerResult) {
    setAdding(p.id);
    const { data: newGuest } = await supabase.from('event_guests').insert({
      event_id: eventId, player_id: p.id, full_name: p.full_name,
      role: 'player', status: 'pending', added_by: profile?.id ?? null,
    }).select().single();

    if (newGuest && p.profile_id) {
      await sendInvite((newGuest as any).id, p.profile_id, p.full_name, 'player');
    }
    await loadGuests();
    setAdding(null);
    fetchPlayers(query);
  }

  async function addCoach(c: CoachResult) {
    setAdding(c.id);
    const { data: newGuest } = await supabase.from('event_guests').insert({
      event_id: eventId, profile_id: c.id, full_name: c.full_name,
      role: 'coach', status: 'pending', added_by: profile?.id ?? null,
    }).select().single();

    if (newGuest) {
      await sendInvite((newGuest as any).id, c.id, c.full_name, 'coach');
    }
    await loadGuests();
    setAdding(null);
    fetchCoaches(query);
  }

  // ── Remove / resend ───────────────────────────────────────────────────────────

  async function removeGuest(guestId: string) {
    setRemoving(guestId);
    await supabase.from('event_guests').delete().eq('id', guestId);
    setGuests(gs => gs.filter(g => g.id !== guestId));
    setRemoving(null);
  }

  async function resendInvite(g: GuestRow) {
    const rid = g.profile_id ?? g.player_profile_id;
    if (!rid) return;
    setResending(g.id);
    await sendInvite(g.id, rid, g.full_name, g.role);
    setResending(null);
  }

  // ── Grouped guest lists ───────────────────────────────────────────────────────

  const confirmed = guests.filter(g => g.status === 'confirmed');
  const pending   = guests.filter(g => g.status === 'pending');
  const declined  = guests.filter(g => g.status === 'declined');

  // ── Player search results grouped by team ─────────────────────────────────────

  const playersByTeam = (() => {
    const map = new Map<string, PlayerResult[]>();
    playerRes.forEach(p => {
      if (!map.has(p.team_name)) map.set(p.team_name, []);
      map.get(p.team_name)!.push(p);
    });
    return Array.from(map.entries());
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Section header */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '8px 18px 4px', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Guests{guests.length > 0 ? ` · ${guests.length}` : ''}
        </span>
        {isCoach && (
          <button
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: primary, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}
          >
            <UserPlus size={12} /> Add
          </button>
        )}
      </div>

      {/* Guest rows */}
      {loading ? (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      ) : guests.length === 0 ? (
        <div style={{ padding: '12px 18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#CBD5E1' }}>No guests yet</div>
        </div>
      ) : (
        [{ list: confirmed, label: 'Confirmed' }, { list: pending, label: 'Invited' }, { list: declined, label: 'Declined' }].map(({ list, label }) =>
          list.length > 0 && (
            <div key={label}>
              <div style={{ padding: '6px 18px 3px', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#FAFAFA', borderTop: '1px solid #F1F5F9' }}>
                {label} · {list.length}
              </div>
              {list.map(g => {
                const sc = STATUS_CONFIG[g.status];
                const canResend = isCoach && g.status === 'pending' && !!(g.profile_id ?? g.player_profile_id);
                return (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderBottom: '1px solid #F8FAFC' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800', color: sc.text, flexShrink: 0 }}>
                      {g.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.full_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                        <span style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'capitalize' }}>{g.role}</span>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: sc.text, background: sc.bg, padding: '1px 5px', borderRadius: '4px' }}>{sc.label}</span>
                      </div>
                    </div>
                    {isCoach && (
                      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                        {canResend && (
                          <button onClick={() => resendInvite(g)} disabled={resending === g.id} title="Resend invite"
                            style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: resending === g.id ? 0.5 : 1 }}>
                            <RotateCw size={11} color="#64748B" />
                          </button>
                        )}
                        <button onClick={() => removeGuest(g.id)} disabled={removing === g.id} title="Remove guest"
                          style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1.5px solid #FEE2E2', background: '#FFF5F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: removing === g.id ? 0.5 : 1 }}>
                          <X size={11} color="#EF4444" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )
      )}

      {/* Add Guest modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px' }}
          onClick={() => setShowAdd(false)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Invite a Guest</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{teamName} · {eventTitle}</div>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', marginTop: '-2px' }}>
                <X size={16} color="#94A3B8" />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '14px 20px 0', gap: '8px', flexShrink: 0 }}>
              {(['player', 'coach'] as const).map(t => (
                <button key={t} onClick={() => setAddTab(t)}
                  style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: addTab === t ? '700' : '500', border: `2px solid ${addTab === t ? primary : '#E2E8F0'}`, background: addTab === t ? `${primary}15` : '#fff', color: addTab === t ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {t === 'player' ? 'Player' : 'Coach / Staff'}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ padding: '12px 20px', flexShrink: 0 }}>
              <input value={query} onChange={e => handleQuery(e.target.value)} autoFocus
                placeholder={addTab === 'player' ? 'Search players…' : 'Search coaches…'}
                style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '9px 13px', fontSize: '14px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
              {searching ? (
                <div style={{ padding: '28px', textAlign: 'center' }}>
                  <div style={{ width: '20px', height: '20px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                </div>
              ) : addTab === 'player' ? (
                playersByTeam.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>
                    {query ? 'No players found' : 'No players on other teams yet'}
                  </div>
                ) : (
                  playersByTeam.map(([tName, players]) => (
                    <div key={tName} style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px', paddingBottom: '6px', borderBottom: '1px solid #F1F5F9' }}>
                        {tName}
                      </div>
                      {players.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#475569', flexShrink: 0 }}>
                            {p.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{p.full_name}</div>
                            <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                              {[p.jersey_number != null ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ')}
                              {!p.profile_id && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#F59E0B' }}>No account</span>}
                            </div>
                          </div>
                          <button onClick={() => addPlayer(p)} disabled={adding === p.id}
                            style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: adding === p.id ? '#E2E8F0' : primary, color: adding === p.id ? '#94A3B8' : '#fff', fontSize: '12px', fontWeight: '700', cursor: adding === p.id ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                            {adding === p.id ? '…' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ))
                )
              ) : (
                coachRes.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>
                    {query ? 'No coaches found' : 'No coaches in your club yet'}
                  </div>
                ) : (
                  coachRes.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#475569', flexShrink: 0 }}>
                        {c.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{c.full_name}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>Coach / Staff</div>
                      </div>
                      <button onClick={() => addCoach(c)} disabled={adding === c.id}
                        style={{ padding: '6px 12px', borderRadius: '7px', border: 'none', background: adding === c.id ? '#E2E8F0' : primary, color: adding === c.id ? '#94A3B8' : '#fff', fontSize: '12px', fontWeight: '700', cursor: adding === c.id ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        {adding === c.id ? '…' : 'Add'}
                      </button>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
