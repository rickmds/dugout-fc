'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Send, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { isEligibleTeam, parseAgeGroup } from '@/lib/guestEligibility';

// ── Types ─────────────────────────────────────────────────────────────────────

type Callout = {
  id: string;
  target_team_ids: string[];
  target_team_names: string[];
  spots_needed: number;
  status: 'open' | 'filled' | 'cancelled';
  note: string | null;
  filled_count: number;
};

type Team = { id: string; name: string; age_group: string | null; eligible: boolean };

type GuestRequestRow = {
  id: string;
  spots_needed: number;
  status: Callout['status'];
  note: string | null;
};

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
  teamClubId: string;
  eventTitle: string;
  primary: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GuestCalloutSection({ eventId, teamId, teamName, teamClubId, eventTitle, primary }: Props) {
  const { profile, club, teams } = useDashboard();
  const isCoach = ['coach', 'org_admin', 'app_admin'].includes(profile?.role ?? '');
  const myTeam = teams.find(t => t.id === teamId);

  const [callouts,   setCallouts]   = useState<Callout[]>([]);
  const [otherTeams, setOtherTeams] = useState<Team[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [targetIds,  setTargetIds]  = useState<string[]>([]);
  const [spots,      setSpots]      = useState(1);
  const [note,       setNote]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // Age-group sections that are expanded — sections with an eligible team
  // open by default when data loads; nothing is ever hard-hidden.
  const [openAgeGroups, setOpenAgeGroups] = useState<Set<string>>(new Set());
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // ── Load callouts ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!eventId || !teamId) return;
    setLoading(true);

    const { data: reqs } = await supabase
      .from('guest_requests')
      .select('id, spots_needed, status, note')
      .eq('event_id', eventId)
      .eq('requesting_team_id', teamId)
      .order('created_at')
      .returns<GuestRequestRow[]>();

    if (!reqs?.length) { setCallouts([]); setLoading(false); return; }

    const requestIds = reqs.map(r => r.id);
    const [{ data: targetRows }, { data: fillRows }] = await Promise.all([
      supabase.from('guest_request_targets').select('request_id, team_id, teams(name)').in('request_id', requestIds)
        .returns<{ request_id: string; team_id: string; teams: { name: string } | null }[]>(),
      supabase.from('guest_request_fill').select('request_id, filled_count').in('request_id', requestIds)
        .returns<{ request_id: string; filled_count: number }[]>(),
    ]);

    const targetsByRequest: Record<string, { id: string; name: string }[]> = {};
    for (const row of targetRows ?? []) {
      (targetsByRequest[row.request_id] ??= []).push({ id: row.team_id, name: row.teams?.name ?? 'Unknown team' });
    }
    const fillByRequest = Object.fromEntries((fillRows ?? []).map(f => [f.request_id, f.filled_count]));

    setCallouts(
      reqs.map(r => {
        const targets = targetsByRequest[r.id] ?? [];
        return {
          id:                 r.id,
          target_team_ids:    targets.map(t => t.id),
          target_team_names:  targets.map(t => t.name),
          spots_needed:       r.spots_needed,
          status:             r.status,
          note:               r.note,
          filled_count:       fillByRequest[r.id] ?? 0,
        };
      })
    );
    setLoading(false);
  }, [eventId, teamId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  // ── Open modal — fetch other teams in the requesting team's own club ───────────

  async function openModal() {
    if (!teamClubId || !teamId) return;
    setOpenAgeGroups(new Set());
    setTeamSearchQuery('');
    const { data } = await supabase
      .from('teams').select('id, name, age_group, gender').eq('club_id', teamClubId).neq('id', teamId).order('name');
    const otherTeamRows = (data ?? []).map(t => ({
      id: t.id, name: t.name, age_group: t.age_group,
      eligible: isEligibleTeam(myTeam ?? { age_group: null, gender: null }, t),
    }));
    setOtherTeams(otherTeamRows);
    setOpenAgeGroups(prev => {
      const next = new Set(prev);
      for (const t of otherTeamRows) if (t.eligible) next.add(t.age_group ?? 'Other');
      return next;
    });
    setTargetIds([]);
    setShowModal(true);
  }

  function toggleTarget(id: string) {
    setTargetIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  // Sections always sorted youngest-first regardless of eligibility; open/
  // collapsed state is tracked separately in openAgeGroups.
  const teamsByAgeGroup = (() => {
    const map = new Map<string, Team[]>();
    for (const t of otherTeams) {
      const key = t.age_group ?? 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries())
      .map(([key, teams]) => ({ key, ageGroup: teams[0]?.age_group ?? null, teams, hasEligible: teams.some(t => t.eligible) }))
      .sort((a, b) => {
        const pa = parseAgeGroup(a.ageGroup);
        const pb = parseAgeGroup(b.ageGroup);
        if (pa == null && pb == null) return a.key.localeCompare(b.key);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
  })();

  // ── Send call out ─────────────────────────────────────────────────────────────

  async function sendCallout() {
    if (!profile || targetIds.length === 0) return;
    setSending(true);

    const { data: newReq, error } = await supabase
      .rpc('create_guest_request', {
        p_event_id:           eventId,
        p_requesting_team_id: teamId,
        p_target_team_ids:    targetIds,
        p_spots_needed:       spots,
        p_note:               note.trim() || null,
      })
      .single<{ id: string }>();

    if (error || !newReq) { setSending(false); return; }

    // Notify all target teams' parents via push
    const { data: players } = await supabase
      .from('players').select('profile_id').in('team_id', targetIds);
    const profileIds = [...new Set((players ?? [])
      .map(p => p.profile_id)
      .filter((id): id is string => !!id))];

    if (profileIds.length) {
      await supabase.functions.invoke('send-push', {
        body: {
          profile_ids: profileIds,
          title: `${teamName} needs guest players`,
          body: `${profile.full_name ?? 'A coach'} is looking for ${spots} player${spots !== 1 ? 's' : ''} for ${eventTitle}${note.trim() ? ` — ${note.trim()}` : ''}. Open the app to volunteer.`,
          data: { type: 'guest_request', request_id: newReq.id, club_slug: club?.slug ?? '' },
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
    await supabase.from('guest_requests').update({ status: 'cancelled' }).eq('id', id);
    setCallouts(prev => prev.map(c => c.id === id ? { ...c, status: 'cancelled' } : c));
    setCancelling(null);
  }

  if (!isCoach) return null;

  function renderTeamChip(t: Team) {
    const sel = targetIds.includes(t.id);
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => toggleTarget(t.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '9px 14px', borderRadius: '20px',
          border: `1.5px solid ${sel ? primary : '#E2E8F0'}`,
          background: sel ? `${primary}15` : '#fff',
          color: sel ? primary : '#0F172A',
          fontWeight: sel ? '800' : '500', fontSize: '13px',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {t.name}
        {!t.eligible && (
          <span style={{ fontSize: '9px', fontWeight: '700', color: sel ? primary : '#94A3B8' }}>
            · Check eligibility
          </span>
        )}
      </button>
    );
  }

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
                  → {c.target_team_names.join(', ')}
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
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  Which team(s)?{targetIds.length > 0 ? ` (${targetIds.length} selected)` : ''}
                </label>
                {otherTeams.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>No other teams in this club yet.</div>
                ) : (
                  <>
                    {otherTeams.length > 6 && (
                      <input value={teamSearchQuery} onChange={e => setTeamSearchQuery(e.target.value)}
                        placeholder="Search teams…"
                        style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 11px', fontSize: '13px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '10px' }} />
                    )}
                    {teamSearchQuery.trim() ? (() => {
                      const q = teamSearchQuery.trim().toLowerCase();
                      const matches = otherTeams.filter(t => t.name.toLowerCase().includes(q));
                      return matches.length === 0 ? (
                        <div style={{ fontSize: '13px', color: '#94A3B8' }}>No teams match &quot;{teamSearchQuery}&quot;</div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {matches.map(renderTeamChip)}
                        </div>
                      );
                    })() : (
                      teamsByAgeGroup.map(section => {
                        const isOpen = openAgeGroups.has(section.key);
                        return (
                          <div key={section.key} style={{ marginBottom: '4px' }}>
                            <button type="button" onClick={() => setOpenAgeGroups(prev => {
                                const next = new Set(prev);
                                if (next.has(section.key)) next.delete(section.key); else next.add(section.key);
                                return next;
                              })}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 2px', border: 'none', borderTop: '1px solid #F1F5F9', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                              <span style={{ fontSize: '12px', color: '#94A3B8', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
                              <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>{section.ageGroup ?? 'Other'}</span>
                              <span style={{ fontSize: '11px', color: '#94A3B8', flex: 1 }}>{section.teams.length} team{section.teams.length !== 1 ? 's' : ''}</span>
                              {!section.hasEligible && (
                                <span style={{ fontSize: '9px', fontWeight: '700', color: '#94A3B8', background: '#F1F5F9', borderRadius: '20px', padding: '2px 7px' }}>
                                  Check eligibility
                                </span>
                              )}
                            </button>
                            {isOpen && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0 10px' }}>
                                {section.teams.map(renderTeamChip)}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
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
                disabled={sending || targetIds.length === 0 || otherTeams.length === 0}
                style={{ width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: sending || targetIds.length === 0 ? '#E2E8F0' : primary, color: sending || targetIds.length === 0 ? '#94A3B8' : '#fff', fontSize: '14px', fontWeight: '800', cursor: sending || targetIds.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'background 0.15s' }}
              >
                <Send size={14} />
                {sending
                  ? 'Sending…'
                  : targetIds.length > 1
                    ? `Call out to ${targetIds.length} teams`
                    : `Call out to ${otherTeams.find(t => t.id === targetIds[0])?.name ?? 'team'}`}
              </button>

              <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>
                Parents on the selected team(s) will receive a push notification. Spots are shared across all of them — first to volunteer fills the spot.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
