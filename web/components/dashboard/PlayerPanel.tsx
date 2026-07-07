'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X, Check, Trash2, Mail, Send, AlertCircle, Hash,
  CalendarCheck, CalendarX, Clock, RotateCcw, Plus, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PlayerForPanel = {
  id: string; full_name: string; jersey_number: number | null;
  position: string | null; team_id: string;
};

type Invite = {
  id: string; token: string; email: string;
  guardian_name: string | null; phone: string | null;
  relationship: string | null; accepted_at: string | null; created_at: string;
};

interface PlayerPanelProps {
  player: PlayerForPanel;
  teamName: string;
  clubName: string;
  primary: string;
  profileId: string | undefined;
  onClose: () => void;
  onSaved: (updated: PlayerForPanel) => void;
  onDeleted: (id: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const POSITIONS = ['GK','CB','LB','RB','WB','SW','DM','CM','AM','CAM','CDM','RM','LM','LW','RW','ST','CF','SS'];

function positionStyle(pos: string | null): { color: string; bg: string } {
  if (!pos) return { color: '#94A3B8', bg: '#F8FAFC' };
  const p = pos.toLowerCase();
  if (p === 'goalkeeper' || p === 'gk') return { color: '#D97706', bg: '#FFFBEB' };
  if (['defender','cb','lb','rb','sw','wb','dm'].some(x => p.includes(x))) return { color: '#2563EB', bg: '#EFF6FF' };
  if (['midfielder','cm','am','rm','lm','cam','cdm'].some(x => p.includes(x))) return { color: '#7C3AED', bg: '#F5F3FF' };
  if (['forward','striker','winger','st','cf','lw','rw'].some(x => p.includes(x))) return { color: '#DC2626', bg: '#FFF1F1' };
  return { color: '#64748B', bg: '#F1F5F9' };
}

function hex2rgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PlayerPanel({ player, teamName, clubName, primary, profileId, onClose, onSaved, onDeleted }: PlayerPanelProps) {
  const posStyle = positionStyle(player.position);
  const initials = player.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const { r, g, b } = hex2rgb(primary.startsWith('#') ? primary : '#22C55E');

  // Edit form
  const [panelForm, setPanelForm] = useState({
    full_name:     player.full_name,
    jersey_number: player.jersey_number?.toString() ?? '',
    position:      player.position ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Invites
  const [invites,          setInvites]          = useState<Invite[]>([]);
  const [inviteLoading,    setInviteLoading]    = useState(true);
  const [inviteEmail,      setInviteEmail]      = useState('');
  const [inviteError,      setInviteError]      = useState('');
  const [sendingInvite,    setSendingInvite]    = useState(false);
  const [inviteSent,       setInviteSent]       = useState(false);
  const [showAddGuardian,  setShowAddGuardian]  = useState(false);
  const [editingInviteId,  setEditingInviteId]  = useState<string | null>(null);
  const [inviteEditForm,   setInviteEditForm]   = useState({ email: '', guardian_name: '', phone: '', relationship: '' });
  const [savingInviteEdit, setSavingInviteEdit] = useState(false);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);

  // Attendance
  const [rsvpStats,   setRsvpStats]   = useState({ attending: 0, not_attending: 0 });
  const [rsvpLoading, setRsvpLoading] = useState(true);

  // Delete
  const [deleting, setDeleting] = useState(false);

  const panelRef = useRef<HTMLDialogElement>(null);
  const delRef   = useRef<HTMLDialogElement>(null);

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '5px' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  useEffect(() => {
    setPanelForm({ full_name: player.full_name, jersey_number: player.jersey_number?.toString() ?? '', position: player.position ?? '' });
    setSaved(false); setInviteSent(false); setInviteEmail(''); setInviteError('');
    setEditingInviteId(null); setShowAddGuardian(false);

    setInviteLoading(true);
    supabase.from('invites').select('id,token,email,guardian_name,phone,relationship,accepted_at,created_at').eq('player_id', player.id).order('created_at')
      .then(({ data }) => { setInvites((data ?? []) as Invite[]); setInviteLoading(false); });

    setRsvpLoading(true);
    supabase.from('event_rsvps').select('status').eq('player_id', player.id)
      .then(({ data }) => {
        const s = { attending: 0, not_attending: 0 };
        for (const row of data ?? []) { if (row.status === 'attending') s.attending++; else if (row.status === 'not_attending') s.not_attending++; }
        setRsvpStats(s); setRsvpLoading(false);
      });
  }, [player.id]);

  useEffect(() => { panelRef.current?.showModal(); }, []);

  async function savePanel() {
    if (!panelForm.full_name.trim()) return;
    setSaving(true);
    const updates = {
      full_name:     panelForm.full_name.trim(),
      jersey_number: panelForm.jersey_number ? parseInt(panelForm.jersey_number) : null,
      position:      panelForm.position || null,
    };
    await supabase.from('players').update(updates).eq('id', player.id);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    onSaved({ ...player, ...updates });
  }

  async function sendInviteFromPanel() {
    if (!inviteEmail.trim()) return;
    setSendingInvite(true); setInviteError('');
    const { data: newRow, error: dbErr } = await supabase.from('invites')
      .insert({ team_id: player.team_id, player_id: player.id, email: inviteEmail.trim(), created_by: profileId })
      .select('id,token,email,guardian_name,phone,relationship,accepted_at,created_at').single();
    if (dbErr) { setInviteError('Could not save invite: ' + dbErr.message); setSendingInvite(false); return; }
    const res = await fetch('/api/send-invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: (newRow as Invite).id, team_name: teamName, player_name: player.full_name, club_name: clubName }),
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
    setSendingInvite(true);
    await fetch('/api/send-invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: inv.id, team_name: teamName, player_name: player.full_name, club_name: clubName }),
    });
    setSendingInvite(false); setInviteSent(true); setTimeout(() => setInviteSent(false), 3000);
  }

  async function deleteInvite(id: string) {
    setDeletingInviteId(id);
    await supabase.from('invites').delete().eq('id', id);
    setInvites(prev => prev.filter(i => i.id !== id)); setDeletingInviteId(null);
  }

  async function deletePlayer() {
    setDeleting(true);
    await supabase.from('players').delete().eq('id', player.id);
    setDeleting(false); onDeleted(player.id);
    delRef.current?.close();
    panelRef.current?.close();
  }

  const totalRsvps    = rsvpStats.attending + rsvpStats.not_attending;
  const attendancePct = totalRsvps > 0 ? Math.round((rsvpStats.attending / totalRsvps) * 100) : null;
  const pctColor = attendancePct === null ? '#94A3B8' : attendancePct >= 80 ? '#16A34A' : attendancePct >= 60 ? '#D97706' : '#DC2626';
  const pctBg    = attendancePct === null ? '#F8FAFC' : attendancePct >= 80 ? '#F0FDF4' : attendancePct >= 60 ? '#FFFBEB' : '#FEF2F2';

  return (
    <>
      <dialog
        ref={panelRef}
        className="modal-panel"
        onClose={onClose}
        onClick={e => { if (e.target === panelRef.current) panelRef.current?.close(); }}
        style={{ margin: 'auto', padding: 0, width: '100%', maxWidth: '540px', maxHeight: '90vh', border: 'none', borderRadius: '20px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden', background: '#FAFBFC' }}
      >

        {/* ── Top accent bar ── */}
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${primary}, rgba(${r},${g},${b},0.4))`, flexShrink: 0 }} />

        {/* ── Header ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Player Profile</span>
          <button onClick={() => panelRef.current?.close()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
            <X size={16} color="#94A3B8" />
          </button>
        </div>

        {/* ── Hero ── */}
        <div style={{ background: '#fff', padding: '24px 24px 20px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Avatar */}
            <div style={{
              width: '72px', height: '72px', borderRadius: '20px',
              background: `linear-gradient(135deg, rgba(${r},${g},${b},0.15), rgba(${r},${g},${b},0.08))`,
              border: `1.5px solid rgba(${r},${g},${b},0.2)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', fontWeight: '900', color: primary, flexShrink: 0,
              letterSpacing: '-0.5px',
            }}>
              {initials}
            </div>

            {/* Name + badges */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '19px', fontWeight: '800', color: '#0F172A', letterSpacing: '-0.4px', lineHeight: 1.2, marginBottom: '8px' }}>
                {player.full_name}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {player.jersey_number != null && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 9px', borderRadius: '20px', background: `rgba(${r},${g},${b},0.1)`, border: `1px solid rgba(${r},${g},${b},0.2)` }}>
                    <Hash size={10} strokeWidth={3} color={primary} />
                    <span style={{ fontSize: '12px', fontWeight: '800', color: primary }}>{player.jersey_number}</span>
                  </div>
                )}
                {player.position && (
                  <span style={{ fontSize: '11.5px', fontWeight: '700', color: posStyle.color, background: posStyle.bg, borderRadius: '20px', padding: '3px 9px', border: `1px solid ${posStyle.color}20` }}>
                    {player.position}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── DETAILS ── */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Full Name</label>
                <input value={panelForm.full_name} onChange={e => { setPanelForm(f => ({ ...f, full_name: e.target.value })); setSaved(false); }} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>Jersey #</label>
                  <input type="number" min="1" max="99" value={panelForm.jersey_number}
                    onChange={e => { setPanelForm(f => ({ ...f, jersey_number: e.target.value })); setSaved(false); }}
                    placeholder="—" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Position</label>
                  <input list="player-panel-positions" value={panelForm.position}
                    onChange={e => { setPanelForm(f => ({ ...f, position: e.target.value })); setSaved(false); }}
                    placeholder="GK, CM, ST…" style={inputStyle} />
                  <datalist id="player-panel-positions">
                    {POSITIONS.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={savePanel} disabled={saving || !panelForm.full_name.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 20px', background: saved ? '#22C55E' : primary, border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s', opacity: (!panelForm.full_name.trim() || saving) ? 0.6 : 1 }}>
                  {saved ? <><Check size={14} strokeWidth={2.5} /> Saved</> : saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>

          {/* ── ATTENDANCE ── */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Attendance</div>
            {rsvpLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : totalRsvps === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <TrendingUp size={24} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 6px' }} />
                <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No RSVP data yet</p>
              </div>
            ) : (
              <>
                {/* Big percentage + bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: pctBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '17px', fontWeight: '900', color: pctColor, lineHeight: 1 }}>{attendancePct}%</span>
                    <span style={{ fontSize: '9px', fontWeight: '700', color: pctColor, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Rate</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '99px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${attendancePct}%`, background: attendancePct! >= 80 ? '#22C55E' : attendancePct! >= 60 ? '#F59E0B' : '#EF4444', borderRadius: '99px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }} />
                        <span style={{ fontSize: '12px', color: '#374151', fontWeight: '600' }}>{rsvpStats.attending} going</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
                        <span style={{ fontSize: '12px', color: '#374151', fontWeight: '600' }}>{rsvpStats.not_attending} not going</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── PARENT / GUARDIAN ── */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>Parent / Guardian</div>
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
                        {/* Status accent strip */}
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
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => deleteInvite(inv.id)} disabled={deletingInviteId === inv.id}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
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
                    {inviteError && <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#DC2626' }}><AlertCircle size={12} />{inviteError}</div>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setShowAddGuardian(false); setInviteEmail(''); setInviteError(''); }} style={{ flex: 1, padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button onClick={sendInviteFromPanel} disabled={sendingInvite || !inviteEmail.trim()}
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

          {/* ── REMOVE ── */}
          <button onClick={() => delRef.current?.showModal()}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', background: 'transparent', border: '1px solid #FECACA', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <Trash2 size={14} /> Remove player
          </button>
        </div>
      </dialog>

      {/* Delete confirm */}
      <dialog ref={delRef} onClick={e => { if (e.target === delRef.current) delRef.current.close(); }}
        style={{ padding: '28px', margin: 'auto', border: 'none', borderRadius: '20px', width: 'calc(100vw - 48px)', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', background: '#fff' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
          <Trash2 size={22} color="#EF4444" />
        </div>
        <div style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>Remove player?</div>
        <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.6' }}>
          <strong style={{ color: '#0F172A' }}>{player.full_name}</strong> will be permanently removed from the roster.
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
        dialog.modal-panel[open] { display: flex; flex-direction: column; }
        dialog.modal-panel::backdrop { background: rgba(0,0,0,0.4); backdrop-filter: blur(2px); }
        dialog[open]::backdrop { background: rgba(0,0,0,0.4); }
      `}</style>
    </>
  );
}
