'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Mail, Phone, Users, Hash, DollarSign, FileCheck, FileText, ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { positionStyle, hex2rgb, initials } from '@/lib/playerDisplay';
import { formatCurrency } from '@/lib/formatCurrency';

type FamilyPlayer = {
  id: string; full_name: string; jersey_number: number | null; position: string | null;
  photo_url: string | null; team_id: string; team_name: string;
  owed: number; waiversSigned: number; waiversTotal: number; activeRegistrations: number;
};
type Guardian = { profile_id: string; full_name: string | null; email: string | null; phone: string | null; playerNames: string[] };

export default function FamilyPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const router = useRouter();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const { r, g, b } = hex2rgb(primary);

  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [players, setPlayers] = useState<FamilyPlayer[]>([]);
  const [attendanceByPlayer, setAttendanceByPlayer] = useState<Map<string, number | null>>(new Map());
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    const { data: playerRows } = await supabase.rpc('get_players_for_guardian', { p_profile_id: profileId });

    const rows = (playerRows ?? []) as { id: string; full_name: string; jersey_number: number | null; position: string | null; photo_url: string | null; team_id: string }[];
    if (!rows.length) { setLoading(false); return; }

    const playerIds = rows.map((p) => p.id);
    const teamIds = [...new Set(rows.map((p) => p.team_id))];
    const [{ data: teams }, { data: playerProfileLinks }, { data: guardianLinks }, { data: fees }, { data: waiverAssignments }, { data: waiverSignatures }, { data: regSubs }] = await Promise.all([
      supabase.from('teams').select('id,name').in('id', teamIds),
      // Every guardian touching ANY of these kids, not just the one we
      // navigated here from — both the legacy single-FK column and the
      // multi-guardian join table.
      supabase.from('players').select('id,profile_id').in('id', playerIds),
      supabase.from('player_guardians').select('player_id,profile_id').in('player_id', playerIds),
      supabase.from('player_fees').select('player_id,amount_due,amount_paid,discount,status').in('player_id', playerIds),
      supabase.from('waiver_assignments').select('waiver_id,team_id').in('team_id', teamIds),
      supabase.from('waiver_signatures').select('waiver_id,player_id').in('player_id', playerIds),
      supabase.from('registration_submissions').select('roster_player_id,form_id').in('roster_player_id', playerIds),
    ]);
    const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
    const playerNameById = new Map(rows.map((p) => [p.id, p.full_name]));

    // Which players each guardian is linked to — usually all of them, but
    // not guaranteed (e.g. a step-parent only on one kid's account).
    const playersByGuardian = new Map<string, Set<string>>();
    for (const p of playerProfileLinks ?? []) {
      if (!p.profile_id) continue;
      const set = playersByGuardian.get(p.profile_id) ?? new Set<string>();
      set.add(p.id);
      playersByGuardian.set(p.profile_id, set);
    }
    for (const g2 of guardianLinks ?? []) {
      const set = playersByGuardian.get(g2.profile_id) ?? new Set<string>();
      set.add(g2.player_id);
      playersByGuardian.set(g2.profile_id, set);
    }
    const guardianIds = [...playersByGuardian.keys()];

    const [{ data: profiles }, { data: invites }] = await Promise.all([
      supabase.from('profiles').select('id,full_name').in('id', guardianIds),
      supabase.from('invites').select('accepted_by,email,phone').in('accepted_by', guardianIds).not('accepted_by', 'is', null),
    ]);
    const guardianNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const contactByGuardian = new Map<string, { email: string | null; phone: string | null }>();
    for (const inv of invites ?? []) {
      if (!inv.accepted_by || contactByGuardian.has(inv.accepted_by)) continue;
      contactByGuardian.set(inv.accepted_by, { email: inv.email, phone: inv.phone });
    }
    setGuardians(guardianIds.map((id) => ({
      profile_id: id,
      full_name: guardianNameById.get(id) ?? null,
      email: contactByGuardian.get(id)?.email ?? null,
      phone: contactByGuardian.get(id)?.phone ?? null,
      playerNames: [...(playersByGuardian.get(id) ?? [])].map((pid) => playerNameById.get(pid) ?? '').filter(Boolean),
    })).sort((a, b) => (a.profile_id === profileId ? -1 : b.profile_id === profileId ? 1 : 0)));

    // Fees owed, per player — the combined total below is just a sum of this.
    const owedByPlayer = new Map<string, number>();
    for (const f of fees ?? []) {
      const amt = Math.max(Number(f.amount_due) - Number(f.discount) - Number(f.amount_paid), 0);
      owedByPlayer.set(f.player_id, (owedByPlayer.get(f.player_id) ?? 0) + amt);
    }
    setOutstandingTotal([...owedByPlayer.values()].reduce((s, v) => s + v, 0));

    // Waiver completion, per player, scoped to their own team's assignments.
    const assignmentsByTeam = new Map<string, Set<string>>();
    for (const a of waiverAssignments ?? []) {
      const set = assignmentsByTeam.get(a.team_id) ?? new Set<string>();
      set.add(a.waiver_id);
      assignmentsByTeam.set(a.team_id, set);
    }
    const signedByPlayer = new Map<string, Set<string>>();
    for (const s of waiverSignatures ?? []) {
      const set = signedByPlayer.get(s.player_id) ?? new Set<string>();
      set.add(s.waiver_id);
      signedByPlayer.set(s.player_id, set);
    }

    // Active registrations, per player — same "open, not archived" rule the
    // Registrations tab itself uses.
    let activeFormIds = new Set<string>();
    const formIds = [...new Set((regSubs ?? []).map((s) => s.form_id))];
    if (formIds.length) {
      const { data: forms } = await supabase.from('registration_forms').select('id,status,archived').in('id', formIds);
      activeFormIds = new Set((forms ?? []).filter((f) => f.status === 'open' && !f.archived).map((f) => f.id));
    }
    const activeRegByPlayer = new Map<string, number>();
    for (const s of regSubs ?? []) {
      if (!activeFormIds.has(s.form_id)) continue;
      activeRegByPlayer.set(s.roster_player_id, (activeRegByPlayer.get(s.roster_player_id) ?? 0) + 1);
    }

    setPlayers(rows.map((p) => {
      const teamAssignments = assignmentsByTeam.get(p.team_id) ?? new Set<string>();
      const signed = signedByPlayer.get(p.id) ?? new Set<string>();
      return {
        ...p,
        team_name: teamNameById.get(p.team_id) ?? 'Unknown team',
        owed: owedByPlayer.get(p.id) ?? 0,
        waiversTotal: teamAssignments.size,
        waiversSigned: [...teamAssignments].filter((wId) => signed.has(wId)).length,
        activeRegistrations: activeRegByPlayer.get(p.id) ?? 0,
      };
    }));

    // Quick attendance % per kid, same precedence as the player profile's
    // own Overview tab (coach-marked wins, RSVP fills in the rest).
    const attMap = new Map<string, number | null>();
    await Promise.all(rows.map(async (p) => {
      const [{ data: rsvps }, { data: att }] = await Promise.all([
        supabase.from('event_rsvps').select('event_id,status').eq('player_id', p.id),
        supabase.from('event_attendance').select('event_id,status').eq('player_id', p.id),
      ]);
      const markedIds = new Set((att ?? []).map((a) => a.event_id));
      let attended = 0, total = 0;
      for (const a of att ?? []) { total++; if (a.status === 'present' || a.status === 'late') attended++; }
      for (const r2 of rsvps ?? []) {
        if (markedIds.has(r2.event_id)) continue;
        total++; if (r2.status === 'attending') attended++;
      }
      attMap.set(p.id, total > 0 ? Math.round((attended / total) * 100) : null);
    }));
    setAttendanceByPlayer(attMap);
    setLoading(false);
  }, [profileId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: '24px', height: '24px', border: `2.5px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
  }

  if (!players.length) {
    return (
      <div style={{ padding: '32px' }}>
        <button onClick={() => router.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', fontFamily: 'inherit' }}>
          <ChevronLeft size={13} /> Back
        </button>
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontSize: '14px' }}>
          No players found for this guardian within your club.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '20px 32px' }}>
        <button onClick={() => router.back()} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '14px', fontFamily: 'inherit' }}>
          <ChevronLeft size={13} /> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', flexShrink: 0,
            background: `rgba(${r},${g},${b},0.12)`, border: `1.5px solid rgba(${r},${g},${b},0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '800', color: primary,
          }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontSize: '19px', fontWeight: '800', color: '#0F172A' }}>{guardians[0]?.full_name ?? 'Guardian'}&apos;s Family</div>
            <div style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '3px' }}>
              {players.length} player{players.length !== 1 ? 's' : ''} · {guardians.length} guardian{guardians.length !== 1 ? 's' : ''} on file
            </div>
          </div>
        </div>

        {/* Every guardian touching any of these kids — not just the one
            this page was reached from. */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
          {guardians.map((g2) => (
            <div key={g2.profile_id} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', minWidth: '220px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{g2.full_name ?? 'Unknown guardian'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                {g2.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#64748B' }}>
                    <Mail size={11} /> {g2.email}
                  </span>
                )}
                {g2.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#64748B' }}>
                    <Phone size={11} /> {g2.phone}
                  </span>
                )}
                {!g2.email && !g2.phone && (
                  <span style={{ fontSize: '12px', color: '#CBD5E1' }}>No contact info on file</span>
                )}
              </div>
              {g2.playerNames.length < players.length && (
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Linked to: {g2.playerNames.join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '28px 32px', maxWidth: '760px' }}>
        {outstandingTotal > 0 && (
          <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: '20px' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#D97706' }}>{formatCurrency(outstandingTotal, club?.currency ?? 'USD')}</div>
            <div style={{ fontSize: '12px', color: '#92400E', marginTop: '2px' }}>Outstanding across all {players.length} player{players.length !== 1 ? 's' : ''}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' }}>
          {players.map((p) => {
            const pos = positionStyle(p.position);
            const pct = attendanceByPlayer.get(p.id);
            const waiversComplete = p.waiversTotal > 0 && p.waiversSigned === p.waiversTotal;
            return (
              <div key={p.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <Link href={`/dashboard/players/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, overflow: 'hidden', background: `rgba(${r},${g},${b},0.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: primary }}>
                      {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(p.full_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {p.jersey_number != null && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: '700', color: primary }}>
                            <Hash size={9} strokeWidth={3} />{p.jersey_number}
                          </span>
                        )}
                        {p.position && <span style={{ fontSize: '10.5px', fontWeight: '700', color: pos.color, background: pos.bg, borderRadius: '20px', padding: '2px 7px' }}>{p.position}</span>}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '3px' }}>
                        {p.team_name}{pct != null ? ` · ${pct}% attendance` : ''}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* At-a-glance status — fees, waivers, active registrations,
                    so a DOC doesn't have to open each kid's profile just to
                    check these. */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '0 16px 14px' }}>
                  {p.owed > 0 ? (
                    <Badge icon={<DollarSign size={10} />} color="#D97706" bg="#FFFBEB" label={formatCurrency(p.owed, club?.currency ?? 'USD')} />
                  ) : (
                    <Badge icon={<DollarSign size={10} />} color="#16A34A" bg="#F0FDF4" label="Paid up" />
                  )}
                  {p.waiversTotal > 0 && (
                    <Badge icon={<FileCheck size={10} />} color={waiversComplete ? '#16A34A' : '#D97706'} bg={waiversComplete ? '#F0FDF4' : '#FFFBEB'}
                      label={`${p.waiversSigned}/${p.waiversTotal} waivers`} />
                  )}
                  {p.activeRegistrations > 0 && (
                    <Badge icon={<ClipboardList size={10} />} color="#2563EB" bg="#EFF6FF" label={`${p.activeRegistrations} active reg.`} />
                  )}
                </div>

                {/* Quick jump — straight to the tab a DOC actually wants,
                    skipping the Overview click-through. */}
                <div style={{ display: 'flex', borderTop: '1px solid #F1F5F9' }}>
                  <QuickLink href={`/dashboard/players/${p.id}/financials`} icon={<DollarSign size={12} />} label="Fees" />
                  <QuickLink href={`/dashboard/players/${p.id}/documents`} icon={<FileText size={12} />} label="Docs" />
                  <QuickLink href={`/dashboard/players/${p.id}/registrations`} icon={<ClipboardList size={12} />} label="Reg." last />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Badge({ icon, color, bg, label }: { icon: React.ReactNode; color: string; bg: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '700', color, background: bg, borderRadius: '20px', padding: '3px 8px' }}>
      {icon}{label}
    </span>
  );
}

function QuickLink({ href, icon, label, last }: { href: string; icon: React.ReactNode; label: string; last?: boolean }) {
  return (
    <Link href={href} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
      padding: '9px 6px', fontSize: '11.5px', fontWeight: '700', color: '#64748B', textDecoration: 'none',
      borderRight: last ? 'none' : '1px solid #F1F5F9',
    }}>
      {icon}{label}
    </Link>
  );
}
