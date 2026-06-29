'use client';

import { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Plus, Printer, Search, X, Edit2, Trash2 } from 'lucide-react';

type Player = {
  id: string; first_name: string; last_name: string; dob: string | null;
  grade: string | null; gender: string | null; final_age_group: string | null;
  positions: string[] | null; email_primary: string | null;
};
type Ranking = { player_id: string; coach_rank: number | null; tryout_rank: number | null; tryout_status: string | null };
type Assignment = { player_id: string; team: string | null; status: string; offer_status: string };
type ClubT = { id: string; name: string } | null;

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Unassigned: { bg: '#F1F5F9', color: '#64748B' }, Offer: { bg: '#EFF6FF', color: '#2563EB' },
  Waitlist: { bg: '#FFF7ED', color: '#C2410C' }, Accepted: { bg: '#F0FDF4', color: '#16A34A' },
  Declined: { bg: '#FEF2F2', color: '#DC2626' }, Cut: { bg: '#F1F5F9', color: '#475569' },
};

export default function PlayerPoolPage() {
  const { club } = useDashboard();
  const [players, setPlayers]   = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Map<string, Ranking>>(new Map());
  const [assigns, setAssigns]   = useState<Map<string, Assignment>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [season, setSeason]     = useState(() => seasonOptions()[1] ?? '2026-27');
  const [activeAg, setActiveAg] = useState('All');
  const [gender, setGender]     = useState('All');
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [editP, setEditP]       = useState<Player | null>(null);
  const [delId, setDelId]       = useState<string | null>(null);
  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seasonYear = seasonLabelToYear(season);

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: rnk }, { data: asgn }] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,dob,grade,gender,final_age_group,positions,email_primary').eq('club_id', club.id).order('last_name'),
      supabase.from('tryout_rankings').select('*').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,team,status,offer_status').eq('club_id', club.id),
    ]);
    setPlayers((ps ?? []) as Player[]);
    setRankings(new Map(((rnk ?? []) as Ranking[]).map(r => [r.player_id, r])));
    setAssigns(new Map(((asgn ?? []) as Assignment[]).map(a => [a.player_id, a])));
    setLoading(false);
  }
  useEffect(() => { load(); }, [club]);

  const getAg = (p: Player) => p.final_age_group || (p.dob ? calcAgeGroup(p.dob, seasonYear) : 'Unknown');

  const agCounts = players.reduce((acc, p) => {
    const ag = getAg(p);
    if (!acc[ag]) acc[ag] = { Male: 0, Female: 0 };
    if (p.gender === 'Male') acc[ag].Male++; else if (p.gender === 'Female') acc[ag].Female++;
    return acc;
  }, {} as Record<string, { Male: number; Female: number }>);

  const tabs = ['All', ...AGE_GROUPS.filter(ag => agCounts[ag])];

  const filtered = players.filter(p => {
    if (activeAg !== 'All' && getAg(p) !== activeAg) return false;
    if (gender !== 'All' && p.gender !== gender) return false;
    if (search) { const q = search.toLowerCase(); if (!`${p.first_name} ${p.last_name}`.toLowerCase().includes(q) && !(p.email_primary ?? '').toLowerCase().includes(q)) return false; }
    return true;
  });

  function updateRank(pid: string, field: 'coach_rank' | 'tryout_rank', val: string) {
    const num = val === '' ? null : parseInt(val);
    setRankings(prev => { const next = new Map(prev); const ex = next.get(pid) ?? { player_id: pid, coach_rank: null, tryout_rank: null, tryout_status: null }; next.set(pid, { ...ex, [field]: num }); return next; });
    const key = `${pid}-${field}`; clearTimeout(debounce.current[key]);
    debounce.current[key] = setTimeout(async () => { if (!club) return; await supabase.from('tryout_rankings').upsert({ club_id: club.id, player_id: pid, [field]: num }, { onConflict: 'club_id,player_id' }); }, 700);
  }

  async function updateStatus(pid: string, status: string) {
    if (!club) return;
    setAssigns(prev => { const next = new Map(prev); const ex = next.get(pid) ?? { player_id: pid, team: null, status: 'Unassigned', offer_status: 'NotSent' }; next.set(pid, { ...ex, status }); return next; });
    await supabase.from('tryout_assignments').upsert({ club_id: club.id, player_id: pid, status }, { onConflict: 'club_id,player_id' });
  }

  function printForms() {
    const rows = filtered.map(p => `<tr><td>${p.first_name} ${p.last_name}</td><td>${p.dob ? new Date(p.dob+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td><td>${getAg(p)}</td><td>${p.grade ?? '—'}</td><td></td><td></td><td style="width:240px"></td></tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Eval Forms — ${season}</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h2{font-size:14px;margin-bottom:4px}p{font-size:11px;color:#666;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em}td{padding:7px 8px;border-bottom:1px solid #ddd}tr:nth-child(even)td{background:#f9f9f9}@media print{@page{size:A4 landscape;margin:15mm}}</style></head><body><h2>Tryout Evaluation — ${season}${activeAg !== 'All' ? ' · ' + activeAg : ''}${gender !== 'All' ? ' · ' + gender : ''}</h2><p>Coach: _________________________ &nbsp;&nbsp; Date: _________________</p><table><thead><tr><th>Player Name</th><th>DOB</th><th>Age Group</th><th>Grade</th><th>Pinnie #</th><th>Rank (1–100)</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    win.document.close(); win.print();
  }

  const rankInp: React.CSSProperties = { padding: '4px 6px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#0F172A', background: '#fff', outline: 'none', width: '58px', textAlign: 'center' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '20px 28px 0', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>Tryout Module · {season}</div>
            <h1 style={{ fontSize: '21px', fontWeight: '800', color: '#0F172A', margin: 0 }}>Player Pool</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '7px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', cursor: 'pointer' }}>
              {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={printForms} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 13px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151', fontWeight: '600' }}><Printer size={14} /> Print Forms</button>
            <button onClick={() => { setEditP(null); setShowAdd(true); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}><Plus size={14} /> Add Player</button>
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto' }}>
          {tabs.map(ag => {
            const cnt = ag === 'All' ? players.filter(p => gender === 'All' || p.gender === gender).length : (agCounts[ag] ? (gender === 'All' ? agCounts[ag].Male + agCounts[ag].Female : gender === 'Male' ? agCounts[ag].Male : agCounts[ag].Female) : 0);
            const active = activeAg === ag;
            return <button key={ag} onClick={() => setActiveAg(ag)} style={{ padding: '8px 16px', border: 'none', borderBottom: active ? '2px solid #22C55E' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '700' : '500', color: active ? '#22C55E' : '#64748B', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '7px' }}>
              {ag}<span style={{ fontSize: '11px', background: active ? '#DCFCE7' : '#F1F5F9', color: active ? '#16A34A' : '#94A3B8', borderRadius: '10px', padding: '1px 8px', fontWeight: '700' }}>{cnt}</span>
            </button>;
          })}
        </div>
      </div>

      <div style={{ padding: '8px 28px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" style={{ paddingLeft: '30px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', width: '210px' }} />
        </div>
        {(['All','Male','Female'] as const).map(g => <button key={g} onClick={() => setGender(g)} style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid', borderColor: gender === g ? '#22C55E' : '#E2E8F0', background: gender === g ? '#F0FDF4' : '#fff', fontSize: '12.5px', fontWeight: '600', color: gender === g ? '#16A34A' : '#64748B', cursor: 'pointer' }}>{g}</button>)}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#94A3B8' }}>{filtered.length} player{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>Loading…</div>
          : filtered.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>No players found.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0 }}>
                {['First','Last','DOB','Grade','Age Grp','Coach Rank','Tryout Rank','Team','Status','Email',''].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const ag = getAg(p); const r = rankings.get(p.id); const a = assigns.get(p.id);
                const status = a?.status ?? 'Unassigned'; const team = a?.team;
                const ss = STATUS_STYLES[status] ?? STATUS_STYLES.Unassigned;
                return <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap' }}>{p.first_name}</td>
                  <td style={{ padding: '8px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{p.last_name}</td>
                  <td style={{ padding: '8px 12px', color: '#64748B', fontSize: '12px', whiteSpace: 'nowrap' }}>{p.dob ? new Date(p.dob+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#374151' }}>{p.grade ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}><span style={{ fontSize: '11.5px', background: '#EFF6FF', color: '#2563EB', borderRadius: '5px', padding: '2px 8px', fontWeight: '700' }}>{ag}</span></td>
                  <td style={{ padding: '8px 12px' }}><input type="number" min={1} max={999} value={r?.coach_rank ?? ''} onChange={e => updateRank(p.id,'coach_rank',e.target.value)} placeholder="—" style={rankInp} /></td>
                  <td style={{ padding: '8px 12px' }}><input type="number" min={1} max={999} value={r?.tryout_rank ?? ''} onChange={e => updateRank(p.id,'tryout_rank',e.target.value)} placeholder="—" style={rankInp} /></td>
                  <td style={{ padding: '8px 12px' }}>{team && !['Unassigned','Cut','Declined',null].includes(team) ? <span style={{ fontWeight: '700', color: '#0F172A', fontSize: '12.5px' }}>{team}</span> : <span style={{ color: '#CBD5E1' }}>—</span>}</td>
                  <td style={{ padding: '8px 12px' }}><select value={status} onChange={e => updateStatus(p.id, e.target.value)} style={{ fontSize: '12px', fontWeight: '600', background: ss.bg, color: ss.color, border: `1px solid ${ss.color}40`, borderRadius: '6px', padding: '3px 7px', outline: 'none', cursor: 'pointer' }}>{Object.keys(STATUS_STYLES).map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                  <td style={{ padding: '8px 12px', color: '#64748B', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email_primary ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}><div style={{ display: 'flex', gap: '2px' }}><button onClick={() => { setEditP(p); setShowAdd(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#64748B' }}><Edit2 size={13} /></button><button onClick={() => setDelId(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: '#EF4444' }}><Trash2 size={13} /></button></div></td>
                </tr>;
              })}
            </tbody>
          </table>}
      </div>

      {showAdd && <PlayerModal club={club as ClubT} player={editP} seasonYear={seasonYear} season={season} onClose={() => { setShowAdd(false); setEditP(null); }} onSaved={load} />}

      {delId && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '8px' }}>Delete player?</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Removes them from the pool and all assignments.</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => setDelId(null)} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: '13.5px' }}>Cancel</button>
            <button onClick={async () => { await supabase.from('tryout_players').delete().eq('id', delId); setDelId(null); load(); }} style={{ padding: '9px 20px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13.5px' }}>Delete</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function PlayerModal({ club, player, season, seasonYear, onClose, onSaved }: { club: ClubT; player: Player | null; season: string; seasonYear: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ first_name: player?.first_name ?? '', last_name: player?.last_name ?? '', dob: player?.dob ?? '', grade: player?.grade ?? '', gender: player?.gender ?? 'Male', email_primary: player?.email_primary ?? '', positions: player?.positions?.join(', ') ?? '', final_age_group: player?.final_age_group ?? '' });
  const [saving, setSaving] = useState(false);
  const autoAg = form.dob ? calcAgeGroup(form.dob, seasonYear) : '';
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  async function save() {
    if (!form.first_name.trim() || !club) return; setSaving(true);
    const payload = { club_id: club.id, first_name: form.first_name.trim(), last_name: form.last_name.trim(), dob: form.dob || null, grade: form.grade || null, gender: form.gender, email_primary: form.email_primary || null, positions: form.positions ? form.positions.split(',').map(s => s.trim()).filter(Boolean) : [], final_age_group: form.final_age_group || autoAg || null };
    if (player) { await supabase.from('tryout_players').update(payload).eq('id', player.id); }
    else {
      const { data: ins } = await supabase.from('tryout_players').insert(payload).select('id').single();
      if (ins) await supabase.from('tryout_assignments').insert({ club_id: club.id, player_id: (ins as { id: string }).id, team: 'Unassigned', status: 'Unassigned', offer_status: 'NotSent' });
    }
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '520px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{player ? 'Edit Player' : 'Add Player'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>{lbl('First name *')}<input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} style={inp} /></div>
          <div>{lbl('Last name')}<input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} style={inp} /></div>
          <div>{lbl('Date of birth')}<input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value, final_age_group: '' }))} style={inp} /></div>
          <div>{lbl(`Age group${autoAg ? ` (auto: ${autoAg})` : ''}`)}<input value={form.final_age_group} onChange={e => setForm(f => ({ ...f, final_age_group: e.target.value }))} placeholder={autoAg || 'e.g. U10'} style={inp} /></div>
          <div>{lbl('Gender')}<select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={inp}><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div>{lbl('Grade')}<input value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="3rd" style={inp} /></div>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Email')}<input type="email" value={form.email_primary} onChange={e => setForm(f => ({ ...f, email_primary: e.target.value }))} style={inp} /></div>
          <div style={{ gridColumn: '1/-1' }}>{lbl('Positions (comma-separated)')}<input value={form.positions} onChange={e => setForm(f => ({ ...f, positions: e.target.value }))} placeholder="GK, CB, CM" style={inp} /></div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.first_name.trim()} style={{ padding: '9px 18px', borderRadius: '9px', background: '#22C55E', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
