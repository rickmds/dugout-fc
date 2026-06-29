'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell, BellOff, Megaphone, X, ChevronDown, Trash2, Pin, Mail, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  team_id: string;
  team_name?: string;
};

type FormState = {
  title: string;
  body: string;
  team_id: string;
  pinned: boolean;
  push_notify: boolean;
  email_team: boolean;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function AnnouncementsPage() {
  const { profile, club, teams } = useDashboard();
  const [items, setItems]           = useState<Announcement[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm]             = useState<FormState>({
    title: '', body: '', team_id: teams[0]?.id ?? '',
    pinned: false, push_notify: true, email_team: false,
  });

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const load = useCallback(async () => {
    if (!teams.length) { setLoading(false); return; }
    setLoading(true);
    const teamIds = teams.map((t) => t.id);
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, pinned, created_at, team_id, teams(name)')
      .in('team_id', teamIds)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    setItems(
      (data ?? []).map((a: Record<string, unknown>) => ({
        ...a,
        team_name: (a.teams as Record<string, unknown> | null)?.name,
      })) as Announcement[]
    );
    setLoading(false);
  }, [teams]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({
      title: '', body: '', team_id: filterTeam !== 'all' ? filterTeam : (teams[0]?.id ?? ''),
      pinned: false, push_notify: true, email_team: false,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);

    const { data } = await supabase.from('announcements').insert({
      title: form.title.trim(), body: form.body.trim(),
      team_id: form.team_id, pinned: form.pinned,
      created_by: profile?.id,
    }).select('id').single();

    const teamName = teams.find((t) => t.id === form.team_id)?.name ?? 'your team';

    if (form.push_notify) {
      try {
        await supabase.functions.invoke('send-push', {
          body: {
            team_id: form.team_id,
            type: 'new_announcement',
            title: `📢 ${teamName}`,
            body: form.title.trim(),
            data: { announcement_id: (data as { id: string } | null)?.id },
          },
        });
      } catch { /* non-critical */ }
    }

    if (form.email_team) {
      try {
        await fetch('/api/send-announcement-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_id: form.team_id,
            title: form.title.trim(),
            body: form.body.trim(),
          }),
        });
      } catch { /* non-critical */ }
    }

    setSaving(false);
    setShowModal(false);
    load();
  }

  async function togglePin(a: Announcement) {
    await supabase.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id);
    setItems((prev) =>
      prev
        .map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x))
        .sort((p, q) => {
          if (p.pinned !== q.pinned) return p.pinned ? -1 : 1;
          return new Date(q.created_at).getTime() - new Date(p.created_at).getTime();
        })
    );
  }

  async function handleDelete(id: string) {
    await supabase.from('announcements').delete().eq('id', id);
    setItems((prev) => prev.filter((a) => a.id !== id));
    setDeleteConfirm(null);
  }

  async function handleEmailTeam(a: Announcement) {
    if (emailingId === a.id) return;
    setEmailingId(a.id);
    try {
      await fetch('/api/send-announcement-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: a.team_id, title: a.title, body: a.body }),
      });
    } catch { /* non-critical */ }
    setTimeout(() => setEmailingId(null), 2500);
  }

  const displayed = items.filter((a) => filterTeam === 'all' || a.team_id === filterTeam);

  return (
    <div style={{ padding: '32px 36px', maxWidth: '820px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#0F172A', marginBottom: '3px', letterSpacing: '-0.3px' }}>Announcements</h1>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Broadcast messages to parents and players</p>
        </div>
        <button
          onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: `0 2px 8px ${primary}40`, fontFamily: 'inherit' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
        >
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {/* Team filter */}
      {teams.length > 1 && (
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '20px' }}>
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            style={{ appearance: 'none', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '8px 36px 8px 13px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500', outline: 'none' }}
          >
            <option value="all">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
      )}

      {/* Counter */}
      {!loading && displayed.length > 0 && (
        <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '14px', fontWeight: '500' }}>
          {displayed.length} announcement{displayed.length !== 1 ? 's' : ''}
          {displayed.filter((a) => a.pinned).length > 0 && ` · ${displayed.filter((a) => a.pinned).length} pinned`}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0.6, 0.75, 0.9].map((op, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px 24px', opacity: op, animation: 'shimmer 1.4s ease-in-out infinite' }}>
              <div style={{ height: '16px', background: '#F1F5F9', borderRadius: '6px', width: '55%', marginBottom: '10px' }} />
              <div style={{ height: '13px', background: '#F8FAFC', borderRadius: '6px', width: '85%', marginBottom: '6px' }} />
              <div style={{ height: '13px', background: '#F8FAFC', borderRadius: '6px', width: '65%' }} />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ width: '68px', height: '68px', borderRadius: '20px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Megaphone size={30} color="#CBD5E1" />
          </div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '7px' }}>No announcements yet</div>
          <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '26px', lineHeight: '1.65', maxWidth: '280px', margin: '0 auto 26px' }}>
            Keep parents and players in the loop. Post updates, reminders, and news here.
          </div>
          <button
            onClick={openCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '11px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Plus size={15} /> Create First Announcement
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayed.map((a) => {
            const isExpanded = expandedId === a.id;
            const isLong = a.body.length > 220;
            const bodyPreview = isLong && !isExpanded ? a.body.slice(0, 220).trimEnd() + '…' : a.body;
            const isEmailing = emailingId === a.id;

            return (
              <div
                key={a.id}
                style={{
                  background: '#fff', borderRadius: '16px',
                  border: `1px solid ${a.pinned ? primary + '35' : '#E2E8F0'}`,
                  padding: '20px 22px', position: 'relative', animation: 'fadeIn 0.2s ease',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 14px rgba(0,0,0,0.06)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
              >
                {/* Pinned top stripe */}
                {a.pinned && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: primary, borderRadius: '16px 16px 0 0' }} />
                )}

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  {/* Icon */}
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                    background: a.pinned ? `${primary}15` : '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${a.pinned ? primary + '22' : '#F1F5F9'}`,
                    marginTop: '1px',
                  }}>
                    <Megaphone size={18} color={a.pinned ? primary : '#94A3B8'} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title + badge row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '7px' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', lineHeight: '1.3' }}>{a.title}</span>
                        {a.pinned && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: '700', color: primary, background: `${primary}15`, borderRadius: '20px', padding: '2px 8px', letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>
                            <Pin size={9} style={{ transform: 'rotate(45deg)' }} /> Pinned
                          </span>
                        )}
                        {teams.length > 1 && a.team_name && (
                          <span style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', borderRadius: '20px', padding: '2px 9px', fontWeight: '500', flexShrink: 0 }}>
                            {a.team_name}
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                        <button
                          onClick={() => togglePin(a)}
                          title={a.pinned ? 'Unpin' : 'Pin to top'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', display: 'flex', transition: 'background 0.1s' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                        >
                          <Pin size={14} color={a.pinned ? primary : '#CBD5E1'} style={{ transform: 'rotate(45deg)' }} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ id: a.id, title: a.title })}
                          title="Delete announcement"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', display: 'flex', transition: 'background 0.1s' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                        >
                          <Trash2 size={14} color="#CBD5E1" />
                        </button>
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
                      {bodyPreview}
                    </div>
                    {isLong && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : a.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0', fontSize: '12px', fontWeight: '600', color: primary, fontFamily: 'inherit' }}
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}

                    {/* Meta + Email team row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span title={formatFull(a.created_at)} style={{ fontSize: '12px', color: '#94A3B8', cursor: 'default' }}>{timeAgo(a.created_at)}</span>
                      </div>
                      <button
                        onClick={() => handleEmailTeam(a)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          background: isEmailing ? `${primary}12` : '#F8FAFC',
                          border: `1.5px solid ${isEmailing ? primary + '30' : '#E2E8F0'}`,
                          borderRadius: '8px', padding: '5px 11px',
                          fontSize: '12px', fontWeight: '600',
                          color: isEmailing ? primary : '#64748B',
                          cursor: isEmailing ? 'default' : 'pointer',
                          fontFamily: 'inherit', transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => { if (!isEmailing) { (e.currentTarget as HTMLElement).style.background = `${primary}10`; (e.currentTarget as HTMLElement).style.borderColor = `${primary}30`; (e.currentTarget as HTMLElement).style.color = primary; } }}
                        onMouseLeave={(e) => { if (!isEmailing) { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.color = '#64748B'; } }}
                      >
                        {isEmailing ? <Send size={12} /> : <Mail size={12} />}
                        {isEmailing ? 'Sent!' : 'Email team'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '540px', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'fadeIn 0.18s ease' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${primary}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={16} color={primary} />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', margin: 0 }}>New Announcement</h2>
                  <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>Visible to all team members immediately</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: '#F8FAFC', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: '8px', display: 'flex' }}>
                <X size={16} color="#64748B" />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {teams.length > 1 && (
                <div>
                  <label style={labelStyle}>Team</label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={form.team_id}
                      onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value }))}
                      style={{ ...inputStyle, appearance: 'none', paddingRight: '34px', cursor: 'pointer' }}
                    >
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Training cancelled this Wednesday"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = primary; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = '#E2E8F0'; }}
                  autoFocus
                />
              </div>

              <div>
                <label style={labelStyle}>Message</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Write your announcement here. Parents and players will see the full text."
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.65' }}
                  onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = primary; }}
                  onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0'; }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ToggleRow
                  icon={form.push_notify ? <Bell size={14} color={primary} /> : <BellOff size={14} color="#94A3B8" />}
                  label="Send push notification"
                  sub="Alerts all team members immediately"
                  on={form.push_notify}
                  color={primary}
                  onToggle={() => setForm((f) => ({ ...f, push_notify: !f.push_notify }))}
                />
                <ToggleRow
                  icon={<Mail size={14} color={form.email_team ? primary : '#94A3B8'} />}
                  label="Also send by email"
                  sub="Emails all parents with the full message"
                  on={form.email_team}
                  color={primary}
                  onToggle={() => setForm((f) => ({ ...f, email_team: !f.email_team }))}
                />
                <ToggleRow
                  icon={<Pin size={14} color={form.pinned ? primary : '#94A3B8'} style={{ transform: 'rotate(45deg)' }} />}
                  label="Pin to top"
                  sub="Keep this visible above other announcements"
                  on={form.pinned}
                  color={primary}
                  onToggle={() => setForm((f) => ({ ...f, pinned: !f.pinned }))}
                />
              </div>
            </div>

            <div style={{ padding: '16px 24px 24px', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.body.trim()}
                style={{
                  flex: 2, padding: '12px',
                  background: saving || !form.title.trim() || !form.body.trim() ? '#CBD5E1' : primary,
                  border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff',
                  cursor: saving || !form.title.trim() || !form.body.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'background 0.15s',
                }}
              >
                {saving
                  ? <><div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Posting…</>
                  : <><Send size={14} /> Post Announcement</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '380px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Trash2 size={20} color="#EF4444" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Delete announcement?</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: '1.5' }}>
              <strong style={{ color: '#0F172A' }}>{deleteConfirm.title}</strong> will be permanently deleted and removed for all parents.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '11px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} style={{ flex: 1, padding: '11px', background: '#EF4444', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  icon, label, sub, on, color, onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  on: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        background: on ? `${color}08` : '#F8FAFC',
        borderRadius: '11px', padding: '11px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: `1.5px solid ${on ? color + '28' : '#E2E8F0'}`,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: on ? `${color}15` : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? color + '22' : '#F1F5F9'}`, flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{label}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>{sub}</div>
        </div>
      </div>
      <div style={{ width: '38px', height: '21px', borderRadius: '11px', background: on ? color : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: '2px', width: '17px', height: '17px', borderRadius: '50%', background: '#fff', left: on ? '19px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: '700', color: '#64748B',
  letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: '7px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
};
