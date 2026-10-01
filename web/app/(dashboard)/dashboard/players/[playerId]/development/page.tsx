'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ClipboardList, FileText, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { EvaluationReportPanel, type EvalRow } from '@/components/dashboard/evaluation/EvaluationReport';

type DevNote = {
  id: string;
  session_date: string;
  notes: string;
  coach_id: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

const card: React.CSSProperties = { background: '#fff', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px', marginBottom: '16px' };
const sectionTitle: React.CSSProperties = { fontSize: '11px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DevelopmentPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { profile, club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [teamId, setTeamId] = useState<string | null>(null);
  const [evals, setEvals] = useState<EvalRow[]>([]);
  const [evalsLoading, setEvalsLoading] = useState(true);
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);

  const [notes, setNotes] = useState<DevNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [composerDate, setComposerDate] = useState(todayISO());
  const [composerText, setComposerText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!playerId) return;

    const { data: playerRow } = await supabase.from('players').select('team_id').eq('id', playerId).single();
    if (playerRow) setTeamId(playerRow.team_id);

    setEvalsLoading(true);
    supabase.from('player_evaluations')
      .select('id,player_id,season_label,period_label,status,rating_technical,rating_tactical,rating_physical,rating_mental,report_data,final_text,published_at,created_at,players(full_name,jersey_number,photo_url)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEvals((data ?? []) as unknown as EvalRow[]); setEvalsLoading(false); });

    setNotesLoading(true);
    supabase.from('player_development_notes')
      .select('id,session_date,notes,coach_id,created_at,profiles(full_name)')
      .eq('player_id', playerId)
      .order('session_date', { ascending: false })
      .then(({ data }) => { setNotes((data ?? []) as unknown as DevNote[]); setNotesLoading(false); });
  }, [playerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() sets state from real network calls, not derivable at render time
  useEffect(() => { load(); }, [load]);

  async function addNote() {
    if (!composerText.trim() || !teamId || !profile) return;
    setSaving(true);
    const { data, error } = await supabase.from('player_development_notes')
      .insert({ player_id: playerId, team_id: teamId, coach_id: profile.id, session_date: composerDate, notes: composerText.trim() })
      .select('id,session_date,notes,coach_id,created_at,profiles(full_name)')
      .single();
    setSaving(false);
    if (error) { alert(`Could not save note: ${error.message}`); return; }
    setNotes((prev) => [data as unknown as DevNote, ...prev].sort((a, b) => b.session_date.localeCompare(a.session_date)));
    setComposerText(''); setComposerDate(todayISO()); setShowComposer(false);
  }

  async function deleteNote(note: DevNote) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeletingId(note.id);
    const { error } = await supabase.from('player_development_notes').delete().eq('id', note.id);
    setDeletingId(null);
    if (error) { alert(`Could not delete note: ${error.message}`); return; }
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  }

  const selectedIndex = evals.findIndex((e) => e.id === selectedEvalId);
  const selectedEval = selectedIndex >= 0 ? evals[selectedIndex] : null;

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={card}>
        <div style={sectionTitle}>Evaluations</div>
        {evalsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : evals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <FileText size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No evaluations yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {evals.map((ev) => {
              const statusStyle = ev.status === 'published'
                ? { color: '#16A34A', bg: '#F0FDF4', label: 'Published' }
                : ev.status === 'approved'
                ? { color: '#2563EB', bg: '#EFF6FF', label: 'Approved' }
                : ev.status === 'submitted'
                ? { color: '#D97706', bg: '#FFFBEB', label: 'Submitted' }
                : { color: '#64748B', bg: '#F8FAFC', label: 'Draft' };
              return (
                <button key={ev.id} onClick={() => setSelectedEvalId(ev.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>{ev.period_label} · {ev.season_label}</div>
                    {(ev.rating_technical || ev.rating_tactical || ev.rating_physical || ev.rating_mental) && (
                      <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                        T {ev.rating_technical ?? '—'} · Tac {ev.rating_tactical ?? '—'} · P {ev.rating_physical ?? '—'} · M {ev.rating_mental ?? '—'}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: '700', color: statusStyle.color, background: statusStyle.bg, borderRadius: '20px', padding: '3px 9px', flexShrink: 0 }}>{statusStyle.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ ...sectionTitle, marginBottom: 0 }}>Development Notes</div>
          {!showComposer && (
            <button onClick={() => setShowComposer(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: primary, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Add note
            </button>
          )}
        </div>

        {showComposer && (
          <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
            <input type="date" value={composerDate} onChange={(e) => setComposerDate(e.target.value)} style={{ ...inputStyle, width: '160px' }} />
            <textarea value={composerText} onChange={(e) => setComposerText(e.target.value)} rows={3} autoFocus
              placeholder="What did you notice this session?" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowComposer(false); setComposerText(''); setComposerDate(todayISO()); }}
                style={{ flex: 1, padding: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addNote} disabled={saving || !composerText.trim()}
                style={{ flex: 1, padding: '8px', background: primary, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || !composerText.trim()) ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        )}

        {notesLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <div style={{ width: '18px', height: '18px', border: `2px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <ClipboardList size={22} color="#CBD5E1" style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No session notes yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderLeft: `3px solid ${primary}`, paddingLeft: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: '600' }}>
                    {fmtDate(n.session_date)} · {n.profiles?.full_name ?? 'Coach'}
                  </div>
                  {n.coach_id === profile?.id && (
                    <button onClick={() => deleteNote(n)} disabled={deletingId === n.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', display: 'flex' }}>
                      <Trash2 size={13} color="#94A3B8" />
                    </button>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0F172A', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedEval && (
        <EvaluationReportPanel
          ev={selectedEval}
          primary={primary}
          clubLogoUrl={club?.logo_url ?? null}
          clubName={club?.name ?? ''}
          onClose={() => setSelectedEvalId(null)}
          onPrev={() => setSelectedEvalId(evals[selectedIndex - 1]?.id ?? selectedEvalId)}
          onNext={() => setSelectedEvalId(evals[selectedIndex + 1]?.id ?? selectedEvalId)}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < evals.length - 1}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
