'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Check, FileText, AlertTriangle, ChevronDown, Send, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Waiver = {
  id: string;
  title: string;
  body: string;
  required_by: string | null;
  created_at: string;
  team_names: string[];
  total_players: number;
  signed_count: number;
};

type Signature = {
  id: string;
  player_id: string;
  player_name: string;
  team_name: string;
  signed_by_name: string;
  signed_at: string;
};

type UnsignedPlayer = {
  id: string;
  full_name: string;
  team_name: string;
  parent_email: string | null;
};

export default function WaiversPage() {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [waivers, setWaivers]       = useState<Waiver[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeWaiver, setActiveWaiver] = useState<Waiver | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [unsigned, setUnsigned]     = useState<UnsignedPlayer[]>([]);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigSearch, setSigSearch]   = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [title, setTitle]           = useState('');
  const [body, setBody]             = useState('');
  const [requiredBy, setRequiredBy] = useState('');
  const [assignedTeams, setAssignedTeams] = useState<string[]>(() => teams.map((t) => t.id));
  const [saving, setSaving]         = useState(false);
  const [createError, setCreateError] = useState('');

  const loadWaivers = useCallback(async () => {
    if (!club?.id) return;
    setLoading(true);

    const { data: waiverData } = await supabase
      .from('waivers')
      .select('id, title, body, required_by, created_at, waiver_assignments(team_id)')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false });

    if (!waiverData?.length) { setWaivers([]); setLoading(false); return; }

    const waiverIds = waiverData.map((w) => w.id);
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

    // Get all player counts and signature counts
    const [playerRes, sigRes] = await Promise.all([
      supabase.from('players').select('id, team_id').in('team_id', teams.map((t) => t.id)),
      supabase.from('waiver_signatures').select('waiver_id, player_id').in('waiver_id', waiverIds),
    ]);

    const playersByTeam: Record<string, string[]> = {};
    for (const p of playerRes.data ?? []) {
      (playersByTeam[p.team_id] ??= []).push(p.id);
    }

    const sigsByWaiver: Record<string, Set<string>> = {};
    for (const s of sigRes.data ?? []) {
      (sigsByWaiver[s.waiver_id] ??= new Set()).add(s.player_id);
    }

    const enriched: Waiver[] = waiverData.map((w) => {
      const assignedTeamIds = (w.waiver_assignments as { team_id: string }[]).map((a) => a.team_id);
      const teamNames = assignedTeamIds.map((id) => teamMap[id] ?? '—');
      const totalPlayers = assignedTeamIds.reduce((s, tid) => s + (playersByTeam[tid]?.length ?? 0), 0);
      const signedCount = sigsByWaiver[w.id]?.size ?? 0;
      return { ...w, team_names: teamNames, total_players: totalPlayers, signed_count: signedCount };
    });

    setWaivers(enriched);
    setLoading(false);
  }, [club?.id, teams]);

  useEffect(() => { loadWaivers(); }, [loadWaivers]);

  useEffect(() => {
    if (!activeWaiver) return;
    (async () => {
      setSigLoading(true);
      const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

      // Get assigned team ids for this waiver
      const { data: assignments } = await supabase
        .from('waiver_assignments')
        .select('team_id')
        .eq('waiver_id', activeWaiver.id);

      const assignedTeamIds = (assignments ?? []).map((a) => a.team_id);

      const [sigRes, playerRes, inviteRes] = await Promise.all([
        supabase.from('waiver_signatures').select('id, player_id, signed_by_name, signed_at').eq('waiver_id', activeWaiver.id),
        supabase.from('players').select('id, full_name, team_id').in('team_id', assignedTeamIds),
        supabase.from('invites').select('player_id, email').in('team_id', assignedTeamIds),
      ]);

      const signedIds = new Set((sigRes.data ?? []).map((s) => s.player_id));
      const sigMap = Object.fromEntries((sigRes.data ?? []).map((s) => [s.player_id, s]));
      const inviteMap: Record<string, string> = {};
      for (const inv of inviteRes.data ?? []) {
        if (inv.player_id) inviteMap[inv.player_id] = inv.email;
      }

      const sigs: Signature[] = (playerRes.data ?? [])
        .filter((p) => signedIds.has(p.id))
        .map((p) => ({
          id: sigMap[p.id].id,
          player_id: p.id,
          player_name: p.full_name,
          team_name: teamMap[p.team_id] ?? '—',
          signed_by_name: sigMap[p.id].signed_by_name,
          signed_at: sigMap[p.id].signed_at,
        }));

      const unsignedList: UnsignedPlayer[] = (playerRes.data ?? [])
        .filter((p) => !signedIds.has(p.id))
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          team_name: teamMap[p.team_id] ?? '—',
          parent_email: inviteMap[p.id] ?? null,
        }));

      setSignatures(sigs);
      setUnsigned(unsignedList);
      setSigLoading(false);
    })();
  }, [activeWaiver, teams]);

  async function handleCreate() {
    if (!title.trim() || !body.trim() || !assignedTeams.length || !club?.id) return;
    setSaving(true);
    setCreateError('');

    const { data: w, error } = await supabase
      .from('waivers')
      .insert({ club_id: club.id, title: title.trim(), body: body.trim(), required_by: requiredBy || null, created_by: profile?.id })
      .select('id')
      .single();

    if (error || !w) { setCreateError('Failed to create waiver. Try again.'); setSaving(false); return; }

    await supabase.from('waiver_assignments').insert(
      assignedTeams.map((tid) => ({ waiver_id: w.id, team_id: tid }))
    );

    setSaving(false);
    setShowCreate(false);
    setTitle(''); setBody(''); setRequiredBy(''); setAssignedTeams(teams.map((t) => t.id));
    loadWaivers();
  }

  async function sendReminder(player: UnsignedPlayer) {
    if (!player.parent_email || !activeWaiver) return;
    await supabase.functions.invoke('send-waiver-reminder', {
      body: {
        to_email: player.parent_email,
        player_name: player.full_name,
        waiver_title: activeWaiver.title,
        club_name: club?.name ?? '',
        portal_url: `${window.location.origin}/portal`,
      },
    });
    alert(`Reminder sent to ${player.parent_email}`);
  }

  const filteredSigs    = signatures.filter((s) => !sigSearch || s.player_name.toLowerCase().includes(sigSearch.toLowerCase()));
  const filteredUnsigned = unsigned.filter((u) => !sigSearch || u.full_name.toLowerCase().includes(sigSearch.toLowerCase()));

  const pct = activeWaiver && activeWaiver.total_players > 0
    ? Math.round((activeWaiver.signed_count / activeWaiver.total_players) * 100)
    : 0;

  const thSt: React.CSSProperties = { padding: '9px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' };
  const tdSt: React.CSSProperties = { padding: '11px 14px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #F8FAFC' };

  return (
    <div style={{ padding: '32px 36px', maxWidth: '1100px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Waivers</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Consent forms and documents — track who has and hasn't signed</p>
        </div>
        {profile?.role === 'org_admin' && (
          <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={16} /> New Waiver
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* Waiver list */}
        <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ height: '13px', borderRadius: '5px', width: '75%', marginBottom: '12px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                  <div style={{ height: '5px', borderRadius: '3px', marginBottom: '8px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                  <div style={{ height: '11px', borderRadius: '5px', width: '55%', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
          ) : waivers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <FileText size={24} color="#CBD5E1" />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '5px' }}>No waivers yet</div>
              <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '1.6', marginBottom: '16px' }}>Create consent forms for liability, photos, or medical info</div>
              {profile?.role === 'org_admin' && (
                <button onClick={() => setShowCreate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '9px 18px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={14} /> Create First Waiver
                </button>
              )}
            </div>
          ) : waivers.map((w) => {
            const wpct = w.total_players > 0 ? Math.round((w.signed_count / w.total_players) * 100) : 0;
            const isSelected = activeWaiver?.id === w.id;
            const overdue = w.required_by && new Date(w.required_by) < new Date() && wpct < 100;
            return (
              <button key={w.id} onClick={() => setActiveWaiver(w)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: isSelected ? `${primary}08` : '#fff', border: `1.5px solid ${isSelected ? primary : '#E2E8F0'}`, borderRadius: '14px', padding: '16px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: isSelected ? `0 2px 12px ${primary}20` : '0 1px 4px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s, border-color 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', lineHeight: 1.3 }}>{w.title}</div>
                  {overdue && <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />}
                </div>
                {/* Progress bar */}
                <div style={{ height: '5px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{ height: '100%', width: `${wpct}%`, background: wpct === 100 ? '#22C55E' : wpct >= 60 ? primary : '#F59E0B', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  {w.signed_count}/{w.total_players} signed ({wpct}%)
                  {w.required_by && <span style={{ color: overdue ? '#D97706' : '#94A3B8' }}> · Due {new Date(w.required_by).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                </div>
                {w.team_names.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>{w.team_names.slice(0, 2).join(', ')}{w.team_names.length > 2 ? ` +${w.team_names.length - 2}` : ''}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        {activeWaiver && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              {/* Panel header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>{activeWaiver.title}</h2>
                  {/* Progress */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', maxWidth: '240px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22C55E' : pct >= 60 ? primary : '#F59E0B', borderRadius: '4px', transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{activeWaiver.signed_count}/{activeWaiver.total_players} signed</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: pct === 100 ? '#16A34A' : '#D97706', background: pct === 100 ? '#F0FDF4' : '#FFFBEB', borderRadius: '20px', padding: '2px 9px' }}>{pct}%</span>
                  </div>
                </div>
                <button onClick={() => setActiveWaiver(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                  <X size={16} color="#94A3B8" />
                </button>
              </div>

              {/* Waiver body */}
              <div style={{ padding: '16px 24px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Document</div>
                <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{activeWaiver.body}</div>
              </div>

              {/* Search */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={13} color="#94A3B8" />
                <input value={sigSearch} onChange={(e) => setSigSearch(e.target.value)} placeholder="Search players…" style={{ border: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', flex: 1, fontFamily: 'inherit', background: 'none' }} />
              </div>

              {sigLoading ? (
                <div style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ width: '24px', height: '24px', border: `2.5px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>Loading signatures…</div>
                </div>
              ) : (
                <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                  {/* Unsigned */}
                  {filteredUnsigned.length > 0 && (
                    <>
                      <div style={{ padding: '8px 20px 4px', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#FAFAFA', borderTop: '1px solid #F1F5F9' }}>
                        Not signed · {filteredUnsigned.length}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {filteredUnsigned.map((u) => (
                            <tr key={u.id}>
                              <td style={tdSt}>
                                <div style={{ fontWeight: '600', color: '#0F172A' }}>{u.full_name}</div>
                                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{u.team_name}</div>
                              </td>
                              <td style={{ ...tdSt, color: '#94A3B8', fontSize: '12px' }}>{u.parent_email ?? 'No email on file'}</td>
                              <td style={{ ...tdSt, textAlign: 'right' }}>
                                {u.parent_email && (
                                  <button
                                    onClick={() => sendReminder(u)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = `${primary}10`; b.style.borderColor = `${primary}40`; b.style.color = primary; }}
                                    onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#F8FAFC'; b.style.borderColor = '#E2E8F0'; b.style.color = '#64748B'; }}
                                  >
                                    <Send size={11} /> Remind
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {/* Signed */}
                  {filteredSigs.length > 0 && (
                    <>
                      <div style={{ padding: '8px 20px 4px', fontSize: '10px', fontWeight: '700', color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#F0FDF4', borderTop: '1px solid #DCFCE7' }}>
                        Signed · {filteredSigs.length}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#FAFFFE' }}>
                            <th style={thSt}>Player</th>
                            <th style={thSt}>Signed by</th>
                            <th style={thSt}>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSigs.map((s) => (
                            <tr key={s.id}>
                              <td style={tdSt}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Check size={12} color="#16A34A" strokeWidth={3} />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: '600', color: '#0F172A' }}>{s.player_name}</div>
                                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{s.team_name}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ ...tdSt, color: '#64748B' }}>{s.signed_by_name}</td>
                              <td style={{ ...tdSt, color: '#94A3B8', fontSize: '12px' }}>
                                {new Date(s.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }} onClick={() => setShowCreate(false)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '540px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>New Waiver / Consent Form</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', overflowY: 'auto' }}>
              <div>
                <label style={labelSt}>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Medical Consent Form 2026/27" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Document body</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter the full text of the waiver or consent form…"
                  rows={8} style={{ ...inputSt, resize: 'vertical', lineHeight: '1.7' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelSt}>Required by (optional)</label>
                  <input type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} style={inputSt} />
                </div>
              </div>
              {/* Team assignment */}
              <div>
                <label style={labelSt}>Assign to teams</label>
                <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', maxHeight: '180px', overflowY: 'auto' }}>
                  {teams.map((t) => {
                    const sel = assignedTeams.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => setAssignedTeams((p) => sel ? p.filter((id) => id !== t.id) : [...p, t.id])}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: sel ? `${primary}07` : 'none', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${sel ? primary : '#D1D5DB'}`, background: sel ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <Check size={11} color="#fff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: '13px', color: '#374151', fontWeight: sel ? '600' : '400' }}>{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {createError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#DC2626' }}>{createError}</div>}
            </div>
            <div style={{ padding: '0 24px 24px', display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !title.trim() || !body.trim() || !assignedTeams.length}
                style={{ flex: 2, padding: '11px', background: saving || !title.trim() || !body.trim() ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Creating…' : 'Create Waiver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelSt: React.CSSProperties = { fontSize: '10px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };
const inputSt: React.CSSProperties = { width: '100%', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
