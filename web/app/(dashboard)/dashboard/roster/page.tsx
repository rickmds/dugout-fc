'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Search, Mail, User, X, ChevronDown, Trash2, Send,
  Sparkles, Check, AlertCircle, ChevronRight, Shield, Hash,
  CalendarCheck, CalendarX, Clock, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import AIRosterImport from '@/components/dashboard/AIRosterImport';

type Player = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  team_id: string;
};

type Invite = {
  id: string;
  token: string;
  email: string;
  guardian_name: string | null;
  phone: string | null;
  relationship: string | null;
  accepted_at: string | null;
  created_at: string;
};

type RsvpStats = { attending: number; not_attending: number; pending: number };

type FormState = {
  full_name: string;
  jersey_number: string;
  position: string;
  parent_email: string;
  team_id: string;
};

type DeleteModal  = { player: Player; deleting: boolean };
type InviteModal  = { player: Player; email: string; sending: boolean; sent: boolean; error: string };

const POSITIONS = [
  'GK', 'CB', 'LB', 'RB', 'WB', 'SW',
  'DM', 'CM', 'AM', 'CAM', 'CDM', 'RM', 'LM',
  'LW', 'RW', 'ST', 'CF', 'SS',
  'Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Winger', 'Striker',
];

const emptyForm = (teamId: string): FormState => ({
  full_name: '', jersey_number: '', position: '', parent_email: '', team_id: teamId,
});

function positionStyle(pos: string | null): { color: string; bg: string } {
  if (!pos) return { color: '#94A3B8', bg: '#F8FAFC' };
  const p = pos.toLowerCase();
  if (p === 'goalkeeper') return { color: '#D97706', bg: '#FFFBEB' };
  if (['defender', 'cb', 'lb', 'rb', 'sw', 'wb', 'dm'].some((x) => p.includes(x))) return { color: '#2563EB', bg: '#EFF6FF' };
  if (['midfielder', 'cm', 'am', 'rm', 'lm', 'cam', 'cdm'].some((x) => p.includes(x))) return { color: '#7C3AED', bg: '#F5F3FF' };
  if (['forward', 'striker', 'winger', 'st', 'cf', 'lw', 'rw'].some((x) => p.includes(x))) return { color: '#DC2626', bg: '#FFF1F1' };
  return { color: '#64748B', bg: '#F1F5F9' };
}

type PosGroup = { label: string; color: string; bg: string; count: number };
function positionGroups(players: Player[]): PosGroup[] {
  const groups: Record<string, PosGroup> = {
    GK:  { label: 'GK',  color: '#D97706', bg: '#FFFBEB', count: 0 },
    DEF: { label: 'DEF', color: '#2563EB', bg: '#EFF6FF', count: 0 },
    MID: { label: 'MID', color: '#7C3AED', bg: '#F5F3FF', count: 0 },
    FWD: { label: 'FWD', color: '#DC2626', bg: '#FFF1F1', count: 0 },
  };
  for (const p of players) {
    const s = positionStyle(p.position);
    if (s.color === '#D97706') groups.GK.count++;
    else if (s.color === '#2563EB') groups.DEF.count++;
    else if (s.color === '#7C3AED') groups.MID.count++;
    else if (s.color === '#DC2626') groups.FWD.count++;
  }
  return Object.values(groups).filter((g) => g.count > 0);
}

