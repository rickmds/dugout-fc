'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Mail, X, Trash2, Search, Check, Pencil, Shield, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type StaffMember = {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string | null;
  assigned_teams: string[];
};

type EditModal = {
  staff: StaffMember;
  name: string;
  role: 'coach' | 'org_admin';
  teamDraft: string[];
  teamSearch: string;
  saving: boolean;
  confirmRemove: boolean;
};

export default function StaffPage() {
  const { profile, club, teams } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [staff, setStaff]     = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [showInvite, setShowInvite]     = useState(false);
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteName, setInviteName]     = useState('');
  const [inviteRole, setInviteRole]     = useState<'coach' | 'org_admin'>('coach');
  const [inviteTeams, setInviteTeams]   = useState<string[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [sending, setSending]           = useState(false);
  const [sent, setSent]                 = useState(false);

  // Edit modal
  const [editModal, setEditModal] = useState<EditModal | null>(null);

  const loadStaff = useCallback(async () => {
    if (!club) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, created_at')
      .eq('club_id', club.id)
      .in('role', ['coach', 'org_admin'])
      .order('full_name');

    if (!data) { setLoading(false); return; }

    const withTeams = await Promise.all(data.map(async (s) => {
      const { data: tm } = await supabase
        .from('team_members').select('team_id').eq('profile_id', s.id);
      return { ...s, assigned_teams: (tm ?? []).map((t) => t.team_id as string) };
    }));

    setStaff(withTeams);
    setLoading(false);
  }, [club]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  // ── Open edit modal ─────────────────────────────────────────────────────────
  function openEdit(s: StaffMember) {
    setEditModal({
      staff: s,
      name: s.full_name ?? '',
      role: (s.role as 'coach' | 'org_admin'),
      teamDraft: [...s.assigned_teams],
      teamSearch: '',
      saving: false,
      confirmRemove: false,
    });
  }

  // ── Save edit ────────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!editModal) return;
    setEditModal((m) => m ? { ...m, saving: true } : null);

    const { staff: s, name, role, teamDraft } = editModal;

    const toAdd    = teamDraft.filter((id) => !s.assigned_teams.includes(id));
    const toRemove = s.assigned_teams.filter((id) => !teamDraft.includes(id));

    await Promise.all([
      supabase.from('profiles').update({ full_name: name.trim() || null, role }).eq('id', s.id),
      ...toAdd.map((teamId) =>
        supabase.from('team_members').insert({ profile_id: s.id, team_id: teamId, role: 'coach' })
      ),
      ...toRemove.map((teamId) =>
        supabase.from('team_members').delete().eq('profile_id', s.id).eq('team_id', teamId)
      ),
    ]);

    setStaff((prev) => prev.map((m) =>
      m.id !== s.id ? m : { ...m, full_name: name.trim() || null, role, assigned_teams: teamDraft }
    ));
    setEditModal(null);
  }

  // ── Remove staff ─────────────────────────────────────────────────────────────
  async function removeStaff() {
    if (!editModal) return;
    await supabase.from('profiles').update({ club_id: null, role: 'player' }).eq('id', editModal.staff.id);
    setStaff((prev) => prev.filter((s) => s.id !== editModal.staff.id));
    setEditModal(null);
  }

  // ── Invite ───────────────────────────────────────────────────────────────────
  async function handleInvite() {
    if (!inviteEmail.trim() || !club) return;
    setSending(true);
    await supabase.functions.invoke('invite-staff', {
      body: { email: inviteEmail.trim(), full_name: inviteName.trim() || null, role: inviteRole, club_id: club.id, team_ids: inviteTeams },
    });
    setSending(false);
    setSent(true);
    setTimeout(() => {
      setSent(false); setShowInvite(false);
      setInviteEmail(''); setInviteName(''); setInviteTeams([]); setInviteSearch('');
      loadStaff();
    }, 2000);
  }

  function initials(name: string | null) {
    return (name ?? '??').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function formatDate(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;

  const filteredTeams = (search: string) =>
    teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ padding: '32px 36px', maxWidth: '900px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Staff</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Manage coaches and admins, assign them to teams</p>
        </div>
        <button onClick={() => setShowInvite(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={16} /> Add staff
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>Loading…</div>
      ) : staff.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '64px', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>👥</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No staff yet</div>
          <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Add coaches and admins to give them dashboard access</div>
          <button onClick={() => setShowInvite(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 22px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={15} /> Add first staff member
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {staff.map((s) => {
            const assignedNames = s.assigned_teams.map(teamName).filter(Boolean);
            const visible  = assignedNames.slice(0, 3);
            const overflow = assignedNames.length - 3;
            const isMe     = s.id === profile?.id;

            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                  {initials(s.full_name)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>{s.full_name ?? 'Unnamed'}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: s.role === 'org_admin' ? '#8B5CF6' : '#0EA5E9', background: s.role === 'org_admin' ? 'rgba(139,92,246,0.1)' : 'rgba(14,165,233,0.1)', borderRadius: '20px', padding: '2px 8px' }}>
                      {s.role === 'org_admin' ? 'Admin' : 'Coach'}
                    </span>
                    {isMe && (
                      <span style={{ fontSize: '11px', color: primary, background: `${primary}15`, borderRadius: '20px', padding: '2px 8px', fontWeight: '600' }}>You</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    {visible.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#CBD5E1' }}>No teams assigned</span>
                    ) : (
                      <>
                        {visible.map((name) => (
                          <span key={name} style={{ fontSize: '11px', fontWeight: '600', color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '2px 8px' }}>
                            {name}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '2px 8px' }}>
                            +{overflow} more
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!isMe && (
                  <button
                    onClick={() => openEdit(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────────────────── */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={() => !editModal.saving && setEditModal(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>Edit staff member</div>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: '6px', display: 'flex', flexShrink: 0 }}>
                <X size={18} color="#64748B" />
              </button>
            </div>

            {/* Avatar hero */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 24px 16px', flexShrink: 0 }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '8px', boxShadow: `0 0 0 4px ${primary}22` }}>
                {initials(editModal.name || editModal.staff.full_name)}
              </div>
              {editModal.staff.created_at && (
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Joined {formatDate(editModal.staff.created_at)}</div>
              )}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* ── PROFILE section ── */}
              <div>
                <div style={sectionLabelSt}>Profile</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={labelSt}>Full name</label>
                    <input
                      value={editModal.name}
                      onChange={(e) => setEditModal((m) => m ? { ...m, name: e.target.value } : null)}
                      placeholder="e.g. Sarah Johnson"
                      style={inputSt}
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              {/* ── ROLE section ── */}
              <div>
                <div style={sectionLabelSt}>Role</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setEditModal((m) => m ? { ...m, role: 'coach' } : null)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px', border: `2px solid ${editModal.role === 'coach' ? primary : '#E2E8F0'}`, background: editModal.role === 'coach' ? `${primary}10` : '#FAFAFA', color: editModal.role === 'coach' ? primary : '#64748B', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}
                  >
                    <User size={15} />
                    Coach
                  </button>
                  <button
                    onClick={() => setEditModal((m) => m ? { ...m, role: 'org_admin' } : null)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px', border: `2px solid ${editModal.role === 'org_admin' ? '#8B5CF6' : '#E2E8F0'}`, background: editModal.role === 'org_admin' ? 'rgba(139,92,246,0.08)' : '#FAFAFA', color: editModal.role === 'org_admin' ? '#8B5CF6' : '#64748B', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}
                  >
                    <Shield size={15} />
                    Admin
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px', marginBottom: 0 }}>
                  {editModal.role === 'org_admin'
                    ? 'Can manage all teams, branding, staff, and club settings'
                    : 'Can manage their assigned teams only'}
                </p>
              </div>

              {/* ── TEAM ACCESS section ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={sectionLabelSt}>Team access</div>
                  {editModal.teamDraft.length > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: primary, background: `${primary}15`, borderRadius: '20px', padding: '2px 9px' }}>
                      {editModal.teamDraft.length} assigned
                    </span>
                  )}
                </div>
                <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  {/* Search */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <Search size={13} color="#94A3B8" />
                    <input
                      value={editModal.teamSearch}
                      onChange={(e) => setEditModal((m) => m ? { ...m, teamSearch: e.target.value } : null)}
                      placeholder="Search teams…"
                      style={{ border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', flex: 1, fontFamily: 'inherit' }}
                    />
                    {editModal.teamSearch && (
                      <button onClick={() => setEditModal((m) => m ? { ...m, teamSearch: '' } : null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                        <X size={13} color="#94A3B8" />
                      </button>
                    )}
                  </div>
                  {/* Team list */}
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {filteredTeams(editModal.teamSearch).length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No teams match</div>
                    ) : filteredTeams(editModal.teamSearch).map((t) => {
                      const checked = editModal.teamDraft.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => setEditModal((m) => {
                            if (!m) return null;
                            return { ...m, teamDraft: checked ? m.teamDraft.filter((id) => id !== t.id) : [...m.teamDraft, t.id] };
                          })}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: checked ? `${primary}07` : 'none', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                          onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = checked ? `${primary}07` : 'none'; }}
                        >
                          <div style={{ width: '20px', height: '20px', borderRadius: '6px', border: `2px solid ${checked ? primary : '#D1D5DB'}`, background: checked ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}>
                            {checked && <Check size={12} color="#fff" strokeWidth={3} />}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: checked ? '600' : '500', color: checked ? '#0F172A' : '#374151' }}>{t.name}</div>
                            {t.age_group && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>{t.age_group}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── DANGER ZONE ── */}
              {!editModal.confirmRemove ? (
                <button
                  onClick={() => setEditModal((m) => m ? { ...m, confirmRemove: true } : null)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', color: '#EF4444', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)'; }}
                >
                  <Trash2 size={15} /> Remove from club
                </button>
              ) : (
                <div style={{ background: '#FEF2F2', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>Remove this staff member?</div>
                  <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '14px', lineHeight: '1.5' }}>
                    <strong style={{ color: '#0F172A' }}>{editModal.staff.full_name ?? 'This person'}</strong> will lose access to the dashboard and all team data immediately.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setEditModal((m) => m ? { ...m, confirmRemove: false } : null)} style={{ flex: 1, padding: '9px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={removeStaff} style={{ flex: 1, padding: '9px', background: '#EF4444', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Yes, remove</button>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setEditModal(null)} disabled={editModal.saving} style={{ flex: 1, padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editModal.saving} style={{ flex: 2, padding: '12px', background: editModal.saving ? '#CBD5E1' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: editModal.saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {editModal.saving
                  ? <><div style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
                  : <><Check size={15} />Save changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite modal ──────────────────────────────────────────────────────── */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '20px' }} onClick={() => setShowInvite(false)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 80px rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: 0 }}>Add staff member</h2>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: '2px 0 0' }}>They'll receive login credentials by email</p>
              </div>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}>
                <X size={18} color="#64748B" />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelSt}>Full name</label>
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="e.g. Sarah Johnson" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Email address</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="coach@example.com" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Role</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['coach', 'org_admin'] as const).map((r) => (
                    <button key={r} onClick={() => setInviteRole(r)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `2px solid ${inviteRole === r ? primary : '#E2E8F0'}`, background: inviteRole === r ? `${primary}10` : '#fff', color: inviteRole === r ? primary : '#64748B', fontWeight: inviteRole === r ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {r === 'org_admin' ? 'Admin' : 'Coach'}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
                  {inviteRole === 'org_admin' ? 'Can manage all teams, branding, staff, and registrations' : 'Can manage their assigned teams only'}
                </p>
              </div>

              <div>
                <label style={labelSt}>
                  Assign to teams{' '}
                  <span style={{ color: '#CBD5E1', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>— optional</span>
                </label>
                <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <Search size={13} color="#94A3B8" />
                    <input
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      placeholder="Search teams…"
                      style={{ border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', flex: 1, fontFamily: 'inherit' }}
                    />
                    {inviteTeams.length > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: primary, background: `${primary}15`, borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        {inviteTeams.length} selected
                      </span>
                    )}
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                    {filteredTeams(inviteSearch).length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>No teams match</div>
                    ) : filteredTeams(inviteSearch).map((t) => {
                      const sel = inviteTeams.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => setInviteTeams((prev) => sel ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: sel ? `${primary}07` : 'none', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                          onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = sel ? `${primary}07` : 'none'; }}
                        >
                          <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${sel ? primary : '#D1D5DB'}`, background: sel ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}>
                            {sel && <Check size={11} color="#fff" strokeWidth={3} />}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: sel ? '600' : '400', color: '#374151' }}>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setShowInvite(false)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleInvite} disabled={sending || sent || !inviteEmail.trim()} style={{ flex: 2, padding: '11px', background: sent ? '#22C55E' : sending || !inviteEmail.trim() ? '#CBD5E1' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: sending || sent || !inviteEmail.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Mail size={15} /> {sent ? 'Invite sent!' : sending ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const sectionLabelSt: React.CSSProperties = {
  fontSize: '10px', fontWeight: '800', color: '#94A3B8',
  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px',
};

const labelSt: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};

const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
