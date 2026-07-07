'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Megaphone, Mail, Plus, X, Pin, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Announcement = { id: string; title: string; body: string; pinned: boolean; created_at: string };
type TeamMember   = { email: string; name: string };

export default function TeamContactPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { club, profile } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<'announcements'|'email'>('announcements');
  const [expandedId,    setExpandedId]    = useState<string|null>(null);

  // Announcement form
  const [showNew,   setShowNew]   = useState(false);
  const [annForm,   setAnnForm]   = useState({ title: '', body: '', pinned: false });
  const [annSaving, setAnnSaving] = useState(false);

  // Email form
  const [emailForm,   setEmailForm]   = useState({ subject: '', body: '' });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSent,   setEmailSent]   = useState(false);
  const [members,     setMembers]     = useState<TeamMember[]>([]);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const { data } = await supabase.from('announcements').select('id,title,body,pinned,created_at')
      .eq('team_id', teamId).order('pinned', { ascending: false }).order('created_at', { ascending: false });
    setAnnouncements((data ?? []) as Announcement[]);
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  async function saveAnnouncement() {
    if (!profile || !teamId) return;
    setAnnSaving(true);
    await supabase.from('announcements').insert({ team_id: teamId, title: annForm.title, body: annForm.body, pinned: annForm.pinned, created_by: profile.id });
    setShowNew(false);
    setAnnForm({ title: '', body: '', pinned: false });
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
      if (res.ok) { setEmailSent(true); setEmailForm({ subject: '', body: '' }); }
    } finally {
      setEmailSaving(false);
    }
  }

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ maxWidth: '720px' }}>

      {/* Tab switcher */}
      <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '3px', marginBottom: '20px', width: 'fit-content' }}>
        {[
          { key: 'announcements', icon: Megaphone, label: 'Announcements' },
          { key: 'email',         icon: Mail,      label: 'Email Team' },
        ].map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key as any)} style={{
            padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            background: tab === key ? '#fff' : 'transparent',
            color: tab === key ? '#0F172A' : '#64748B',
            boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            display: 'flex', alignItems: 'center', gap: '7px',
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Announcements */}
      {tab === 'announcements' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button onClick={() => setShowNew(true)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: primary, color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> New Announcement
            </button>
          </div>

          {loading ? (
            <>
              <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[1,2,3].map(i => <div key={i} style={{ height: '72px', borderRadius: '12px', background: 'linear-gradient(90deg,#F1F5F9 25%,#E8EFF5 50%,#F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease-in-out infinite' }} />)}
              </div>
            </>
          ) : announcements.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '56px 40px', textAlign: 'center' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Megaphone size={24} color="#94A3B8" />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No announcements yet</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Post one to notify all team parents and coaches.</div>
              <button onClick={() => setShowNew(true)} style={{ padding: '9px 22px', borderRadius: '9px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                New Announcement
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {announcements.map(ann => (
                <div key={ann.id} style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${ann.pinned ? `${primary}40` : '#E2E8F0'}`, overflow: 'hidden' }}>
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
                    <div style={{ padding: '0 18px 16px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
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
              <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>New Announcement</div>
                  <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94A3B8" /></button>
                </div>
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    Title *
                    <input value={annForm.title} onChange={e => setAnnForm(f => ({...f, title: e.target.value}))} placeholder="Announcement title" style={{ ...inputStyle, marginTop: '5px' }} />
                  </label>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    Message *
                    <textarea value={annForm.body} onChange={e => setAnnForm(f => ({...f, body: e.target.value}))} placeholder="Write your announcement…" rows={5} style={{ ...inputStyle, marginTop: '5px', resize: 'vertical', fontFamily: 'inherit' }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={annForm.pinned} onChange={e => setAnnForm(f => ({...f, pinned: e.target.checked}))} style={{ width: '15px', height: '15px' }} />
                    Pin to top
                  </label>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => setShowNew(false)} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveAnnouncement} disabled={annSaving || !annForm.title || !annForm.body}
                    style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: primary, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>
                    {annSaving ? 'Posting…' : 'Post Announcement'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Email Team */}
      {tab === 'email' && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>Send to all team parents & coaches</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>Sent via email — recipients see a professionally formatted message from your club.</div>
          </div>
          {emailSent ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>Email sent!</div>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Your message has been delivered to all team members.</div>
              <button onClick={() => setEmailSent(false)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151', cursor: 'pointer' }}>Send another</button>
            </div>
          ) : (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                Subject *
                <input value={emailForm.subject} onChange={e => setEmailForm(f => ({...f, subject: e.target.value}))} placeholder="e.g. Training cancelled this Thursday" style={{ ...inputStyle, marginTop: '5px' }} />
              </label>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                Message *
                <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({...f, body: e.target.value}))} placeholder="Write your message…" rows={7} style={{ ...inputStyle, marginTop: '5px', resize: 'vertical', fontFamily: 'inherit' }} />
              </label>
              <button onClick={sendTeamEmail} disabled={emailSaving || !emailForm.subject || !emailForm.body}
                style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', background: emailSaving ? '#94A3B8' : primary, fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Send size={15} /> {emailSaving ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
