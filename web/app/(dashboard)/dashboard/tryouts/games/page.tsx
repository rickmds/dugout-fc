'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

type Game = { id: string; season_label: string | null; age_group: string | null; gender: string | null; team: string | null; opponent_name: string | null; is_home_game: boolean; game_date: string | null; start_time: string | null; field_name: string | null; away_location: string | null; league: string | null; status: string; notes: string | null };

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  unscheduled: { bg: '#F1F5F9', color: '#64748B' },
  scheduled:   { bg: '#F0FDF4', color: '#16A34A' },
  rescheduled: { bg: '#FFF7ED', color: '#C2410C' },
  cancelled:   { bg: '#FEF2F2', color: '#DC2626' },
  completed:   { bg: '#F0FDF4', color: '#166534' },
};

const blank = (): Omit<Game,'id'> => ({ season_label: '', age_group: null, gender: null, team: '', opponent_name: '', is_home_game: true, game_date: '', start_time: null, field_name: '', away_location: '', league: '', status: 'unscheduled', notes: '' });

function HoverRow({ children, baseBackground, borderBottom }: { children: React.ReactNode; baseBackground: string; borderBottom: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{ borderBottom, background: hovered ? '#F8FAFC' : baseBackground, transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </tr>
  );
}

export default function TryoutGamesPage() {
  const { club } = useDashboard();

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    if (!club) return;
    const { data } = await supabase.from('tryout_games').select('*').eq('club_id', club.id).order('game_date', { ascending: true });
    setGames(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [club]);

  function openAdd() { setEditId(null); setForm(blank()); setShowModal(true); }
  function openEdit(g: Game) { setEditId(g.id); const { id: _, ...rest } = g; setForm(rest); setShowModal(true); }

  async function handleSave() {
    if (!form.game_date || !club) return;
    setSaving(true);
    const payload = { ...form, club_id: club.id };
    if (editId) { await supabase.from('tryout_games').update(payload).eq('id', editId); }
    else { await supabase.from('tryout_games').insert(payload); }
    setSaving(false);
    setShowModal(false);
    load();
  }

  const inputStyle: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Sticky page header */}
      <div style={{ padding: '20px 28px 16px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Season Management</div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0' }}>Games Schedule</h1>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
          <Plus size={15} /> Add Game
        </button>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#F8FAFC' }}>
        {loading ? (
          <div style={{ color: '#94A3B8' }}>Loading…</div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: '28px' }}>⚽</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No games yet</div>
            <div style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '24px', maxWidth: '280px', margin: '0 auto 24px' }}>Add your first game to start building the season schedule.</div>
            <button onClick={openAdd} style={{ padding: '10px 22px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }}>Add First Game</button>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Date','Team','Opponent','','Location','Status',''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#F8FAFC' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.map((g, i) => {
                  const badge = STATUS_COLORS[g.status] ?? STATUS_COLORS.unscheduled;
                  return (
                    <HoverRow key={g.id} baseBackground={i % 2 === 0 ? '#fff' : '#FAFAFA'} borderBottom={i < games.length - 1 ? '1px solid #F1F5F9' : 'none'}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#0F172A' }}>
                          {g.game_date ? new Date(g.game_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </div>
                        {g.start_time && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{g.start_time.slice(0,5)}</div>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{g.team ?? '—'}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>{[g.age_group, g.gender].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13.5px', fontWeight: '600', color: '#0F172A' }}>{g.opponent_name ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {g.is_home_game
                          ? <span style={{ display: 'inline-block', background: '#F0FDF4', color: '#16A34A', fontSize: '10.5px', fontWeight: '800', borderRadius: '20px', padding: '3px 10px', letterSpacing: '0.06em', border: '1px solid #BBF7D0' }}>HOME</span>
                          : <span style={{ display: 'inline-block', background: '#EFF6FF', color: '#2563EB', fontSize: '10.5px', fontWeight: '800', borderRadius: '20px', padding: '3px 10px', letterSpacing: '0.06em', border: '1px solid #BFDBFE' }}>AWAY</span>
                        }
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12.5px', color: '#64748B' }}>{g.is_home_game ? g.field_name : g.away_location}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11.5px', background: badge.bg, color: badge.color, borderRadius: '20px', padding: '4px 10px', fontWeight: '700', textTransform: 'capitalize' }}>{g.status}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => openEdit(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748B' }}><Edit2 size={13} /></button>
                          <button onClick={() => setDeleteId(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#EF4444' }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </HoverRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }} onClick={() => setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{editId ? 'Edit Game' : 'Add Game'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
            </div>
            <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>{lbl('Game date *')}<input type="date" value={form.game_date ?? ''} onChange={e => setForm(f => ({ ...f, game_date: e.target.value }))} style={inputStyle} /></div>
              <div>{lbl('Start time')}<input type="time" value={form.start_time ?? ''} onChange={e => setForm(f => ({ ...f, start_time: e.target.value || null }))} style={inputStyle} /></div>
              <div>{lbl('Team')}<input value={form.team ?? ''} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} style={inputStyle} /></div>
              <div>{lbl('Opponent')}<input value={form.opponent_name ?? ''} onChange={e => setForm(f => ({ ...f, opponent_name: e.target.value }))} style={inputStyle} /></div>
              <div>{lbl('Age group')}<input value={form.age_group ?? ''} onChange={e => setForm(f => ({ ...f, age_group: e.target.value || null }))} placeholder="U10" style={inputStyle} /></div>
              <div>{lbl('League')}<input value={form.league ?? ''} onChange={e => setForm(f => ({ ...f, league: e.target.value }))} style={inputStyle} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', color: '#374151' }}>
                  <input type="checkbox" checked={form.is_home_game} onChange={e => setForm(f => ({ ...f, is_home_game: e.target.checked }))} /> Home game
                </label>
              </div>
              {form.is_home_game ? (
                <div style={{ gridColumn: '1/-1' }}>{lbl('Field')}<input value={form.field_name ?? ''} onChange={e => setForm(f => ({ ...f, field_name: e.target.value }))} style={inputStyle} /></div>
              ) : (
                <div style={{ gridColumn: '1/-1' }}>{lbl('Away location')}<input value={form.away_location ?? ''} onChange={e => setForm(f => ({ ...f, away_location: e.target.value }))} style={inputStyle} /></div>
              )}
              <div>
                {lbl('Status')}
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                  {['unscheduled','scheduled','rescheduled','cancelled','completed'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>{lbl('Notes')}<textarea value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '16px' }}>Delete this game?</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: '13.5px' }}>Cancel</button>
              <button onClick={async () => { await supabase.from('tryout_games').delete().eq('id', deleteId); setDeleteId(null); load(); }} style={{ padding: '9px 20px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13.5px' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
