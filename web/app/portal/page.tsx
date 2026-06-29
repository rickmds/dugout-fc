'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { CalendarDays, Megaphone, MapPin, Clock, Check, X, LogOut, FileText } from 'lucide-react';

type Profile = { id: string; full_name: string | null; role: string | null; club_id: string | null };
type Club    = { id: string; name: string; logo_url: string | null; primary_color: string | null };
type Team    = { id: string; name: string; age_group: string | null };
type Player  = { id: string; full_name: string; team_id: string };

type Event = {
  id: string; title: string; type: string;
  event_date: string; event_time: string | null;
  location: string | null; team_id: string;
};

type Announcement = {
  id: string; title: string; body: string; pinned: boolean;
  created_at: string; team_id: string;
};

type Waiver = {
  id: string; title: string; body: string; required_by: string | null;
};

type RsvpMap = Record<string, 'attending' | 'not_attending'>;

const TYPE_COLORS: Record<string, string> = { game: '#EF4444', training: '#22C55E', other: '#8B5CF6' };
const TYPE_BG:    Record<string, string> = { game: '#FEF2F2', training: '#F0FDF4', other: '#F5F3FF' };
const TYPE_EMOJI: Record<string, string> = { game: '⚽', training: '🏃', other: '📌' };

function fmtDate(iso: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function ParentPortal() {
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<Profile | null>(null);
  const [club, setClub]             = useState<Club | null>(null);
  const [teams, setTeams]           = useState<Team[]>([]);
  const [players, setPlayers]       = useState<Player[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [events, setEvents]         = useState<Event[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [waivers, setWaivers]       = useState<Waiver[]>([]);
  const [rsvps, setRsvps]           = useState<RsvpMap>({});
  const [tab, setTab]               = useState<'schedule' | 'announcements' | 'waivers'>('schedule');

  // Waiver signing state
  const [signingWaiver, setSigningWaiver] = useState<Waiver | null>(null);
  const [signerName, setSignerName]       = useState('');
  const [signing, setSigning]             = useState(false);
  const [signedIds, setSignedIds]         = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }

      const { data: prof } = await supabase.from('profiles').select('id, full_name, role, club_id').eq('id', user.id).single();
      if (!prof) { window.location.href = '/login'; return; }

      // Coaches/admins go to dashboard
      if (prof.role === 'org_admin' || prof.role === 'coach' || prof.role === 'app_admin') {
        window.location.href = '/dashboard';
        return;
      }

      setProfile(prof);

      // Load club
      if (prof.club_id) {
        const { data: clubData } = await supabase.from('clubs').select('id, name, logo_url, primary_color').eq('id', prof.club_id).single();
        setClub(clubData);
      }

      // Load teams this user belongs to
      const { data: memberData } = await supabase
        .from('team_members')
        .select('team_id, teams(id, name, age_group)')
        .eq('profile_id', user.id);

      const userTeams: Team[] = (memberData ?? []).map((m: any) => m.teams).filter(Boolean);
      setTeams(userTeams);
      if (userTeams.length) setSelectedTeam(userTeams[0].id);

      // Load players (their children on the roster)
      const teamIds = userTeams.map((t) => t.id);
      if (teamIds.length) {
        const { data: playerData } = await supabase
          .from('players')
          .select('id, full_name, team_id')
          .in('team_id', teamIds);
        setPlayers(playerData ?? []);
      }

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    (async () => {
      const today = new Date().toISOString().split('T')[0];

      const [evRes, annRes, rsvpRes, waiverRes] = await Promise.all([
        supabase.from('events').select('id, title, type, event_date, event_time, location, team_id')
          .eq('team_id', selectedTeam).gte('event_date', today).order('event_date').order('event_time').limit(30),
        supabase.from('announcements').select('id, title, body, pinned, created_at, team_id')
          .eq('team_id', selectedTeam).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20),
        supabase.from('event_rsvps').select('event_id, status')
          .in('event_id',
            (await supabase.from('events').select('id').eq('team_id', selectedTeam).gte('event_date', today)).data?.map((e) => e.id) ?? []
          ),
        supabase.from('waivers').select('id, title, body, required_by')
          .in('id',
            (await supabase.from('waiver_assignments').select('waiver_id').eq('team_id', selectedTeam)).data?.map((a) => a.waiver_id) ?? []
          ),
      ]);

      setEvents(evRes.data ?? []);
      setAnnouncements(annRes.data ?? []);

      const rsvpMap: RsvpMap = {};
      for (const r of rsvpRes.data ?? []) rsvpMap[r.event_id] = r.status;
      setRsvps(rsvpMap);
      setWaivers(waiverRes.data ?? []);
    })();
  }, [selectedTeam]);

  async function toggleRsvp(eventId: string, playerId: string, currentStatus: string | undefined) {
    const newStatus = currentStatus === 'attending' ? 'not_attending' : 'attending';
    const existing = await supabase.from('event_rsvps').select('id').eq('event_id', eventId).eq('player_id', playerId).maybeSingle();
    if (existing.data) {
      await supabase.from('event_rsvps').update({ status: newStatus }).eq('id', existing.data.id);
    } else {
      await supabase.from('event_rsvps').insert({ event_id: eventId, player_id: playerId, status: newStatus });
    }
    setRsvps((prev) => ({ ...prev, [eventId]: newStatus }));
  }

  async function signWaiver() {
    if (!signingWaiver || !signerName.trim()) return;
    const teamPlayers = players.filter((p) => p.team_id === selectedTeam);
    if (!teamPlayers.length) return;
    setSigning(true);
    await supabase.from('waiver_signatures').upsert(
      teamPlayers.map((p) => ({ waiver_id: signingWaiver.id, player_id: p.id, signed_by_name: signerName.trim() })),
      { onConflict: 'waiver_id,player_id' }
    );
    setSignedIds((prev) => new Set([...prev, signingWaiver.id]));
    setSigning(false);
    setSigningWaiver(null);
    setSignerName('');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ width: '32px', height: '32px', border: '2px solid #22C55E', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const initials = (club?.name ?? 'D').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const teamPlayers = players.filter((p) => p.team_id === selectedTeam);
  const mainPlayer = teamPlayers[0];

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* Top nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: club?.logo_url ? 'transparent' : primary, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '13px', fontWeight: '800', color: '#fff' }}>
            {club?.logo_url ? <img src={club.logo_url} alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>{club?.name ?? 'Dugout FC'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#64748B' }}>{profile?.full_name}</span>
          <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: '#94A3B8', fontFamily: 'inherit' }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 20px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>
            Hi{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋
          </h1>
          {mainPlayer && <p style={{ fontSize: '13px', color: '#64748B' }}>Viewing info for {mainPlayer.full_name}</p>}
        </div>

        {/* Team switcher */}
        {teams.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {teams.map((t) => (
              <button key={t.id} onClick={() => setSelectedTeam(t.id)}
                style={{ padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${selectedTeam === t.id ? primary : '#E2E8F0'}`, background: selectedTeam === t.id ? `${primary}10` : '#fff', color: selectedTeam === t.id ? primary : '#374151', fontWeight: selectedTeam === t.id ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', marginBottom: '20px' }}>
          {([['schedule', <CalendarDays key="s" size={14} />, 'Schedule'],
             ['announcements', <Megaphone key="a" size={14} />, 'Announcements'],
             ['waivers', <FileText key="w" size={14} />, 'Waivers']] as const).map(([v, icon, lbl]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: tab === v ? '700' : '500', background: tab === v ? '#fff' : 'transparent', color: tab === v ? '#0F172A' : '#64748B', boxShadow: tab === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', fontFamily: 'inherit' }}>
              {icon} {lbl}
            </button>
          ))}
        </div>

        {/* Schedule tab */}
        {tab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <CalendarDays size={36} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748B' }}>No upcoming events</div>
              </div>
            ) : events.map((ev) => {
              const status = rsvps[ev.id];
              return (
                <div key={ev.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <div style={{ width: '5px', flexShrink: 0, background: TYPE_COLORS[ev.type] ?? '#64748B' }} />
                    <div style={{ flex: 1, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>
                          {TYPE_EMOJI[ev.type]} {ev.title}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: TYPE_COLORS[ev.type], background: TYPE_BG[ev.type], borderRadius: '4px', padding: '1px 6px', textTransform: 'uppercase' }}>
                          {ev.type}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748B' }}>
                          <CalendarDays size={11} color="#94A3B8" /> {fmtDate(ev.event_date)}
                        </span>
                        {ev.event_time && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748B' }}>
                            <Clock size={11} color="#94A3B8" /> {fmtTime(ev.event_time)}
                          </span>
                        )}
                        {ev.location && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748B' }}>
                            <MapPin size={11} color="#94A3B8" /> {ev.location}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* RSVP buttons */}
                    {mainPlayer && (
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', padding: '12px 14px', borderLeft: '1px solid #F1F5F9', flexShrink: 0 }}>
                        <button
                          onClick={() => toggleRsvp(ev.id, mainPlayer.id, status)}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', border: `1.5px solid ${status === 'attending' ? '#22C55E' : '#E2E8F0'}`, background: status === 'attending' ? '#F0FDF4' : '#fff', color: status === 'attending' ? '#16A34A' : '#64748B', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Check size={13} strokeWidth={2.5} /> Going
                        </button>
                        <button
                          onClick={() => toggleRsvp(ev.id, mainPlayer.id, status === 'not_attending' ? 'attending' : status)}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', border: `1.5px solid ${status === 'not_attending' ? '#EF4444' : '#E2E8F0'}`, background: status === 'not_attending' ? '#FEF2F2' : '#fff', color: status === 'not_attending' ? '#DC2626' : '#64748B', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <X size={13} strokeWidth={2.5} /> Can't go
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Announcements tab */}
        {tab === 'announcements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {announcements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <Megaphone size={36} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748B' }}>No announcements yet</div>
              </div>
            ) : announcements.map((a) => (
              <div key={a.id} style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${a.pinned ? `${primary}40` : '#E2E8F0'}`, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                {a.pinned && (
                  <div style={{ fontSize: '10px', fontWeight: '700', color: primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>📌 Pinned</div>
                )}
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '8px' }}>{a.title}</div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{a.body}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '10px' }}>
                  {new Date(a.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Waivers tab */}
        {tab === 'waivers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {waivers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <FileText size={36} color="#CBD5E1" style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748B' }}>No waivers to sign</div>
              </div>
            ) : waivers.map((w) => {
              const isSigned = signedIds.has(w.id);
              return (
                <div key={w.id} style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${isSigned ? '#DCFCE7' : '#E2E8F0'}`, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>{w.title}</div>
                      {w.required_by && (
                        <div style={{ fontSize: '12px', color: new Date(w.required_by) < new Date() && !isSigned ? '#D97706' : '#94A3B8' }}>
                          Required by {new Date(w.required_by).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                    {isSigned ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F0FDF4', borderRadius: '8px', padding: '6px 12px', flexShrink: 0 }}>
                        <Check size={14} color="#16A34A" strokeWidth={2.5} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#16A34A' }}>Signed</span>
                      </div>
                    ) : (
                      <button onClick={() => setSigningWaiver(w)} style={{ padding: '7px 16px', background: primary, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                        Sign now
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748B', lineHeight: '1.6', maxHeight: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap' }}>
                    {w.body.slice(0, 200)}{w.body.length > 200 ? '…' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sign waiver modal */}
      {signingWaiver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: '0' }}
          onClick={() => setSigningWaiver(null)}>
          <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: '600px', padding: '24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '36px', height: '4px', background: '#E2E8F0', borderRadius: '2px', margin: '0 auto 20px' }} />
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>{signingWaiver.title}</div>
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', maxHeight: '160px', overflowY: 'auto', background: '#F8FAFC', borderRadius: '10px', padding: '12px', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
              {signingWaiver.body}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Your full name (signature)</label>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Type your full name to sign"
                style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
              By entering your name you agree to the terms of this document on behalf of {teamPlayers.map((p) => p.full_name).join(', ')}.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setSigningWaiver(null)} style={{ flex: 1, padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={signWaiver} disabled={signing || !signerName.trim()} style={{ flex: 2, padding: '12px', background: signing || !signerName.trim() ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {signing ? 'Signing…' : '✓ I agree & sign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
