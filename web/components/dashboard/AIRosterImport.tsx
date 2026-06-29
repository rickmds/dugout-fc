'use client';

import { useRef, useState } from 'react';
import { X, Upload, AlertTriangle, CheckSquare, Square, ChevronDown, ChevronRight, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from './DashboardContext';
import type { Team } from './DashboardContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'review' | 'importing' | 'done';
type ImportMode = 'single' | 'club';

type ReviewPlayer = {
  _id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  parent_email: string | null;
  uncertain: boolean;
  uncertaintyReason: string | null;
  duplicate: boolean;
  selected: boolean;
  // assigned team
  teamId: string;
  teamName: string;
};

type ReviewCoach = {
  full_name: string;
  email: string | null;
  role: string;
  uncertain: boolean;
};

type ReviewTeam = {
  parsedName: string;
  matchedTeam: Team | null;
  age_group: string | null;
  season: string | null;
  coaches: ReviewCoach[];
  players: ReviewPlayer[];
  isNew: boolean;
};

type DoneStats = { players: number; teams: number; invites: number };

const PROCESSING_STEPS = [
  'Reading your file…',
  'Mapping player columns…',
  'Identifying teams…',
  'Normalising positions…',
  'Checking parent contacts…',
  'Almost done…',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function uid() { return Math.random().toString(36).slice(2); }

function matchTeam(name: string, teams: Team[]): Team | null {
  const n = name.toLowerCase().trim();
  return teams.find((t) => t.name.toLowerCase().trim() === n)
    ?? teams.find((t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()))
    ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIRosterImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [phase, setPhase]         = useState<Phase>('idle');
  const [mode, setMode]           = useState<ImportMode>(profile?.role === 'org_admin' && teams.length > 1 ? 'club' : 'single');
  const [teamId, setTeamId]       = useState(teams[0]?.id ?? '');
  const [players, setPlayers]     = useState<ReviewPlayer[]>([]);
  const [reviewTeams, setReviewTeams] = useState<ReviewTeam[]>([]);
  const [warnings, setWarnings]   = useState<string[]>([]);
  const [procStep, setProcStep]   = useState(0);
  const [doneStats, setDoneStats] = useState<DoneStats | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [warningsOpen, setWarningsOpen]   = useState(false);
  const fileRef  = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOrgAdmin = profile?.role === 'org_admin';

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    startProcessing();
    try {
      const base64    = await fileToBase64(file);
      const file_type = file.type || 'text/plain';
      if (mode === 'club') await runClubImport(base64, file_type);
      else                 await runSingleImport(base64, file_type);
    } catch (e) {
      stopProcessing();
      alert(`Could not read file: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setPhase('idle');
    }
  }

  async function runSingleImport(base64: string, file_type: string) {
    const team = teams.find((t) => t.id === teamId);

    const [parseRes, existingRes] = await Promise.all([
      supabase.functions.invoke('import-roster', { body: { file_base64: base64, file_type } }),
      supabase.from('players').select('full_name').eq('team_id', teamId),
    ]);
    stopProcessing();

    if (parseRes.error || !parseRes.data?.players) {
      alert(parseRes.data?.error ?? parseRes.error?.message ?? 'Failed to parse roster.');
      setPhase('idle'); return;
    }
    if (!parseRes.data.players.length) {
      alert('No players found in this file.'); setPhase('idle'); return;
    }

    const existingNames = new Set(
      ((existingRes.data ?? []) as any[]).map((r) => (r.full_name as string).toLowerCase().trim())
    );

    setPlayers(parseRes.data.players.map((p: any) => {
      const dup = existingNames.has((p.full_name ?? '').toLowerCase().trim());
      return {
        _id: uid(), full_name: p.full_name, jersey_number: p.jersey_number ?? null,
        position: p.position ?? null, parent_email: p.parent_email ?? null,
        uncertain: !!p.uncertain, uncertaintyReason: p.uncertainty_reason ?? null,
        duplicate: dup, selected: !p.uncertain && !dup,
        teamId, teamName: team?.name ?? '',
      };
    }));
    setWarnings(parseRes.data.warnings ?? []);
    setPhase('review');
  }

  async function runClubImport(base64: string, file_type: string) {
    const existingTeamNames = teams.map((t) => t.name);

    const [parseRes, existingPlayersRes] = await Promise.all([
      supabase.functions.invoke('import-club', {
        body: { file_base64: base64, file_type, existing_teams: existingTeamNames },
      }),
      supabase.from('players').select('full_name, team_id').in('team_id', teams.map((t) => t.id)),
    ]);
    stopProcessing();

    if (parseRes.error || !parseRes.data?.teams) {
      alert(parseRes.data?.error ?? parseRes.error?.message ?? 'Failed to parse file.');
      setPhase('idle'); return;
    }
    if (!parseRes.data.teams.length) {
      alert('No teams or players found in this file.'); setPhase('idle'); return;
    }

    // Build existing name set per team
    const existingByTeam: Record<string, Set<string>> = {};
    for (const t of teams) existingByTeam[t.id] = new Set();
    for (const r of (existingPlayersRes.data ?? []) as any[]) {
      existingByTeam[r.team_id]?.add((r.full_name as string).toLowerCase().trim());
    }

    const rTeams: ReviewTeam[] = parseRes.data.teams.map((t: any) => {
      const matched = matchTeam(t.name, teams);
      const existingNames = matched ? (existingByTeam[matched.id] ?? new Set()) : new Set<string>();
      const assignedTeamId = matched?.id ?? '';
      const assignedTeamName = matched?.name ?? t.name;

      const rPlayers: ReviewPlayer[] = (t.players ?? []).map((p: any) => {
        const dup = !!matched && existingNames.has((p.full_name ?? '').toLowerCase().trim());
        return {
          _id: uid(), full_name: p.full_name, jersey_number: p.jersey_number ?? null,
          position: p.position ?? null, parent_email: p.parent_email ?? null,
          uncertain: !!p.uncertain, uncertaintyReason: p.uncertainty_reason ?? null,
          duplicate: dup, selected: !p.uncertain && !dup,
          teamId: assignedTeamId, teamName: assignedTeamName,
        };
      });

      return {
        parsedName: t.name,
        matchedTeam: matched,
        age_group: t.age_group ?? null,
        season: t.season ?? null,
        coaches: t.coaches ?? [],
        players: rPlayers,
        isNew: !matched,
      };
    });

    setReviewTeams(rTeams);
    setWarnings(parseRes.data.warnings ?? []);
    // Default expand all teams
    setExpandedTeams(new Set(rTeams.map((t) => t.parsedName)));
    setPhase('review');
  }

  function startProcessing() {
    setPhase('processing');
    setProcStep(0);
    timerRef.current = setInterval(() => setProcStep((i) => (i + 1) % PROCESSING_STEPS.length), 1600);
  }

  function stopProcessing() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    setPhase('importing');
    const stats: DoneStats = { players: 0, teams: 0, invites: 0 };

    if (mode === 'single') {
      const toImport = players.filter((p) => p.selected);
      for (const p of toImport) {
        const { data: pd } = await supabase.from('players').insert({
          team_id: p.teamId, full_name: p.full_name,
          jersey_number: p.jersey_number, position: p.position,
        }).select('id').single();
        if (!pd) continue;
        stats.players++;
        if (p.parent_email?.trim()) {
          await supabase.from('invites').insert({
            team_id: p.teamId, player_id: (pd as any).id,
            email: p.parent_email.trim(), created_by: profile?.id,
          });
          stats.invites++;
        }
      }
    } else {
      for (const rt of reviewTeams) {
        const toImport = rt.players.filter((p) => p.selected);
        if (!toImport.length) continue;

        let resolvedTeamId = rt.matchedTeam?.id ?? null;

        // Create the team if it's new and user selected any of its players
        if (!resolvedTeamId && profile?.club_id) {
          const { data: newTeam } = await supabase.from('teams').insert({
            club_id: profile.club_id,
            name: rt.parsedName,
            age_group: rt.age_group,
            season: rt.season,
          }).select('id').single();
          resolvedTeamId = (newTeam as any)?.id ?? null;
          if (resolvedTeamId) stats.teams++;
        }

        if (!resolvedTeamId) continue;

        for (const p of toImport) {
          const { data: pd } = await supabase.from('players').insert({
            team_id: resolvedTeamId, full_name: p.full_name,
            jersey_number: p.jersey_number, position: p.position,
          }).select('id').single();
          if (!pd) continue;
          stats.players++;
          if (p.parent_email?.trim()) {
            await supabase.from('invites').insert({
              team_id: resolvedTeamId, player_id: (pd as any).id,
              email: p.parent_email.trim(), created_by: profile?.id,
            });
            stats.invites++;
          }
        }
      }
    }

    setDoneStats(stats);
    setPhase('done');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function togglePlayer(id: string) {
    if (mode === 'single') {
      setPlayers((prev) => prev.map((p) => p._id === id ? { ...p, selected: !p.selected } : p));
    } else {
      setReviewTeams((prev) => prev.map((rt) => ({
        ...rt, players: rt.players.map((p) => p._id === id ? { ...p, selected: !p.selected } : p),
      })));
    }
  }

  function toggleTeamExpand(name: string) {
    setExpandedTeams((p) => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  function selectAllInTeam(parsedName: string, val: boolean) {
    setReviewTeams((prev) => prev.map((rt) =>
      rt.parsedName === parsedName ? { ...rt, players: rt.players.map((p) => ({ ...p, selected: val })) } : rt
    ));
  }

  const allPlayers     = mode === 'single' ? players : reviewTeams.flatMap((t) => t.players);
  const selectedCount  = allPlayers.filter((p) => p.selected).length;
  const inviteCount    = allPlayers.filter((p) => p.selected && p.parent_email).length;
  const dupCount       = allPlayers.filter((p) => p.duplicate).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={phase === 'processing' || phase === 'importing' ? undefined : onClose}>
      <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: 0 }}>AI Roster Import</h2>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '2px 0 0' }}>Upload any spreadsheet — AI maps the columns automatically</p>
          </div>
          {phase !== 'processing' && phase !== 'importing' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '6px' }}>
              <X size={18} color="#64748B" />
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Mode picker */}
              {isOrgAdmin && teams.length > 1 && (
                <div>
                  <label style={labelSt}>Import type</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {([['single', 'One team'], ['club', 'Whole club (all teams)']] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setMode(val)} style={{
                        flex: 1, padding: '10px 14px', borderRadius: '10px',
                        border: `2px solid ${mode === val ? primary : '#E2E8F0'}`,
                        background: mode === val ? `${primary}10` : '#fff',
                        color: mode === val ? primary : '#64748B',
                        fontWeight: mode === val ? '700' : '500', fontSize: '13px',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
                      }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {mode === 'club' && (
                    <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                      Upload a single spreadsheet with all your teams. AI identifies each team, maps players, and creates new teams if needed.
                    </p>
                  )}
                </div>
              )}

              {/* Team selector — single mode with multiple teams */}
              {mode === 'single' && teams.length > 1 && (
                <div>
                  <label style={labelSt}>Team</label>
                  <div style={{ position: 'relative' }}>
                    <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ ...inputSt, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? primary : '#CBD5E1'}`,
                  borderRadius: '14px', padding: '48px 24px', textAlign: 'center',
                  cursor: 'pointer', background: dragOver ? `${primary}06` : '#FAFAFA',
                  transition: 'all 0.15s',
                }}
              >
                <Upload size={32} color={dragOver ? primary : '#CBD5E1'} style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                  Drop your roster here
                </div>
                <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
                  CSV, Excel, Google Sheets export, or PDF · Any column format
                </div>
                <span style={{ display: 'inline-block', background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '9px 20px', borderRadius: '8px' }}>
                  Browse files
                </span>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
            </div>
          )}

          {/* ── PROCESSING ── */}
          {phase === 'processing' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: '52px', height: '52px', border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Analysing your roster…</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>{PROCESSING_STEPS[procStep]}</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── REVIEW ── */}
          {phase === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Summary */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>{allPlayers.length} players found</span>
                  <span style={{ fontSize: '13px', color: '#64748B', marginLeft: '10px' }}>
                    {selectedCount} selected · {inviteCount} invite{inviteCount !== 1 ? 's' : ''} will be sent
                  </span>
                </div>
                {dupCount > 0 && (
                  <span style={{ fontSize: '12px', color: '#60A5FA', background: 'rgba(96,165,250,0.1)', borderRadius: '20px', padding: '3px 10px' }}>
                    {dupCount} already on roster
                  </span>
                )}
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <button onClick={() => setWarningsOpen((o) => !o)} style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} color="#F59E0B" />
                    <span style={{ fontSize: '13px', color: '#B45309', fontWeight: '600', flex: 1 }}>{warnings.length} AI note{warnings.length !== 1 ? 's' : ''}</span>
                    {warningsOpen ? <ChevronDown size={13} color="#B45309" /> : <ChevronRight size={13} color="#B45309" />}
                  </div>
                  {warningsOpen && (
                    <ul style={{ margin: '8px 0 0 22px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {warnings.map((w, i) => <li key={i} style={{ fontSize: '12px', color: '#92400E' }}>{w}</li>)}
                    </ul>
                  )}
                </button>
              )}

              {/* ── SINGLE: flat list ── */}
              {mode === 'single' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {players.map((p) => <PlayerRow key={p._id} player={p} primary={primary} onToggle={() => togglePlayer(p._id)} />)}
                </div>
              )}

              {/* ── CLUB: grouped by team ── */}
              {mode === 'club' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {reviewTeams.map((rt) => {
                    const isOpen   = expandedTeams.has(rt.parsedName);
                    const selCount = rt.players.filter((p) => p.selected).length;
                    const allSel   = selCount === rt.players.length;
                    return (
                      <div key={rt.parsedName} style={{ border: `1px solid ${rt.isNew ? 'rgba(139,92,246,0.3)' : '#E2E8F0'}`, borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: rt.isNew ? 'rgba(139,92,246,0.05)' : '#F8FAFC' }}>
                          <button onClick={() => toggleTeamExpand(rt.parsedName)} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                            {isOpen ? <ChevronDown size={14} color="#64748B" /> : <ChevronRight size={14} color="#64748B" />}
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{rt.parsedName}</span>
                            {rt.age_group && <span style={{ fontSize: '11px', color: '#94A3B8' }}>{rt.age_group}</span>}
                          </button>
                          {rt.isNew
                            ? <span style={{ fontSize: '11px', color: '#8B5CF6', background: 'rgba(139,92,246,0.1)', borderRadius: '20px', padding: '2px 8px', fontWeight: '600', flexShrink: 0 }}>New team</span>
                            : <span style={{ fontSize: '11px', color: '#22C55E', background: '#F0FDF4', borderRadius: '20px', padding: '2px 8px', fontWeight: '600', flexShrink: 0 }}>✓ Matched</span>
                          }
                          <span style={{ fontSize: '12px', color: '#64748B', flexShrink: 0 }}>{selCount}/{rt.players.length}</span>
                          <button onClick={() => selectAllInTeam(rt.parsedName, !allSel)} style={{ fontSize: '11px', color: primary, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit', fontWeight: '600', flexShrink: 0 }}>
                            {allSel ? 'None' : 'All'}
                          </button>
                        </div>

                        {isOpen && (
                          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #F1F5F9' }}>
                            {/* Coaches — read only, shown as info */}
                            {rt.coaches.length > 0 && (
                              <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '8px 12px', marginBottom: '4px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Staff found (not imported)</div>
                                {rt.coaches.map((c, i) => (
                                  <div key={i} style={{ fontSize: '12px', color: '#64748B', marginBottom: '2px' }}>
                                    {c.full_name} · {c.role}{c.email ? ` · ${c.email}` : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                            {rt.players.map((p) => <PlayerRow key={p._id} player={p} primary={primary} onToggle={() => togglePlayer(p._id)} />)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── IMPORTING ── */}
          {phase === 'importing' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: '52px', height: '52px', border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Importing players…</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Adding to your roster and queuing invites</div>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && doneStats && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#0F172A', marginBottom: '16px' }}>Import complete</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px', margin: '0 auto 28px', textAlign: 'left' }}>
                <StatLine color="#22C55E" label={`${doneStats.players} player${doneStats.players !== 1 ? 's' : ''} added to roster`} />
                {doneStats.teams > 0 && <StatLine color="#8B5CF6" label={`${doneStats.teams} new team${doneStats.teams !== 1 ? 's' : ''} created`} />}
                {doneStats.invites > 0 && <StatLine color="#60A5FA" label={`${doneStats.invites} parent invite${doneStats.invites !== 1 ? 's' : ''} queued`} />}
              </div>
              <button onClick={() => { onDone(); onClose(); }} style={{ background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '12px 28px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
                View Roster
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'review' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
            <button onClick={() => { setPlayers([]); setReviewTeams([]); setWarnings([]); setPhase('idle'); }} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Try another file
            </button>
            <button onClick={handleImport} disabled={selectedCount === 0} style={{ flex: 2, padding: '11px', background: selectedCount > 0 ? primary : '#CBD5E1', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              Import {selectedCount} player{selectedCount !== 1 ? 's' : ''}
              {inviteCount > 0 ? ` · Send ${inviteCount} invite${inviteCount !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerRow({ player: p, primary, onToggle }: { player: ReviewPlayer; primary: string; onToggle: () => void }) {
  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
      borderRadius: '8px', cursor: 'pointer',
      border: `1px solid ${p.uncertain ? 'rgba(245,158,11,0.35)' : p.duplicate ? 'rgba(96,165,250,0.25)' : '#E2E8F0'}`,
      background: p.duplicate && !p.selected ? 'rgba(96,165,250,0.04)' : p.uncertain ? 'rgba(245,158,11,0.04)' : p.selected ? `${primary}08` : '#fff',
      opacity: p.duplicate && !p.selected ? 0.65 : 1,
      transition: 'background 0.1s',
    }}>
      <div style={{ paddingTop: '2px', flexShrink: 0 }}>
        {p.selected ? <CheckSquare size={16} color={primary} /> : <Square size={16} color="#CBD5E1" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
          {p.jersey_number != null && (
            <span style={{ fontSize: '12px', fontWeight: '800', color: primary, background: `${primary}15`, borderRadius: '5px', padding: '1px 6px', flexShrink: 0 }}>
              #{p.jersey_number}
            </span>
          )}
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{p.full_name}</span>
          {p.position && <span style={{ fontSize: '11px', color: '#64748B' }}>{p.position}</span>}
          {p.duplicate && (
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#60A5FA', background: 'rgba(96,165,250,0.12)', borderRadius: '5px', padding: '1px 6px' }}>
              Already on roster
            </span>
          )}
          {p.uncertain && (
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#F59E0B', background: 'rgba(245,158,11,0.12)', borderRadius: '5px', padding: '1px 6px' }}>?</span>
          )}
        </div>
        {p.parent_email ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Mail size={11} color="#60A5FA" />
            <span style={{ fontSize: '12px', color: '#60A5FA' }}>{p.parent_email}</span>
          </div>
        ) : (
          <span style={{ fontSize: '11px', color: '#CBD5E1', fontStyle: 'italic' }}>No parent email</span>
        )}
        {p.uncertain && p.uncertaintyReason && (
          <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={10} /> {p.uncertaintyReason}
          </div>
        )}
      </div>
    </div>
  );
}

function StatLine({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '14px', color: '#374151' }}>{label}</span>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};

const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
