'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Send, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type Callout = {
  id: string;
  target_team_id: string;
  target_team_name: string;
  spots_needed: number;
  status: 'open' | 'filled' | 'cancelled';
  note: string | null;
  filled_count: number;
};

type Team = { id: string; name: string };

const STATUS_CFG: Record<Callout['status'], { bg: string; text: string; label: string }> = {
  open:      { bg: '#FEF3C7', text: '#D97706', label: 'Open'      },
  filled:    { bg: '#F0FDF4', text: '#16A34A', label: 'Filled'    },
  cancelled: { bg: '#F1F5F9', text: '#94A3B8', label: 'Cancelled' },
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  eventId: string;
  teamId: string;
  teamName: string;
  eventTitle: string;
  primary: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GuestCalloutSection({ eventId, teamId, teamName, eventTitle, primary }: Props) {
  const { profile, club } = useDashboard();
  const isCoach = ['coach', 'org_admin', 'app_admin'].includes(profile?.role ?? '');
  const clubId  = club?.id ?? '';

  const [callouts,   setCallouts]   = useState<Callout[]>([]);
  const [otherTeams, setOtherTeams] = useState<Team[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [targetId,   setTargetId]   = useState('');
  const [spots,      setSpots]      = useState(1);
  const [note,       setNote]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // ── Load callouts ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!eventId || !teamId) return;
    setLoading(true);

    const db = supabase as any;
    const { data: reqs } = await db
      .from('guest_requests')
      .select('id, target_team_id, spots_needed, status, note')
      .eq('event_id', eventId)
      .eq('requesting_team_id', teamId)
      .order('created_at');

    if (!reqs?.length) { setCallouts([]); setLoading(false); return; }

    const targetIds = (reqs as any[]).map((r: any) => r.target_team_id as string);
    const { data: teamsData } = await supabase.from('teams').select('id, name').in('id', targetIds);
    const nameMap = Object.fromEntries(((teamsData ?? []) as any[]).map((t: any) => [t.id as string, t.name as string]));

    // Count confirmed guests per callout (from the target team's players)
    const filled: Record<string, number> = {};
    await Promise.all(
      (reqs as any[]).map(async (r: any) => {
        const { data: players } = await supabase.from('players').select('id').eq('team_id', r.target_team_id);
        const pids = ((players ?? []) as any[]).map((p: any) => p.id as string);
        if (!pids.length) { filled[r.id] = 0; return; }
        const { count } = await supabase
          .from('event_guests')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .in('player_id', pids)
          .eq('status', 'confirmed');
        filled[r.id] = count ?? 0;
      })
    );

    setCallouts(
      (reqs as any[]).map((r: any) => ({
        id:               r.id,
        target_team_id:   r.target_team_id,
        target_team_name: nameMap[r.target_team_id] ?? 'Unknown team',
        spots_needed:     r.spots_needed as number,
        status:           r.status as Callout['status'],
        note:             r.note as string | null,
        filled_count:     filled[r.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [eventId, teamId]);

  useEffect(() => { load(); }, [load]);

  // ── Open modal — fetch other teams first ──────────────────────────────────────

  async function openModal() {
    if (!clubId || !teamId) return;
    const { data } = await supabase
      .from('teams').select('id, name').eq('club_id', clubId).neq('id', teamId).order('name');
    const teams = ((data ?? []) as any[]).map((t: any) => ({ id: t.id as string, name: t.name as string }));
    setOtherTeams(teams);
    if (teams.length && !targetId) setTargetId(teams[0].id);
    setShowModal(true);
  }

  // ── Send call out ─────────────────────────────────────────────────────────────

  async function sendCallout() {
    if (!profile || !targetId) return;
    setSending(true);
    const db = supabase as any;

    const { data: newReq, error } = await db
      .from('guest_requests')
      .insert({
        event_id:           eventId,
        requesting_team_id: teamId,
        target_team_id:     targetId,
        note:               note.trim() || null,
        spots_needed:       spots,
        status:             'open',
        created_by:         profile.id,
      })
      .select('id')
      .single();

    if (error || !newReq) { setSending(false); return; }

    // Notify target team's parents via push
    const { data: players } = await supabase
      .from('players').select('profile_id').eq('team_id', targetId);
    const profileIds = ((players ?? []) as any[])
      .map((p: any) => p.profile_id as string | null)
      .filter(Boolean) as string[];

    if (profileIds.length) {
      await supabase.functions.invoke('send-push', {
        body: {
          profile_ids: profileIds,
          title: `${teamName} needs guest players`,
          body: `${profile.full_name ?? 'A coach'} is looking for ${spots} player${spots !== 1 ? 's' : ''} for ${eventTitle}${note.trim() ? ` — ${note.trim()}` : ''}. Open the app to volunteer.`,
          data: { type: 'guest_request', request_id: (newReq as any).id, club_slug: club?.slug ?? '' },
        },
      });
    }

    setShowModal(false);
    setNote('');
    setSpots(1);
    await load();
    setSending(false);
  }

  // ── Cancel ────────────────────────────────────────────────────────────────────

  async function cancelCallout(id: string) {
    setCancelling(id);
    await (supabase as any).from('guest_requests').update({ status: 'cancelled' }).eq('id', id);
    setCallouts(prev => prev.map(c => c.id === id ? { ...c, status: 'cancelled' } : c));
    setCancelling(null);
  }

  if (!isCoach) return null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Section header */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '8px 18px 4px', background: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Call Outs{callouts.filter(c => c.status !== 'cancelled').length > 0 ? ` · ${callouts.filter(c => c.status !== 'cancelled').length}` : ''}
        </span>
        <button
          onClick={openModal}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: primary, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}
        >
          <Megaphone size={12} /> Call out
        </button>
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: '12px', textAlign: 'center' }}>
          <div style={{ width: '16px', height: '16px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        </div>
      ) : callouts.length === 0 ? (
        <div style={{ padding: '10px 18px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#CBD5E1' }}>No call outs sent</div>
        </div>
      ) : (
        callouts.map(c => {
          const sc = STATUS_CFG[c.status];
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderBottom: '1px solid #F8FAFC' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  → {c.target_team_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                  {/* Dot indicators */}
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {Array.from({ length: c.spots_needed }).map((_, i) => (
                      <div key={i} style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        background: i < c.filled_count ? '#16A34A' : '#E2E8F0',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>{c.filled_count}/{c.spots_needed}</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: sc.text, background: sc.bg, padding: '1px 5px', borderRadius: '4px' }}>{sc.label}</span>
                  {c.note && (
                    <span style={{ fontSize: '10px', color: '#94A3B8', fontStyle: 'italic', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.note}
                    </span>
                  )}
                </div>
              </div>
              {c.status === 'open' && (
                <button
                  onClick={() => cancelCallout(c.id)}
                  disabled={cancelling === c.id}
                  title="Cancel call out"
                  style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1.5px solid #FEE2E2', background: '#FFF5F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: cancelling === c.id ? 0.5 : 1, flexShrink: 0 }}
                >
                  <X size={11} color="#EF4444" />
                </button>
              )}
            </div>
          );
        })
      )}

      {/* Call out modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>Call out to a team</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{teamName} · {eventTitle}</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={16} color="#94A3B8" />
              </button>
            </div>

            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Team picker */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Which team?</label>
                {otherTeams.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>No other teams in this club yet.</div>
                ) : (
                  <select
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '14px', color: '#0F172A', background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                  >
                    {otherTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>

              {/* Spots */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Spots needed</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setSpots(n)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: '8px', border: `2px solid ${spots === n ? primary : '#E2E8F0'}`, background: spots === n ? `${primary}15` : '#fff', color: spots === n ? primary : '#64748B', fontWeight: spots === n ? '800' : '500', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Message (optional)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Need U10 players, game starts at 9am"
                  rows={2}
                  style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '14px', color: '#0F172A', fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <button
                onClick={sendCallout}
                disabled={sending || !targetId || otherTeams.length === 0}
                style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: sending || !targetId ? '#E2E8F0' : primary, color: sending || !targetId ? '#94A3B8' : '#fff', fontSize: '14px', fontWeight: '800', cursor: sending || !targetId ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'background 0.15s' }}
              >
                <Send size={14} />
                {sending ? 'Sending…' : `Call out to ${otherTeams.find(t => t.id === targetId)?.name ?? 'team'}`}
              </button>

              <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
                Parents on that team will receive a push notification and can volunteer their child in the app.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
