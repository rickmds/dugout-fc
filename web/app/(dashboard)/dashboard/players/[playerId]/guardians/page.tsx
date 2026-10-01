'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Mail, Send, AlertCircle, Clock, Check, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Invite = {
  id: string; token: string; email: string;
  guardian_name: string | null; phone: string | null;
  relationship: string | null; accepted_at: string | null; accepted_by: string | null;
  created_at: string;
};
type EmergencyContact = { id: string; name: string; phone: string | null; relationship: string | null };

const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '5px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const card: React.CSSProperties = { background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '16px' };
const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' };

export default function GuardiansSafetyPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const router = useRouter();
  const { profile, club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const delRef = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [playerName, setPlayerName] = useState('');

  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [showAddGuardian, setShowAddGuardian] = useState(false);
  const [editingInviteId, setEditingInviteId] = useState<string | null>(null);
  const [inviteEditForm, setInviteEditForm] = useState({ email: '', guardian_name: '', phone: '', relationship: '' });
  const [savingInviteEdit, setSavingInviteEdit] = useState(false);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [medicalNotes, setMedicalNotes] = useState<string | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;

    const { data: playerRow } = await supabase.from('players').select('full_name, team_id, teams(name)').eq('id', playerId).single();
    if (playerRow) {
      setPlayerName(playerRow.full_name);
      setTeamId(playerRow.team_id);
      setTeamName((playerRow.teams as unknown as { name: string } | null)?.name ?? '');
    }

    setInviteLoading(true);
    supabase.from('invites').select('id,token,email,guardian_name,phone,relationship,accepted_at,accepted_by,created_at').eq('player_id', playerId).order('created_at')
      .then(({ data }) => { setInvites((data ?? []) as Invite[]); setInviteLoading(false); });

    setSafetyLoading(true);
    Promise.all([
      supabase.from('player_emergency_contacts').select('id,name,phone,relationship').eq('player_id', playerId),
      supabase.from('player_medical_notes').select('notes').eq('player_id', playerId).maybeSingle(),
    ]).then(([{ data: contacts }, { data: medical }]) => {
      setEmergencyContacts(contacts ?? []);
      setMedicalNotes(medical?.notes ?? null);
      setSafetyLoading(false);
    });
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  async function sendInvite() {
    if (!inviteEmail.trim() || !teamId) return;
    setSendingInvite(true); setInviteError('');
    const { data: newRow, error: dbErr } = await supabase.from('invites')
      .insert({ team_id: teamId, club_id: club?.id, player_id: playerId, email: inviteEmail.trim(), created_by: profile?.id })
      .select('id,token,email,guardian_name,phone,relationship,accepted_at,accepted_by,created_at').single();
    if (dbErr) { setInviteError('Could not save invite: ' + dbErr.message); setSendingInvite(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ invite_id: (newRow as Invite).id, team_name: teamName, player_name: playerName, club_name: club?.name ?? '' }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); setInviteError('Saved but email failed: ' + (e.error ?? res.statusText)); }
    setInvites(prev => [...prev, newRow as Invite]);
    setInviteEmail(''); setInviteSent(true); setShowAddGuardian(false); setSendingInvite(false);
    setTimeout(() => setInviteSent(false), 3000);
  }

  async function saveInviteEdit() {
    if (!editingInviteId || !inviteEditForm.email.trim()) return;
    setSavingInviteEdit(true);
    const updates = { email: inviteEditForm.email.trim(), guardian_name: inviteEditForm.guardian_name.trim() || null, phone: inviteEditForm.phone.trim() || null, relationship: inviteEditForm.relationship.trim() || null };
    await supabase.from('invites').update(updates).eq('id', editingInviteId);
    setInvites(prev => prev.map(i => i.id === editingInviteId ? { ...i, ...updates } : i));
    setEditingInviteId(null); setSavingInviteEdit(false);
  }

  async function resendInvite(inv: Invite) {
    setSendingInvite(true); setInviteError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ invite_id: inv.id, team_name: teamName, player_name: playerName, club_name: club?.name ?? '' }),
    });
    setSendingInvite(false);
    if (!res.ok) { const e = await res.json().catch(() => ({})); setInviteError('Resend failed: ' + (e.error ?? res.statusText)); return; }
    setInviteSent(true); setTimeout(() => setInviteSent(false), 3000);
  }

  // Mirrors PlayerPanel.tsx's deleteInvite: an already-accepted guardian
  // needs their access actually revoked (revoke_guardian_access RPC), not
  // just the historical invite row deleted — otherwise they'd keep full
  // roster/chat/schedule access despite looking "removed" here.
  async function deleteInvite(inv: Invite) {
    const isAccepted = !!inv.accepted_at;
    const confirmMsg = isAccepted
      ? `Remove ${inv.guardian_name || inv.email} as a guardian? They will lose access to this player's info, RSVPs, and chat.`
      : `Cancel the pending invite to ${inv.guardian_name || inv.email}?`;
    if (!confirm(confirmMsg)) return;
    setDeletingInviteId(inv.id);

    if (isAccepted) {
      if (!inv.accepted_by) { alert('Could not remove this guardian — missing account info. Please contact support.'); setDeletingInviteId(null); return; }
      const { data, error } = await supabase.rpc('revoke_guardian_access', { p_player_id: playerId, p_profile_id: inv.accepted_by });
      const result = data as { success?: boolean; error?: string } | null;
      if (error || result?.error) { alert(result?.error ?? 'Could not remove guardian. Please try again.'); setDeletingInviteId(null); return; }
    } else {
      const { error } = await supabase.from('invites').delete().eq('id', inv.id);
      if (error) { alert('Could not cancel invite: ' + error.message); setDeletingInviteId(null); return; }
    }
    setInvites(prev => prev.filter(i => i.id !== inv.id)); setDeletingInviteId(null);
  }

  async function deletePlayer() {
    setDeleting(true);
    // Raw delete fails hard the moment a player has any evaluations or
    // match-tracker data — routed through the same self-healing RPC
    // roster/page.tsx's quick-delete already uses.
    const { error } = await supabase.rpc('admin_delete_player', { p_player_id: playerId });
    setDeleting(false);
    if (error) { alert(`Could not delete player: ${error.message}`); return; }
    router.push('/dashboard/players');
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      {(safetyLoading || emergencyContacts.length > 0 || medicalNotes) && (
        <div style={{ ...card, border: '1px solid #FECACA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
            <AlertCircle size={13} color="#DC2626" />
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Emergency &amp; Medical</div>
          </div>
          {safetyLoading ? (
            <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {emergencyContacts.length > 0 && (
                <div>
                  <label style={labelStyle}>Emergency Contacts</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {emergencyContacts.map(c => (
                      <div key={c.id} style={{ fontSize: '13px', color: '#0F172A' }}>
                        <span style={{ fontWeight: '700' }}>{c.name}</span>
                        {c.relationship && <span style={{ color: '#94A3B8' }}> · {c.relationship}</span>}
                        {c.phone && <span style={{ color: '#64748B' }}> · {c.phone}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {medicalNotes && (
                <div>
                  <label style={labelStyle}>Medical Notes</label>
                  <div style={{ fontSize: '13px', color: '#0F172A', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{medicalNotes}</div>
                </div>
              )}
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Managed by the family in the app — view only here.</div>
            </div>
          )}
        </div>
      )}

      <div style={card}>
        <div style={sectionTitle}>Parent / Guardian</div>
        {inviteLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invites.map(inv => (
              <div key={inv.id}>
                {editingInviteId === inv.id ? (
                  <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div><label style={labelStyle}>Email *</label><input type="email" value={inviteEditForm.email} autoFocus onChange={e => setInviteEditForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} /></div>
                    <div><label style={labelStyle}>Guardian name</label><input value={inviteEditForm.guardian_name} onChange={e => setInviteEditForm(f => ({ ...f, guardian_name: e.target.value }))} placeholder="e.g. Sarah Turner" style={inputStyle} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div><label style={labelStyle}>Phone</label><input type="tel" value={inviteEditForm.phone} onChange={e => setInviteEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="07700…" style={inputStyle} /></div>
                      <div><label style={labelStyle}>Relationship</label><input value={inviteEditForm.relationship} onChange={e => setInviteEditForm(f => ({ ...f, relationship: e.target.value }))} placeholder="Mother…" style={inputStyle} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setEditingInviteId(null)} style={{ flex: 1, padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button onClick={saveInviteEdit} disabled={savingInviteEdit || !inviteEditForm.email.trim()} style={{ flex: 1, padding: '8px', background: primary, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {savingInviteEdit ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                    <div style={{ height: '3px', background: inv.accepted_at ? '#22C55E' : '#F59E0B' }} />
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {inv.guardian_name && (
                            <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A', marginBottom: '3px' }}>
                              {inv.guardian_name}
                              {inv.relationship && <span style={{ fontSize: '11px', fontWeight: '500', color: '#94A3B8', marginLeft: '6px' }}>({inv.relationship})</span>}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                            <Mail size={11} color="#94A3B8" />
                            <span style={{ fontSize: '12px', color: '#374151', wordBreak: 'break-all' }}>{inv.email}</span>
                          </div>
                          {inv.phone && <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '3px' }}>📞 {inv.phone}</div>}
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '5px', padding: '2px 7px', borderRadius: '20px', background: inv.accepted_at ? '#F0FDF4' : '#FFFBEB' }}>
                            {inv.accepted_at
                              ? <><Check size={10} color="#16A34A" strokeWidth={2.5} /><span style={{ fontSize: '10.5px', color: '#16A34A', fontWeight: '700' }}>Joined the app</span></>
                              : <><Clock size={10} color="#D97706" /><span style={{ fontSize: '10.5px', color: '#D97706', fontWeight: '700' }}>Invite pending</span></>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                          <button onClick={() => { setInviteEditForm({ email: inv.email, guardian_name: inv.guardian_name ?? '', phone: inv.phone ?? '', relationship: inv.relationship ?? '' }); setEditingInviteId(inv.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => deleteInvite(inv)} disabled={deletingInviteId === inv.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}>
                            <Trash2 size={13} color="#EF4444" />
                          </button>
                        </div>
                      </div>
                      {!inv.accepted_at && (
                        <button onClick={() => resendInvite(inv)} disabled={sendingInvite}
                          style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <RotateCcw size={11} /> Resend invite
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {inviteSent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 12px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: '#16A34A' }}>
                <Check size={13} strokeWidth={2.5} /> Invite sent!
              </div>
            )}
            {inviteError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: '#DC2626' }}>
                <AlertCircle size={12} />{inviteError}
              </div>
            )}

            {showAddGuardian ? (
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={13} color="#94A3B8" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input type="email" value={inviteEmail} autoFocus onChange={e => { setInviteEmail(e.target.value); setInviteError(''); }}
                      placeholder="parent@example.com" style={{ ...inputStyle, paddingLeft: '32px' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setShowAddGuardian(false); setInviteEmail(''); setInviteError(''); }} style={{ flex: 1, padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={sendInvite} disabled={sendingInvite || !inviteEmail.trim()}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: sendingInvite || !inviteEmail.trim() ? '#E2E8F0' : primary, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: sendingInvite || !inviteEmail.trim() ? '#94A3B8' : '#fff', cursor: sendingInvite || !inviteEmail.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    <Send size={12} />{sendingInvite ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setShowAddGuardian(true); setInviteError(''); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', background: '#fff', border: `1.5px dashed ${invites.length === 0 ? primary : '#CBD5E1'}`, borderRadius: '9px', fontSize: '13px', fontWeight: '600', color: invites.length === 0 ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={14} />{invites.length === 0 ? 'Add guardian' : 'Add another guardian'}
              </button>
            )}
          </div>
        )}
      </div>

      <button onClick={() => delRef.current?.showModal()}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', background: 'transparent', border: '1px solid #FECACA', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Trash2 size={14} /> Remove player
      </button>

      <dialog ref={delRef} onClick={e => { if (e.target === delRef.current) delRef.current?.close(); }}
        style={{ padding: '28px', margin: 'auto', border: 'none', borderRadius: '20px', width: 'calc(100vw - 48px)', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', background: '#fff' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
          <Trash2 size={22} color="#EF4444" />
        </div>
        <div style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>Remove player?</div>
        <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.6' }}>
          <strong style={{ color: '#0F172A' }}>{playerName}</strong> will be permanently removed from the roster.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => delRef.current?.close()} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={deletePlayer} disabled={deleting} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            {deleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </dialog>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        dialog::backdrop { background: rgba(0,0,0,0.4); }
      `}</style>
    </div>
  );
}
