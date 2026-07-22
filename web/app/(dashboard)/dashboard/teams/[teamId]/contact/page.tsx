'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Megaphone, Mail, Plus, X, Pin, Send, ChevronDown, ChevronUp, Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Announcement = { id: string; title: string; body: string; pinned: boolean; created_at: string };
type Tone = 'friendly' | 'professional' | 'urgent' | 'encouraging';

const TONES: { value: Tone; label: string }[] = [
  { value: 'friendly',     label: '😊 Friendly' },
  { value: 'professional', label: '💼 Professional' },
  { value: 'urgent',       label: '🚨 Urgent' },
  { value: 'encouraging',  label: '💪 Encouraging' },
];

export default function TeamContactPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { club, profile } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<'announcements' | 'email'>('announcements');
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [teamName,      setTeamName]      = useState('the team');

  // Announcement form
  const [showNew,    setShowNew]    = useState(false);
  const [annForm,    setAnnForm]    = useState({ title: '', body: '', pinned: false });
  const [annSaving,  setAnnSaving]  = useState(false);
  // Announcement AI
  const [annShowAI,  setAnnShowAI]  = useState(false);
  const [annBullets, setAnnBullets] = useState('');
  const [annTone,    setAnnTone]    = useState<Tone>('friendly');
  const [annWriting, setAnnWriting] = useState(false);
  const [annAiError, setAnnAiError] = useState('');
  const [annAiDone,  setAnnAiDone]  = useState(false);

  // Email form
  const [emailForm,   setEmailForm]   = useState({ subject: '', body: '' });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSent,   setEmailSent]   = useState(false);
  // Email AI
  const [emailShowAI,  setEmailShowAI]  = useState(false);
  const [emailBullets, setEmailBullets] = useState('');
  const [emailTone,    setEmailTone]    = useState<Tone>('friendly');
  const [emailWriting, setEmailWriting] = useState(false);
  const [emailAiError, setEmailAiError] = useState('');
  const [emailAiDone,  setEmailAiDone]  = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const [{ data: anns }, { data: team }] = await Promise.all([
      supabase.from('announcements').select('id,title,body,pinned,created_at')
        .eq('team_id', teamId).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('teams').select('name').eq('id', teamId).single(),
    ]);
    setAnnouncements((anns ?? []) as Announcement[]);
    if (team?.name) setTeamName(team.name);
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  async function saveAnnouncement() {
    if (!profile || !teamId) return;
    setAnnSaving(true);
    await supabase.from('announcements').insert({ team_id: teamId, title: annForm.title, body: annForm.body, pinned: annForm.pinned, created_by: profile.id });
    setShowNew(false);
    setAnnForm({ title: '', body: '', pinned: false });
    setAnnBullets(''); setAnnAiDone(false); setAnnShowAI(false);
    setAnnSaving(false);
    load();
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm('Delete this announcement?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    load();
  }

  async function togglePin(ann: Announcement) {
    await supabase.from('announcements').update({ pinned: !ann.pinned }).eq('id', ann.id);
    load();
  }

  async function draftAnnouncement() {
    if (!annBullets.trim()) return;
    setAnnWriting(true); setAnnAiError('');
    const { data, error } = await supabase.functions.invoke('write-email', {
      body: { bullets: annBullets.trim(), tone: annTone, team_name: teamName, coach_name: profile?.full_name ?? 'Coach' },
    });
    setAnnWriting(false);
    if (error || !data?.subject) { setAnnAiError(data?.error ?? 'AI failed. Try again.'); return; }
    setAnnForm(f => ({ ...f, title: data.subject, body: data.body }));
    setAnnAiDone(true);
  }

  async function sendTeamEmail() {
    if (!club || !teamId) return;
    setEmailSaving(true);
    try {
      const res = await fetch('/api/send-team-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          subject: emailForm.subject,
          body: emailForm.body,
          from_name: profile?.full_name ?? club.name,
          club_name: club.name,
          club_logo_url: club.logo_url,
          primary_color: club.primary_color,
        }),
      });
      if (res.ok) { setEmailSent(true); setEmailForm({ subject: '', body: '' }); setEmailBullets(''); setEmailAiDone(false); setEmailShowAI(false); }
    } finally {
      setEmailSaving(false);
    }
  }

  async function draftEmail() {
    if (!emailBullets.trim()) return;
    setEmailWriting(true); setEmailAiError('');
    const { data, error } = await supabase.functions.invoke('write-email', {
      body: { bullets: emailBullets.trim(), tone: emailTone, team_name: teamName, coach_name: profile?.full_name ?? 'Coach' },
    });
    setEmailWriting(false);
    if (error || !data?.subject) { setEmailAiError(data?.error ?? 'AI failed. Try again.'); return; }
    setEmailForm({ subject: data.subject, body: data.body });
    setEmailAiDone(true);
  }

  const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' };

  function AIPanel({ bullets, setBullets, tone, setTone, writing, onDraft, error, done }: {
    bullets: string; setBullets: (v: string) => void;
    tone: Tone; setTone: (v: Tone) => void;
    writing: boolean; onDraft: () => void; error: string; done: boolean;
  }) {
    return (
      <div style={{ background: `${primary}06`, border: `1.5px solid ${primary}20`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: primary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={12} /> AI Draft
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelSt}>Key points (bullet list)</label>
          <textarea
            value={bullets} onChange={e => setBullets(e.target.value)}
            placeholder={'- Training cancelled Thursday\n- Moved to Saturday 10am\n- Bring red kit'}
            rows={4}
            style={{ ...inputSt, resize: 'vertical', lineHeight: 1.6, background: '#fff' }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelSt}>Tone</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {TONES.map(t => (
              <button key={t.value} onClick={() => setTone(t.value)}
                style={{ padding: '6px 12px', borderRadius: '20px', border: `1.5px solid ${tone === t.value ? primary : '#E2E8F0'}`, background: tone === t.value ? `${primary}12` : '#fff', color: tone === t.value ? primary : '#64748B', fontWeight: tone === t.value ? '700' : '500', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p style={{ fontSize: '12px', color: '#EF4444', margin: '0 0 10px' }}>{error}</p>}
        <button onClick={onDraft} disabled={writing || !bullets.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: writing || !bullets.trim() ? '#E2E8F0' : primary, color: writing || !bullets.trim() ? '#94A3B8' : '#fff', fontWeight: '700', fontSize: '13px', cursor: writing || !bullets.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {writing
            ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Writing…</>
            : <><Sparkles size={13} /> Draft with AI</>}
        </button>
        {done && <p style={{ fontSize: '11px', color: primary, marginTop: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}><Sparkles size={11} /> AI drafted — edit freely before sending</p>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px' }}>

      {/* Tab switcher */}
      <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', marginBottom: '20px', width: 'fit-content' }}>
        {([
          { key: 'announcements', icon: Megaphone, label: 'Announcements' },
          { key: 'email',         icon: Mail,      label: 'Email Team' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            background: tab === key ? '#fff' : 'transparent',
            color: tab === key ? '#0F172A' : '#64748B',
            boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'inherit',
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Announcements ── */}
      {tab === 'announcements' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button onClick={() => setShowNew(true)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
              <Plus size={14} /> New Announcement
            </button>
          </div>

          {loading ? (
            <>
              <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[1,2,3].map(i => <div key={i} style={{ height: '72px', borderRadius: '8px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />)}
              </div>
            </>
          ) : announcements.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '56px 40px', textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Megaphone size={24} color="#94A3B8" />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No announcements yet</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Post one to notify all team parents and coaches.</div>
              <button onClick={() => setShowNew(true)} style={{ padding: '9px 22px', borderRadius: '6px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                New Announcement
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {announcements.map(ann => (
                <div key={ann.id} style={{ background: '#fff', borderRadius: '8px', border: `1px solid ${ann.pinned ? `${primary}40` : '#E2E8F0'}`, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === ann.id ? null : ann.id)}>
                    {ann.pinned && <div style={{ background: `${primary}20`, color: primary, fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '5px', flexShrink: 0, marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pinned</div>}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{ann.title}</div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); togglePin(ann); }} title={ann.pinned ? 'Unpin' : 'Pin'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}>
                        <Pin size={13} color={ann.pinned ? primary : '#CBD5E1'} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteAnnouncement(ann.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}>
                        <X size={13} color="#CBD5E1" />
                      </button>
                      {expandedId === ann.id ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                    </div>
                  </div>
                  {expandedId === ann.id && (
                    <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #F1F5F9' }}>
                      <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{ann.body}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New announcement modal */}
          {showNew && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
              <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>New Announcement</div>
                  <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94A3B8" /></button>
                </div>
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1 }}>

                  {/* AI toggle */}
                  <button onClick={() => setAnnShowAI(v => !v)}
                    style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '7px', background: annShowAI ? `${primary}12` : '#F8FAFC', border: `1.5px solid ${annShowAI ? primary + '40' : '#E2E8F0'}`, borderRadius: '6px', padding: '7px 14px', color: annShowAI ? primary : '#64748B', fontWeight: '700', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Sparkles size={13} /> {annShowAI ? 'Hide AI' : 'Write with AI'}
                  </button>

                  {annShowAI && (
                    <AIPanel
                      bullets={annBullets} setBullets={setAnnBullets}
                      tone={annTone} setTone={setAnnTone}
                      writing={annWriting} onDraft={draftAnnouncement}
                      error={annAiError} done={annAiDone}
                    />
                  )}

                  <div>
                    <label style={labelSt}>Title *</label>
                    <input value={annForm.title} onChange={e => setAnnForm(f => ({...f, title: e.target.value}))} placeholder="Announcement title" style={inputSt} />
                  </div>
                  <div>
                    <label style={labelSt}>Message *</label>
                    <textarea value={annForm.body} onChange={e => setAnnForm(f => ({...f, body: e.target.value}))} placeholder="Write your announcement…" rows={6} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.6 }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(f => ({...f, pinned: e.target.checked}))} style={{ width: '15px', height: '15px' }} />
                    Pin to top
                  </label>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                  <button onClick={() => setShowNew(false)} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={saveAnnouncement} disabled={annSaving || !annForm.title || !annForm.body}
                    style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: annSaving || !annForm.title || !annForm.body ? '#E2E8F0' : primary, fontSize: '13px', fontWeight: '700', color: annSaving || !annForm.title || !annForm.body ? '#94A3B8' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {annSaving ? 'Posting…' : 'Post Announcement'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Email Team ── */}
      {tab === 'email' && (
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>Send to all team parents &amp; coaches</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>Sent via email — recipients see a professionally formatted message from your club.</div>
          </div>
          {emailSent ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Email sent!</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Your message has been delivered to all team members.</div>
              <button onClick={() => setEmailSent(false)} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Send another</button>
            </div>
          ) : (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* AI toggle */}
              <button onClick={() => setEmailShowAI(v => !v)}
                style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '7px', background: emailShowAI ? `${primary}12` : '#F8FAFC', border: `1.5px solid ${emailShowAI ? primary + '40' : '#E2E8F0'}`, borderRadius: '6px', padding: '7px 14px', color: emailShowAI ? primary : '#64748B', fontWeight: '700', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Sparkles size={13} /> {emailShowAI ? 'Hide AI' : 'Write with AI'}
              </button>

              {emailShowAI && (
                <AIPanel
                  bullets={emailBullets} setBullets={setEmailBullets}
                  tone={emailTone} setTone={setEmailTone}
                  writing={emailWriting} onDraft={draftEmail}
                  error={emailAiError} done={emailAiDone}
                />
              )}

              <div>
                <label style={labelSt}>Subject *</label>
                <input value={emailForm.subject} onChange={e => setEmailForm(f => ({...f, subject: e.target.value}))} placeholder="e.g. Training cancelled this Thursday" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Message *</label>
                <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({...f, body: e.target.value}))} placeholder="Write your message…" rows={8} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
              <button onClick={sendTeamEmail} disabled={emailSaving || !emailForm.subject || !emailForm.body}
                style={{ padding: '11px 24px', borderRadius: '6px', border: 'none', background: emailSaving || !emailForm.subject || !emailForm.body ? '#E2E8F0' : primary, fontSize: '14px', fontWeight: '700', color: emailSaving || !emailForm.subject || !emailForm.body ? '#94A3B8' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit' }}>
                <Send size={15} /> {emailSaving ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
