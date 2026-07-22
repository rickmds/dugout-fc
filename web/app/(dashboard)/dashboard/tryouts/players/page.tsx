'use client';

import { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { calcAgeGroup, seasonLabelToYear, seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Plus, Printer, Search, X, Edit2, Trash2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

type Player = {
  id: string; first_name: string; last_name: string; date_of_birth: string | null;
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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printGroups, setPrintGroups]       = useState<Set<string>>(new Set());
  const [printExcludeNTR, setPrintExcludeNTR] = useState(true);
  const [clubPlayerNames, setClubPlayerNames] = useState<Set<string>>(new Set());
  const debounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seasonYear = seasonLabelToYear(season);

  // Import rankings state
  const [showImport, setShowImport]       = useState(false);
  const [importText, setImportText]       = useState('');
  const [importRows, setImportRows]       = useState<{ raw: string; name: string; value: number | null; player: Player | null }[]>([]);
  const [importParsed, setImportParsed]   = useState(false);
  const [importing, setImporting]         = useState(false);

  function matchPlayer(inputName: string): Player | null {
    const norm = (s: string) => s.toLowerCase().trim().replace(/[,\.]/g, ' ').replace(/\s+/g, ' ');
    const n = norm(inputName);
    for (const p of players) {
      const fl = norm(`${p.first_name} ${p.last_name}`);
      const lf = norm(`${p.last_name} ${p.first_name}`);
      if (fl === n || lf === n) return p;
    }
    for (const p of players) {
      const fn = norm(p.first_name); const ln = norm(p.last_name);
      if (fn.length > 1 && ln.length > 1 && n.includes(fn) && n.includes(ln)) return p;
    }
    return null;
  }

  function parseImport() {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    const rows = lines.map((line, i) => {
      // Strip leading numbers like "1." or "1)"
      const stripped = line.replace(/^\d+[\.\)]\s*/, '');
      // Try to split on comma or tab
      const parts = stripped.split(/[,\t]/).map(p => p.trim());
      let name = parts[0]; let value: number | null = null;
      if (parts.length >= 2) { const v = parseFloat(parts[parts.length - 1]); if (!isNaN(v)) value = v; }
      return { raw: line, name, value, player: matchPlayer(name) };
    });
    setImportRows(rows);
    setImportParsed(true);
  }

  async function commitImport() {
    if (!club) return;
    setImporting(true);
    const matched = importRows.filter(r => r.player);
    // Sort by value desc (highest = rank 1), or by row order if no values
    const hasValues = matched.some(r => r.value !== null);
    const sorted = hasValues
      ? [...matched].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      : matched;
    const upserts = sorted.map((r, i) => ({
      club_id: club.id,
      player_id: r.player!.id,
      tryout_rank: i + 1,
    }));
    for (let i = 0; i < upserts.length; i += 50) {
      await supabase.from('tryout_rankings').upsert(upserts.slice(i, i + 50), { onConflict: 'club_id,player_id' });
    }
    setImporting(false);
    setShowImport(false);
    setImportText(''); setImportRows([]); setImportParsed(false);
    load();
  }

  async function load() {
    if (!club) return;
    const [{ data: ps }, { data: rnk }, { data: asgn }, { data: clubTeams }] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,date_of_birth,grade,gender,final_age_group,positions,email_primary').eq('club_id', club.id).order('last_name'),
      supabase.from('tryout_rankings').select('*').eq('club_id', club.id),
      supabase.from('tryout_assignments').select('player_id,team,status,offer_status').eq('club_id', club.id),
      supabase.from('teams').select('id').eq('club_id', club.id),
    ]);
    setPlayers((ps ?? []) as Player[]);
    setRankings(new Map(((rnk ?? []) as Ranking[]).map(r => [r.player_id, r])));
    setAssigns(new Map(((asgn ?? []) as Assignment[]).map(a => [a.player_id, a])));
    // Load current club roster names for "returning player" indicator
    const teamIds = ((clubTeams ?? []) as { id: string }[]).map(t => t.id);
    if (teamIds.length > 0) {
      const { data: clubPs } = await supabase.from('players').select('full_name').in('team_id', teamIds);
      setClubPlayerNames(new Set(((clubPs ?? []) as { full_name: string }[]).map(p => p.full_name.toLowerCase().trim())));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [club]);

  const getAg = (p: Player) => p.final_age_group || (p.date_of_birth ? calcAgeGroup(p.date_of_birth, seasonYear) : 'Unknown');

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

  // Build list of (age_group, gender) combos that have players
  const groupKey = (ag: string, g: string) => `${ag}||${g}`;
  const availableGroups: { key: string; ag: string; gender: string; count: number }[] = [];
  const GENDERS = ['Female', 'Male'];
  for (const ag of AGE_GROUPS) {
    for (const g of GENDERS) {
      const count = players.filter(p => {
        if (getAg(p) !== ag || p.gender !== g) return false;
        if (printExcludeNTR && rankings.get(p.id)?.tryout_status === 'NTR') return false;
        return true;
      }).length;
      if (count > 0) availableGroups.push({ key: groupKey(ag, g), ag, gender: g, count });
    }
  }

  function openPrintModal() {
    // Pre-select all groups
    setPrintGroups(new Set(availableGroups.map(g => g.key)));
    setShowPrintModal(true);
  }

  function toggleGroup(key: string) {
    setPrintGroups(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  function generateAndPrint() {
    const clubName = club?.name ?? 'Club';
    const fmtDob = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const norm = (s: string) => s.toLowerCase().trim();

    const selectedGroups = availableGroups.filter(g => printGroups.has(g.key));
    const totalPages = selectedGroups.length;

    const pages = selectedGroups.map(({ ag, gender: gdr }, pageIdx) => {
      const groupPlayers = players
        .filter(p => getAg(p) === ag && p.gender === gdr && !(printExcludeNTR && rankings.get(p.id)?.tryout_status === 'NTR'))
        .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

      const genderLabel = gdr === 'Female' ? 'Girls' : 'Boys';
      const rows = groupPlayers.map((p, i) => {
        const fullName = norm(`${p.first_name} ${p.last_name}`);
        const isReturning = clubPlayerNames.has(fullName);
        const pos = p.positions?.length ? p.positions.slice(0, 3).join(', ') : '';
        return `<tr>
          <td class="col-num">${i + 1}</td>
          <td class="col-name">
            <div>${p.last_name}, ${p.first_name}${isReturning ? ' <span class="returning-badge">Returning</span>' : ''}</div>
            ${pos ? `<div class="player-pos">${pos}</div>` : ''}
          </td>
          <td class="col-dob">${fmtDob(p.date_of_birth)}</td>
          <td class="col-grade">${p.grade ?? '—'}</td>
          <td class="col-pinnie"><span class="write-box" style="width:38px"></span></td>
          <td class="col-score"><span class="write-box"></span></td>
          <td class="col-notes"></td>
        </tr>`;
      }).join('');

      return `<div class="page" ${pageIdx === 0 ? '' : 'style="page-break-before:always"'}>
        <div class="page-header">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <div class="club-eyebrow">${clubName.toUpperCase()}</div>
              <div class="form-title">Tryout Evaluation <span class="season-label">${season}</span></div>
              <div class="age-line">
                <span class="age-badge">${ag} ${genderLabel}</span>
                <span class="player-count">${groupPlayers.length} player${groupPlayers.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div class="page-num">Form ${pageIdx + 1} of ${totalPages}</div>
          </div>
          <div class="meta-grid">
            <div class="meta-field"><div class="meta-label">Coach</div><div class="meta-line"></div></div>
            <div class="meta-field"><div class="meta-label">Date</div><div class="meta-line"></div></div>
            <div class="meta-field"><div class="meta-label">Session</div><div class="meta-line"></div></div>
            <div class="meta-field"><div class="meta-label">Field / Location</div><div class="meta-line"></div></div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-name">Player Name / Position</th>
              <th class="col-dob">DOB</th>
              <th class="col-grade">Grade</th>
              <th class="col-pinnie">Pinnie</th>
              <th class="col-score">Score (1–100)</th>
              <th class="col-notes">Notes / Comments</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">
          <span>${clubName} · ${season} · ${ag} ${genderLabel}</span>
          <span>Confidential — coaching staff only</span>
        </div>
      </div>`;
    }).join('');

    const css = `
      @page { size: letter portrait; margin: 0.5in 0.6in; }
      * { box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10.5px; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
      .club-eyebrow { font-size: 9px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 3px; }
      .form-title { font-size: 22px; font-weight: 900; color: #0F172A; letter-spacing: -0.5px; margin: 0 0 6px; line-height: 1.1; }
      .season-label { font-size: 16px; font-weight: 500; color: #64748B; }
      .age-line { display: flex; align-items: center; gap: 10px; margin-bottom: 0; }
      .age-badge { background: #0F172A; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 5px; letter-spacing: 0.03em; }
      .player-count { font-size: 11px; color: #64748B; font-weight: 600; }
      .page-num { font-size: 10px; color: #94A3B8; font-weight: 600; text-align: right; white-space: nowrap; padding-top: 4px; }
      .page-header { border-bottom: 2.5px solid #0F172A; padding-bottom: 12px; margin-bottom: 12px; }
      .meta-grid { display: grid; grid-template-columns: 1.8fr 1fr 0.65fr 1fr; gap: 8px 20px; }
      .meta-field { display: flex; flex-direction: column; gap: 4px; }
      .meta-label { font-size: 8px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.1em; }
      .meta-line { border-bottom: 1.5px solid #64748B; height: 22px; width: 100%; }
      table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
      thead { display: table-header-group; }
      thead tr { background: #0F172A; }
      th { padding: 8px 8px; text-align: left; font-size: 8.5px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; overflow: hidden; }
      td { padding: 13px 8px; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
      tr:nth-child(even) td { background: #F8FAFC; }
      tr:nth-child(odd) td { background: #fff; }
      .col-num { width: 24px; color: #94A3B8; font-size: 9.5px; text-align: center; }
      .col-name { width: 22%; font-weight: 700; color: #0F172A; font-size: 11px; }
      .player-pos { font-size: 8.5px; color: #64748B; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
      .col-dob { width: 76px; color: #374151; white-space: nowrap; font-size: 10px; }
      .col-grade { width: 42px; text-align: center; }
      .col-pinnie { width: 52px; text-align: center; }
      .col-score { width: 82px; text-align: center; }
      .write-box { border: 1.5px solid #94A3B8; border-radius: 3px; display: inline-block; width: 56px; height: 28px; }
      .col-notes { }
      .returning-badge { display: inline-block; background: #EFF6FF; color: #1D4ED8; font-size: 7.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 5px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #BFDBFE; }
      .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 8px; color: #94A3B8; font-weight: 600; }
    `;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Eval Forms — ${season}</title><style>${css}</style></head><body>${pages}</body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
    setShowPrintModal(false);
  }

  const rankInp: React.CSSProperties = { padding: '4px 6px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#0F172A', background: '#fff', outline: 'none', width: '58px', textAlign: 'center' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '20px 28px 0', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Tryout Module · {season}</div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>Player Pool</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={season} onChange={e => setSeason(e.target.value)} style={{ padding: '7px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', cursor: 'pointer' }}>
              {seasonOptions().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={openPrintModal} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 13px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151', fontWeight: '600' }}><Printer size={14} /> Print Forms</button>
            <button onClick={() => { setShowImport(true); setImportParsed(false); setImportText(''); setImportRows([]); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 13px', borderRadius: '8px', border: '1px solid #6366F1', background: '#EEF2FF', fontSize: '13px', cursor: 'pointer', color: '#4338CA', fontWeight: '700' }}><Upload size={14} /> Import Rankings</button>
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" style={{ paddingLeft: '30px', paddingRight: '10px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', width: '240px' }} />
        </div>
        {(['All','Male','Female'] as const).map(g => <button key={g} onClick={() => setGender(g)} style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid', borderColor: gender === g ? '#22C55E' : '#E2E8F0', background: gender === g ? '#F0FDF4' : '#fff', fontSize: '12.5px', fontWeight: '600', color: gender === g ? '#16A34A' : '#64748B', cursor: 'pointer' }}>{g}</button>)}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#94A3B8' }}>{filtered.length} player{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: '64px', textAlign: 'center', color: '#94A3B8', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <div style={{ width: '18px', height: '18px', border: '2px solid #E2E8F0', borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Loading…
          </div>
        )
          : filtered.length === 0 ? (
            <div style={{ padding: '80px 48px', textAlign: 'center' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Search size={22} color="#94A3B8" />
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>No players found</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>{search ? `No results for "${search}"` : 'Try adjusting your filters or add a player.'}</div>
            </div>
          )
          : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#0F172A', position: 'sticky', top: 0, zIndex: 2, boxShadow: 'none' }}>
                {['First','Last','DOB','Grade','Age Grp','Coach Rank','Tryout Rank','Team','Status','Email',''].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: '1.5px', textTransform: 'uppercase', whiteSpace: 'nowrap', background: '#0F172A' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const ag = getAg(p); const r = rankings.get(p.id); const a = assigns.get(p.id);
                const status = a?.status ?? 'Unassigned'; const team = a?.team;
                const ss = STATUS_STYLES[status] ?? STATUS_STYLES.Unassigned;
                const base = i % 2 === 0 ? '#fff' : '#FAFAFA';
                return <tr key={p.id}
                  style={{ borderBottom: '1px solid #F1F5F9', background: base, cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F0F9FF'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = base}>
                  <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap' }}>{p.first_name}</td>
                  <td style={{ padding: '8px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{p.last_name}</td>
                  <td style={{ padding: '8px 12px', color: '#64748B', fontSize: '12px', whiteSpace: 'nowrap' }}>{p.date_of_birth ? new Date(p.date_of_birth+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
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

      {/* Print Eval Forms modal */}
      {showPrintModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '24px' }} onClick={() => setShowPrintModal(false)}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: '900', fontSize: '17px', color: '#0F172A' }}>Print Eval Forms</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>One page per group — coaches fill in Pinnie, Score, and Notes at the tryout</div>
              </div>
              <button onClick={() => setShowPrintModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={16} color="#64748B" /></button>
            </div>

            {/* Group selector */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {availableGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '14px' }}>
                  No players with age group and gender set yet.
                </div>
              ) : (
                <>
                  {/* Controls row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Select groups to include</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setPrintGroups(new Set(availableGroups.map(g => g.key)))} style={{ fontSize: '12px', color: '#22C55E', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700' }}>Select all</button>
                      <button onClick={() => setPrintGroups(new Set())} style={{ fontSize: '12px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Clear</button>
                    </div>
                  </div>

                  {/* Groups grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {availableGroups.map(g => {
                      const selected = printGroups.has(g.key);
                      const gLabel = g.gender === 'Female' ? 'Girls' : 'Boys';
                      return (
                        <button key={g.key} onClick={() => toggleGroup(g.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: `2px solid ${selected ? '#22C55E' : '#E2E8F0'}`, background: selected ? '#F0FDF4' : '#FAFAFA', cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s' }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '5px', border: `2px solid ${selected ? '#22C55E' : '#CBD5E1'}`, background: selected ? '#22C55E' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {selected && <CheckCircle2 size={11} color="#fff" />}
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>{g.ag} {gLabel}</div>
                            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '1px' }}>{g.count} player{g.count !== 1 ? 's' : ''}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Options */}
                  <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={printExcludeNTR} onChange={e => setPrintExcludeNTR(e.target.checked)} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Exclude NTR players</div>
                        <div style={{ fontSize: '11.5px', color: '#94A3B8' }}>Players marked Not To Return won't appear on forms</div>
                      </div>
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fff' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                {printGroups.size > 0
                  ? <span style={{ color: '#374151', fontWeight: '600' }}>{printGroups.size} form{printGroups.size !== 1 ? 's' : ''} · {availableGroups.filter(g => printGroups.has(g.key)).reduce((s, g) => s + g.count, 0)} players total</span>
                  : 'No groups selected'}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowPrintModal(false)} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={generateAndPrint} disabled={printGroups.size === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 20px', borderRadius: '9px', background: printGroups.size > 0 ? '#0F172A' : '#94A3B8', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '700', cursor: printGroups.size > 0 ? 'pointer' : 'default' }}>
                  <Printer size={14} /> Generate & Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && <PlayerModal club={club as ClubT} player={editP} seasonYear={seasonYear} season={season} onClose={() => { setShowAdd(false); setEditP(null); }} onSaved={load} />}

      {delId && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ background: '#fff', borderRadius: '8px', padding: '28px', width: '340px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A', marginBottom: '8px' }}>Delete player?</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>Removes them from the pool and all assignments.</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => setDelId(null)} style={{ padding: '9px 20px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: '13.5px' }}>Cancel</button>
            <button onClick={async () => { await supabase.from('tryout_players').delete().eq('id', delId); setDelId(null); load(); }} style={{ padding: '9px 20px', borderRadius: '9px', background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13.5px' }}>Delete</button>
          </div>
        </div>
      </div>}

      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
          onClick={() => { setShowImport(false); setImportText(''); setImportRows([]); setImportParsed(false); }}>
          <div style={{ background: '#fff', borderRadius: '8px', width: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '15px', color: '#0F172A' }}>Import Rankings</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '1px' }}>Paste from any spreadsheet, Google Sheets export, or master list</div>
              </div>
              <button onClick={() => { setShowImport(false); setImportText(''); setImportRows([]); setImportParsed(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={16} color="#94A3B8" />
              </button>
            </div>

            {!importParsed ? (
              /* Step 1 — Paste */
              <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
                <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px', fontSize: '12.5px', color: '#64748B', lineHeight: '1.7' }}>
                  <strong style={{ color: '#374151' }}>Accepted formats:</strong><br />
                  • <code style={{ background: '#E2E8F0', borderRadius: '4px', padding: '1px 5px' }}>Name, Score</code> — e.g. <em>Alex Smith, 87</em><br />
                  • Ranked list (one name per line, row 1 = rank 1)<br />
                  • <code style={{ background: '#E2E8F0', borderRadius: '4px', padding: '1px 5px' }}>1. Name</code> or <code style={{ background: '#E2E8F0', borderRadius: '4px', padding: '1px 5px' }}>1) Name</code> with leading numbers stripped automatically
                </div>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={"Alex Smith, 87\nJordan Lee, 84\nSam Torres, 81\n…"}
                  rows={14}
                  style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#0F172A', fontFamily: 'monospace', resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box', lineHeight: '1.6' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => { setShowImport(false); setImportText(''); }} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13.5px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={parseImport} disabled={!importText.trim()}
                    style={{ padding: '9px 20px', borderRadius: '9px', background: '#6366F1', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer', opacity: importText.trim() ? 1 : 0.45 }}>
                    Preview →
                  </button>
                </div>
              </div>
            ) : (
              /* Step 2 — Preview + Confirm */
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                {/* Summary bar */}
                <div style={{ padding: '10px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: '700', color: '#16A34A' }}>
                    <CheckCircle2 size={14} />
                    {importRows.filter(r => r.player).length} matched
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: '700', color: '#DC2626' }}>
                    <AlertCircle size={14} />
                    {importRows.filter(r => !r.player).length} unmatched
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: 'auto' }}>
                    {importRows.length} rows parsed
                  </span>
                </div>

                {/* Preview table */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#0F172A', position: 'sticky', top: 0 }}>
                        {['#', 'Input Name', 'Matched Player', 'Score', ''].map(h => (
                          <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: '1.5px', textTransform: 'uppercase', borderBottom: 'none' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F1F5F9', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '7px 14px', color: '#CBD5E1', fontWeight: '700', width: '36px' }}>{i + 1}</td>
                          <td style={{ padding: '7px 14px', color: '#374151', fontWeight: '500' }}>{row.name}</td>
                          <td style={{ padding: '7px 14px' }}>
                            {row.player
                              ? <span style={{ fontWeight: '600', color: '#0F172A' }}>{row.player.first_name} {row.player.last_name}</span>
                              : <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>No match</span>}
                          </td>
                          <td style={{ padding: '7px 14px', color: '#6366F1', fontWeight: '700', fontFamily: 'monospace' }}>
                            {row.value !== null ? row.value : <span style={{ color: '#CBD5E1' }}>—</span>}
                          </td>
                          <td style={{ padding: '7px 14px', textAlign: 'center', width: '36px' }}>
                            {row.player
                              ? <CheckCircle2 size={14} color="#22C55E" />
                              : <AlertCircle size={14} color="#EF4444" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={() => setImportParsed(false)}
                    style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
                    ← Edit Paste
                  </button>
                  <button onClick={commitImport} disabled={importing || importRows.filter(r => r.player).length === 0}
                    style={{ padding: '9px 22px', borderRadius: '9px', background: '#6366F1', color: '#fff', border: 'none', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer', opacity: (importing || importRows.filter(r => r.player).length === 0) ? 0.5 : 1 }}>
                    {importing ? 'Importing…' : `Import ${importRows.filter(r => r.player).length} Rankings`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerModal({ club, player, season, seasonYear, onClose, onSaved }: { club: ClubT; player: Player | null; season: string; seasonYear: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ first_name: player?.first_name ?? '', last_name: player?.last_name ?? '', date_of_birth: player?.date_of_birth ?? '', grade: player?.grade ?? '', gender: player?.gender ?? 'Male', email_primary: player?.email_primary ?? '', positions: player?.positions?.join(', ') ?? '', final_age_group: player?.final_age_group ?? '' });
  const [saving, setSaving] = useState(false);
  const autoAg = form.date_of_birth ? calcAgeGroup(form.date_of_birth, seasonYear) : '';
  const inp: React.CSSProperties = { padding: '8px 11px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const lbl = (t: string) => <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>{t}</label>;

  async function save() {
    if (!form.first_name.trim() || !club) return; setSaving(true);
    const payload = { club_id: club.id, first_name: form.first_name.trim(), last_name: form.last_name.trim(), date_of_birth: form.date_of_birth || null, grade: form.grade || null, gender: form.gender, email_primary: form.email_primary || null, positions: form.positions ? form.positions.split(',').map(s => s.trim()).filter(Boolean) : [], final_age_group: form.final_age_group || autoAg || null };
    if (player) { await supabase.from('tryout_players').update(payload).eq('id', player.id); }
    else {
      const { data: ins } = await supabase.from('tryout_players').insert(payload).select('id').single();
      if (ins) await supabase.from('tryout_assignments').insert({ club_id: club.id, player_id: (ins as { id: string }).id, team: 'Unassigned', status: 'Unassigned', offer_status: 'NotSent' });
    }
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '8px', width: '520px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: '700', fontSize: '15px', color: '#0F172A' }}>{player ? 'Edit Player' : 'Add Player'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#64748B" /></button>
        </div>
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>{lbl('First name *')}<input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} style={inp} /></div>
          <div>{lbl('Last name')}<input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} style={inp} /></div>
          <div>{lbl('Date of birth')}<input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value, final_age_group: '' }))} style={inp} /></div>
          <div>{lbl(`Age group${autoAg ? ` (auto: ${autoAg})` : ''}`)}<input value={form.final_age_group} onChange={e => setForm(f => ({ ...f, final_age_group: e.target.value }))} placeholder={autoAg || 'e.g. U10'} style={inp} /></div>
          <div>{lbl('Gender')}<select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={inp}><option>Male</option><option>Female</option></select></div>
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
