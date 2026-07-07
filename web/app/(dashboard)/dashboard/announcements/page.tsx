'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell, BellOff, Megaphone, X, ChevronDown, Trash2, Pin, Mail, Send, Sparkles, RefreshCw, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  team_id: string | null;
  team_name?: string;
  is_club_wide?: boolean;
};

type FormState = {
  title: string;
  body: string;
  team_ids: string[];
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
  const [composeMode, setComposeMode] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [bullets, setBullets]       = useState('');
  const [tone, setTone]             = useState<'friendly'|'professional'|'urgent'|'encouraging'>('friendly');
  const [writing, setWriting]       = useState(false);
  const [aiError, setAiError]       = useState('');
  const [aiDrafted, setAiDrafted]   = useState(false);
  const [showAI, setShowAI]         = useState(false);
  const [form, setForm]             = useState<FormState>({
    title: '', body: '', team_ids: teams.map((t) => t.id),
    pinned: false, push_notify: true, email_team: false,
  });

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const load = useCallback(async () => {
    if (!teams.length || !club) { setLoading(false); return; }
    setLoading(true);
    const teamIds = teams.map((t) => t.id);
    const [{ data: teamData }, { data: clubData }] = await Promise.all([
      supabase
        .from('announcements')
        .select('id, title, body, pinned, created_at, team_id, is_club_wide, teams(name)')
        .in('team_id', teamIds)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('announcements')
        .select('id, title, body, pinned, created_at, team_id, is_club_wide')
        .eq('club_id', club.id)
        .eq('is_club_wide', true)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    const teamItems = (teamData ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      team_name: (a.teams as Record<string, unknown> | null)?.name,
    })) as Announcement[];
    const clubItems = (clubData ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      is_club_wide: true,
    })) as Announcement[];
    const merged = [...teamItems, ...clubItems].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setItems(merged);
    setLoading(false);
  }, [teams, club]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({
      title: '', body: '',
      team_ids: filterTeam !== 'all' ? [filterTeam] : teams.map((t) => t.id),
      pinned: false, push_notify: true, email_team: false,
    });
    setBullets('');
    setAiError('');
    setAiDrafted(false);
    setComposeMode(true);
  }

  async function handleDraftWithAI() {
    if (!bullets.trim()) return;
    setWriting(true);
    setAiError('');
    const teamName = form.team_ids.length === 1
      ? (teams.find((t) => t.id === form.team_ids[0])?.name ?? club?.name ?? 'the team')
      : (club?.name ?? 'the team');
    const { data, error } = await supabase.functions.invoke('write-email', {
      body: {
        bullets: bullets.trim(),
        tone,
        team_name: teamName,
        coach_name: profile?.full_name ?? 'Coach',
      },
    });
    setWriting(false);
    if (error || !data?.subject) {
      setAiError(data?.error ?? error?.message ?? 'AI failed to draft. Try again.');
      return;
    }
    setForm((f) => ({ ...f, title: data.subject, body: data.body }));
    setAiDrafted(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim() || !form.team_ids.length) return;
    setSaving(true);

    await supabase.from('announcements').insert(
      form.team_ids.map((tid) => ({
        title: form.title.trim(),
        body: form.body.trim(),
        team_id: tid,
        pinned: form.pinned,
        created_by: profile?.id,
      }))
    );

    if (form.push_notify) {
      for (const tid of form.team_ids) {
        const tName = teams.find((t) => t.id === tid)?.name ?? club?.name ?? 'your team';
        try {
          await supabase.functions.invoke('send-push', {
            body: {
              team_id: tid,
              type: 'new_announcement',
              title: `📢 ${tName}`,
              body: form.title.trim(),
            },
          });
        } catch { /* non-critical */ }
      }
    }

    if (form.email_team) {
      for (const tid of form.team_ids) {
        try {
          await fetch('/api/send-announcement-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_id: tid, title: form.title.trim(), body: form.body.trim() }),
          });
        } catch { /* non-critical */ }
      }
    }

    setSaving(false);
    setComposeMode(false);
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

  const TONES = [
    { value: 'friendly'     as const, label: 'Friendly',     desc: 'Warm & conversational',   emoji: '😊' },
    { value: 'professional' as const, label: 'Professional',  desc: 'Clear & formal',          emoji: '📋' },
    { value: 'urgent'       as const, label: 'Urgent',        desc: 'Direct & time-sensitive', emoji: '⚡' },
    { value: 'encouraging'  as const, label: 'Encouraging',   desc: 'Upbeat & motivating',     emoji: '💪' },
  ];

  return (
    <div style={{ padding: '32px 36px', maxWidth: composeMode ? '1100px' : '820px', transition: 'max-width 0.2s' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {composeMode && (
            <button
              onClick={() => setComposeMode(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ← Back
            </button>
          )}
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', marginBottom: '2px', letterSpacing: '-0.3px' }}>
              {composeMode ? 'New Announcement' : 'Announcements'}
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B' }}>
              {composeMode ? 'Draft with AI or write manually — visible to all team members immediately' : 'Broadcast messages to parents and players'}
            </p>
          </div>
        </div>
        {!composeMode && (
          <button
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer', boxShadow: `0 2px 8px ${primary}40`, fontFamily: 'inherit' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
          >
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>

      {/* ── COMPOSE VIEW ── */}
      {composeMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start', animation: 'fadeIn 0.2s ease' }}>

          {/* Left: draft */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Write with AI toggle */}
            <button
              onClick={() => { setShowAI((v) => !v); }}
              style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '7px', background: showAI ? `${primary}12` : '#F8FAFC', border: `1.5px solid ${showAI ? primary + '40' : '#E2E8F0'}`, borderRadius: '10px', padding: '9px 16px', color: showAI ? primary : '#64748B', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            >
              <Sparkles size={14} />
              {showAI ? 'Hide AI tools' : 'Write with AI'}
            </button>

            {showAI && (
              <>
                {/* Tone */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', animation: 'fadeIn 0.15s ease' }}>
                  <label style={labelStyle}>Tone</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
                    {TONES.map((t) => (
                      <button key={t.value} onClick={() => setTone(t.value)} style={{ padding: '10px 8px', borderRadius: '10px', border: `2px solid ${tone === t.value ? primary : '#E2E8F0'}`, background: tone === t.value ? `${primary}10` : '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '18px' }}>{t.emoji}</span>
                        <span style={{ fontSize: '12px', fontWeight: tone === t.value ? '700' : '500', color: tone === t.value ? primary : '#374151' }}>{t.label}</span>
                        <span style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI compose */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', animation: 'fadeIn 0.15s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <label style={{ ...labelStyle, margin: 0 }}>What do you want to say?</label>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>Bullet points, notes, anything</span>
                  </div>
                  <textarea
                    value={bullets}
                    onChange={(e) => { setBullets(e.target.value); setAiDrafted(false); }}
                    placeholder={'e.g.\n- Training moved to Thursday 5pm this week\n- Bring shin guards\n- Great win on Saturday, well done everyone'}
                    rows={6}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.7', marginBottom: '12px' }}
                  />
                  <button
                    onClick={handleDraftWithAI}
                    disabled={writing || !bullets.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: writing || !bullets.trim() ? '#F1F5F9' : `${primary}15`, border: `1.5px solid ${writing || !bullets.trim() ? '#E2E8F0' : primary + '40'}`, borderRadius: '10px', padding: '10px 16px', color: writing || !bullets.trim() ? '#94A3B8' : primary, fontWeight: '700', fontSize: '13px', cursor: writing || !bullets.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  >
                    {writing ? <><RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Writing…</> : <><Sparkles size={14} /> Draft with AI</>}
                  </button>
                  {aiError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#DC2626', marginTop: '8px' }}>{aiError}</div>}
                </div>
              </>
            )}

            {/* Title + body */}
            <div style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${aiDrafted ? primary + '30' : '#E2E8F0'}`, padding: '20px', transition: 'border-color 0.2s' }}>
              {aiDrafted && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '12px', color: primary, fontWeight: '600' }}>
                  <Sparkles size={12} /> AI drafted — edit freely before posting
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Training cancelled this Wednesday"
                  style={inputStyle}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = primary; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = '#E2E8F0'; }}
                />
              </div>
              <div>
                <label style={labelStyle}>Message</label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Write your announcement here. Parents and players will see the full text."
                  rows={10}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.75' }}
                  onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = primary; }}
                  onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0'; }}
                />
              </div>
            </div>
          </div>

          {/* Right: settings + post */}
          <div style={{ position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Settings card */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>

              {/* Team checklist */}
              <div style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Send to</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setForm((f) => ({ ...f, team_ids: teams.map((t) => t.id) }))} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '2px 9px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>All</button>
                    <button onClick={() => setForm((f) => ({ ...f, team_ids: [] }))} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '2px 9px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>None</button>
                  </div>
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', paddingBottom: '6px' }}>
                  {teams.map((t) => {
                    const sel = form.team_ids.includes(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() => setForm((f) => ({ ...f, team_ids: sel ? f.team_ids.filter((id) => id !== t.id) : [...f.team_ids, t.id] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', cursor: 'pointer', background: sel ? `${primary}07` : 'transparent', transition: 'background 0.1s' }}
                        onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = sel ? `${primary}07` : 'transparent'; }}
                      >
                        <div style={{ width: '17px', height: '17px', borderRadius: '5px', flexShrink: 0, border: `2px solid ${sel ? primary : '#D1D5DB'}`, background: sel ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}>
                          {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                        </div>
                        <span style={{ fontSize: '13px', color: '#374151', fontWeight: sel ? '600' : '400', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: '6px 16px 10px', fontSize: '11px', color: '#94A3B8' }}>
                  {form.team_ids.length} of {teams.length} team{teams.length !== 1 ? 's' : ''} selected
                </div>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ToggleRow icon={form.push_notify ? <Bell size={14} color={primary} /> : <BellOff size={14} color="#94A3B8" />} label="Send push notification" sub="Alerts team immediately" on={form.push_notify} color={primary} onToggle={() => setForm((f) => ({ ...f, push_notify: !f.push_notify }))} />
                <ToggleRow icon={<Mail size={14} color={form.email_team ? primary : '#94A3B8'} />} label="Also send by email" sub="Emails all parents" on={form.email_team} color={primary} onToggle={() => setForm((f) => ({ ...f, email_team: !f.email_team }))} />
                <ToggleRow icon={<Pin size={14} color={form.pinned ? primary : '#94A3B8'} style={{ transform: 'rotate(45deg)' }} />} label="Pin to top" sub="Keep visible above others" on={form.pinned} color={primary} onToggle={() => setForm((f) => ({ ...f, pinned: !f.pinned }))} />
              </div>
            </div>

            {/* Post button */}
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.body.trim() || !form.team_ids.length}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: saving || !form.title.trim() || !form.body.trim() || !form.team_ids.length ? '#CBD5E1' : primary, color: '#fff', fontWeight: '700', fontSize: '15px', padding: '14px', borderRadius: '12px', border: 'none', cursor: saving || !form.title.trim() || !form.body.trim() || !form.team_ids.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}
            >
              {saving
                ? <><div style={{ width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Posting…</>
                : <><Send size={15} /> Post Announcement</>}
            </button>
          </div>
        </div>

      ) : (
        <>
          {/* Team filter */}
          {teams.length > 1 && (
            <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '20px' }}>
              <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} style={{ appearance: 'none', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '8px 36px 8px 13px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500', outline: 'none' }}>
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={14} color="#64748B" style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          )}

          {!loading && displayed.length > 0 && (
            <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '14px', fontWeight: '500' }}>
              {displayed.length} announcement{displayed.length !== 1 ? 's' : ''}
              {displayed.filter((a) => a.pinned).length > 0 && ` · ${displayed.filter((a) => a.pinned).length} pinned`}
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px 24px' }}>
                  <div style={{ height: '16px', borderRadius: '6px', width: '55%', marginBottom: '10px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                  <div style={{ height: '13px', borderRadius: '6px', width: '85%', marginBottom: '6px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                  <div style={{ height: '13px', borderRadius: '6px', width: '65%', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
                </div>
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0', animation: 'fadeIn 0.3s ease' }}>
              <div style={{ width: '68px', height: '68px', borderRadius: '20px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <Megaphone size={30} color="#CBD5E1" />
              </div>
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '7px' }}>No announcements yet</div>
              <div style={{ fontSize: '13px', color: '#94A3B8', lineHeight: '1.65', maxWidth: '280px', margin: '0 auto 26px' }}>
                Keep parents and players in the loop. Post updates, reminders, and news here.
              </div>
              <button onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: primary, color: '#fff', fontWeight: '700', fontSize: '14px', padding: '11px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                  <div key={a.id} style={{ background: '#fff', borderRadius: '16px', border: `1px solid ${a.pinned ? primary + '35' : '#E2E8F0'}`, padding: '20px 22px', position: 'relative', animation: 'fadeIn 0.2s ease', transition: 'box-shadow 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
                    {a.pinned && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: primary, borderRadius: '16px 16px 0 0' }} />}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0, background: a.pinned ? `${primary}15` : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${a.pinned ? primary + '22' : '#F1F5F9'}`, marginTop: '1px' }}>
                        <Megaphone size={18} color={a.pinned ? primary : '#94A3B8'} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '7px' }}>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', lineHeight: '1.3' }}>{a.title}</span>
                            {a.pinned && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: '700', color: primary, background: `${primary}15`, borderRadius: '20px', padding: '2px 8px', letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}><Pin size={9} style={{ transform: 'rotate(45deg)' }} /> Pinned</span>}
                            {a.is_club_wide
                              ? <span style={{ fontSize: '11px', color: '#6366F1', background: '#EEF2FF', borderRadius: '20px', padding: '2px 9px', fontWeight: '600', flexShrink: 0 }}>Club-wide</span>
                              : teams.length > 1 && a.team_name && <span style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', borderRadius: '20px', padding: '2px 9px', fontWeight: '500', flexShrink: 0 }}>{a.team_name}</span>
                            }
                          </div>
                          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                            <button onClick={() => togglePin(a)} title={a.pinned ? 'Unpin' : 'Pin to top'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', display: 'flex' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                              <Pin size={14} color={a.pinned ? primary : '#CBD5E1'} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                            <button onClick={() => setDeleteConfirm({ id: a.id, title: a.title })} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '7px', display: 'flex' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                              <Trash2 size={14} color="#CBD5E1" />
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>{bodyPreview}</div>
                        {isLong && <button onClick={() => setExpandedId(isExpanded ? null : a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0', fontSize: '12px', fontWeight: '600', color: primary, fontFamily: 'inherit' }}>{isExpanded ? 'Show less' : 'Read more'}</button>}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                          <span title={formatFull(a.created_at)} style={{ fontSize: '12px', color: '#94A3B8', cursor: 'default' }}>{timeAgo(a.created_at)}</span>
                          <button onClick={() => handleEmailTeam(a)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: isEmailing ? `${primary}12` : '#F8FAFC', border: `1.5px solid ${isEmailing ? primary + '30' : '#E2E8F0'}`, borderRadius: '8px', padding: '5px 11px', fontSize: '12px', fontWeight: '600', color: isEmailing ? primary : '#64748B', cursor: isEmailing ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }} onMouseEnter={(e) => { if (!isEmailing) { (e.currentTarget as HTMLElement).style.background = `${primary}10`; (e.currentTarget as HTMLElement).style.borderColor = `${primary}30`; (e.currentTarget as HTMLElement).style.color = primary; } }} onMouseLeave={(e) => { if (!isEmailing) { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.color = '#64748B'; } }}>
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
        </>
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
  fontSize: '10px', fontWeight: '700', color: '#94A3B8',
  letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: '7px',
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s',
};
