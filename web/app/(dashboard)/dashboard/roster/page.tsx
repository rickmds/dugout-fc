'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Search, Mail, User, X, ChevronDown, Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import AIRosterImport from '@/components/dashboard/AIRosterImport';

type Player = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  team_id: string;
  photo_url: string | null;
};

type FormState = {
  full_name: string;
  jersey_number: string;
  position: string;
  parent_email: string;
  team_id: string;
};

type DeleteModal  = { player: Player; deleting: boolean };

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
  const router = useRouter();
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

  // Other modals
  const [deleteModal, setDeleteModal]   = useState<DeleteModal | null>(null);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const loadPlayers = useCallback(async () => {
    if (!teams.length) { setLoading(false); return; }
    setLoading(true);
    const targetTeamId = teamFilter || (teams[0]?.id ?? '');
    const { data } = await supabase
      .from('players')
      .select('id, full_name, jersey_number, position, team_id, photo_url')
      .eq('team_id', targetTeamId)
      .order('jersey_number', { ascending: true, nullsFirst: false });
    setPlayers((data ?? []) as Player[]);
    setLoading(false);
  }, [teams, teamFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/filter-change; loadPlayers sets loading/players from a real network call, not derivable at render time
  useEffect(() => { loadPlayers(); }, [loadPlayers]);

  async function handleAddPlayer() {
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        position: form.position || null,
        team_id: form.team_id,
      };
      const { data, error } = await supabase.from('players').insert(payload).select('id').single();
      if (error) { alert(`Could not add player: ${error.message}`); return; }
      if (form.parent_email.trim() && (data as { id: string } | null)?.id) {
        const { data: inviteRow } = await supabase.from('invites').insert({
          team_id: form.team_id,
          club_id: club?.id,
          player_id: (data as { id: string }).id,
          email: form.parent_email.trim(),
          created_by: profile?.id,
        }).select('id').single();
        if (inviteRow) {
          const { data: { session } } = await supabase.auth.getSession();
          fetch('/api/send-invite', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              invite_id: (inviteRow as { id: string }).id,
              team_name: teams.find((t) => t.id === form.team_id)?.name ?? 'your team',
              player_name: form.full_name.trim(),
              club_name: club?.name ?? '',
            }),
          }).catch(() => {});
        }
      }
      setShowAddModal(false);
      loadPlayers();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(player: Player) {
    // Raw delete used to fail hard the moment a player had any evaluations
    // or match-tracker data — routed through the same self-healing RPC
    // used for club/team deletes.
    const { error } = await supabase.rpc('admin_delete_player', { p_player_id: player.id });
    if (error) { alert(`Could not delete player: ${error.message}`); return; }
    setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    setDeleteModal(null);
  }

  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.position?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const currentTeam = teams.find((t) => t.id === teamFilter);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 36px', maxWidth: '960px', minWidth: 0 }}>

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
              return (
                <PlayerRow key={p.id} player={p} primary={primary} pos={pos} initials={initials}
                  isLast={idx === paginated.length - 1}
                  onClick={() => router.push(`/dashboard/players/${p.id}`)}
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

function PlayerRow({ player: p, primary, pos, initials, isLast, onClick, onDelete }: {
  player: Player; primary: string;
  pos: { color: string; bg: string };
  initials: string; isLast: boolean;
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
        background: hover ? '#FAFBFF' : 'transparent',
        borderLeft: '3px solid transparent',
      }}>
      <div style={{ fontSize: '15px', fontWeight: '800', color: primary, letterSpacing: '-0.3px' }}>
        {p.jersey_number != null ? p.jersey_number : <span style={{ fontSize: '13px', color: '#CBD5E1' }}>—</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `${primary}15`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: primary, border: `1.5px solid ${primary}20`, overflow: 'hidden' }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
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

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '9px 12px', fontSize: '13px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
