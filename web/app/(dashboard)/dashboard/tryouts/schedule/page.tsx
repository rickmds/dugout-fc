'use client';

import { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';
import { seasonOptions, AGE_GROUPS } from '@/lib/ageGroup';
import { Plus, X, LayoutGrid, List, AlertTriangle, MapPin, Users, Copy } from 'lucide-react';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri'] as const;
type Day = typeof DAYS[number];
const DAY_FULL: Record<string,string> = { Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday' };
const TIME_PRESETS = ['15:00','16:00','17:00','18:00','19:00','20:00'];

type PracticeSlot = {
  id: string; club_id: string; season_label: string; age_group: string|null; gender: string|null;
  team: string|null; field_name: string; sub_zone: string|null; day_of_week: Day;
  start_time: string|null; end_time: string|null; notes: string|null;
};
type TryoutField = { id: string; name: string; sub_zones: string[]; is_active: boolean; sort_order: number; rental_cost_per_hour: number|null; };
type TryoutTeam  = { id: string; name: string; color: string; age_group: string|null; gender: string|null; head_coach_id: string|null; };
type TryoutCoach = { id: string; full_name: string; };

function fmt12(t: string|null) {
  if (!t) return '';
  const [h,m] = t.split(':');
  const hr = parseInt(h);
  return `${hr%12||12}:${m}${hr>=12?'pm':'am'}`;
}
function addMinutes(time: string, mins: number): string {
  const [h,m] = time.split(':').map(Number);
  const total = h*60+m+mins;
  return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function timesToMinutes(t: string) { const [h,m]=t.split(':').map(Number); return h*60+m; }
function fmtDuration(start: string|null, end: string|null): string {
  if (!start || !end) return '';
  const mins = timesToMinutes(end) - timesToMinutes(start);
  if (mins <= 0) return '';
  if (mins % 60 === 0) return `${mins/60}hr`;
  return `${Math.floor(mins/60)}h ${mins%60}m`;
}
function slotsOverlap(a: PracticeSlot, b: PracticeSlot) {
  if (!a.start_time||!b.start_time) return false;
  const aS=timesToMinutes(a.start_time), aE=a.end_time?timesToMinutes(a.end_time):aS+90;
  const bS=timesToMinutes(b.start_time), bE=b.end_time?timesToMinutes(b.end_time):bS+90;
  return aS<bE && bS<aE;
}

const inp2: React.CSSProperties = { padding:'7px 10px', borderRadius:'7px', border:'1px solid #E2E8F0', fontSize:'13px', color:'#0F172A', background:'#fff', outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit' };

export default function PracticeSchedulePage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [season,    setSeason]   = useState(() => seasonOptions()[1] ?? '2026-27');
  const [slots,     setSlots]    = useState<PracticeSlot[]>([]);
  const [fields,    setFields]   = useState<TryoutField[]>([]);
  const [teams,     setTeams]    = useState<TryoutTeam[]>([]);
  const [coaches,   setCoaches]  = useState<TryoutCoach[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [view,      setView]     = useState<'grid'|'pitches'>('pitches');
  const [activeDay, setActiveDay]= useState<Day>('Mon');
  const [teamSearch,   setTeamSearch]= useState('');
  const [filterAg,     setFilterAg]  = useState('All');
  const [filterGender, setFG]        = useState('All');
  const [filterCoach,  setFC]        = useState('All');
  const [showConflictsOnly, setConflictsOnly] = useState(false);
  const [showWeekends, setShowWeekends] = useState(false);

  // Slot modal
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [editSlot,  setEditSlot]  = useState<PracticeSlot|null>(null);
  const [draftSlot, setDraftSlot] = useState<Partial<PracticeSlot>|null>(null);

  // Duplicate popover
  const [dupSource, setDupSource] = useState<PracticeSlot|null>(null);
  const [dupAnchor, setDupAnchor] = useState<{top:number;left:number}|null>(null);
  const [duping,    setDuping]    = useState(false);

  const dragTeamRef = useRef<TryoutTeam|null>(null);

  async function load() {
    if (!club) return;
    const [{ data: sl }, { data: fi }, { data: ts }, { data: cs }] = await Promise.all([
      supabase.from('tryout_practice_slots').select('*').eq('club_id', club.id).eq('season_label', season),
      supabase.from('tryout_fields').select('*').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('tryout_teams').select('id,name,color,age_group,gender,head_coach_id').eq('club_id', club.id).eq('is_active', true).order('name'),
      supabase.from('tryout_coaches').select('id,full_name').eq('club_id', club.id).eq('is_active', true),
    ]);
    setSlots((sl??[]) as PracticeSlot[]);
    setFields((fi??[]) as TryoutField[]);
    setTeams((ts??[]) as TryoutTeam[]);
    setCoaches((cs??[]) as TryoutCoach[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [club, season]);

  // Conflict detection
  const conflictIds = new Set<string>();
  for (let i=0;i<slots.length;i++) for (let j=i+1;j<slots.length;j++) {
    const a=slots[i], b=slots[j];
    if (a.field_name===b.field_name && a.sub_zone===b.sub_zone && a.day_of_week===b.day_of_week && slotsOverlap(a,b)) {
      conflictIds.add(a.id); conflictIds.add(b.id);
    }
  }
  const conflictCount = Math.round(conflictIds.size/2);

  // Per-team slot counts and scheduled days
  const teamSlotCount: Record<string,number> = {};
  const teamDaysMap: Record<string,Set<Day>> = {};
  slots.forEach(s => {
    if (!s.team) return;
    teamSlotCount[s.team] = (teamSlotCount[s.team]??0)+1;
    if (!teamDaysMap[s.team]) teamDaysMap[s.team] = new Set();
    teamDaysMap[s.team].add(s.day_of_week);
  });

  function coachFor(team: TryoutTeam) {
    if (!team.head_coach_id) return '';
    return coaches.find(c => c.id === team.head_coach_id)?.full_name ?? '';
  }

  const activeFields     = fields.filter(f => f.is_active);
  const ageGroupsAvail   = [...new Set(teams.map(t=>t.age_group).filter(Boolean))] as string[];
  const coachesWithTeams = coaches.filter(c => teams.some(t=>t.head_coach_id===c.id));

  const filteredTeams = teams.filter(t => {
    if (teamSearch && !t.name.toLowerCase().includes(teamSearch.toLowerCase())) return false;
    if (filterAg    !== 'All' && t.age_group !== filterAg) return false;
    if (filterGender !== 'All') { const g=filterGender==='Boys'?'Male':'Female'; if (t.gender!==g) return false; }
    if (filterCoach  !== 'All' && t.head_coach_id !== filterCoach) return false;
    if (showConflictsOnly && !slots.some(s=>s.team===t.name && conflictIds.has(s.id))) return false;
    return true;
  });

  function openAddSlot()            { setEditSlot(null); setDraftSlot({}); setShowSlotModal(true); }
  function openEditSlot(s:PracticeSlot) { setEditSlot(s); setDraftSlot(null); setShowSlotModal(true); }
  function handleDrop(fieldName:string, zone:string|null, day:Day) {
    const team = dragTeamRef.current;
    if (!team) return;
    setEditSlot(null);
    setDraftSlot({ field_name:fieldName, sub_zone:zone??undefined, day_of_week:day, team:team.name, age_group:team.age_group??undefined, gender:team.gender??undefined });
    setShowSlotModal(true);
    dragTeamRef.current = null;
  }

  async function duplicateTo(day: Day) {
    if (!dupSource || !club) return;
    setDuping(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = dupSource;
    await supabase.from('tryout_practice_slots').insert({ ...rest, day_of_week: day });
    await load();
    setDupSource(null); setDupAnchor(null); setDuping(false);
  }

  function openDupPopover(e: React.MouseEvent, slot: PracticeSlot) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDupSource(slot);
    setDupAnchor({ top: rect.bottom + 6, left: rect.left });
  }

  if (loading) return <div style={{padding:'40px',color:'#94A3B8',fontSize:'14px'}}>Loading schedule…</div>;

  const totalPractices = slots.length;
  const teamsScheduled = new Set(slots.map(s=>s.team).filter(Boolean)).size;

  // Session chip — shared between views
  function SessionChip({ slot, compact }: { slot: PracticeSlot; compact?: boolean }) {
    const team       = teams.find(t=>t.name===slot.team);
    const cn         = team ? coachFor(team) : '';
    const color      = team?.color ?? '#64748B';
    const isConflict = conflictIds.has(slot.id);
    const duration   = fmtDuration(slot.start_time, slot.end_time);

    if (compact) {
      // Grid view chip — tight, coloured left bar, full width
      return (
        <div style={{ background:isConflict?'#FEF2F2':'#fff', border:`1px solid ${isConflict?'#FCA5A5':'#E2E8F0'}`, borderLeft:`3px solid ${isConflict?'#EF4444':color}`, borderRadius:'6px', padding:'4px 6px', marginBottom:'3px', transition:'box-shadow 0.1s', overflow:'hidden' }}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.boxShadow='0 2px 6px rgba(0,0,0,0.08)'}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.boxShadow='none'}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'3px' }}>
            <div onClick={()=>openEditSlot(slot)} style={{ flex:1, cursor:'pointer', minWidth:0 }}>
              <div style={{ fontWeight:'800', fontSize:'11px', color:isConflict?'#EF4444':color, lineHeight:1.25, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{slot.team ?? 'Open'}</div>
              {cn && <div style={{ fontSize:'9.5px', color:'#64748B', marginTop:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cn}</div>}
              {slot.start_time && <div style={{ fontSize:'9.5px', color:'#94A3B8', marginTop:'1px', fontVariantNumeric:'tabular-nums' }}>{fmt12(slot.start_time)}{slot.end_time?`–${fmt12(slot.end_time)}`:''}</div>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', flexShrink:0 }}>
              {isConflict && <span style={{ fontSize:'9px', color:'#EF4444' }}>⚠</span>}
              <button onClick={e=>openDupPopover(e,slot)} title="Copy to another day"
                style={{ background:'none', border:'none', cursor:'pointer', padding:'1px', display:'flex', color:'#E2E8F0', transition:'color 0.1s' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color=color}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#E2E8F0'}>
                <Copy size={10}/>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Pitches view chip
    return (
      <div style={{ background:isConflict?'#b91c1c':color, borderRadius:'8px', padding:'8px 10px', marginBottom:'6px', outline:isConflict?`2px solid #FCA5A5`:'none', outlineOffset:'1px', boxShadow:'0 1px 3px rgba(0,0,0,0.15)', transition:'transform 0.1s, box-shadow 0.1s' }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-1px)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 10px rgba(0,0,0,0.2)';}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 1px 3px rgba(0,0,0,0.15)';}}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div onClick={()=>openEditSlot(slot)} style={{ flex:1, cursor:'pointer' }}>
            <div style={{ fontSize:'13px', fontWeight:'800', color:'#fff', lineHeight:1.2 }}>{slot.team ?? 'Open'}</div>
            {cn && <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.8)', marginTop:'2px' }}>{cn}</div>}
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.7)', marginTop:'2px' }}>
              {fmt12(slot.start_time)}{slot.end_time?`–${fmt12(slot.end_time)}`:''}{duration?` · ${duration}`:''}
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', marginLeft:'6px', flexShrink:0 }}>
            {isConflict && <span style={{ fontSize:'11px', color:'#fff', background:'rgba(0,0,0,0.3)', borderRadius:'4px', padding:'1px 4px' }}>⚠</span>}
            <button onClick={e=>openDupPopover(e,slot)} title="Copy to another day"
              style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'5px', cursor:'pointer', padding:'4px 5px', display:'flex', alignItems:'center', color:'#fff', transition:'background 0.1s' }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.35)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.2)'}>
              <Copy size={12}/>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Left team panel ─────────────────────────────────────────────────────────
  const TeamPanel = (
    <div style={{ width:'240px', flexShrink:0, borderRight:'1px solid #E2E8F0', background:'#fff', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'12px 14px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'8px' }}>
          <Users size={13} color="#64748B" />
          <span style={{ fontSize:'13px', fontWeight:'700', color:'#374151' }}>Teams</span>
          <span style={{ fontSize:'11px', fontWeight:'700', color:'#64748B', background:'#F1F5F9', borderRadius:'8px', padding:'1px 7px' }}>{teams.length}</span>
        </div>
        <input value={teamSearch} onChange={e=>setTeamSearch(e.target.value)} placeholder="Search…"
          style={{ width:'100%', padding:'6px 9px', borderRadius:'6px', border:'1px solid #E2E8F0', fontSize:'12px', outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:'7px' }} />
        <div style={{ display:'flex', gap:'4px', marginBottom:'4px' }}>
          <select value={filterAg} onChange={e=>setFilterAg(e.target.value)} style={{ flex:1, padding:'4px 5px', borderRadius:'5px', border:'1px solid #E2E8F0', fontSize:'11px', outline:'none', fontFamily:'inherit' }}>
            <option value="All">All ages</option>
            {ageGroupsAvail.map(ag=><option key={ag}>{ag}</option>)}
          </select>
          <select value={filterGender} onChange={e=>setFG(e.target.value)} style={{ flex:1, padding:'4px 5px', borderRadius:'5px', border:'1px solid #E2E8F0', fontSize:'11px', outline:'none', fontFamily:'inherit' }}>
            <option value="All">All</option>
            <option>Boys</option>
            <option>Girls</option>
          </select>
        </div>
        <select value={filterCoach} onChange={e=>setFC(e.target.value)} style={{ width:'100%', padding:'4px 5px', borderRadius:'5px', border:'1px solid #E2E8F0', fontSize:'11px', outline:'none', fontFamily:'inherit' }}>
          <option value="All">All coaches</option>
          {coachesWithTeams.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {filteredTeams.map(team => {
          const cn         = coachFor(team);
          const count      = teamSlotCount[team.name] ?? 0;
          const scheduledDays = [...(teamDaysMap[team.name] ?? [])].sort((a,b)=>DAYS.indexOf(a)-DAYS.indexOf(b));
          const hasConflict = slots.some(s=>s.team===team.name && conflictIds.has(s.id));
          return (
            <div key={team.id} draggable
              onDragStart={()=>{ dragTeamRef.current=team; }}
              onDragEnd={()=>{ dragTeamRef.current=null; }}
              style={{ padding:'9px 14px', borderBottom:'1px solid #F8FAFC', cursor:'grab', userSelect:'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom: scheduledDays.length>0 ? '5px' : '0' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'2px', background:team.color, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12.5px', fontWeight:'700', color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{team.name}</div>
                  {cn && <div style={{ fontSize:'10.5px', color:'#94A3B8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cn}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'3px', flexShrink:0 }}>
                  {hasConflict && <span style={{ fontSize:'11px', color:'#EF4444' }}>⚠</span>}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'13px', fontWeight:'800', color:count>0?primary:'#CBD5E1', lineHeight:1 }}>{count}</div>
                    <div style={{ fontSize:'8px', fontWeight:'700', color:'#CBD5E1', textTransform:'uppercase', letterSpacing:'0.5px' }}>sessions</div>
                  </div>
                </div>
              </div>
              {scheduledDays.length>0 && (
                <div style={{ display:'flex', gap:'3px', paddingLeft:'16px', flexWrap:'wrap' }}>
                  {scheduledDays.map(d=>(
                    <span key={d} style={{ fontSize:'9.5px', fontWeight:'700', color:'#fff', background:team.color, borderRadius:'4px', padding:'1px 5px', letterSpacing:'0.3px' }}>{d}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredTeams.length===0 && <div style={{ padding:'32px 16px', textAlign:'center', fontSize:'12px', color:'#CBD5E1' }}>No teams found</div>}
      </div>

      <div style={{ padding:'10px 14px', borderTop:'1px solid #F1F5F9', flexShrink:0 }}>
        <button onClick={openAddSlot} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'7px', borderRadius:'7px', background:'#F8FAFC', border:'1px dashed #CBD5E1', fontSize:'12px', fontWeight:'600', color:'#64748B', cursor:'pointer', fontFamily:'inherit' }}>
          <Plus size={12}/> Manual slot
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }} onClick={()=>{ if(dupSource){setDupSource(null);setDupAnchor(null);} }}>

      {/* ── Header ── */}
      <div style={{ padding:'14px 24px', background:'#fff', borderBottom:`3px solid ${primary}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
          <div>
            <div style={{ fontSize:'10px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', letterSpacing:'1.5px' }}>Tryouts · {season}</div>
            <h1 style={{ fontSize:'22px', fontWeight:'900', color:'#0D1117', margin:'2px 0 0', letterSpacing:'-0.5px' }}>Practice Schedule</h1>
          </div>
          <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
            <div style={{ display:'flex', gap:'6px' }}>
              <StatChip label="Practices" value={totalPractices} />
              <StatChip label="Teams Scheduled" value={teamsScheduled} />
              {conflictCount>0 && <StatChip label="Conflicts" value={conflictCount} warn />}
            </div>
            <div style={{ display:'flex', background:'#F1F5F9', borderRadius:'8px', padding:'3px', gap:'2px' }}>
              {([['grid','Grid',<List key="l" size={13}/>],['pitches','Pitches',<LayoutGrid key="g" size={13}/>]] as const).map(([v,label,icon])=>(
                <button key={v} onClick={()=>setView(v as 'grid'|'pitches')}
                  style={{ display:'flex', alignItems:'center', gap:'5px', padding:'5px 12px', borderRadius:'6px', border:'none', background:view===v?'#fff':'transparent', color:view===v?'#0F172A':'#64748B', fontSize:'12.5px', fontWeight:view===v?'700':'500', cursor:'pointer', boxShadow:view===v?'0 1px 3px rgba(0,0,0,0.1)':'none', transition:'all 0.15s', fontFamily:'inherit' }}>
                  {icon}{label}
                </button>
              ))}
            </div>
            <select value={season} onChange={e=>setSeason(e.target.value)} style={{ padding:'6px 10px', borderRadius:'7px', border:'1px solid #E2E8F0', fontSize:'13px', color:'#0F172A', background:'#fff', outline:'none' }}>
              {seasonOptions().map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            {conflictCount>0 && (
              <button onClick={()=>setConflictsOnly(x=>!x)}
                style={{ display:'flex', alignItems:'center', gap:'5px', padding:'5px 12px', borderRadius:'7px', background:showConflictsOnly?'#FEF2F2':'#FFF7ED', border:`1px solid ${showConflictsOnly?'#FCA5A5':'#FDE68A'}`, color:showConflictsOnly?'#EF4444':'#F59E0B', fontSize:'12px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                <AlertTriangle size={12}/> {showConflictsOnly?'Show all':'Conflicts only'} {conflictCount}
              </button>
            )}
          </div>
        </div>

        {view==='pitches' ? (
          <div style={{ display:'flex', alignItems:'center', gap:'5px', flexWrap:'wrap' }}>
            {DAYS.filter(d=>['Mon','Tue','Wed','Thu','Fri'].includes(d) || slots.some(s=>s.day_of_week===d)).map(d=>{
              const dayCount = slots.filter(s=>s.day_of_week===d).length;
              return (
                <button key={d} onClick={()=>setActiveDay(d)}
                  style={{ padding:'6px 14px 6px 16px', borderRadius:'7px', border:'none', background:activeDay===d?primary:'#F1F5F9', color:activeDay===d?'#fff':'#64748B', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', display:'flex', alignItems:'center', gap:'6px' }}>
                  {d}
                  {dayCount>0 && <span style={{ fontSize:'10px', fontWeight:'700', background:activeDay===d?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.08)', borderRadius:'8px', padding:'0 5px', color:activeDay===d?'#fff':'#64748B' }}>{dayCount}</span>}
                </button>
              );
            })}
            <span style={{ fontSize:'12px', color:'#CBD5E1', marginLeft:'8px' }}>Drag a team onto a zone · click a session to edit · <Copy size={10} style={{display:'inline',verticalAlign:'middle'}}/> to copy to another day</span>
          </div>
        ) : (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
            {['All',...ageGroupsAvail].map(ag=>(
              <button key={ag} onClick={()=>setFilterAg(ag)}
                style={{ padding:'4px 11px', borderRadius:'6px', border:'none', background:filterAg===ag?'#0F172A':'#F1F5F9', color:filterAg===ag?'#fff':'#64748B', fontSize:'12px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>{ag}</button>
            ))}
            <div style={{ marginLeft:'8px', display:'flex', gap:'4px' }}>
              {['All','Boys','Girls'].map(g=>(
                <button key={g} onClick={()=>setFG(g==='All'?'All':g==='Boys'?'Male':'Female')}
                  style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid', borderColor:(filterGender==='All'&&g==='All')||(filterGender==='Male'&&g==='Boys')||(filterGender==='Female'&&g==='Girls')?primary:'#E2E8F0', background:(filterGender==='All'&&g==='All')||(filterGender==='Male'&&g==='Boys')||(filterGender==='Female'&&g==='Girls')?`${primary}15`:'#fff', color:(filterGender==='All'&&g==='All')||(filterGender==='Male'&&g==='Boys')||(filterGender==='Female'&&g==='Girls')?primary:'#64748B', fontSize:'12px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>{g}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {TeamPanel}

        {/* ── PITCHES VIEW ── */}
        {view==='pitches' && (
          <div style={{ flex:1, overflowY:'auto', overflowX:'auto', background:'#F0F2F5', padding:'20px' }}>
            {activeFields.length===0 ? (
              <EmptyState icon="📍" title="No fields configured" sub={<span>Go to <strong>Fields &amp; Zones</strong> in the sidebar to set up your fields first.</span>} />
            ) : activeFields.map(field => {
              const zones    = (field.sub_zones??[]).length>0 ? field.sub_zones : [null as unknown as string];
              const daySlots = slots.filter(s=>s.field_name===field.name && s.day_of_week===activeDay);
              return (
                <div key={field.id} style={{ marginBottom:'24px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                    <MapPin size={15} color={primary} />
                    <span style={{ fontSize:'16px', fontWeight:'900', color:'#0D1117', letterSpacing:'-0.3px' }}>{field.name}</span>
                    {daySlots.length>0 && <span style={{ fontSize:'11px', fontWeight:'700', color:primary, background:`${primary}15`, borderRadius:'6px', padding:'2px 8px' }}>{daySlots.length} session{daySlots.length!==1?'s':''} today</span>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'10px' }}>
                    {zones.map((zone,zi) => {
                      const zoneSlots = daySlots.filter(s=>s.sub_zone===(zone??null)).sort((a,b)=>(a.start_time??'').localeCompare(b.start_time??''));
                      return (
                        <div key={zone??zi}
                          onDragOver={e=>{e.preventDefault();(e.currentTarget as HTMLElement).style.borderColor=primary;(e.currentTarget as HTMLElement).style.background=`${primary}08`;}}
                          onDragLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#E2E8F0';(e.currentTarget as HTMLElement).style.background='#fff';}}
                          onDrop={e=>{e.preventDefault();(e.currentTarget as HTMLElement).style.borderColor='#E2E8F0';(e.currentTarget as HTMLElement).style.background='#fff';handleDrop(field.name,zone??null,activeDay);}}
                          style={{ border:'1.5px solid #E2E8F0', borderRadius:'10px', background:'#fff', overflow:'hidden', minHeight:'110px', transition:'border-color 0.15s, background 0.15s', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                          <div style={{ padding:'7px 12px', background:'#F8FAFC', borderBottom:'1px solid #E2E8F0', fontSize:'10px', fontWeight:'800', color:'#64748B', textTransform:'uppercase', letterSpacing:'1.2px' }}>
                            {zone ?? field.name}
                          </div>
                          <div style={{ padding:'8px' }}>
                            {zoneSlots.length===0 ? (
                              <div style={{ fontSize:'11.5px', color:'#CBD5E1', fontStyle:'italic', padding:'10px 6px', textAlign:'center' }}>No sessions — drag a team here.</div>
                            ) : zoneSlots.map(slot=>(
                              <SessionChip key={slot.id} slot={slot} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── GRID VIEW ── */}
        {view==='grid' && (
          <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
            {activeFields.length===0 ? (
              <EmptyState icon="📅" title="No fields configured" sub={<span>Go to <strong>Fields &amp; Zones</strong> in the sidebar to set up your fields first.</span>} />
            ) : (() => {
              const gridDays = (showWeekends ? DAYS : WEEKDAYS) as readonly Day[];
              const weekendCount = slots.filter(s=>s.day_of_week==='Sat'||s.day_of_week==='Sun').length;
              return (
                <>
                  {/* weekend toggle bar */}
                  <div style={{ padding:'8px 14px', borderBottom:'1px solid #F1F5F9', background:'#fff', display:'flex', alignItems:'center', gap:'10px' }}>
                    <button onClick={()=>setShowWeekends(x=>!x)}
                      style={{ fontSize:'12px', fontWeight:'600', padding:'4px 12px', borderRadius:'6px', border:`1px solid ${showWeekends?primary:'#E2E8F0'}`, background:showWeekends?`${primary}15`:'#F8FAFC', color:showWeekends?primary:'#64748B', cursor:'pointer', fontFamily:'inherit' }}>
                      {showWeekends ? '✓ Weekends' : 'Show weekends'}
                    </button>
                    {!showWeekends && weekendCount>0 && <span style={{ fontSize:'11.5px', color:'#F59E0B', fontWeight:'600' }}>{weekendCount} session{weekendCount!==1?'s':''} on Sat/Sun hidden</span>}
                  </div>
                  <table style={{ borderCollapse:'collapse', width:'100%', tableLayout:'fixed', fontSize:'12.5px' }}>
                    <thead>
                      <tr style={{ background:'#0F172A', position:'sticky', top:0, zIndex:2 }}>
                        <th style={{ padding:'10px 12px', textAlign:'left', fontSize:'10px', fontWeight:'800', color:'rgba(255,255,255,0.5)', letterSpacing:'1.5px', width:'120px' }}>FIELD / ZONE</th>
                        {gridDays.map(d=>{
                          const dayCount = slots.filter(s=>s.day_of_week===d).length;
                          return (
                            <th key={d} style={{ padding:'8px 10px', textAlign:'center', fontSize:'10px', fontWeight:'800', color:'rgba(255,255,255,0.7)', letterSpacing:'1px' }}>
                              <div>{DAY_FULL[d].toUpperCase()}</div>
                              <div style={{ fontSize:'9px', fontWeight:'600', color:'rgba(255,255,255,0.35)', marginTop:'2px' }}>{dayCount>0?`${dayCount} sessions`:''}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {activeFields.flatMap((field,fi) => {
                        const zones = (field.sub_zones??[]).length>0 ? field.sub_zones : [null as unknown as string];
                        return zones.map((zone,zi)=>{
                          const isFirst = zi===0;
                          const rowBg   = fi%2===0 ? '#fff' : '#FAFAFA';
                          return (
                            <tr key={`${field.id}-${zone??'main'}`} style={{ borderBottom:'1px solid #F1F5F9', background:rowBg }}>
                              <td style={{ padding:'6px 12px', borderRight:'1px solid #E2E8F0', verticalAlign:'top', overflow:'hidden' }}>
                                {isFirst && <div style={{ fontSize:'11.5px', fontWeight:'800', color:'#0F172A', display:'flex', alignItems:'center', gap:'4px', overflow:'hidden' }}><MapPin size={10} color={primary}/><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{field.name}</span></div>}
                                {zone && <div style={{ fontSize:'10px', color:'#94A3B8', marginTop:isFirst?'2px':'0', paddingLeft:isFirst?'14px':'0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{zone}</div>}
                              </td>
                              {gridDays.map(day=>{
                                const cell = slots
                                  .filter(s=>s.field_name===field.name && s.sub_zone===(zone??null) && s.day_of_week===day)
                                  .filter(s=>!showConflictsOnly || conflictIds.has(s.id))
                                  .sort((a,b)=>(a.start_time??'').localeCompare(b.start_time??''));
                                return (
                                  <td key={day}
                                    onDragOver={e=>{e.preventDefault();(e.currentTarget as HTMLElement).style.background=`${primary}10`;}}
                                    onDragLeave={e=>{(e.currentTarget as HTMLElement).style.background='';}}
                                    onDrop={e=>{e.preventDefault();(e.currentTarget as HTMLElement).style.background='';handleDrop(field.name,zone??null,day as Day);}}
                                    style={{ padding:'4px 5px', borderRight:'1px solid #F1F5F9', verticalAlign:'top', minHeight:'48px', transition:'background 0.1s' }}>
                                    {cell.map(s=><SessionChip key={s.id} slot={s} compact />)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Slot Modal ── */}
      {showSlotModal && (
        <SlotModal
          club={club as {id:string}|null} season={season}
          slot={editSlot} draft={draftSlot}
          fields={fields} teams={teams} primary={primary}
          onClose={()=>{setShowSlotModal(false);setEditSlot(null);setDraftSlot(null);}}
          onSaved={load}
        />
      )}

      {/* ── Duplicate day picker popover ── */}
      {dupSource && dupAnchor && (
        <div onClick={e=>e.stopPropagation()}
          style={{ position:'fixed', top:dupAnchor.top, left:dupAnchor.left, background:'#fff', borderRadius:'12px', boxShadow:'0 8px 32px rgba(0,0,0,0.18)', padding:'14px 16px', zIndex:200, border:'1px solid #E2E8F0', minWidth:'220px' }}>
          <div style={{ fontSize:'10px', fontWeight:'800', color:'#64748B', textTransform:'uppercase', letterSpacing:'1.2px', marginBottom:'4px' }}>Copy to day</div>
          <div style={{ fontSize:'12px', color:'#94A3B8', marginBottom:'10px' }}>{dupSource.team} · {fmt12(dupSource.start_time)}{dupSource.end_time?`–${fmt12(dupSource.end_time)}`:''}</div>
          <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
            {DAYS.map(d => {
              const isSource  = d === dupSource.day_of_week;
              const alreadyHas = slots.some(s=>s.team===dupSource.team && s.field_name===dupSource.field_name && s.sub_zone===dupSource.sub_zone && s.day_of_week===d && s.start_time===dupSource.start_time);
              return (
                <button key={d} disabled={isSource || duping}
                  onClick={()=>duplicateTo(d)}
                  style={{ padding:'6px 11px', borderRadius:'7px', border:'none', cursor:isSource?'default':'pointer', fontFamily:'inherit', fontSize:'12.5px', fontWeight:'700', background:isSource?'#F1F5F9':alreadyHas?'#FFF7ED':primary, color:isSource?'#CBD5E1':alreadyHas?'#F59E0B':'#fff', opacity:duping?0.5:1, position:'relative' }}>
                  {d}
                  {alreadyHas && !isSource && <span style={{ position:'absolute', top:'-3px', right:'-3px', width:'8px', height:'8px', background:'#F59E0B', borderRadius:'50%', border:'1.5px solid #fff' }}/>}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop:'10px', fontSize:'10.5px', color:'#CBD5E1' }}>Orange dot = already scheduled · source day is greyed out</div>
        </div>
      )}
    </div>
  );
}

// ── StatChip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div style={{ background:warn?'#FEF2F2':'#F1F5F9', borderRadius:'8px', padding:'6px 12px', textAlign:'center', border:warn?'1px solid #FCA5A5':'none' }}>
      <div style={{ fontSize:'16px', fontWeight:'900', color:warn?'#EF4444':'#0F172A' }}>{value}</div>
      <div style={{ fontSize:'9px', fontWeight:'700', color:warn?'#EF4444':'#94A3B8', textTransform:'uppercase', letterSpacing:'1px' }}>{label}</div>
    </div>
  );
}

// ── SlotModal ─────────────────────────────────────────────────────────────────

function SlotModal({ club, season, slot, draft, fields, teams, primary, onClose, onSaved }: {
  club:{id:string}|null; season:string; slot:PracticeSlot|null; draft:Partial<PracticeSlot>|null;
  fields:TryoutField[]; teams:TryoutTeam[]; primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  const initial = slot ?? draft ?? {};
  // Auto-fill end time as start + 90min if not already set
  const initialEnd = (initial.end_time as string|undefined) || (initial.start_time ? addMinutes(initial.start_time as string, 90) : '');
  const [form, setForm] = useState({
    age_group:   (initial.age_group   ?? '') as string,
    gender:      (initial.gender      ?? '') as string,
    team:        (initial.team        ?? '') as string,
    field_name:  (initial.field_name  ?? (fields[0]?.name ?? '')) as string,
    sub_zone:    (initial.sub_zone    ?? '') as string,
    day_of_week: (initial.day_of_week ?? 'Mon') as Day,
    start_time:  (initial.start_time  ?? '') as string,
    end_time:    initialEnd,
    notes:       (initial.notes       ?? '') as string,
  });
  const [saving, setSaving] = useState(false);
  const selectedField = fields.find(f=>f.name===form.field_name);
  const lbl = (t:string) => <label style={{ fontSize:'11px', fontWeight:'600', color:'#374151', display:'block', marginBottom:'3px' }}>{t}</label>;

  function setStartTime(start: string) {
    setForm(f => ({
      ...f,
      start_time: start,
      end_time: f.end_time || (start ? addMinutes(start, 90) : ''),
    }));
  }

  async function save() {
    if (!club) return; setSaving(true);
    const payload = { club_id:club.id, season_label:season, age_group:form.age_group||null, gender:form.gender||null, team:form.team||null, field_name:form.field_name, sub_zone:form.sub_zone||null, day_of_week:form.day_of_week, start_time:form.start_time||null, end_time:form.end_time||null, notes:form.notes||null };
    let savedId = slot?.id ?? '';
    if (slot) {
      await supabase.from('tryout_practice_slots').update(payload).eq('id', slot.id);
    } else {
      const { data:ins } = await supabase.from('tryout_practice_slots').insert(payload).select('id').single();
      savedId = ins?.id ?? '';
    }
    const field = fields.find(f=>f.name===form.field_name);
    if (field?.rental_cost_per_hour && form.start_time && form.end_time && savedId) {
      const hours  = Math.max(0, (timesToMinutes(form.end_time)-timesToMinutes(form.start_time))/60);
      const amount = parseFloat((hours*field.rental_cost_per_hour).toFixed(2));
      const description = `${form.team??'Practice'} — ${form.field_name}${form.sub_zone?', '+form.sub_zone:''} (${form.day_of_week} ${fmt12(form.start_time)}–${fmt12(form.end_time)})`;
      const { data:existing } = await supabase.from('tryout_expenses').select('id').eq('slot_id',savedId).maybeSingle();
      if (existing) { await supabase.from('tryout_expenses').update({ amount, description }).eq('id', existing.id); }
      else { await supabase.from('tryout_expenses').insert({ club_id:club.id, season_label:season, category:'Field Rental', description, amount, slot_id:savedId }); }
    }
    setSaving(false); onSaved(); onClose();
  }

  async function deleteSlot() {
    if (!slot) return;
    await supabase.from('tryout_practice_slots').delete().eq('id', slot.id);
    onSaved(); onClose();
  }

  const duration = fmtDuration(form.start_time, form.end_time);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'12px', width:'520px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontWeight:'700', fontSize:'14.5px', color:'#0F172A' }}>{slot?'Edit Slot':'Add Practice Slot'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={15} color="#64748B"/></button>
        </div>
        <div style={{ padding:'18px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div>{lbl('Day')}<select value={form.day_of_week} onChange={e=>setForm(f=>({...f,day_of_week:e.target.value as Day}))} style={inp2}>{DAYS.map(d=><option key={d}>{d}</option>)}</select></div>
          <div>{lbl('Team')}<select value={form.team} onChange={e=>setForm(f=>({...f,team:e.target.value}))} style={inp2}><option value="">— None —</option>{teams.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select></div>
          <div>{lbl('Age Group')}<select value={form.age_group} onChange={e=>setForm(f=>({...f,age_group:e.target.value}))} style={inp2}><option value="">— Any —</option>{AGE_GROUPS.map(ag=><option key={ag}>{ag}</option>)}</select></div>
          <div>{lbl('Gender')}<select value={form.gender} onChange={e=>setForm(f=>({...f,gender:e.target.value}))} style={inp2}><option value="">— Any —</option><option>Male</option><option>Female</option></select></div>
          <div>{lbl('Field')}<select value={form.field_name} onChange={e=>setForm(f=>({...f,field_name:e.target.value,sub_zone:''}))} style={inp2}>{fields.map(f=><option key={f.id} value={f.name}>{f.name}</option>)}</select></div>
          <div>{lbl('Zone')}<select value={form.sub_zone} onChange={e=>setForm(f=>({...f,sub_zone:e.target.value}))} style={inp2}><option value="">— None —</option>{selectedField?.sub_zones?.map(z=><option key={z}>{z}</option>)}</select></div>

          {/* Time row with presets */}
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'4px' }}>
              {lbl('Time')}
              {duration && <span style={{ fontSize:'10.5px', fontWeight:'700', color:primary }}>{duration}</span>}
            </div>
            {/* Quick presets */}
            <div style={{ display:'flex', gap:'5px', marginBottom:'8px', flexWrap:'wrap' }}>
              {TIME_PRESETS.map(t=>(
                <button key={t} onClick={()=>setStartTime(t)}
                  style={{ padding:'4px 10px', borderRadius:'6px', border:`1px solid ${form.start_time===t?primary:'#E2E8F0'}`, background:form.start_time===t?primary:'#F8FAFC', color:form.start_time===t?'#fff':'#374151', fontSize:'12px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', transition:'all 0.1s' }}>
                  {fmt12(t)}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div>
                <div style={{ fontSize:'10px', color:'#94A3B8', marginBottom:'3px' }}>Start</div>
                <input type="time" value={form.start_time} onChange={e=>setStartTime(e.target.value)} style={inp2}/>
              </div>
              <div>
                <div style={{ fontSize:'10px', color:'#94A3B8', marginBottom:'3px' }}>End <span style={{color:'#CBD5E1'}}>(default 90 min)</span></div>
                <input type="time" value={form.end_time} onChange={e=>setForm(f=>({...f,end_time:e.target.value}))} style={inp2}/>
              </div>
            </div>
          </div>

          <div style={{ gridColumn:'1/-1' }}>{lbl('Notes')}<input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={inp2} placeholder="Optional"/></div>
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {slot
            ? <button onClick={deleteSlot} style={{ padding:'8px 14px', borderRadius:'8px', background:'#FEF2F2', color:'#EF4444', border:'1px solid #FCA5A5', fontSize:'12.5px', cursor:'pointer', fontWeight:'600', fontFamily:'inherit' }}>Delete</button>
            : <div/>
          }
          <div style={{ display:'flex', gap:'8px', marginLeft:'auto' }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding:'8px 16px', borderRadius:'8px', background:primary, color:'#fff', border:'none', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>{saving?'Saving…':'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub, action }: { icon:string; title:string; sub:React.ReactNode; action?:React.ReactNode }) {
  return (
    <div style={{ padding:'80px 48px', textAlign:'center', margin:'0 auto', maxWidth:'400px' }}>
      <div style={{ fontSize:'36px', marginBottom:'12px' }}>{icon}</div>
      <div style={{ fontSize:'15px', fontWeight:'700', color:'#0F172A', marginBottom:'6px' }}>{title}</div>
      <div style={{ fontSize:'13px', color:'#94A3B8', lineHeight:1.6, marginBottom:action?'20px':'0' }}>{sub}</div>
      {action}
    </div>
  );
}