export default function RosterPage() {
  const { profile, club, teams, selectedTeamId } = useDashboard();
  const searchParams = useSearchParams();
  const [players, setPlayers]         = useState<Player[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [teamFilter, setTeamFilter]   = useState(searchParams.get('team') ?? selectedTeamId ?? teams[0]?.id ?? '');
  const [page, setPage]               = useState(0);
  const PAGE_SIZE = 25;

  // Add player modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAI, setShowAI]             = useState(false);
  const [form, setForm]                 = useState<FormState>(emptyForm(selectedTeamId ?? teams[0]?.id ?? ''));
  const [saving, setSaving]             = useState(false);

  // Player profile panel
  const [selectedPlayer, setSelectedPlayer]   = useState<Player | null>(null);
  const [panelForm, setPanelForm]             = useState<{ full_name: string; jersey_number: string; position: string }>({ full_name: '', jersey_number: '', position: '' });
  const [panelSaving, setPanelSaving]         = useState(false);
  const [panelSaved, setPanelSaved]           = useState(false);
  const [invites, setInvites]                 = useState<Invite[]>([]);
  const [inviteLoading, setInviteLoading]     = useState(false);
  const [rsvpStats, setRsvpStats]             = useState<RsvpStats>({ attending: 0, not_attending: 0, pending: 0 });
  const [rsvpLoading, setRsvpLoading]         = useState(false);
  const [sendingInvite, setSendingInvite]     = useState(false);
  const [inviteEmail, setInviteEmail]         = useState('');
  const [inviteSent, setInviteSent]           = useState(false);
  const [inviteError, setInviteError]         = useState('');
  const [showAddGuardianForm, setShowAddGuardianForm] = useState(false);
  const [editingInviteId, setEditingInviteId]   = useState<string | null>(null);
  const [inviteEditForm, setInviteEditForm]     = useState({ email: '', guardian_name: '', phone: '', relationship: '' });
  const [savingInviteEdit, setSavingInviteEdit] = useState(false);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);

  // Other modals
  const [deleteModal, setDeleteModal]   = useState<DeleteModal | null>(null);
  const [inviteModal, setInviteModal]   = useState<InviteModal | null>(null);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const loadPlayers = useCallback(async () => {
    if (!teams.length) { setLoading(false); return; }
    setLoading(true);
    const targetTeamId = teamFilter || (teams[0]?.id ?? '');
    const { data } = await supabase
      .from('players')
      .select('id, full_name, jersey_number, position, team_id')
      .eq('team_id', targetTeamId)
      .order('jersey_number', { ascending: true, nullsFirst: false });
    setPlayers((data ?? []) as Player[]);
    setLoading(false);
  }, [teams, teamFilter]);

  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  // Load invite + RSVP stats when a player is selected
  useEffect(() => {
    if (!selectedPlayer) return;
    setPanelForm({
      full_name: selectedPlayer.full_name,
      jersey_number: selectedPlayer.jersey_number?.toString() ?? '',
      position: selectedPlayer.position ?? '',
    });
    setPanelSaved(false);
    setInviteSent(false);
    setInviteEmail('');
    setInviteError('');
    setEditingInviteId(null);
    setInviteEditForm({ email: '', guardian_name: '', phone: '', relationship: '' });
    setDeletingInviteId(null);
    setShowAddGuardianForm(false);

    setInviteLoading(true);
    supabase
      .from('invites')
      .select('id, token, email, guardian_name, phone, relationship, accepted_at, created_at')
      .eq('player_id', selectedPlayer.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setInvites((data ?? []) as Invite[]); setInviteLoading(false); });

    setRsvpLoading(true);
    supabase
      .from('event_rsvps')
      .select('status')
      .eq('player_id', selectedPlayer.id)
      .then(({ data }) => {
        const stats: RsvpStats = { attending: 0, not_attending: 0, pending: 0 };
        for (const r of data ?? []) {
          if (r.status === 'attending') stats.attending++;
          else if (r.status === 'not_attending') stats.not_attending++;
        }
        // We'll treat "total events" as attending + not_attending
        setRsvpStats(stats);
        setRsvpLoading(false);
      });
  }, [selectedPlayer]);

  async function savePanel() {
    if (!selectedPlayer || !panelForm.full_name.trim()) return;
    setPanelSaving(true);
    await supabase.from('players').update({
      full_name: panelForm.full_name.trim(),
      jersey_number: panelForm.jersey_number ? parseInt(panelForm.jersey_number) : null,
      position: panelForm.position || null,
    }).eq('id', selectedPlayer.id);
    // Update local state
    setPlayers((prev) => prev.map((p) => p.id === selectedPlayer.id ? {
      ...p,
      full_name: panelForm.full_name.trim(),
      jersey_number: panelForm.jersey_number ? parseInt(panelForm.jersey_number) : null,
      position: panelForm.position || null,
    } : p));
    setSelectedPlayer((prev) => prev ? {
      ...prev,
      full_name: panelForm.full_name.trim(),
      jersey_number: panelForm.jersey_number ? parseInt(panelForm.jersey_number) : null,
      position: panelForm.position || null,
    } : null);
    setPanelSaving(false);
    setPanelSaved(true);
    setTimeout(() => setPanelSaved(false), 2500);
  }

  async function sendInviteFromPanel() {
    if (!selectedPlayer || !inviteEmail.trim()) return;
    setSendingInvite(true);
    setInviteError('');
    const { data: newRow, error: dbErr } = await supabase
      .from('invites')
      .insert({
        team_id: selectedPlayer.team_id,
        player_id: selectedPlayer.id,
        email: inviteEmail.trim(),
        created_by: profile?.id,
      })
      .select('id, token, email, guardian_name, phone, relationship, accepted_at, created_at')
      .single();
    if (dbErr) {
      setInviteError('Could not save invite: ' + dbErr.message);
      setSendingInvite(false);
      return;
    }
    const teamName = teams.find((t) => t.id === selectedPlayer.team_id)?.name ?? 'your team';
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_id: (newRow as Invite).id,
        team_name: teamName,
        player_name: selectedPlayer.full_name,
        club_name: club?.name ?? '',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setInviteError('Invite saved but email failed: ' + (err.error ?? res.statusText));
    }
    setInvites((prev) => [...prev, newRow as Invite]);
    setInviteEmail('');
    setInviteSent(true);
    setShowAddGuardianForm(false);
    setSendingInvite(false);
    setTimeout(() => setInviteSent(false), 3000);
  }

  async function saveInviteEdit() {
    if (!editingInviteId || !inviteEditForm.email.trim()) return;
    setSavingInviteEdit(true);
    const updates = {
      email: inviteEditForm.email.trim(),
      guardian_name: inviteEditForm.guardian_name.trim() || null,
      phone: inviteEditForm.phone.trim() || null,
      relationship: inviteEditForm.relationship.trim() || null,
    };
    await supabase.from('invites').update(updates).eq('id', editingInviteId);
    setInvites((prev) => prev.map((inv) => inv.id === editingInviteId ? { ...inv, ...updates } : inv));
    setEditingInviteId(null);
    setSavingInviteEdit(false);
  }

  async function deleteInviteRecord(id: string) {
    setDeletingInviteId(id);
    await supabase.from('invites').delete().eq('id', id);
    setInvites((prev) => prev.filter((inv) => inv.id !== id));
    setDeletingInviteId(null);
  }

  async function resendInvite(inv: Invite) {
    if (!selectedPlayer) return;
    setSendingInvite(true);
    const teamName = teams.find((t) => t.id === selectedPlayer.team_id)?.name ?? 'your team';
    await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_id: inv.id,
        team_name: teamName,
        player_name: selectedPlayer.full_name,
        club_name: club?.name ?? '',
      }),
    });
    setSendingInvite(false);
    setInviteSent(true);
    setTimeout(() => setInviteSent(false), 2500);
  }

  async function handleAddPlayer() {
    if (!form.full_name.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
      position: form.position || null,
      team_id: form.team_id,
    };
    const { data } = await supabase.from('players').insert(payload).select('id').single();
    if (form.parent_email.trim() && (data as { id: string } | null)?.id) {
      const { data: inviteRow } = await supabase.from('invites').insert({
        team_id: form.team_id,
        player_id: (data as { id: string }).id,
        email: form.parent_email.trim(),
        created_by: profile?.id,
      }).select('id').single();
      if (inviteRow) {
        fetch('/api/send-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invite_id: (inviteRow as { id: string }).id,
            team_name: teams.find((t) => t.id === form.team_id)?.name ?? 'your team',
            player_name: form.full_name.trim(),
            club_name: club?.name ?? '',
          }),
        }).catch(() => {});
      }
    }
    setSaving(false);
    setShowAddModal(false);
    loadPlayers();
  }

  async function confirmDelete(player: Player) {
    await supabase.from('players').delete().eq('id', player.id);
    setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    setDeleteModal(null);
    if (selectedPlayer?.id === player.id) setSelectedPlayer(null);
  }

  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.position?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const currentTeam = teams.find((t) => t.id === teamFilter);

  const posStyle = positionStyle(selectedPlayer?.position ?? null);
  const panelInitials = selectedPlayer?.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '';
  const totalRsvps = rsvpStats.attending + rsvpStats.not_attending;
  const attendancePct = totalRsvps > 0 ? Math.round((rsvpStats.attending / totalRsvps) * 100) : null;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 36px', maxWidth: selectedPlayer ? '680px' : '960px', minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px' }}>Roster</h1>
            <p style={{ fontSize: '13px', color: '#64748B' }}>
              {currentTeam?.name ?? 'All teams'} · {players.length} player{players.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setShowAI(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#374151', fontWeight: '600', fontSize: '14px', padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #E2E8F0', cursor: 'pointer' }}>
              <Sparkles size={15} color="#8B5CF6" /> AI Import
            </button>
            <button onClick={() => { setForm(emptyForm(teamFilter || (teams[0]?.id ?? ''))); setShowAddModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
              <Plus size={16} /> Add Player
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input placeholder="Search by name or position…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              style={{ width: '100%', padding: '10px 12px 10px 36px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', color: '#0F172A', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {teams.length > 1 && (
            <div style={{ position: 'relative' }}>
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
                style={{ appearance: 'none', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '9px', padding: '10px 32px 10px 12px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          )}
        </div>

        {/* Position breakdown */}
        {!loading && players.length > 0 && (() => {
          const groups = positionGroups(players);
          if (!groups.length) return null;
          return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {groups.map((g) => (
                <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: g.bg, border: `1px solid ${g.color}20`, borderRadius: '20px', padding: '4px 12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: g.color, letterSpacing: '0.04em' }}>{g.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: g.color }}>{g.count}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '20px', padding: '4px 12px' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#64748B' }}>TOTAL</span>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748B' }}>{players.length}</span>
              </div>
            </div>
          );
        })()}

        {/* Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
            <div style={{ width: '28px', height: '28px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <User size={40} color="#CBD5E1" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B', marginBottom: '4px' }}>{search ? 'No players match' : 'No players yet'}</div>
            {!search && (
              <button onClick={() => { setForm(emptyForm(teamFilter || (teams[0]?.id ?? ''))); setShowAddModal(true); }}
                style={{ marginTop: '16px', background: primary, color: '#fff', fontWeight: '700', fontSize: '13px', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                + Add First Player
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 160px 24px', padding: '10px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
              {['#', 'Name', 'Position', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
              ))}
            </div>
            {paginated.map((p, idx) => {
              const pos = positionStyle(p.position);
              const initials = p.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
              const isSelected = selectedPlayer?.id === p.id;
              return (
                <PlayerRow key={p.id} player={p} primary={primary} pos={pos} initials={initials}
                  isLast={idx === paginated.length - 1} isSelected={isSelected}
                  onClick={() => setSelectedPlayer(isSelected ? null : p)}
                  onDelete={(e) => { e.stopPropagation(); setDeleteModal({ player: p, deleting: false }); }}
                />
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', padding: '0 4px' }}>
            <span style={{ fontSize: '13px', color: '#64748B' }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} players
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: page === 0 ? '#F8FAFC' : '#fff', color: page === 0 ? '#CBD5E1' : '#374151', fontSize: '13px', fontWeight: '600', cursor: page === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  style={{ padding: '7px 12px', borderRadius: '8px', border: `1px solid ${i === page ? primary : '#E2E8F0'}`, background: i === page ? primary : '#fff', color: i === page ? '#fff' : '#374151', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', background: page === totalPages - 1 ? '#F8FAFC' : '#fff', color: page === totalPages - 1 ? '#CBD5E1' : '#374151', fontSize: '13px', fontWeight: '600', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Player profile panel ─────────────────────────────────────────────── */}
      {selectedPlayer && (
        <div style={{
          width: '360px', flexShrink: 0, borderLeft: '1px solid #E2E8F0',
          background: '#fff', height: '100vh', overflowY: 'auto',
          position: 'sticky', top: 0, display: 'flex', flexDirection: 'column',
        }}>
          {/* Panel header */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Player Profile</span>
            <button onClick={() => setSelectedPlayer(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
              <X size={16} color="#64748B" />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

            {/* Avatar + headline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
              <div style={{
                width: '60px', height: '60px', borderRadius: '50%',
                background: `${primary}15`, border: `2px solid ${primary}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: '800', color: primary, flexShrink: 0,
              }}>
                {panelInitials}
              </div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: '800', color: '#0F172A' }}>{selectedPlayer.full_name}</div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {selectedPlayer.jersey_number != null && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontWeight: '700', color: primary }}>
                      <Hash size={11} strokeWidth={2.5} /> {selectedPlayer.jersey_number}
                    </span>
                  )}
                  {selectedPlayer.position && (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: posStyle.color, background: posStyle.bg, borderRadius: '5px', padding: '2px 7px' }}>
                      {selectedPlayer.position}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Edit details ─────────────────────── */}
            <Section label="Details">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input value={panelForm.full_name}
                    onChange={(e) => { setPanelForm((f) => ({ ...f, full_name: e.target.value })); setPanelSaved(false); }}
                    style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Jersey #</label>
                    <input type="number" min="1" max="99" value={panelForm.jersey_number}
                      onChange={(e) => { setPanelForm((f) => ({ ...f, jersey_number: e.target.value })); setPanelSaved(false); }}
                      placeholder="—" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Position</label>
                    <input
                      list="positions-list"
                      value={panelForm.position}
                      onChange={(e) => { setPanelForm((f) => ({ ...f, position: e.target.value })); setPanelSaved(false); }}
                      placeholder="e.g. GK, CM, ST…"
                      style={inputStyle}
                    />
                    <datalist id="positions-list">
                      {POSITIONS.map((pos) => <option key={pos} value={pos} />)}
                    </datalist>
                  </div>
                </div>

                <button onClick={savePanel} disabled={panelSaving || !panelForm.full_name.trim()}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', width: '100%', padding: '10px', background: panelSaved ? '#22C55E' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}>
                  {panelSaved ? <><Check size={15} strokeWidth={2.5} /> Saved</> : panelSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </Section>

            {/* ── Attendance ─────────────────────── */}
            <Section label="Attendance">
              {rsvpLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                  <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : totalRsvps === 0 ? (
                <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>No RSVP data yet</p>
              ) : (
                <>
                  {/* % bar */}
                  {attendancePct !== null && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>Attendance rate</span>
                        <span style={{ fontSize: '13px', fontWeight: '800', color: attendancePct >= 80 ? '#16A34A' : attendancePct >= 60 ? '#D97706' : '#DC2626' }}>
                          {attendancePct}%
                        </span>
                      </div>
                      <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${attendancePct}%`, background: attendancePct >= 80 ? '#22C55E' : attendancePct >= 60 ? '#F59E0B' : '#EF4444', borderRadius: '99px', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <StatCard icon={<CalendarCheck size={14} color="#16A34A" />} label="Going" value={rsvpStats.attending} color="#16A34A" bg="#F0FDF4" />
                    <StatCard icon={<CalendarX size={14} color="#DC2626" />} label="Not going" value={rsvpStats.not_attending} color="#DC2626" bg="#FEF2F2" />
                  </div>
                </>
              )}
            </Section>

            {/* ── Parent / Guardian ─────────────────── */}
            <Section label="Parent / Guardian">
              {inviteLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                  <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* ── Guardian cards ── */}
                  {invites.map((inv) => (
                    <div key={inv.id}>
                      {editingInviteId === inv.id ? (
                        /* Edit form */
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={labelStyle}>Email *</label>
                            <input type="email" value={inviteEditForm.email} autoFocus
                              onChange={(e) => setInviteEditForm((f) => ({ ...f, email: e.target.value }))}
                              style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>Guardian name</label>
                            <input value={inviteEditForm.guardian_name}
                              onChange={(e) => setInviteEditForm((f) => ({ ...f, guardian_name: e.target.value }))}
                              placeholder="e.g. Sarah Turner" style={inputStyle} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={labelStyle}>Phone</label>
                              <input type="tel" value={inviteEditForm.phone}
                                onChange={(e) => setInviteEditForm((f) => ({ ...f, phone: e.target.value }))}
                                placeholder="07700…" style={inputStyle} />
                            </div>
                            <div>
                              <label style={labelStyle}>Relationship</label>
                              <input value={inviteEditForm.relationship}
                                onChange={(e) => setInviteEditForm((f) => ({ ...f, relationship: e.target.value }))}
                                placeholder="Mother…" style={inputStyle} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setEditingInviteId(null)}
                              style={{ flex: 1, padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                              Cancel
                            </button>
                            <button onClick={saveInviteEdit} disabled={savingInviteEdit || !inviteEditForm.email.trim()}
                              style={{ flex: 1, padding: '8px', background: primary, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                              {savingInviteEdit ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Display card */
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px', border: '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              {inv.guardian_name && (
                                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>
                                  {inv.guardian_name}
                                  {inv.relationship && <span style={{ fontSize: '11px', fontWeight: '500', color: '#94A3B8', marginLeft: '6px' }}>({inv.relationship})</span>}
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                                <Mail size={11} color="#64748B" />
                                <span style={{ fontSize: '12px', color: '#374151', wordBreak: 'break-all' }}>{inv.email}</span>
                              </div>
                              {inv.phone && (
                                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '3px' }}>📞 {inv.phone}</div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                                {inv.accepted_at ? (
                                  <><Check size={11} color="#16A34A" strokeWidth={2.5} /><span style={{ fontSize: '11px', color: '#16A34A', fontWeight: '600' }}>Joined the app</span></>
                                ) : (
                                  <><Clock size={11} color="#94A3B8" /><span style={{ fontSize: '11px', color: '#94A3B8' }}>Invite pending</span></>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                              <button
                                onClick={() => { setInviteEditForm({ email: inv.email, guardian_name: inv.guardian_name ?? '', phone: inv.phone ?? '', relationship: inv.relationship ?? '' }); setEditingInviteId(inv.id); }}
                                title="Edit guardian"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#E2E8F0'}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button onClick={() => deleteInviteRecord(inv.id)} disabled={deletingInviteId === inv.id} title="Remove guardian"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex' }}
                                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FEF2F2'}
                                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                                <Trash2 size={13} color="#EF4444" />
                              </button>
                            </div>
                          </div>
                          {!inv.accepted_at && (
                            <button onClick={() => resendInvite(inv)} disabled={sendingInvite}
                              style={{ width: '100%', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '7px', fontSize: '12px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                              <RotateCcw size={11} /> Resend invite
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ── Sent confirmation ── */}
                  {inviteSent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 12px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '9px', fontSize: '12px', fontWeight: '600', color: '#16A34A' }}>
                      <Check size={13} strokeWidth={2.5} /> Invite sent!
                    </div>
                  )}

                  {/* ── Add guardian form ── */}
                  {showAddGuardianForm ? (
                    <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={labelStyle}>Email *</label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={13} color="#94A3B8" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                          <input type="email" value={inviteEmail} autoFocus
                            onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); }}
                            placeholder="parent@example.com"
                            style={{ ...inputStyle, paddingLeft: '32px' }} />
                        </div>
                      </div>
                      {inviteError && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#DC2626' }}>
                          <AlertCircle size={12} /> {inviteError}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setShowAddGuardianForm(false); setInviteEmail(''); setInviteError(''); }}
                          style={{ flex: 1, padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Cancel
                        </button>
                        <button onClick={sendInviteFromPanel} disabled={sendingInvite || !inviteEmail.trim()}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: sendingInvite || !inviteEmail.trim() ? '#E2E8F0' : primary, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: sendingInvite || !inviteEmail.trim() ? '#94A3B8' : '#fff', cursor: sendingInvite || !inviteEmail.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                          <Send size={12} /> {sendingInvite ? 'Sending…' : 'Send Invite'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowAddGuardianForm(true); setInviteError(''); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', background: '#fff', border: `1px dashed ${invites.length === 0 ? primary : '#CBD5E1'}`, borderRadius: '9px', fontSize: '13px', fontWeight: '600', color: invites.length === 0 ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Plus size={14} /> {invites.length === 0 ? 'Add guardian' : 'Add another guardian'}
                    </button>
                  )}
                </div>
              )}
            </Section>

            {/* ── Remove ─────────────────────── */}
            <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
              <button onClick={() => setDeleteModal({ player: selectedPlayer, deleting: false })}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', fontSize: '13px', fontWeight: '700', color: '#DC2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Trash2 size={14} /> Remove Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add player modal ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A' }}>Add Player</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {teams.length > 1 && (
                <div>
                  <label style={labelStyle}>Team</label>
                  <div style={{ position: 'relative' }}>
                    <select value={form.team_id} onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value }))}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: '32px' }}>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Player name" style={inputStyle} autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>Jersey #</label>
                  <input type="number" min="1" max="99" value={form.jersey_number}
                    onChange={(e) => setForm((f) => ({ ...f, jersey_number: e.target.value }))}
                    placeholder="—" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Position</label>
                <div style={{ position: 'relative' }}>
                  <select value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    style={{ ...inputStyle, appearance: 'none', paddingRight: '32px', cursor: 'pointer' }}>
                    <option value="">Select position…</option>
                    {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                  <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Parent Email (optional)</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="email" value={form.parent_email}
                    onChange={(e) => setForm((f) => ({ ...f, parent_email: e.target.value }))}
                    placeholder="parent@example.com"
                    style={{ ...inputStyle, paddingLeft: '34px' }} />
                </div>
                <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '5px' }}>An invite email with the app download link will be sent automatically.</p>
              </div>
            </div>
            <div style={{ padding: '0 24px 24px', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAddPlayer} disabled={saving || !form.full_name.trim()}
                style={{ flex: 2, padding: '11px', background: saving || !form.full_name.trim() ? '#86EFAC' : primary, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: saving || !form.full_name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Adding…' : 'Add Player'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAI && <AIRosterImport onClose={() => setShowAI(false)} onDone={() => loadPlayers()} />}

      {/* ── Delete confirm ─────────────────────────────────────────────────── */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => !deleteModal.deleting && setDeleteModal(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Trash2 size={20} color="#EF4444" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Remove player?</div>
              <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
                <strong style={{ color: '#0F172A' }}>{deleteModal.player.full_name}</strong> will be removed from the roster. This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setDeleteModal(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Keep</button>
                <button onClick={() => confirmDelete(deleteModal.player)} disabled={deleteModal.deleting}
                  style={{ flex: 1, padding: '11px', background: deleteModal.deleting ? '#FCA5A5' : '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: deleteModal.deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {deleteModal.deleting ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlayerRow({ player: p, primary, pos, initials, isLast, isSelected, onClick, onDelete }: {
  player: Player; primary: string;
  pos: { color: string; bg: string };
  initials: string; isLast: boolean; isSelected: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '56px 1fr 160px 24px',
        padding: '12px 20px', borderBottom: isLast ? 'none' : '1px solid #F8FAFC',
        alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s',
        background: isSelected ? `${primary}08` : hover ? '#FAFBFF' : 'transparent',
        borderLeft: isSelected ? `3px solid ${primary}` : '3px solid transparent',
      }}>
      <div style={{ fontSize: '15px', fontWeight: '800', color: primary, letterSpacing: '-0.3px' }}>
        {p.jersey_number != null ? p.jersey_number : <span style={{ fontSize: '13px', color: '#CBD5E1' }}>—</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `${primary}15`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: primary, border: `1.5px solid ${primary}20` }}>
          {initials}
        </div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name}</div>
      </div>
      <div>
        {p.position
          ? <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: '700', color: pos.color, background: pos.bg, borderRadius: '6px', padding: '3px 9px', border: `1px solid ${pos.color}20` }}>{p.position}</span>
          : <span style={{ fontSize: '12px', color: '#CBD5E1' }}>—</span>}
      </div>
      <div style={{ opacity: hover ? 1 : 0, transition: 'opacity 0.15s' }}>
        <button onClick={onDelete} title="Remove"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '5px', display: 'flex' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; e.stopPropagation(); }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
          <Trash2 size={13} color="#94A3B8" />
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>{label}</div>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: '10px', padding: '10px 12px', border: `1px solid ${color}20` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>{icon}<span style={{ fontSize: '11px', fontWeight: '600', color }}>{label}</span></div>
      <div style={{ fontSize: '20px', fontWeight: '800', color }}>{value}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
