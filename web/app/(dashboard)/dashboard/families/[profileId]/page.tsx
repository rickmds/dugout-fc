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
type Guardian = { full_name: string | null; email: string | null; phone: string | null };

export default function FamilyPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const router = useRouter();
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const { r, g, b } = hex2rgb(primary);

  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [players, setPlayers] = useState<FamilyPlayer[]>([]);
  const [attendanceByPlayer, setAttendanceByPlayer] = useState<Map<string, number | null>>(new Map());
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    const [{ data: profileRow }, { data: playerRows }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', profileId).maybeSingle(),
      supabase.rpc('get_players_for_guardian', { p_profile_id: profileId }),
    ]);

    const rows = (playerRows ?? []) as { id: string; full_name: string; jersey_number: number | null; position: string | null; photo_url: string | null; team_id: string }[];
    if (!rows.length) { setLoading(false); return; }

    const playerIds = rows.map((p) => p.id);
    const teamIds = [...new Set(rows.map((p) => p.team_id))];
    const [{ data: teams }, { data: invite }, { data: fees }, { data: waiverAssignments }, { data: waiverSignatures }, { data: regSubs }] = await Promise.all([
      supabase.from('teams').select('id,name').in('id', teamIds),
      // Any one accepted invite for this guardian gives us a real contact
      // email/phone — invites are per-child, but the same guardian's
      // contact info is the same across all of them.
      supabase.from('invites').select('email,phone').eq('accepted_by', profileId).limit(1).maybeSingle(),
      supabase.from('player_fees').select('player_id,amount_due,amount_paid,discount,status').in('player_id', playerIds),
      supabase.from('waiver_assignments').select('waiver_id,team_id').in('team_id', teamIds),
      supabase.from('waiver_signatures').select('waiver_id,player_id').in('player_id', playerIds),
      supabase.from('registration_submissions').select('roster_player_id,form_id').in('roster_player_id', playerIds),
    ]);
    const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

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

    setGuardian({ full_name: profileRow?.full_name ?? null, email: invite?.email ?? null, phone: invite?.phone ?? null });
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
            <div style={{ fontSize: '19px', fontWeight: '800', color: '#0F172A' }}>{guardian?.full_name ?? 'Guardian'}&apos;s Family</div>
            <div style={{ display: 'flex', gap: '14px', marginTop: '4px', flexWrap: 'wrap' }}>
              {guardian?.email && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#64748B' }}>
                  <Mail size={12} /> {guardian.email}
                </span>
              )}
              {guardian?.phone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#64748B' }}>
                  <Phone size={12} /> {guardian.phone}
                </span>
              )}
            </div>
          </div>
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
