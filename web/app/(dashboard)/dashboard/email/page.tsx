'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Mail, Sparkles, Send, ChevronDown, Users, Check, RefreshCw, Search, X, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';

type Recipient = { email: string; name: string; player_name: string | null; team_id: string; selected: boolean };
type Tone = 'professional' | 'friendly' | 'urgent' | 'encouraging';
type EmailLog = {
  id: string;
  subject: string;
  body: string;
  recipient_count: number;
  team_names: string[];
  sent_at: string;
};

const TONES: { value: Tone; label: string; desc: string; emoji: string }[] = [
  { value: 'friendly',     label: 'Friendly',     desc: 'Warm & conversational',   emoji: '😊' },
  { value: 'professional', label: 'Professional',  desc: 'Clear & formal',          emoji: '📋' },
  { value: 'urgent',       label: 'Urgent',        desc: 'Direct & time-sensitive', emoji: '⚡' },
  { value: 'encouraging',  label: 'Encouraging',   desc: 'Upbeat & motivating',     emoji: '💪' },
];

export default function EmailPage() {
  const { profile, club, teams } = useDashboard();
  const [teamScope, setTeamScope]       = useState<'all' | 'select'>('all');
  const [selectedTeams, setSelectedTeams] = useState<string[]>(() => teams.map((t) => t.id));
  const [teamSearch, setTeamSearch]     = useState('');
  const [recipients, setRecipients]     = useState<Recipient[]>([]);
  const [loadingRec, setLoadingRec]   = useState(false);
  const [tone, setTone]               = useState<Tone>('friendly');
  const [bullets, setBullets]         = useState('');
  const [subject, setSubject]         = useState('');
  const [body, setBody]               = useState('');
  const [writing, setWriting]         = useState(false);
  const [aiError, setAiError]         = useState('');
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);
  const [sendError, setSendError]     = useState('');
  const [pageTab, setPageTab]         = useState<'compose' | 'sent'>('compose');
  const [logs, setLogs]               = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showAI, setShowAI]           = useState(false);

  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const activeTeamIds = useMemo(
    () => teamScope === 'all' ? teams.map((t) => t.id) : selectedTeams,
    [teamScope, selectedTeams, teams]
  );
  // Deduplicate by email for the actual send (parent with kids on 2 teams gets one email)
  const selectedRec = useMemo(() => {
    const seen = new Set<string>();
    return recipients.filter((r) => {
      if (!r.selected || seen.has(r.email.toLowerCase())) return false;
      seen.add(r.email.toLowerCase());
      return true;
    });
  }, [recipients]);
  const selectedCount = useMemo(() => new Set(recipients.filter((r) => r.selected).map((r) => r.email.toLowerCase())).size, [recipients]);
  const totalCount    = useMemo(() => new Set(recipients.map((r) => r.email.toLowerCase())).size, [recipients]);
  const hasAI = subject || body;

  const loadRecipients = useCallback(async () => {
    if (!activeTeamIds.length) { setRecipients([]); return; }
    setLoadingRec(true);

    const { data: inviteData } = await supabase
      .from('invites')
      .select('email, team_id, players(full_name)')
      .in('team_id', activeTeamIds)
      .order('created_at');

    // One row per invite — same parent may appear under multiple teams if they have kids there
    const list: Recipient[] = (inviteData ?? [])
      .filter((inv) => !!inv.email)
      .map((inv) => ({
        email: inv.email as string,
        name: '',
        player_name: (inv.players as any)?.full_name ?? null,
        team_id: inv.team_id as string,
        selected: true,
      }));

    setRecipients(list);
    setLoadingRec(false);
  }, [activeTeamIds]);

  useEffect(() => { loadRecipients(); }, [loadRecipients]);

  const loadLogs = useCallback(async () => {
    if (!club?.id) return;
    setLogsLoading(true);
    const { data } = await supabase
      .from('email_logs')
      .select('id, subject, body, recipient_count, team_names, sent_at')
      .eq('club_id', club.id)
      .order('sent_at', { ascending: false })
      .limit(50);
    setLogs(data ?? []);
    setLogsLoading(false);
  }, [club?.id]);

  useEffect(() => { if (pageTab === 'sent') loadLogs(); }, [pageTab, loadLogs]);

  function toggleRecipient(email: string) {
    setRecipients((prev) => {
      const newVal = !prev.find((r) => r.email.toLowerCase() === email.toLowerCase())?.selected;
      return prev.map((r) => r.email.toLowerCase() === email.toLowerCase() ? { ...r, selected: newVal } : r);
    });
  }

  function selectAll(val: boolean) {
    setRecipients((prev) => prev.map((r) => ({ ...r, selected: val })));
  }

  async function handleWriteWithAI() {
    if (!bullets.trim()) return;
    setWriting(true);
    setSubject('');
    setBody('');

    const { data, error } = await supabase.functions.invoke('write-email', {
      body: {
        bullets: bullets.trim(),
        tone,
        team_name: teamScope === 'all' || selectedTeams.length !== 1
          ? (club?.name ?? '')
          : (teams.find((t) => t.id === selectedTeams[0])?.name ?? club?.name ?? ''),
        coach_name: profile?.full_name ?? 'Coach',
      },
    });

    setWriting(false);

    if (error || !data?.subject) {
      setAiError(data?.error ?? error?.message ?? 'AI failed to write the email. Try again.');
      return;
    }
    setAiError('');

    setSubject(data.subject);
    setBody(data.body);
  }

  async function handleSend() {
    if (!selectedRec.length || !subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError('');

    const { error } = await supabase.functions.invoke('send-team-email', {
      body: {
        to: selectedRec.map((r) => ({ email: r.email, name: r.name || r.player_name || '' })),
        cc: [],
        subject: subject.trim(),
        body: body.trim(),
        reply_to: null,
        from_name: profile?.full_name ?? 'Coach',
        team_name: teamScope === 'all' || selectedTeams.length !== 1
          ? (club?.name ?? '')
          : (teams.find((t) => t.id === selectedTeams[0])?.name ?? club?.name ?? ''),
        attachments: [],
        club_logo_url: club?.logo_url ?? null,
        club_name: club?.name ?? null,
        primary_color: club?.primary_color ?? null,
      },
    });

    setSending(false);

    if (error) {
      setSendError('Failed to send. Check your Resend config and try again.');
      return;
    }

    // Log the sent email
    const sentTeamNames = teamScope === 'all'
      ? teams.map((t) => t.name)
      : teams.filter((t) => selectedTeams.includes(t.id)).map((t) => t.name);
    await supabase.from('email_logs').insert({
      club_id: club?.id,
      sent_by: profile?.id,
      subject: subject.trim(),
      body: body.trim(),
      recipient_count: selectedRec.length,
      team_ids: activeTeamIds,
      team_names: sentTeamNames,
    });

    setSent(true);
    setTimeout(() => setSent(false), 4000);
    setBullets('');
    setSubject('');
    setBody('');
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: '1100px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', marginBottom: '2px' }}>Email Team</h1>
          <p style={{ fontSize: '12px', color: '#94A3B8' }}>Write a message to parents — use AI to draft it from bullet points</p>
        </div>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
          {([['compose', 'Compose'], ['sent', 'Sent']] as const).map(([v, lbl]) => (
            <button key={v} onClick={() => setPageTab(v)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: pageTab === v ? '700' : '500', background: pageTab === v ? '#fff' : 'transparent', color: pageTab === v ? '#0F172A' : '#64748B', boxShadow: pageTab === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', fontFamily: 'inherit' }}>
              {v === 'sent' && <Clock size={13} />} {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sent tab ── */}
      {pageTab === 'sent' && (
        <div style={{ maxWidth: '760px' }}>
          {logsLoading ? (
            <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ width: '28px', height: '28px', border: `2.5px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Loading sent emails…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 40px', background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Clock size={26} color="#CBD5E1" />
              </div>
              <div style={{ fontSize: '17px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No sent emails yet</div>
              <div style={{ fontSize: '13px', color: '#94A3B8', lineHeight: '1.6' }}>Emails you send will appear here for reference</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logs.map((log) => {
                const isExpanded = expandedLog === log.id;
                const sentDate = new Date(log.sent_at);
                return (
                  <div key={log.id} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}>
                    <div onClick={() => setExpandedLog(isExpanded ? null : log.id)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#FAFAFA'}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Mail size={16} color={primary} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.subject}</div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          {log.team_names?.join(', ') || 'All teams'} · {log.recipient_count} recipient{log.recipient_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', flexShrink: 0, textAlign: 'right' }}>
                        <div>{sentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div>{sentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                      </div>
                      <ChevronDown size={14} color="#94A3B8" style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 20px 20px', borderTop: '1px solid #F1F5F9' }}>
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', marginTop: '14px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#94A3B8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Message body</div>
                          <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{log.body}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {pageTab === 'compose' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>

        {/* ── Left: Compose ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Team scope picker */}
          {teams.length > 1 && (
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '20px' }}>
              <label style={labelSt}>Sending to</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: teamScope === 'select' ? '16px' : '0' }}>
                {([['all', `All teams (${teams.length})`], ['select', 'Specific teams']] as const).map(([v, lbl]) => (
                  <button key={v} onClick={() => { setTeamScope(v); if (v === 'all') setSelectedTeams(teams.map((t) => t.id)); }} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: `2px solid ${teamScope === v ? primary : '#E2E8F0'}`, background: teamScope === v ? `${primary}10` : '#F8FAFC', color: teamScope === v ? primary : '#64748B', fontWeight: teamScope === v ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {lbl}
                  </button>
                ))}
              </div>
              {teamScope === 'select' && (
                <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <Search size={13} color="#94A3B8" />
                    <input value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} placeholder="Search teams…" style={{ border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: '#0F172A', flex: 1, fontFamily: 'inherit' }} />
                    <button onClick={() => setSelectedTeams(teams.map((t) => t.id))} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>All</button>
                    <button onClick={() => setSelectedTeams([])} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>None</button>
                  </div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {teams.filter((t) => !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase())).map((t) => {
                      const sel = selectedTeams.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => setSelectedTeams((p) => sel ? p.filter((id) => id !== t.id) : [...p, t.id])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: sel ? `${primary}07` : 'none', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                          onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = sel ? `${primary}07` : 'none'; }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${sel ? primary : '#D1D5DB'}`, background: sel ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}>
                            {sel && <Check size={11} color="#fff" strokeWidth={3} />}
                          </div>
                          <span style={{ fontSize: '13px', color: '#374151', fontWeight: sel ? '600' : '400' }}>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Write with AI toggle */}
          <button
            onClick={() => setShowAI((v) => !v)}
            style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '7px', background: showAI ? `${primary}12` : '#F8FAFC', border: `1.5px solid ${showAI ? primary + '40' : '#E2E8F0'}`, borderRadius: '6px', padding: '9px 16px', color: showAI ? primary : '#64748B', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
          >
            <Sparkles size={14} />
            {showAI ? 'Hide AI tools' : 'Write with AI'}
          </button>

          {showAI && (
            <>
              {/* Tone */}
              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '20px', animation: 'fadeIn 0.15s ease' }}>
                <label style={labelSt}>Tone</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {TONES.map((t) => (
                    <button key={t.value} onClick={() => setTone(t.value)} style={{
                      padding: '10px 8px', borderRadius: '6px', border: `2px solid ${tone === t.value ? primary : '#E2E8F0'}`,
                      background: tone === t.value ? `${primary}10` : '#fff',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    }}>
                      <span style={{ fontSize: '18px' }}>{t.emoji}</span>
                      <span style={{ fontSize: '12px', fontWeight: tone === t.value ? '700' : '500', color: tone === t.value ? primary : '#374151' }}>{t.label}</span>
                      <span style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Compose */}
              <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', padding: '20px', animation: 'fadeIn 0.15s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <label style={{ ...labelSt, margin: 0 }}>What do you want to say?</label>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>Bullet points, notes, anything</span>
                </div>
                <textarea
                  value={bullets}
                  onChange={(e) => setBullets(e.target.value)}
                  placeholder={`e.g.\n- Training moved to Tuesday 6pm this week\n- Remember to bring shin pads\n- Great win on Saturday, well done everyone`}
                  rows={6}
                  style={{ ...inputSt, resize: 'vertical', lineHeight: '1.7', marginBottom: '12px' }}
                />
                <button
                  onClick={handleWriteWithAI}
                  disabled={writing || !bullets.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: writing || !bullets.trim() ? '#F1F5F9' : `${primary}15`,
                    border: `1.5px solid ${writing || !bullets.trim() ? '#E2E8F0' : `${primary}40`}`,
                    borderRadius: '6px', padding: '8px 16px',
                    color: writing || !bullets.trim() ? '#94A3B8' : primary,
                    fontWeight: '700', fontSize: '13px', cursor: writing || !bullets.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.15s',
                  }}
                >
                  {writing
                    ? <><RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Writing…</>
                    : <><Sparkles size={14} /> Write with AI</>}
                </button>
                {aiError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>
                    {aiError}
                  </div>
                )}
              </div>
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Subject + Body — shown after AI writes */}
          <div style={{ background: '#fff', borderRadius: '8px', border: `1px solid ${hasAI ? `${primary}30` : '#E2E8F0'}`, padding: '20px', transition: 'border-color 0.2s' }}>
            {hasAI && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '12px', color: primary, fontWeight: '600' }}>
                <Sparkles size={12} /> AI drafted — edit freely before sending
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelSt}>Subject line</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Training update — this Tuesday"
                style={inputSt}
              />
            </div>
            <div>
              <label style={labelSt}>Email body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Your message to parents…"
                rows={10}
                style={{ ...inputSt, resize: 'vertical', lineHeight: '1.75' }}
              />
            </div>
            <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px' }}>
              Your name ({profile?.full_name ?? 'Coach'}) and {club?.name ?? 'club'} branding are added automatically.
            </p>
          </div>

          {/* Error */}
          {sendError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#DC2626' }}>
              {sendError}
            </div>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim() || !selectedRec.length}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              background: sending || !subject.trim() || !body.trim() || !selectedRec.length
                ? '#CBD5E1' : sent ? '#22C55E' : primary,
              color: '#fff', fontWeight: '700', fontSize: '13px',
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              cursor: sending || !subject.trim() || !body.trim() || !selectedRec.length ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background 0.2s',
            }}
          >
            {sent
              ? <><Check size={16} /> Sent to {selectedRec.length} parent{selectedRec.length !== 1 ? 's' : ''}</>
              : sending
              ? 'Sending…'
              : <><Send size={15} /> Send to {selectedRec.length} parent{selectedRec.length !== 1 ? 's' : ''}</>}
          </button>
        </div>

        {/* ── Right: Recipients ── */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden', position: 'sticky', top: '24px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={15} color="#64748B" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Recipients</span>
              <span style={{ fontSize: '12px', color: '#94A3B8', background: '#F1F5F9', borderRadius: '20px', padding: '1px 8px' }}>
                {selectedCount}/{totalCount}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => selectAll(true)} style={ghostBtnSt}>All</button>
              <button onClick={() => selectAll(false)} style={ghostBtnSt}>None</button>
            </div>
          </div>

          <div style={{ maxHeight: '520px', overflow: 'auto' }}>
            {loadingRec ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ width: '24px', height: '24px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              </div>
            ) : recipients.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Mail size={22} color="#CBD5E1" />
                </div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>No parent emails yet</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '1.55' }}>Add players with parent emails via the Roster page</div>
              </div>
            ) : (
              activeTeamIds.map((tid) => {
                const team = teams.find((t) => t.id === tid);
                const teamRecs = recipients.filter((r) => r.team_id === tid);
                if (!teamRecs.length) return null;
                const teamSelectedCount = new Set(teamRecs.filter((r) => r.selected).map((r) => r.email.toLowerCase())).size;
                const teamTotalCount    = new Set(teamRecs.map((r) => r.email.toLowerCase())).size;
                const allSelected = teamSelectedCount === teamTotalCount;
                return (
                  <div key={tid}>
                    {/* Team header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px 5px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', borderTop: '1px solid #F1F5F9' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{team?.name ?? 'Team'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>{teamSelectedCount}/{teamTotalCount}</span>
                        <button
                          onClick={() => setRecipients((prev) => prev.map((r) => r.team_id === tid ? { ...r, selected: !allSelected } : r))}
                          style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '5px', padding: '1px 7px', fontSize: '10px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {allSelected ? 'None' : 'All'}
                        </button>
                      </div>
                    </div>
                    {/* Recipients for this team */}
                    {teamRecs.map((r) => (
                      <div
                        key={`${tid}-${r.email}`}
                        onClick={() => toggleRecipient(r.email)}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 18px', cursor: 'pointer', borderBottom: '1px solid #F8FAFC', background: r.selected ? `${primary}06` : '#fff', transition: 'background 0.1s' }}
                        onMouseEnter={(e) => { if (!r.selected) (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = r.selected ? `${primary}06` : '#fff'; }}
                      >
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, border: `2px solid ${r.selected ? primary : '#CBD5E1'}`, background: r.selected ? primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}>
                          {r.selected && <Check size={9} color="#fff" strokeWidth={3} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {r.player_name && <div style={{ fontSize: '11px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Parent of {r.player_name}</div>}
                          <div style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {recipients.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0 }}>
                Emails are sent individually — parents won't see each other's addresses.
              </p>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}

const labelSt: React.CSSProperties = {
  fontSize: '10px', fontWeight: '800', color: '#94A3B8',
  letterSpacing: '1.5px', textTransform: 'uppercase', display: 'block', marginBottom: '8px',
};

const inputSt: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1.5px solid #E2E8F0',
  borderRadius: '10px', padding: '10px 13px', fontSize: '14px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const ghostBtnSt: React.CSSProperties = {
  background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px',
  padding: '3px 10px', fontSize: '11px', fontWeight: '600', color: '#64748B',
  cursor: 'pointer', fontFamily: 'inherit',
};
