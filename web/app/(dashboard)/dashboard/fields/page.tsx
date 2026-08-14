'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Plus, X, Trash2, Pencil, AlertOctagon, CheckCircle, CloudRain, Sun, Cloud, Zap, Snowflake, Wind, Sparkles, ChevronDown, ChevronUp, Upload, Check } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type TryoutField = {
  id: string; club_id: string; name: string; sub_zones: string[];
  is_active: boolean; sort_order: number; rental_cost_per_hour: number | null;
  field_group: string | null; is_full_field: boolean;
  scheduler_split: number; scheduler_format: string;
  half_a_name: string | null; half_b_name: string | null;
  has_lights: boolean; surface_type: string | null; field_notes: string | null;
};
type FieldClosure = {
  id: string; club_id: string; field_name: string; sub_zones: string[];
  closed_from: string; closed_until: string | null; duration_label: string;
  reason: string | null; notify_message: string | null;
  emails_sent_at: string | null; emails_sent_count: number; push_sent: boolean;
  created_at: string;
};
type ClosureAck = { closure_id: string; coach_email: string; coach_name: string | null; acknowledged_at: string; };
type AvailabilityRule = {
  id: string; field_name: string; sub_zone: string | null;
  day_of_week: string | null; rule_date: string | null;
  unavailable_from: string; unavailable_until: string; label: string | null; season_label: string | null;
  rule_type: 'block' | 'permit'; valid_from: string | null; valid_until: string | null;
};

type ParsedWindow = {
  field_name: string; sub_zone: string | null;
  date: string;       // YYYY-MM-DD
  from_time: string; until_time: string;
  label: string | null; confidence: 'high' | 'medium' | 'low';
  selected: boolean;
};

type WeatherHour = { time: string; chance_of_rain: number; condition_text: string; temp_f: number; };

const DURATION_OPTIONS = [
  { value: 'rest_of_day',  label: 'Rest of today' },
  { value: 'hours',        label: 'Next few hours' },
  { value: 'date_range',   label: 'Specific dates' },
  { value: 'indefinite',   label: 'Until further notice' },
];
const QUICK_REASONS = ['Rain / Wet conditions','Scheduled maintenance','Unsafe conditions','Tournament / event','Frozen ground','Other'];

const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', borderRadius:'8px', border:'1.5px solid #E2E8F0', fontSize:'13px', color:'#0F172A', background:'#fff', outline:'none', fontFamily:'inherit', boxSizing:'border-box' };
const lbl = (t: string) => <label style={{ fontSize:'10px', fontWeight:'800', color:'#94A3B8', letterSpacing:'1.5px', textTransform:'uppercase', display:'block', marginBottom:'5px' }}>{t}</label>;

function weatherIcon(condition: string, size = 18) {
  const t = condition.toLowerCase();
  if (t.includes('thunder') || t.includes('storm'))                         return <Zap size={size} color="#F59E0B" />;
  if (t.includes('snow') || t.includes('blizzard') || t.includes('sleet')) return <Snowflake size={size} color="#818CF8" />;
  if (t.includes('drizzle') || t.includes('shower') || t.includes('rain')) return <CloudRain size={size} color="#3B82F6" />;
  if (t.includes('fog') || t.includes('mist') || t.includes('overcast'))   return <Wind size={size} color="#64748B" />;
  if (t.includes('cloud') || t.includes('cloudy') || t.includes('partly')) return <Cloud size={size} color="#94A3B8" />;
  return <Sun size={size} color="#F59E0B" />;
}
function weatherLabel(condition: string): string {
  const t = condition.toLowerCase();
  if (t.includes('thunder') || t.includes('storm'))  return 'Storm';
  if (t.includes('snow') || t.includes('blizzard'))  return 'Snow';
  if (t.includes('sleet'))                           return 'Sleet';
  if (t.includes('heavy rain'))                      return 'Heavy Rain';
  if (t.includes('drizzle'))                         return 'Drizzle';
  if (t.includes('shower') || t.includes('rain'))    return 'Rain';
  if (t.includes('fog') || t.includes('mist'))       return 'Foggy';
  if (t.includes('overcast'))                        return 'Overcast';
  if (t.includes('partly') || t.includes('partial')) return 'Partly Cloudy';
  if (t.includes('cloud') || t.includes('cloudy'))   return 'Cloudy';
  return 'Clear';
}
function isActiveClosure(c: FieldClosure): boolean {
  const now = new Date();
  const from = new Date(c.closed_from);
  if (from > now) return false;
  if (!c.closed_until) return true;
  return new Date(c.closed_until) > now;
}
function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FieldsPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [tab, setTab] = useState<'fields'|'closures'|'availability'>('fields');
  const [fields,     setFields]     = useState<TryoutField[]>([]);
  const [closures,   setClosures]   = useState<FieldClosure[]>([]);
  const [acks,       setAcks]       = useState<ClosureAck[]>([]);
  const [rules,      setRules]      = useState<AvailabilityRule[]>([]);
  const [weather,    setWeather]    = useState<WeatherHour[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Modals
  const [showFieldModal,   setShowFieldModal]   = useState(false);
  const [editField,        setEditField]        = useState<TryoutField|null>(null);
  const [showCloseModal,   setShowCloseModal]   = useState(false);
  const [closeTarget,      setCloseTarget]      = useState<TryoutField|null>(null);
  const [showRuleModal,    setShowRuleModal]     = useState(false);
  const [editRule,         setEditRule]         = useState<AvailabilityRule|null>(null);
  const [rulePreDate,      setRulePreDate]      = useState<string|null>(null);
  const [rulePreField,     setRulePreField]     = useState<string|null>(null);
  const [showParseModal,   setShowParseModal]   = useState(false);
  const [savingLocation,   setSavingLocation]   = useState(false);
  const [showZoneModal,    setShowZoneModal]    = useState(false);
  const [zoneTarget,       setZoneTarget]       = useState<TryoutField|null>(null);

  // Club lat/lng
  const clubAny = club as (typeof club & { latitude?: number; longitude?: number; timezone?: string }) | null;

  const load = useCallback(async () => {
    if (!club) return;
    const [{ data: fi }, { data: cl }, { data: ac }, { data: ru }] = await Promise.all([
      supabase.from('tryout_fields').select('*').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('field_closures').select('*').eq('club_id', club.id).order('created_at', { ascending: false }),
      supabase.from('field_closure_acknowledgements').select('closure_id, coach_email, coach_name, acknowledged_at'),
      supabase.from('field_availability_rules').select('*').eq('club_id', club.id).order('field_name').order('day_of_week'),
    ]);
    setFields((fi ?? []) as TryoutField[]);
    setClosures((cl ?? []) as FieldClosure[]);
    setAcks((ac ?? []) as ClosureAck[]);
    setRules((ru ?? []) as AvailabilityRule[]);
    setLoading(false);
  }, [club]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / derived-state sync; sets state from a real network call or prop change, not derivable at render time
  useEffect(() => { load(); }, [load]);

  // Weather fetch via WeatherAPI (3-day forecast, 3pm–8pm window)
  useEffect(() => {
    if (!clubAny?.latitude || !clubAny?.longitude) return;
    fetch(`/api/weather?lat=${clubAny.latitude}&lng=${clubAny.longitude}`)
      .then(r => r.json())
      .then(d => {
        const hours: WeatherHour[] = [];
        for (const day of (d.forecast?.forecastday ?? [])) {
          for (const h of (day.hour ?? [])) {
            const hourNum = parseInt((h.time as string).split(' ')[1].split(':')[0], 10);
            if (hourNum >= 15 && hourNum <= 20) {
              hours.push({
                time: h.time as string,
                chance_of_rain: (h.chance_of_rain as number) ?? 0,
                condition_text: (h.condition as { text: string })?.text ?? '',
                temp_f: Math.round(h.temp_f as number),
              });
            }
          }
        }
        setWeather(hours);
      }).catch(() => {});
  }, [clubAny?.latitude, clubAny?.longitude]);

  async function saveLocation(lat: number, lng: number) {
    if (!club) return;
    setSavingLocation(true);
    await supabase.from('clubs').update({ latitude: lat, longitude: lng }).eq('id', club.id);
    setSavingLocation(false);
    window.location.reload();
  }

  async function reopenClosure(id: string) {
    await supabase.from('field_closures').update({ closed_until: new Date().toISOString() }).eq('id', id);
    load();
  }

  async function deleteField(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This will also remove all its permits, closures, and open game slots. Assigned games will be cleared.`)) return;
    const variants = [name, `${name} [A]`, `${name} [B]`];
    await Promise.all([
      supabase.from('game_slots').delete().eq('club_id', club!.id).in('field_name', variants),
      supabase.from('field_availability_rules').delete().eq('club_id', club!.id).eq('field_name', name),
      supabase.from('field_closures').delete().eq('club_id', club!.id).eq('field_name', name),
    ]);
    await supabase.from('tryout_fields').delete().eq('id', id);
    load();
  }

  async function deleteRule(id: string) {
    await supabase.from('field_availability_rules').delete().eq('id', id);
    load();
  }


  if (loading) return <div style={{ padding:'48px', color:'#94A3B8', fontSize:'14px' }}>Loading…</div>;

  const activeClosures = closures.filter(isActiveClosure);
  const pastClosures   = closures.filter(c => !isActiveClosure(c));

  // Max rain % in the 3pm–8pm window today
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPm = weather.filter(h => h.time.startsWith(todayStr));
  const maxRain  = todayPm.length ? Math.max(...todayPm.map(h => h.chance_of_rain)) : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>

      {/* Header */}
      <div style={{ padding:'14px 24px', background:'#fff', borderBottom:`3px solid ${primary}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
          <div>
            <div style={{ fontSize:'10px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', letterSpacing:'1.5px' }}>Club</div>
            <h1 style={{ fontSize:'22px', fontWeight:'900', color:'#0D1117', margin:'2px 0 0', letterSpacing:'-0.5px' }}>Fields &amp; Venues</h1>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            {maxRain !== null && maxRain >= 50 && (
              <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:'8px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', color:'#1D4ED8' }}>
                <CloudRain size={13}/> {maxRain}% rain this afternoon
              </div>
            )}
            {activeClosures.length > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:'8px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', color:'#EF4444' }}>
                <AlertOctagon size={13}/> {activeClosures.length} active closure{activeClosures.length!==1?'s':''}
              </div>
            )}
            {tab==='fields' && (
              <button onClick={()=>{setEditField(null);setShowFieldModal(true);}}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', background:primary, color:'#fff', border:'none', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={14}/> Add Field
              </button>
            )}
            {tab==='fields' && fields.length>0 && (
              <button onClick={()=>setShowCloseModal(true)}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', background:'#FEF2F2', color:'#EF4444', border:'1px solid #FCA5A5', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                <AlertOctagon size={14}/> Close a Field
              </button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:'4px' }}>
          {([['fields','Fields'],['closures','Closures'],['availability','Availability']] as const).map(([v,label])=>(
            <button key={v} onClick={()=>setTab(v)}
              style={{ padding:'5px 14px', borderRadius:'6px', border:'none', background:tab===v?'#0F172A':'#F1F5F9', color:tab===v?'#fff':'#64748B', fontSize:'12.5px', fontWeight:tab===v?'700':'500', cursor:'pointer', fontFamily:'inherit' }}>
              {label}
              {v==='closures' && activeClosures.length>0 && <span style={{ marginLeft:'5px', fontSize:'10px', background:'#EF4444', color:'#fff', borderRadius:'8px', padding:'0 5px' }}>{activeClosures.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

        {/* ── FIELDS TAB ── */}
        {tab==='fields' && (
          <div>
            {/* Weather widget */}
            <WeatherWidget
              weather={weather} hasLocation={!!clubAny?.latitude}
              onSave={saveLocation} saving={savingLocation} primary={primary}
            />

            {fields.length===0 ? (
              <Empty icon="📍" title="No fields yet" sub="Add your training grounds — they'll appear here and in the Practice Schedule." />
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {fields.map(f => {
                  const activeClosure = activeClosures.find(c=>c.field_name===f.name);
                  return (
                    <div key={f.id} style={{ background:'#fff', borderRadius:'12px', border:`1.5px solid ${activeClosure?'#FCA5A5':'#E2E8F0'}`, padding:'14px 18px', display:'flex', alignItems:'center', gap:'14px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ width:'40px', height:'40px', borderRadius:'8px', background:activeClosure?'#FEF2F2':'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <MapPin size={18} color={activeClosure?'#EF4444':'#16A34A'}/>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <span style={{ fontSize:'14px', fontWeight:'800', color:'#0F172A' }}>{f.name}</span>
                          {activeClosure ? (
                            <span style={{ fontSize:'11px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', borderRadius:'5px', padding:'1px 8px' }}>
                              CLOSED · {activeClosure.reason ?? activeClosure.duration_label}
                            </span>
                          ) : (
                            <span style={{ fontSize:'11px', fontWeight:'700', color:'#16A34A', background:'#F0FDF4', borderRadius:'5px', padding:'1px 8px' }}>OPEN</span>
                          )}
                        </div>
                        {f.sub_zones?.length>0 && (
                          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'3px', flexWrap:'wrap' }}>
                            <div style={{ fontSize:'11.5px', color:'#94A3B8' }}>
                              Zones: {f.sub_zones.join(' · ')}
                            </div>
                            <button
                              onClick={()=>{setZoneTarget(f);setShowZoneModal(true);}}
                              style={{ fontSize:'11px', fontWeight:'700', color:primary, background:`${primary}12`, border:`1px solid ${primary}30`, borderRadius:'5px', padding:'1px 8px', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                              ↗ Create zone fields
                            </button>
                          </div>
                        )}
                        {activeClosure && (
                          <div style={{ fontSize:'11px', color:'#EF4444', marginTop:'2px' }}>
                            {activeClosure.closed_until ? `Until ${fmtDt(activeClosure.closed_until)}` : 'Until further notice'}
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                        {activeClosure ? (
                          <button onClick={()=>reopenClosure(activeClosure.id)}
                            style={{ padding:'6px 12px', borderRadius:'7px', border:'1px solid #BBF7D0', background:'#F0FDF4', color:'#16A34A', fontSize:'12px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                            <CheckCircle size={12} style={{display:'inline',marginRight:'4px',verticalAlign:'middle'}}/>Reopen
                          </button>
                        ) : (
                          <button onClick={()=>{setCloseTarget(f);setShowCloseModal(true);}}
                            style={{ padding:'6px 12px', borderRadius:'7px', border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                            <AlertOctagon size={12} style={{display:'inline',marginRight:'4px',verticalAlign:'middle'}}/>Close
                          </button>
                        )}
                        <IBtn title="Edit" onClick={()=>{setEditField(f);setShowFieldModal(true);}}><Pencil size={13}/></IBtn>
                        <IBtn title="Delete" onClick={()=>deleteField(f.id, f.name)} danger><Trash2 size={13}/></IBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CLOSURES TAB ── */}
        {tab==='closures' && (
          <div>
            {activeClosures.length>0 && (
              <Section title="Active Closures" color="#EF4444">
                {activeClosures.map(c=>(
                  <ClosureCard key={c.id} closure={c} acks={acks.filter(a=>a.closure_id===c.id)} onReopen={()=>reopenClosure(c.id)} primary={primary}/>
                ))}
              </Section>
            )}
            {pastClosures.length>0 && (
              <Section title="Past Closures" color="#94A3B8">
                {pastClosures.slice(0,20).map(c=>(
                  <ClosureCard key={c.id} closure={c} acks={acks.filter(a=>a.closure_id===c.id)} primary={primary}/>
                ))}
              </Section>
            )}
            {closures.length===0 && <Empty icon="✅" title="No closures yet" sub="When you close a field, the record will appear here." />}
          </div>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab==='availability' && (
          <div>
            {/* Header row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', gap:'8px', flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:'16px', fontSize:'11.5px' }}>
                <span style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                  <span style={{ display:'inline-block', width:'12px', height:'12px', borderRadius:'3px', background:'#22C55E', opacity:0.8 }}/> Pitch time
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                  <span style={{ display:'inline-block', width:'12px', height:'12px', borderRadius:'3px', background:'#F59E0B', opacity:0.8 }}/> Unavailable
                </span>
                <span style={{ display:'flex', alignItems:'center', gap:'5px', color:'#94A3B8' }}>
                  <span style={{ display:'inline-block', width:'12px', height:'12px', borderRadius:'3px', background:'#F1F5F9', border:'1px solid #E2E8F0' }}/> Not set
                </span>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={()=>setShowParseModal(true)}
                  style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', background:'#F0FDF4', color:'#16A34A', border:'1px solid #BBF7D0', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                  <Sparkles size={14}/> Import Permit
                </button>
                <button onClick={()=>{setEditRule(null);setShowRuleModal(true);}}
                  style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', background:primary, color:'#fff', border:'none', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                  <Plus size={14}/> Add Block
                </button>
              </div>
            </div>

            {fields.length===0 ? (
              <Empty icon="📍" title="No pitches set up yet" sub="Add your pitches on the Fields tab first, then come back here to configure your booking hours." />
            ) : rules.length===0 ? (
              <div>
                {/* Empty state with a prompt to use the parser */}
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:'12px', padding:'20px 24px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'18px' }}>
                  <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#16A34A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Sparkles size={22} color="#fff"/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'14px', fontWeight:'800', color:'#0F172A', marginBottom:'3px' }}>Got a permit or booking confirmation?</div>
                    <div style={{ fontSize:'12.5px', color:'#64748B', lineHeight:1.5 }}>
                      Drop in the PDF or photo — AI reads your allocated pitch times and sets up the grid automatically.
                    </div>
                  </div>
                  <button onClick={()=>setShowParseModal(true)}
                    style={{ display:'inline-flex', alignItems:'center', gap:'7px', padding:'9px 18px', borderRadius:'9px', background:'#16A34A', color:'#fff', border:'none', fontSize:'12.5px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>
                    <Upload size={13}/> Import permit
                  </button>
                </div>
                {/* Grid placeholder */}
                <AvailabilityCalendar fields={fields} rules={[]}
                  onAddForDate={(fn,d)=>{setEditRule(null);setRulePreField(fn);setRulePreDate(d);setShowRuleModal(true);}}
                  onEdit={(r)=>{setEditRule(r);setRulePreDate(null);setRulePreField(null);setShowRuleModal(true);}}
                  onDelete={deleteRule} primary={primary}/>
              </div>
            ) : (
              <AvailabilityCalendar fields={fields} rules={rules}
                onAddForDate={(fn,d)=>{setEditRule(null);setRulePreField(fn);setRulePreDate(d);setShowRuleModal(true);}}
                onEdit={(r)=>{setEditRule(r);setRulePreDate(null);setRulePreField(null);setShowRuleModal(true);}}
                onDelete={deleteRule} primary={primary}/>
            )}
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
      </div>

      {/* ── MODALS ── */}
      {showFieldModal && (
        <FieldModal
          field={editField} fields={fields} club={club as {id:string}|null}
          primary={primary} onClose={()=>setShowFieldModal(false)} onSaved={load}
        />
      )}
      {showCloseModal && (
        <CloseFieldModal
          target={closeTarget} fields={fields}
          club={club as ({id:string;name:string}&Record<string,unknown>)|null}
          primary={primary}
          onClose={()=>{setShowCloseModal(false);setCloseTarget(null);}}
          onSaved={()=>{setShowCloseModal(false);setCloseTarget(null);load();setTab('closures');}}
        />
      )}
      {showRuleModal && (
        <AvailabilityRuleModal
          rule={editRule} fields={fields}
          preselectedDate={rulePreDate} preselectedField={rulePreField}
          club={club as {id:string}|null} primary={primary}
          onClose={()=>{setShowRuleModal(false);setRulePreDate(null);setRulePreField(null);}} onSaved={load}
        />
      )}
      {showParseModal && (
        <ParsePermitModal
          fields={fields}
          club={club as {id:string}|null} primary={primary}
          onClose={()=>setShowParseModal(false)} onSaved={()=>{setShowParseModal(false);load();}}
        />
      )}
      {showZoneModal && zoneTarget && (
        <CreateZoneFieldsModal
          parent={zoneTarget} existingNames={fields.map(f=>f.name)}
          club={club as {id:string}|null} primary={primary}
          onClose={()=>{setShowZoneModal(false);setZoneTarget(null);}}
          onSaved={()=>{setShowZoneModal(false);setZoneTarget(null);load();}}
        />
      )}
    </div>
  );
}

// ── Weather Widget ─────────────────────────────────────────────────────────────

function WeatherWidget({ weather, hasLocation, onSave, saving, primary: _primary }: {
  weather: WeatherHour[]; hasLocation: boolean;
  onSave:(lat:number,lng:number)=>void; saving:boolean; primary:string;
}) {
  const [showSetup,    setShowSetup]    = useState(!hasLocation);
  const [query,        setQuery]        = useState('');
  const [suggestions,  setSuggestions]  = useState<{place_id:string;description:string}[]>([]);
  const [locating,     setLocating]     = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/places?input=${encodeURIComponent(val)}`);
      const data = await res.json();
      setSuggestions(data.predictions ?? []);
    }, 300);
  }

  async function selectPlace(placeId: string, description: string) {
    setQuery(description);
    setSuggestions([]);
    const res = await fetch(`/api/places?place_id=${encodeURIComponent(placeId)}`);
    const data = await res.json();
    const loc = data.result?.geometry?.location;
    if (loc) onSave(loc.lat, loc.lng);
  }

  function locateMyClub() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLocating(false); onSave(pos.coords.latitude, pos.coords.longitude); },
      ()  => { setLocating(false); alert('Could not get your location — try searching instead.'); }
    );
  }

  if (!hasLocation) {
    return (
      <div style={{ background:'#FFF7ED', border:'1px solid #FDE68A', borderRadius:'10px', padding:'14px 18px', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
          <div style={{ fontSize:'13px', color:'#92400E' }}>
            <strong>Set club location</strong> to see weather forecasts and get rain alerts for your fields.
          </div>
          <button onClick={()=>setShowSetup(x=>!x)}
            style={{ padding:'6px 14px', borderRadius:'7px', border:'1px solid #FDE68A', background:'#fff', color:'#92400E', fontSize:'12px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
            {showSetup?'Cancel':'Set location'}
          </button>
        </div>
        {showSetup && (
          <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ position:'relative' }}>
              <input
                placeholder="Search your club address…"
                value={query}
                onChange={e=>handleQueryChange(e.target.value)}
                style={{ ...inp, paddingRight:'36px' }}
                autoFocus
              />
              {saving && (
                <div style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', fontSize:'11px', color:'#92400E' }}>Saving…</div>
              )}
              {suggestions.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1.5px solid #E2E8F0', borderRadius:'8px', marginTop:'3px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, overflow:'hidden' }}>
                  {suggestions.map(s=>(
                    <div key={s.place_id} onClick={()=>selectPlace(s.place_id, s.description)}
                      style={{ padding:'9px 13px', fontSize:'13px', color:'#0F172A', cursor:'pointer', borderBottom:'1px solid #F1F5F9' }}
                      onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')}
                      onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                      {s.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={locateMyClub} disabled={locating}
              style={{ alignSelf:'flex-start', display:'flex', alignItems:'center', gap:'6px', padding:'6px 13px', borderRadius:'7px', border:'1px solid #E2E8F0', background:'#fff', color:'#64748B', fontSize:'12px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
              <MapPin size={12}/>{locating?'Getting location…':'Use my current location'}
            </button>
          </div>
        )}
      </div>
    );
  }
  if (weather.length===0) return null;

  // Group by day
  const days: Record<string, WeatherHour[]> = {};
  weather.forEach(h => {
    const d = h.time.slice(0,10);
    if (!days[d]) days[d] = [];
    days[d].push(h);
  });

  return (
    <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:'10px', padding:'14px 18px', marginBottom:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
        <div style={{ fontSize:'10px', fontWeight:'800', color:'#0369A1', textTransform:'uppercase', letterSpacing:'1.5px' }}>Afternoon Forecast (3pm–8pm)</div>
        <button onClick={()=>setShowSetup(x=>!x)} style={{ fontSize:'10px', fontWeight:'700', color:'#0369A1', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit', textDecoration:'underline' }}>
          {showSetup ? 'Cancel' : 'Change location'}
        </button>
      </div>
      {showSetup && (
        <div style={{ marginBottom:'12px', display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ position:'relative' }}>
            <input
              placeholder="Search your club address…"
              value={query}
              onChange={e=>handleQueryChange(e.target.value)}
              style={{ ...inp, paddingRight:'36px' }}
              autoFocus
            />
            {saving && <div style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', fontSize:'11px', color:'#0369A1' }}>Saving…</div>}
            {suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1.5px solid #E2E8F0', borderRadius:'8px', marginTop:'3px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:50, overflow:'hidden' }}>
                {suggestions.map(s=>(
                  <div key={s.place_id} onClick={()=>{ selectPlace(s.place_id, s.description); setShowSetup(false); }}
                    style={{ padding:'9px 13px', fontSize:'13px', color:'#0F172A', cursor:'pointer', borderBottom:'1px solid #F1F5F9' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='#F8FAFC')}
                    onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                    {s.description}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={()=>{ locateMyClub(); setShowSetup(false); }} disabled={locating}
            style={{ alignSelf:'flex-start', display:'flex', alignItems:'center', gap:'6px', padding:'6px 13px', borderRadius:'7px', border:'1px solid #BAE6FD', background:'#fff', color:'#0369A1', fontSize:'12px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
            <MapPin size={12}/>{locating?'Getting location…':'Use my current location'}
          </button>
        </div>
      )}
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
        {Object.entries(days).map(([day, hours]) => {
          const maxRain = Math.max(...hours.map(h => h.chance_of_rain));
          const midHour = hours[Math.floor(hours.length / 2)];
          const condition = midHour?.condition_text ?? '';
          const date = new Date(day + 'T12:00:00');
          const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <div key={day} style={{ background:'#fff', borderRadius:'8px', padding:'10px 14px', border:`1.5px solid ${maxRain>=60?'#FCA5A5':maxRain>=30?'#FDE68A':'#E0F2FE'}`, minWidth:'130px', textAlign:'center' }}>
              <div style={{ fontSize:'11px', fontWeight:'700', color:'#0369A1', marginBottom:'5px' }}>{label}</div>
              <div style={{ margin:'4px 0' }}>{weatherIcon(condition, 22)}</div>
              <div style={{ fontSize:'11px', color:'#64748B', marginBottom:'3px' }}>{weatherLabel(condition)}</div>
              <div style={{ fontSize:'12px', fontWeight:'700', color:maxRain>=60?'#EF4444':maxRain>=30?'#F59E0B':'#16A34A' }}>
                <CloudRain size={11} style={{display:'inline',verticalAlign:'middle',marginRight:'2px'}}/>{maxRain}% rain
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Closure Card ───────────────────────────────────────────────────────────────

function ClosureCard({ closure, acks, onReopen, primary: _primary }: { closure:FieldClosure; acks:ClosureAck[]; onReopen?:()=>void; primary:string; }) {
  const [expanded, setExpanded] = useState(false);
  const active = isActiveClosure(closure);
  return (
    <div style={{ background:'#fff', borderRadius:'10px', border:`1.5px solid ${active?'#FCA5A5':'#E2E8F0'}`, padding:'14px 16px', marginBottom:'8px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <span style={{ fontSize:'14px', fontWeight:'800', color:'#0F172A' }}>{closure.field_name}</span>
            <span style={{ fontSize:'11px', fontWeight:'700', padding:'1px 7px', borderRadius:'5px', background:active?'#FEF2F2':'#F1F5F9', color:active?'#EF4444':'#94A3B8' }}>{active?'ACTIVE':'PAST'}</span>
          </div>
          {closure.reason && <div style={{ fontSize:'12px', color:'#64748B', marginBottom:'3px' }}>{closure.reason}</div>}
          <div style={{ fontSize:'11.5px', color:'#94A3B8' }}>
            {fmtDt(closure.closed_from)} → {closure.closed_until ? fmtDt(closure.closed_until) : 'Until further notice'}
          </div>
          {closure.emails_sent_count>0 && (
            <div style={{ fontSize:'11px', color:'#64748B', marginTop:'4px' }}>
              📧 {closure.emails_sent_count} emails sent
              {closure.push_sent && ' · 📱 Push sent'}
              {acks.length>0 && ` · ✅ ${acks.length} coach${acks.length!==1?'es':''} acknowledged`}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:'6px', flexShrink:0, alignItems:'center' }}>
          {closure.notify_message && (
            <button onClick={()=>setExpanded(x=>!x)}
              style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid #E2E8F0', background:'#F8FAFC', color:'#64748B', fontSize:'11px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'4px' }}>
              Message {expanded?<ChevronUp size={11}/>:<ChevronDown size={11}/>}
            </button>
          )}
          {onReopen && active && (
            <button onClick={onReopen}
              style={{ padding:'5px 12px', borderRadius:'7px', border:'1px solid #BBF7D0', background:'#F0FDF4', color:'#16A34A', fontSize:'12px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
              Reopen
            </button>
          )}
        </div>
      </div>
      {expanded && closure.notify_message && (
        <div style={{ marginTop:'10px', padding:'10px 13px', background:'#F8FAFC', borderRadius:'7px', border:'1px solid #E2E8F0', fontSize:'12.5px', color:'#374151', lineHeight:1.6, fontStyle:'italic' }}>
          &quot;{closure.notify_message}&quot;
        </div>
      )}
      {acks.length>0 && expanded && (
        <div style={{ marginTop:'8px', display:'flex', flexWrap:'wrap', gap:'5px' }}>
          {acks.map(a=>(
            <span key={a.coach_email} style={{ fontSize:'10.5px', background:'#F0FDF4', color:'#16A34A', border:'1px solid #BBF7D0', borderRadius:'5px', padding:'2px 8px' }}>
              ✓ {a.coach_name ?? a.coach_email}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Close Field Modal ──────────────────────────────────────────────────────────

function CloseFieldModal({ target, fields, club, primary, onClose, onSaved }: {
  target: TryoutField|null; fields: TryoutField[];
  club:{id:string;name:string}&Record<string,unknown>|null;
  primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  const [selectedFields, setSelectedFields] = useState<string[]>(target ? [target.name] : []);
  const [duration,       setDuration]       = useState('rest_of_day');
  const [customHours,    setCustomHours]    = useState('2');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [reason,         setReason]         = useState('');
  const [message,        setMessage]        = useState('');

  const [drafting,       setDrafting]       = useState(false);
  const [draftError,     setDraftError]     = useState('');
  const [sending,        setSending]        = useState(false);
  const [step,           setStep]           = useState<'config'|'preview'>('config');
  const [blastCount,     setBlastCount]     = useState<{sessions:number;coaches:number;parents:number}|null>(null);


  // AI draft
  async function draftMessage() {
    if (!message.trim()) return;
    setDrafting(true);
    setDraftError('');
    const fieldNames = selectedFields.join(', ');
    const durationDesc = duration==='rest_of_day'?'for the rest of today':duration==='hours'?`for the next ${customHours} hours`:duration==='indefinite'?'until further notice':'for a specific period';
    const prompt = `You are writing a field closure notification for a youth soccer club called "${club?.name ?? 'our club'}". The admin has written these raw notes: "${message.trim()}". Field(s) affected: ${fieldNames}. Duration: ${durationDesc}${reason ? `. Reason: ${reason}` : ''}. Rewrite it as a single short paragraph (2-3 sentences max) for parents and coaches. Be direct and clear — no fluff, no filler phrases like "We understand this may be disappointing". End with "We'll update you when the field reopens." Return only the message text.`;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai', {
        method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session?.access_token ?? ''}`},
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const text: string | undefined = data.result ?? data.text;
      if (text) {
        setMessage(text);
      } else {
        setDraftError(data.error ?? 'AI draft failed — try again');
      }
    } catch {
      setDraftError('Network error — check connection and try again');
    }
    setDrafting(false);
  }

  // Compute closed_until
  function getClosedUntil(): string | null {
    const now = new Date();
    if (duration==='rest_of_day') {
      const eod = new Date(now); eod.setHours(23,59,59,0); return eod.toISOString();
    }
    if (duration==='hours') {
      return new Date(now.getTime() + parseFloat(customHours)*3600000).toISOString();
    }
    if (duration==='date_range' && dateTo) {
      return new Date(dateTo + 'T23:59:59').toISOString();
    }
    return null; // indefinite
  }

  async function goToPreview() {
    // Blast radius: count assigned game_slots on the affected fields within the closure window
    if (!club) return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let query = supabase
      .from('game_slots')
      .select('id, home_team_id, home_team:teams(name)')
      .eq('club_id', club.id)
      .eq('status', 'assigned')
      .in('field_name', selectedFields);
    if (duration === 'rest_of_day' || duration === 'hours') {
      query = query.eq('slot_date', todayStr);
    } else if (duration === 'date_range' && dateFrom && dateTo) {
      query = query.gte('slot_date', dateFrom).lte('slot_date', dateTo);
    }
    const { data: affectedSlots } = await query;
    const sessions = (affectedSlots ?? []).length;
    const homeTeams = new Set((affectedSlots ?? []).map(s => s.home_team_id).filter(Boolean));
    const { data: teamMembers } = homeTeams.size > 0
      ? await supabase.from('team_members').select('profile_id, role').in('team_id', [...homeTeams])
      : { data: [] };
    const coaches = new Set((teamMembers ?? []).filter(m => m.role === 'coach').map(m => m.profile_id)).size;
    const parents = (teamMembers ?? []).filter(m => m.role === 'parent' || m.role === 'player').length;
    setBlastCount({ sessions, coaches, parents });
    setStep('preview');
  }

  async function send() {
    setSending(true);
    const closedFrom = new Date().toISOString();
    const closedUntil = getClosedUntil();
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await fetch('/api/fields/close', {
      method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${session?.access_token ?? ''}`},
      body: JSON.stringify({
        club_id: club?.id, field_names: selectedFields,
        closed_from: closedFrom, closed_until: closedUntil,
        duration_label: duration, reason, notify_message: message,
      }),
    }).then(r=>r.json());
    setSending(false);
    if (!error) onSaved();
  }

  const canProceed = selectedFields.length>0 && reason.trim().length>0;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'20px' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'14px', width:'560px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'18px 22px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'16px', fontWeight:'800', color:'#0F172A' }}>
              {step==='config'?'Close a Field':'Preview & Send'}
            </div>
            <div style={{ fontSize:'12px', color:'#94A3B8', marginTop:'1px' }}>
              {step==='config'?'Cancel affected sessions and notify everyone':'Review the notification before sending'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={16} color="#94A3B8"/></button>
        </div>

        {step==='config' && (
          <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:'16px' }}>

            {/* Field selector */}
            <div>
              {lbl('Which fields?')}
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {fields.map(f=>(
                  <label key={f.id} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'8px 12px', borderRadius:'8px', border:`1.5px solid ${selectedFields.includes(f.name)?primary:'#E2E8F0'}`, background:selectedFields.includes(f.name)?`${primary}08`:'#FAFAFA', cursor:'pointer' }}>
                    <input type="checkbox" checked={selectedFields.includes(f.name)}
                      onChange={e=>setSelectedFields(prev=>e.target.checked?[...prev,f.name]:prev.filter(n=>n!==f.name))}
                      style={{ accentColor:primary, width:'15px', height:'15px' }}/>
                    <span style={{ fontSize:'13px', fontWeight:'600', color:'#0F172A' }}>{f.name}</span>
                    {f.sub_zones?.length>0 && <span style={{ fontSize:'11px', color:'#94A3B8' }}>({f.sub_zones.join(', ')})</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              {lbl('How long?')}
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                {DURATION_OPTIONS.map(o=>(
                  <button key={o.value} onClick={()=>setDuration(o.value)}
                    style={{ padding:'6px 14px', borderRadius:'7px', border:`1.5px solid ${duration===o.value?primary:'#E2E8F0'}`, background:duration===o.value?`${primary}10`:'#fff', color:duration===o.value?primary:'#64748B', fontSize:'12.5px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                    {o.label}
                  </button>
                ))}
              </div>
              {duration==='hours' && (
                <div style={{ marginTop:'8px', display:'flex', alignItems:'center', gap:'8px' }}>
                  <input type="number" min="1" max="24" value={customHours} onChange={e=>setCustomHours(e.target.value)}
                    style={{ ...inp, width:'70px' }}/>
                  <span style={{ fontSize:'13px', color:'#64748B' }}>hours</span>
                </div>
              )}
              {duration==='date_range' && (
                <div style={{ marginTop:'8px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div><div style={{ fontSize:'10px', color:'#94A3B8', marginBottom:'3px' }}>From</div><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={inp}/></div>
                  <div><div style={{ fontSize:'10px', color:'#94A3B8', marginBottom:'3px' }}>Until</div><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={inp}/></div>
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              {lbl('Reason')}
              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginBottom:'8px' }}>
                {QUICK_REASONS.map(r=>(
                  <button key={r} onClick={()=>setReason(r)}
                    style={{ padding:'4px 11px', borderRadius:'6px', border:`1px solid ${reason===r?primary:'#E2E8F0'}`, background:reason===r?`${primary}10`:'#F8FAFC', color:reason===r?primary:'#64748B', fontSize:'12px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Or describe the reason…" style={inp}/>
            </div>

            {/* Message */}
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px' }}>
                {lbl('Parent & coach notification')}
                <button onClick={draftMessage} disabled={drafting||!message.trim()}
                  style={{ display:'flex', alignItems:'center', gap:'5px', padding:'4px 10px', borderRadius:'6px', border:`1px solid ${primary}`, background:`${primary}10`, color:primary, fontSize:'11.5px', fontWeight:'700', cursor:!message.trim()?'not-allowed':'pointer', fontFamily:'inherit', opacity:!message.trim()?0.5:1 }}>
                  <Sparkles size={11}/>{drafting?'Drafting…':'AI Polish'}
                </button>
              </div>
              {draftError && (
                <div style={{ fontSize:'11.5px', color:'#EF4444', marginBottom:'6px', padding:'6px 10px', background:'#FEF2F2', borderRadius:'6px', border:'1px solid #FCA5A5' }}>
                  {draftError}
                </div>
              )}
              <textarea value={message} onChange={e=>setMessage(e.target.value)}
                placeholder="Jot your notes here (e.g. 'rain overnight, fields waterlogged') then hit AI Polish to clean it up…"
                rows={4}
                style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/>
            </div>
          </div>
        )}

        {step==='preview' && blastCount && (
          <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:'16px' }}>
            {/* Blast radius */}
            <div style={{ background:'#F8FAFC', borderRadius:'10px', border:'1px solid #E2E8F0', padding:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', textAlign:'center' }}>
              {[['Sessions cancelled', blastCount.sessions, '#EF4444'],['Coaches notified', blastCount.coaches, '#F59E0B'],['Parents notified', blastCount.parents, '#3B82F6']].map(([label,val,color])=>(
                <div key={label as string}>
                  <div style={{ fontSize:'24px', fontWeight:'900', color:color as string }}>{val as number}</div>
                  <div style={{ fontSize:'10.5px', color:'#94A3B8', fontWeight:'600', marginTop:'2px' }}>{label as string}</div>
                </div>
              ))}
            </div>
            {/* Fields being closed */}
            <div>
              {lbl('Fields closing')}
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                {selectedFields.map(f=>(
                  <span key={f} style={{ padding:'4px 12px', borderRadius:'6px', background:'#FEF2F2', color:'#EF4444', fontSize:'12.5px', fontWeight:'700', border:'1px solid #FCA5A5' }}>{f}</span>
                ))}
              </div>
            </div>
            {/* Duration summary */}
            <div>
              {lbl('Duration')}
              <div style={{ fontSize:'13px', color:'#374151' }}>
                {duration==='rest_of_day'&&'Until end of today (midnight)'}
                {duration==='hours'&&`Next ${customHours} hour${customHours==='1'?'':'s'}`}
                {duration==='date_range'&&`${dateFrom} → ${dateTo}`}
                {duration==='indefinite'&&'Until manually reopened'}
              </div>
            </div>
            {/* Message preview */}
            {message && (
              <div>
                {lbl('Notification message')}
                <div style={{ background:'#F8FAFC', borderRadius:'8px', border:'1px solid #E2E8F0', padding:'12px 15px', fontSize:'13px', color:'#374151', lineHeight:1.65, fontStyle:'italic' }}>
                  &quot;{message}&quot;
                </div>
              </div>
            )}
            <div style={{ background:'#FFF7ED', borderRadius:'8px', border:'1px solid #FDE68A', padding:'10px 14px', fontSize:'12px', color:'#92400E' }}>
              ⚡ This will immediately cancel affected sessions, send emails, and push a notification to the app.
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding:'14px 22px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          {step==='preview' ? (
            <>
              <button onClick={()=>setStep('config')}
                style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', color:'#64748B' }}>
                ← Back
              </button>
              <button onClick={send} disabled={sending}
                style={{ padding:'9px 22px', borderRadius:'8px', background:'#EF4444', color:'#fff', border:'none', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
                <AlertOctagon size={14}/>{sending?'Closing…':'Close Fields & Notify Everyone'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose}
                style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', color:'#64748B' }}>
                Cancel
              </button>
              <button onClick={goToPreview} disabled={!canProceed}
                style={{ padding:'9px 22px', borderRadius:'8px', background:canProceed?primary:'#E2E8F0', color:canProceed?'#fff':'#94A3B8', border:'none', fontSize:'13px', fontWeight:'700', cursor:canProceed?'pointer':'not-allowed', fontFamily:'inherit' }}>
                Preview & Continue →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Field Add/Edit Modal ───────────────────────────────────────────────────────

const FORMAT_OPTIONS = [
  { value: '7v7',   label: '7v7',   sub: '90 min' },
  { value: '9v9',   label: '9v9',   sub: '1h 45m' },
  { value: '11v11', label: '11v11', sub: '2h' },
] as const;

function FieldModal({ field, fields, club, primary, onClose, onSaved }: {
  field:TryoutField|null; fields:TryoutField[]; club:{id:string}|null;
  primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  const [form, setForm] = useState({
    name:                 field?.name??'',
    sub_zones:            field?.sub_zones?.join(', ')??'',
    rental_cost_per_hour: field?.rental_cost_per_hour?.toString()??'',
    field_group:          field?.field_group??'',
    is_full_field:        field?.is_full_field??false,
    scheduler_format:     field?.scheduler_format??'7v7',
    scheduler_split:      field?.scheduler_split??1,
    half_a_name:          field?.half_a_name??'',
    half_b_name:          field?.half_b_name??'',
    has_lights:           field?.has_lights??false,
    surface_type:         field?.surface_type??'',
    field_notes:          field?.field_notes??'',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!club||!form.name.trim()) return; setSaving(true);
    const zones = form.sub_zones.split(',').map(z=>z.trim()).filter(Boolean);
    const cost  = form.rental_cost_per_hour ? parseFloat(form.rental_cost_per_hour) : null;
    const newName = form.name.trim();
    const payload = {
      name: newName, sub_zones: zones, rental_cost_per_hour: cost,
      field_group: form.field_group.trim() || null, is_full_field: form.is_full_field,
      scheduler_format: form.scheduler_format,
      scheduler_split:  form.scheduler_split,
      half_a_name:  form.half_a_name.trim()  || null,
      half_b_name:  form.half_b_name.trim()  || null,
      has_lights:   form.has_lights,
      surface_type: form.surface_type || null,
      field_notes:  form.field_notes.trim() || null,
    };
    if (field) {
      await supabase.from('tryout_fields').update(payload).eq('id',field.id);
      // Cascade rename to all tables that store field_name as a plain string
      if (field.name !== newName) {
        const oldName = field.name;
        await Promise.all([
          supabase.from('game_slots').update({ field_name: newName }).eq('club_id', club.id).eq('field_name', oldName),
          supabase.from('game_slots').update({ field_name: `${newName} [A]` }).eq('club_id', club.id).eq('field_name', `${oldName} [A]`),
          supabase.from('game_slots').update({ field_name: `${newName} [B]` }).eq('club_id', club.id).eq('field_name', `${oldName} [B]`),
          supabase.from('field_availability_rules').update({ field_name: newName }).eq('club_id', club.id).eq('field_name', oldName),
          supabase.from('field_closures').update({ field_name: newName }).eq('club_id', club.id).eq('field_name', oldName),
        ]);
      }
    } else {
      await supabase.from('tryout_fields').insert({ club_id:club.id, ...payload, is_active:true, sort_order:fields.length });
    }
    setSaving(false); onSaved(); onClose();
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'20px' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'14px', width:'520px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }} onClick={e=>e.stopPropagation()}>
        <MHead title={field?'Edit Field':'Add Field'} onClose={onClose}/>
        <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Basic info */}
          <div>{lbl('Field name *')}<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Vets Field" style={inp} autoFocus/></div>
          <div>{lbl('Zones (comma-separated)')}<input value={form.sub_zones} onChange={e=>setForm(f=>({...f,sub_zones:e.target.value}))} placeholder="e.g. Zone 1A, Zone 1B, Zone 1C" style={inp}/></div>
          <div>{lbl('Rental cost per hour ($)')}<input type="number" min="0" step="5" value={form.rental_cost_per_hour} onChange={e=>setForm(f=>({...f,rental_cost_per_hour:e.target.value}))} placeholder="0" style={inp}/></div>

          {/* Conflict detection */}
          <div style={{borderTop:'1px solid #F1F5F9',paddingTop:'14px'}}>
            {lbl('Field group (for conflict detection)')}
            <input value={form.field_group} onChange={e=>setForm(f=>({...f,field_group:e.target.value}))} placeholder="e.g. maple (groups Maple East, Maple West, Maple Full)" style={inp}/>
            <div style={{marginTop:'10px',display:'flex',alignItems:'center',gap:'10px'}}>
              <input type="checkbox" id="fm_is_full_field" checked={form.is_full_field} onChange={e=>setForm(f=>({...f,is_full_field:e.target.checked}))} style={{width:'16px',height:'16px',cursor:'pointer'}}/>
              <label htmlFor="fm_is_full_field" style={{fontSize:'13px',color:'#374151',cursor:'pointer',userSelect:'none'}}>
                Full field — blocks sub-zone slots when assigned here
              </label>
            </div>
          </div>

          {/* Scheduler settings */}
          <div style={{borderTop:'1px solid #F1F5F9',paddingTop:'14px',display:'flex',flexDirection:'column',gap:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:'800',color:'#94A3B8',textTransform:'uppercase',letterSpacing:'1.5px'}}>Game Scheduler</div>

            {/* Format */}
            <div>
              {lbl('Game format')}
              <div style={{display:'flex',gap:'8px'}}>
                {FORMAT_OPTIONS.map(fp=>(
                  <button key={fp.value} onClick={()=>setForm(f=>({...f,scheduler_format:fp.value}))}
                    style={{flex:1,padding:'9px 8px',borderRadius:'9px',cursor:'pointer',fontFamily:'inherit',border:form.scheduler_format===fp.value?`2px solid ${primary}`:'2px solid #E2E8F0',background:form.scheduler_format===fp.value?`${primary}12`:'#fff'}}>
                    <div style={{fontSize:'13px',fontWeight:'800',color:form.scheduler_format===fp.value?primary:'#374151'}}>{fp.label}</div>
                    <div style={{fontSize:'10px',color:'#94A3B8',marginTop:'1px'}}>{fp.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Split */}
            <div>
              {lbl('Field split')}
              <button onClick={()=>setForm(f=>({...f,scheduler_split:f.scheduler_split===2?1:2}))}
                style={{width:'100%',padding:'10px 14px',borderRadius:'9px',border:form.scheduler_split===2?`2px solid ${primary}`:'2px solid #E2E8F0',background:form.scheduler_split===2?`${primary}10`:'#fff',color:form.scheduler_split===2?primary:'#374151',fontSize:'13px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit',textAlign:'left',display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{fontSize:'14px'}}>{form.scheduler_split===2?'⧠':'□'}</span>
                {form.scheduler_split===2?'Split into two halves (A + B)':'Full field — one game at a time'}
              </button>
              {form.scheduler_split===2 && (
                <div style={{marginTop:'8px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  <div><input value={form.half_a_name} onChange={e=>setForm(f=>({...f,half_a_name:e.target.value}))} placeholder="Half A name (optional)" style={inp}/>
                    <div style={{fontSize:'10px',color:'#94A3B8',marginTop:'3px',fontWeight:'600',letterSpacing:'0.5px',textTransform:'uppercase'}}>First half</div>
                  </div>
                  <div><input value={form.half_b_name} onChange={e=>setForm(f=>({...f,half_b_name:e.target.value}))} placeholder="Half B name (optional)" style={inp}/>
                    <div style={{fontSize:'10px',color:'#94A3B8',marginTop:'3px',fontWeight:'600',letterSpacing:'0.5px',textTransform:'uppercase'}}>Second half</div>
                  </div>
                </div>
              )}
            </div>

            {/* Surface + lights */}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'10px',alignItems:'end'}}>
              <div>
                {lbl('Surface type')}
                <select value={form.surface_type} onChange={e=>setForm(f=>({...f,surface_type:e.target.value}))} style={inp}>
                  <option value="">— Not specified —</option>
                  <option>Natural Grass</option>
                  <option>Artificial Turf</option>
                  <option>Hybrid</option>
                  <option>Indoor</option>
                  <option>Other</option>
                </select>
              </div>
              <button onClick={()=>setForm(f=>({...f,has_lights:!f.has_lights}))}
                style={{padding:'9px 14px',borderRadius:'9px',border:form.has_lights?`2px solid ${primary}`:'2px solid #E2E8F0',background:form.has_lights?`${primary}10`:'#fff',color:form.has_lights?primary:'#374151',fontSize:'12px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                {form.has_lights?'💡 Has lights':'No lights'}
              </button>
            </div>

            {/* Notes */}
            <div>
              {lbl('Field notes')}
              <textarea value={form.field_notes} onChange={e=>setForm(f=>({...f,field_notes:e.target.value}))} placeholder="Parking, access codes, special instructions…" rows={2} style={{...inp,resize:'vertical',lineHeight:1.5}}/>
            </div>
          </div>
        </div>
        <MFoot onClose={onClose} onSave={save} saving={saving} disabled={!form.name.trim()} primary={primary} label={field?'Save changes':'Add field'}/>
      </div>
    </div>
  );
}

// ── Create Zone Fields Modal ──────────────────────────────────────────────────

function CreateZoneFieldsModal({ parent, existingNames, club, primary, onClose, onSaved }: {
  parent: TryoutField; existingNames: string[];
  club: {id:string}|null; primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  // Derive a sensible group slug from the parent name
  const defaultGroup = parent.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const [group,      setGroup]    = useState(parent.field_group ?? defaultGroup);
  const [fullZone,   setFullZone] = useState<string>(parent.sub_zones[0] ?? '');
  const [saving,     setSaving]   = useState(false);

  const alreadyExist = parent.sub_zones.filter(z => existingNames.includes(z));
  const toCreate     = parent.sub_zones.filter(z => !existingNames.includes(z));

  async function create() {
    if (!club || toCreate.length === 0) return;
    setSaving(true);
    const rows = toCreate.map((zone, i) => ({
      club_id:      club.id,
      name:         zone,
      sub_zones:    [],
      is_active:    true,
      sort_order:   (parent.sort_order ?? 0) + i + 1,
      field_group:  group.trim() || null,
      is_full_field: zone === fullZone,
    }));
    await supabase.from('tryout_fields').insert(rows);
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'20px' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'14px', width:'460px', boxShadow:'0 24px 64px rgba(0,0,0,0.25)' }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'18px 22px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'16px', fontWeight:'800', color:'#0F172A' }}>Create zone fields</div>
            <div style={{ fontSize:'12px', color:'#94A3B8', marginTop:'2px' }}>From <strong>{parent.name}</strong></div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer' }}>
            <X size={16} color="#94A3B8"/>
          </button>
        </div>

        <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:'16px' }}>
          {/* Field group */}
          <div>
            {lbl('Field group name')}
            <input value={group} onChange={e=>setGroup(e.target.value)} placeholder="e.g. maple" style={inp}/>
            <div style={{ fontSize:'11px', color:'#94A3B8', marginTop:'4px' }}>All zone fields share this group — the scheduler uses it to detect conflicts.</div>
          </div>

          {/* Zone list — pick full field */}
          <div>
            {lbl('Which zone is the full field?')}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {parent.sub_zones.map(zone => {
                const exists = existingNames.includes(zone);
                return (
                  <label key={zone} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', borderRadius:'9px', border:`1.5px solid ${fullZone===zone ? primary : '#E2E8F0'}`, background: fullZone===zone ? `${primary}10` : exists ? '#FAFBFC' : '#fff', cursor: exists ? 'default' : 'pointer', opacity: exists ? 0.5 : 1 }}>
                    <input type="radio" name="fullZone" value={zone} checked={fullZone===zone} onChange={()=>setFullZone(zone)} disabled={exists} style={{ accentColor:primary }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'13px', fontWeight:'700', color:'#0F172A' }}>{zone}</div>
                      {exists && <div style={{ fontSize:'11px', color:'#94A3B8' }}>Already exists — will be skipped</div>}
                    </div>
                    {fullZone===zone && !exists && (
                      <span style={{ fontSize:'10px', fontWeight:'800', color:primary, background:`${primary}18`, borderRadius:'4px', padding:'2px 7px' }}>FULL FIELD</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          {toCreate.length > 0 ? (
            <div style={{ padding:'10px 14px', background:'#F0FDF4', borderRadius:'9px', border:'1px solid #BBF7D0', fontSize:'12px', color:'#15803D' }}>
              ✅ Will create <strong>{toCreate.length}</strong> field{toCreate.length!==1?'s':''}: {toCreate.join(', ')}
              {alreadyExist.length > 0 && ` · skipping ${alreadyExist.length} that already exist`}
            </div>
          ) : (
            <div style={{ padding:'10px 14px', background:'#FFFBEB', borderRadius:'9px', border:'1px solid #FDE68A', fontSize:'12px', color:'#92400E' }}>
              ⚠️ All zone fields already exist. You can edit them individually to set field_group and full field flag.
            </div>
          )}
        </div>

        <div style={{ padding:'14px 22px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
          <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', cursor:'pointer', fontFamily:'inherit', color:'#64748B' }}>Cancel</button>
          <button onClick={create} disabled={saving || toCreate.length===0}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'none', fontSize:'13px', fontWeight:'700', fontFamily:'inherit', cursor:(saving||toCreate.length===0)?'not-allowed':'pointer', background:(saving||toCreate.length===0)?'#E2E8F0':primary, color:(saving||toCreate.length===0)?'#94A3B8':'#fff' }}>
            {saving ? 'Creating…' : `Create ${toCreate.length} field${toCreate.length!==1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Availability Calendar ─────────────────────────────────────────────────────

function AvailabilityCalendar({ fields, rules, onAddForDate, onEdit, onDelete, primary }: {
  fields: TryoutField[]; rules: AvailabilityRule[];
  onAddForDate:(fieldName:string, date:string)=>void;
  onEdit:(r:AvailabilityRule)=>void; onDelete:(id:string)=>void; primary:string;
}) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);

  const firstRuleDate = rules.filter(r=>r.rule_date).sort((a,b)=>(a.rule_date??'').localeCompare(b.rule_date??''))[0]?.rule_date;
  const initDate = firstRuleDate ? new Date(firstRuleDate+'T12:00:00') : today;

  const [calYear,  setCalYear]  = useState(initDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initDate.getMonth());
  const [viewMode, setViewMode] = useState<'field'|'date'>('field');
  const [byDate,   setByDate]   = useState(todayStr);

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_HDR = ['M','T','W','T','F','S','S'];

  function prevMonth() { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); }
  function nextMonth() { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); }
  function fmtT(t:string){const[h,m]=t.split(':').map(Number);return`${h%12||12}:${String(m).padStart(2,'0')}${h<12?'am':'pm'}`;}
  function fmtDate(y:number,m:number,d:number){return`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  function startPad(y:number,m:number){const d=new Date(y,m,1).getDay();return d===0?6:d-1;}
  function daysIn(y:number,m:number){return new Date(y,m+1,0).getDate();}

  const pad   = startPad(calYear, calMonth);
  const total = daysIn(calYear, calMonth);
  const cells: Array<{date:string;day:number}|null> = [
    ...Array(pad).fill(null),
    ...Array.from({length:total},(_,i)=>({day:i+1,date:fmtDate(calYear,calMonth,i+1)})),
  ];
  while(cells.length%7!==0) cells.push(null);

  function rulesFor(fieldName:string, date:string){ return rules.filter(r=>r.rule_date===date&&r.field_name===fieldName); }

  // Count how many fields have any data at all
  const fieldsWithData  = fields.filter(f=>rules.some(r=>r.field_name===f.name&&r.rule_date));
  const fieldsEmpty     = fields.filter(f=>!rules.some(r=>r.field_name===f.name&&r.rule_date));

  return (
    <div>
      {/* ── Control row ── */}
      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'18px',flexWrap:'wrap'}}>
        {/* View toggle */}
        <div style={{display:'flex',gap:'2px',background:'#F1F5F9',borderRadius:'8px',padding:'3px'}}>
          {(['field','date'] as const).map(mode=>(
            <button key={mode} onClick={()=>setViewMode(mode)}
              style={{padding:'5px 14px',borderRadius:'6px',border:'none',background:viewMode===mode?'#fff':'transparent',color:viewMode===mode?'#0F172A':'#64748B',fontSize:'12px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit',boxShadow:viewMode===mode?'0 1px 2px rgba(0,0,0,0.08)':'none',transition:'all 0.12s'}}>
              {mode==='field'?'By field':'By date'}
            </button>
          ))}
        </div>

        {viewMode==='field' && (
          <div style={{display:'flex',alignItems:'center',gap:'4px',marginLeft:'auto',background:'#fff',border:'1px solid #E2E8F0',borderRadius:'8px',padding:'3px 6px'}}>
            <button onClick={prevMonth} style={{width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'5px',border:'none',background:'transparent',cursor:'pointer',fontSize:'14px',color:'#374151',fontFamily:'inherit'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#F1F5F9')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>‹</button>
            <span style={{fontSize:'13px',fontWeight:'700',color:'#0F172A',padding:'0 8px',minWidth:'120px',textAlign:'center'}}>{MONTH_FULL[calMonth]} {calYear}</span>
            <button onClick={nextMonth} style={{width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'5px',border:'none',background:'transparent',cursor:'pointer',fontSize:'14px',color:'#374151',fontFamily:'inherit'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#F1F5F9')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>›</button>
          </div>
        )}

        {viewMode==='date' && (
          <input type="date" value={byDate} onChange={e=>setByDate(e.target.value)}
            style={{...inp, marginLeft:'auto', width:'auto', padding:'6px 12px', fontSize:'13px'}}/>
        )}
      </div>

      {/* ── BY FIELD ── */}
      {viewMode==='field' && (
        <div>
          {/* Fields with data — 2-column wrapping flex */}
          {fieldsWithData.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:'14px',marginBottom:fieldsEmpty.length>0?'10px':0}}>
              {fieldsWithData.map(field=>{
                const allFieldRules = rules.filter(r=>r.field_name===field.name&&r.rule_date);

                return (
                  <div key={field.id} style={{background:'#fff',borderRadius:'14px',border:'1.5px solid #E2E8F0',overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.05)',width:'490px',maxWidth:'100%',flexShrink:0}}>
                    {/* Card header */}
                    <div style={{padding:'11px 14px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#FAFBFC'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                        <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#22C55E',flexShrink:0}}/>
                        <span style={{fontSize:'13px',fontWeight:'800',color:'#0F172A'}}>{field.name}</span>
                        <span style={{fontSize:'10px',fontWeight:'600',color:'#94A3B8'}}>{allFieldRules.length} slot{allFieldRules.length!==1?'s':''}</span>
                      </div>
                      <button onClick={()=>onAddForDate(field.name, fmtDate(calYear,calMonth,today.getDate()<=total?today.getDate():1))}
                        style={{display:'flex',alignItems:'center',gap:'4px',padding:'4px 10px',borderRadius:'6px',border:`1px solid ${primary}30`,background:`${primary}0d`,color:primary,fontSize:'11.5px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit'}}>
                        <Plus size={11}/> Add
                      </button>
                    </div>

                    {/* Body: calendar left, rules right */}
                    <div style={{display:'flex',alignItems:'flex-start'}}>

                      {/* Calendar — fixed width */}
                      <div style={{padding:'12px 12px 12px 14px',flexShrink:0,width:'230px'}}>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px'}}>
                          {DAY_HDR.map((d,i)=>(
                            <div key={i} style={{textAlign:'center',fontSize:'8.5px',fontWeight:'800',color:'#CBD5E1',paddingBottom:'5px',letterSpacing:'0.3px'}}>{d}</div>
                          ))}
                          {cells.map((cell,i)=>{
                            if(!cell) return <div key={`p${i}`}/>;
                            const dr = rulesFor(field.name, cell.date);
                            const hasPermit = dr.some(r=>r.rule_type==='permit');
                            const hasBlock  = dr.some(r=>r.rule_type==='block');
                            const isToday   = cell.date===todayStr;
                            const hasSomething = hasPermit||hasBlock;
                            const bg = hasPermit?'#22C55E':hasBlock?'#F59E0B':'transparent';
                            return (
                              <div key={cell.date}
                                onClick={()=>hasSomething?onEdit(dr[0]):onAddForDate(field.name,cell.date)}
                                title={dr.length>0?dr.map(r=>`${r.rule_type==='permit'?'✅':'🚫'} ${fmtT(r.unavailable_from)}–${fmtT(r.unavailable_until)}`).join('\n'):`Add rule for ${cell.date}`}
                                style={{
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  height:'27px',borderRadius:'6px',cursor:'pointer',
                                  background:bg,
                                  color:hasSomething?'#fff':isToday?primary:'#374151',
                                  fontSize:'11.5px',fontWeight:hasSomething?'700':'400',
                                  outline:isToday&&!hasSomething?`2px solid ${primary}`:'none',
                                  outlineOffset:'-2px',
                                  transition:'background 0.1s,transform 0.08s',
                                }}
                                onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;if(!hasSomething)el.style.background='#F1F5F9';el.style.transform='scale(1.1)';}}
                                onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;if(!hasSomething)el.style.background='transparent';el.style.transform='scale(1)';}}
                              >
                                {cell.day}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Rules list — ALL rules grouped by month */}
                      <div style={{flex:1,minWidth:0,borderLeft:'1px solid #F1F5F9',padding:'8px 10px',maxHeight:'246px',overflowY:'auto'}}>
                        {allFieldRules.length===0 ? (
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',minHeight:'100px',gap:'4px'}}>
                            <span style={{fontSize:'11px',color:'#CBD5E1',textAlign:'center'}}>No rules yet</span>
                            <span style={{fontSize:'10px',color:'#E2E8F0',textAlign:'center'}}>Click any date to add one</span>
                          </div>
                        ) : (() => {
                          // Group by year-month
                          const grouped: Record<string, AvailabilityRule[]> = {};
                          allFieldRules.sort((a,b)=>(a.rule_date??'').localeCompare(b.rule_date??'')).forEach(r=>{
                            const key = (r.rule_date??'').slice(0,7);
                            if(!grouped[key]) grouped[key]=[];
                            grouped[key].push(r);
                          });
                          return (
                            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                              {Object.entries(grouped).map(([ym, grpRules])=>{
                                const [yr,mo] = ym.split('-').map(Number);
                                const isCurrentMonth = yr===calYear && mo-1===calMonth;
                                return (
                                  <div key={ym}>
                                    <div style={{fontSize:'9px',fontWeight:'800',color:isCurrentMonth?primary:'#CBD5E1',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'3px',padding:'0 2px'}}>
                                      {MONTH_NAMES[mo-1]} {yr} · {grpRules.length}
                                    </div>
                                    <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                      {grpRules.map(r=>{
                                        const isPermit=r.rule_type==='permit';
                                        const d=r.rule_date?new Date(r.rule_date+'T12:00:00'):null;
                                        const dow=d?d.toLocaleDateString('en-US',{weekday:'short'}):'';
                                        const mday=d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
                                        return(
                                          <div key={r.id} style={{display:'flex',alignItems:'center',gap:'4px',padding:'3px 5px',borderRadius:'5px',background:isPermit?'#F0FDF4':'#FFFBEB'}}>
                                            <div style={{width:'5px',height:'5px',borderRadius:'50%',background:isPermit?'#22C55E':'#F59E0B',flexShrink:0}}/>
                                            <span style={{fontSize:'9.5px',fontWeight:'700',color:'#94A3B8',width:'24px',flexShrink:0}}>{dow}</span>
                                            <span style={{fontSize:'9.5px',fontWeight:'700',color:'#374151',width:'42px',flexShrink:0}}>{mday}</span>
                                            <span style={{fontSize:'9.5px',color:'#374151',flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                                              {fmtT(r.unavailable_from)}–{fmtT(r.unavailable_until)}
                                              {r.label&&<span style={{color:'#94A3B8'}}> {r.label}</span>}
                                            </span>
                                            <div style={{display:'flex',gap:'1px',flexShrink:0}}>
                                              <IBtn title="Edit" onClick={()=>onEdit(r)}><Pencil size={9}/></IBtn>
                                              <IBtn title="Delete" onClick={()=>onDelete(r.id)} danger><Trash2 size={9}/></IBtn>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty fields — compact strip */}
          {fieldsEmpty.length>0 && (
            <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
              {fieldsWithData.length>0 && (
                <div style={{fontSize:'10px',fontWeight:'800',color:'#CBD5E1',textTransform:'uppercase',letterSpacing:'1.2px',marginBottom:'2px'}}>No hours set</div>
              )}
              {fieldsEmpty.map(field=>(
                <div key={field.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 16px',background:'#fff',borderRadius:'10px',border:'1.5px solid #F1F5F9'}}>
                  <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#E2E8F0',flexShrink:0}}/>
                  <span style={{fontSize:'13px',fontWeight:'700',color:'#94A3B8',flex:1}}>{field.name}</span>
                  <button onClick={()=>onAddForDate(field.name, todayStr)}
                    style={{display:'flex',alignItems:'center',gap:'5px',padding:'5px 12px',borderRadius:'7px',border:'1px solid #E2E8F0',background:'#F8FAFC',color:'#64748B',fontSize:'12px',fontWeight:'600',cursor:'pointer',fontFamily:'inherit'}}>
                    <Plus size={11}/> Add hours
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BY DATE ── */}
      {viewMode==='date' && (
        <div style={{background:'#fff',borderRadius:'14px',border:'1.5px solid #E2E8F0',overflow:'hidden'}}>
          {/* Date header */}
          <div style={{padding:'14px 20px',borderBottom:'1px solid #F1F5F9',background:'#FAFBFC'}}>
            <div style={{fontSize:'16px',fontWeight:'800',color:'#0F172A'}}>
              {byDate ? new Date(byDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : 'Pick a date above'}
            </div>
            {byDate && (
              <div style={{fontSize:'11px',color:'#94A3B8',marginTop:'2px'}}>
                {rules.filter(r=>r.rule_date===byDate).length} rule{rules.filter(r=>r.rule_date===byDate).length!==1?'s':''} across all fields
              </div>
            )}
          </div>
          {/* Field rows */}
          <div style={{padding:'4px 0'}}>
            {fields.map((field,i)=>{
              const dr=rulesFor(field.name,byDate);
              const hasPermit=dr.some(r=>r.rule_type==='permit');
              const hasBlock=dr.some(r=>r.rule_type==='block');
              return(
                <div key={field.id} style={{display:'flex',alignItems:'center',gap:'14px',padding:'10px 20px',borderTop:i>0?'1px solid #F8FAFC':'none'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',width:'200px',flexShrink:0}}>
                    <div style={{width:'8px',height:'8px',borderRadius:'50%',background:hasPermit?'#22C55E':hasBlock?'#F59E0B':'#E2E8F0',flexShrink:0}}/>
                    <span style={{fontSize:'13px',fontWeight:'700',color:'#0F172A',lineHeight:1.2}}>{field.name}</span>
                  </div>
                  {dr.length===0 ? (
                    <div style={{display:'flex',alignItems:'center',gap:'10px',flex:1}}>
                      <span style={{fontSize:'12px',color:'#CBD5E1'}}>Not set</span>
                      {byDate && (
                        <button onClick={()=>onAddForDate(field.name,byDate)}
                          style={{padding:'4px 11px',borderRadius:'6px',border:'1px solid #E2E8F0',background:'#F8FAFC',fontSize:'11.5px',fontWeight:'600',cursor:'pointer',fontFamily:'inherit',color:'#64748B',display:'flex',alignItems:'center',gap:'4px'}}>
                          <Plus size={10}/> Add
                        </button>
                      )}
                    </div>
                  ):(
                    <div style={{display:'flex',flexDirection:'column',gap:'3px',flex:1}}>
                      {dr.map(r=>{
                        const isPermit=r.rule_type==='permit';
                        return(
                          <div key={r.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 10px',borderRadius:'7px',background:isPermit?'#F0FDF4':'#FFFBEB',width:'fit-content'}}>
                            <span style={{fontSize:'11.5px',fontWeight:'700',color:isPermit?'#15803D':'#92400E'}}>
                              {isPermit?'✅':'🚫'} {fmtT(r.unavailable_from)} – {fmtT(r.unavailable_until)}
                            </span>
                            {r.label&&<span style={{fontSize:'11px',color:'#94A3B8'}}>· {r.label}</span>}
                            <IBtn title="Edit" onClick={()=>onEdit(r)}><Pencil size={10}/></IBtn>
                            <IBtn title="Delete" onClick={()=>onDelete(r.id)} danger><Trash2 size={10}/></IBtn>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Parse Permit Modal ─────────────────────────────────────────────────────────

function ParsePermitModal({ fields, club, primary, onClose, onSaved }: {
  fields:TryoutField[]; club:{id:string}|null;
  primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  type ParseStep = 'upload' | 'parsing' | 'review' | 'saving';
  const [step, setStep] = useState<ParseStep>('upload');
  const [inputMode, setInputMode] = useState<'file'|'text'>('file');
  const [pastedText, setPastedText] = useState('');
  const [windows, setWindows] = useState<ParsedWindow[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [parseProgress, setParseProgress] = useState<{current:number;total:number;name:string}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pdfToText(file: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter(item => 'str' in item)
        .map(item => (item as { str: string }).str)
        .join(' ');
      if (pageText.trim()) pages.push(pageText.trim());
    }
    return pages.join('\n\n--- Page break ---\n\n');
  }

  async function parseSingleFile(file: File): Promise<{ windows: Omit<ParsedWindow,'selected'>[]; notes: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    const knownFields = fields.map(f => f.name);
    let body: Record<string, unknown>;
    if (file.type === 'application/pdf') {
      const text = await pdfToText(file);
      if (!text.trim()) throw new Error(`${file.name}: This PDF appears to be a scanned image. Use the "Paste text" tab and copy the text from your PDF manually.`);
      body = { text, known_fields: knownFields };
    } else if (file.type.startsWith('text/')) {
      const text = await file.text();
      body = { text, known_fields: knownFields };
    } else {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      body = { image_base64: base64, image_media_type: file.type, known_fields: knownFields };
    }
    const res = await fetch('/api/ai/parse-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.dates) throw new Error(data.error ?? 'Parse failed');
    return { windows: data.dates as Omit<ParsedWindow,'selected'>[], notes: data.notes ?? '' };
  }

  async function parseFiles(files: File[]) {
    setStep('parsing');
    setError('');
    const allWindows: Omit<ParsedWindow,'selected'>[] = [];
    const allNotes: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setParseProgress({ current: i + 1, total: files.length, name: files[i].name });
        const result = await parseSingleFile(files[i]);
        allWindows.push(...result.windows);
        if (result.notes) allNotes.push(`${files[i].name}: ${result.notes}`);
      }
      setWindows(allWindows.map(w => ({ ...w, selected: true })));
      setNotes(allNotes.join(' · '));
      setParseProgress(null);
      setStep('review');
    } catch (e) {
      setParseProgress(null);
      setError(e instanceof Error ? e.message : 'Failed to parse one or more permits');
      setStep('upload');
    }
  }

  async function parseText() {
    if (!pastedText.trim()) return;
    setStep('parsing');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/ai/parse-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ text: pastedText.trim(), known_fields: fields.map(f=>f.name) }),
      });
      const data = await res.json();
      if (!res.ok || !data.dates) throw new Error(data.error ?? 'Parse failed');
      setWindows((data.dates as Omit<ParsedWindow,'selected'>[]).map(w => ({ ...w, selected: true })));
      setNotes(data.notes ?? '');
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse permit');
      setStep('upload');
    }
  }

  async function saveWindows() {
    if (!club) return;
    setStep('saving');
    const selected = windows.filter(w => w.selected);
    const rows = selected.map(w => ({
      club_id: club.id,
      field_name: w.field_name,
      sub_zone: w.sub_zone || null,
      rule_date: w.date,
      day_of_week: null,
      unavailable_from: w.from_time,
      unavailable_until: w.until_time,
      label: w.label || null,
      season_label: null,
      rule_type: 'permit' as const,
      valid_from: null,
      valid_until: null,
    }));
    await supabase.from('field_availability_rules').insert(rows);

    // Auto-create any field names from the permit that don't exist yet
    const existingNames = new Set(fields.map(f => f.name));
    const newNames = [...new Set(selected.map(w => w.field_name))].filter(n => !existingNames.has(n));
    if (newNames.length > 0) {
      const maxSort = fields.reduce((m, f) => Math.max(m, f.sort_order), 0);
      const newFields = newNames.map((name, i) => ({
        club_id: club.id,
        name,
        sub_zones: [] as string[],
        is_active: true,
        sort_order: maxSort + i + 1,
        rental_cost_per_hour: null,
      }));
      await supabase.from('tryout_fields').insert(newFields);
    }

    onSaved();
  }

  function toggleWindow(i: number) {
    setWindows(ws => ws.map((w,idx) => idx===i ? {...w, selected:!w.selected} : w));
  }

  function updateWindow(i: number, key: keyof ParsedWindow, value: string) {
    setWindows(ws => ws.map((w,idx) => idx===i ? {...w, [key]:value} : w));
  }

  const selectedCount = windows.filter(w=>w.selected).length;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'20px' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'16px', width:'640px', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px' }}>
              <Sparkles size={16} color="#16A34A"/>
              <span style={{ fontSize:'16px', fontWeight:'800', color:'#0F172A' }}>Import Pitch Permit</span>
            </div>
            <div style={{ fontSize:'12px', color:'#94A3B8' }}>
              {step==='upload' && 'Upload your permit or booking confirmation — AI pulls out all your allocated pitch times'}
              {step==='parsing' && (parseProgress?.total??1) > 1 ? `Reading permit ${parseProgress!.current} of ${parseProgress!.total}…` : 'Reading your permit…'}
              {step==='review' && `Found ${windows.length} slot${windows.length!==1?'s':''} across ${new Set(windows.map(w=>w.field_name)).size} pitch${new Set(windows.map(w=>w.field_name)).size!==1?'es':''}. Check them over then save.`}
              {step==='saving' && 'Saving availability rules…'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', marginLeft:'12px', flexShrink:0 }}><X size={16} color="#94A3B8"/></button>
        </div>

        {/* Body */}
        <div style={{ padding:'20px 24px', flex:1 }}>

          {/* ── Upload step ── */}
          {step==='upload' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              {/* Mode toggle */}
              <div style={{ display:'flex', gap:'6px', background:'#F1F5F9', borderRadius:'9px', padding:'4px' }}>
                {(['file','text'] as const).map(m=>(
                  <button key={m} onClick={()=>setInputMode(m)}
                    style={{ flex:1, padding:'7px', borderRadius:'7px', border:'none', background:inputMode===m?'#fff':'transparent', color:inputMode===m?'#0F172A':'#64748B', fontSize:'12.5px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', boxShadow:inputMode===m?'0 1px 3px rgba(0,0,0,0.1)':'' }}>
                    {m==='file'?'📎 Upload file':'📋 Paste text'}
                  </button>
                ))}
              </div>

              {inputMode==='file' && (
                <>
                  <div
                    onClick={()=>fileRef.current?.click()}
                    style={{ border:'2px dashed #D1FAE5', borderRadius:'12px', padding:'40px', textAlign:'center', cursor:'pointer', background:'#F0FDF4', transition:'border-color 0.2s' }}
                    onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='#16A34A';}}
                    onDragLeave={e=>{e.currentTarget.style.borderColor='#D1FAE5';}}
                    onDrop={e=>{e.preventDefault();const fs=Array.from(e.dataTransfer.files);if(fs.length)parseFiles(fs);}}
                  >
                    <Upload size={28} color="#16A34A" style={{ marginBottom:'10px' }}/>
                    <div style={{ fontSize:'14px', fontWeight:'700', color:'#0F172A', marginBottom:'4px' }}>Drop your permit here</div>
                    <div style={{ fontSize:'12px', color:'#64748B' }}>or click to browse · PDF, photo, or text file · <strong>drop multiple at once</strong></div>
                    <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.txt,.webp" style={{ display:'none' }} onChange={e=>{const fs=Array.from(e.target.files??[]);if(fs.length)parseFiles(fs);}}/>
                  </div>
                  <div style={{ fontSize:'12px', color:'#94A3B8', textAlign:'center' }}>
                    Works with permits, booking confirmations, facility emails, and schedules
                  </div>
                </>
              )}

              {inputMode==='text' && (
                <>
                  <textarea
                    value={pastedText}
                    onChange={e=>setPastedText(e.target.value)}
                    placeholder="Paste the text from your permit or booking email here…&#10;&#10;e.g.&#10;Pitch A — Monday/Wednesday/Friday 5:00pm–9:00pm&#10;Pitch B — Saturday 8:00am–12:00pm&#10;Season: September 1 – December 15, 2026"
                    rows={10}
                    style={{ ...inp, resize:'vertical', lineHeight:1.6 }}
                    autoFocus
                  />
                  <button onClick={parseText} disabled={!pastedText.trim()}
                    style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'7px', padding:'11px', borderRadius:'9px', background:pastedText.trim()?'#16A34A':'#E2E8F0', color:pastedText.trim()?'#fff':'#94A3B8', border:'none', fontSize:'13px', fontWeight:'700', cursor:pastedText.trim()?'pointer':'not-allowed', fontFamily:'inherit' }}>
                    <Sparkles size={14}/> Parse with AI
                  </button>
                </>
              )}

              {error && (
                <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:'8px', fontSize:'12.5px', color:'#DC2626' }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {/* ── Parsing step ── */}
          {step==='parsing' && (
            <div style={{ padding:'48px', textAlign:'center' }}>
              <Sparkles size={36} color="#16A34A" style={{ marginBottom:'14px' }}/>
              <div style={{ fontSize:'16px', fontWeight:'800', color:'#0F172A', marginBottom:'6px' }}>
                {parseProgress && parseProgress.total > 1
                  ? `Reading permit ${parseProgress.current} of ${parseProgress.total}…`
                  : 'Reading your permit…'}
              </div>
              {parseProgress && parseProgress.total > 1 && (
                <>
                  <div style={{ fontSize:'12px', color:'#64748B', marginBottom:'12px' }}>{parseProgress.name}</div>
                  <div style={{ width:'240px', margin:'0 auto 12px', background:'#E2E8F0', borderRadius:'99px', height:'6px', overflow:'hidden' }}>
                    <div style={{ width:`${(parseProgress.current/parseProgress.total)*100}%`, height:'100%', background:'#16A34A', borderRadius:'99px', transition:'width 0.4s ease' }}/>
                  </div>
                </>
              )}
              <div style={{ fontSize:'13px', color:'#64748B' }}>AI is extracting field names, days, and times</div>
              <div style={{ marginTop:'20px', display:'flex', justifyContent:'center', gap:'4px' }}>
                {[0,1,2].map(i=><div key={i} style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#16A34A', animation:`pulse ${0.6+i*0.15}s ease-in-out infinite alternate` }}/>)}
              </div>
            </div>
          )}

          {/* ── Review step ── */}
          {step==='review' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {notes && (
                <div style={{ padding:'10px 14px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'8px', fontSize:'12.5px', color:'#92400E', display:'flex', gap:'8px' }}>
                  <span style={{ flexShrink:0 }}>⚠️</span><span>{notes}</span>
                </div>
              )}

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:'11px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', letterSpacing:'1px' }}>
                  {selectedCount} of {windows.length} selected
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={()=>setWindows(ws=>ws.map(w=>({...w,selected:true})))} style={{ fontSize:'11.5px', fontWeight:'600', color:primary, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Select all</button>
                  <button onClick={()=>setWindows(ws=>ws.map(w=>({...w,selected:false})))} style={{ fontSize:'11.5px', fontWeight:'600', color:'#94A3B8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Deselect all</button>
                </div>
              </div>

              {windows.map((w, i) => (
                <div key={i} style={{ borderRadius:'10px', border:`1.5px solid ${w.selected?'#BBF7D0':'#E2E8F0'}`, background:w.selected?'#F0FDF4':'#F8FAFC', overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px' }}>
                    <input type="checkbox" checked={w.selected} onChange={()=>toggleWindow(i)} style={{ accentColor:'#16A34A', width:'16px', height:'16px', cursor:'pointer', flexShrink:0 }}/>
                    <div style={{ flex:1, display:'grid', gridTemplateColumns:'1.5fr 1fr 1fr 1fr', gap:'8px' }}>
                      <div>
                        <div style={{ fontSize:'9px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', marginBottom:'2px' }}>Field</div>
                        <input value={w.field_name} onChange={e=>updateWindow(i,'field_name',e.target.value)} style={{ ...inp, fontSize:'12px', padding:'4px 8px' }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:'9px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', marginBottom:'2px' }}>Date</div>
                        <input type="date" value={w.date} onChange={e=>updateWindow(i,'date',e.target.value)} style={{ ...inp, fontSize:'12px', padding:'4px 8px' }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:'9px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', marginBottom:'2px' }}>From</div>
                        <input type="time" value={w.from_time} onChange={e=>updateWindow(i,'from_time',e.target.value)} style={{ ...inp, fontSize:'12px', padding:'4px 8px' }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:'9px', fontWeight:'800', color:'#94A3B8', textTransform:'uppercase', marginBottom:'2px' }}>Until</div>
                        <input type="time" value={w.until_time} onChange={e=>updateWindow(i,'until_time',e.target.value)} style={{ ...inp, fontSize:'12px', padding:'4px 8px' }}/>
                      </div>
                    </div>
                    <div style={{ fontSize:'10px', fontWeight:'700', padding:'2px 8px', borderRadius:'5px', background:w.confidence==='high'?'#DCFCE7':w.confidence==='medium'?'#FEF9C3':'#FEE2E2', color:w.confidence==='high'?'#15803D':w.confidence==='medium'?'#92400E':'#B91C1C', flexShrink:0 }}>
                      {w.confidence}
                    </div>
                  </div>
                  {w.label && (
                    <div style={{ padding:'6px 14px 10px 42px', display:'flex', gap:'12px', fontSize:'11px', color:'#64748B' }}>
                      <span>🏷️ {w.label}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {step==='saving' && (
            <div style={{ padding:'48px', textAlign:'center' }}>
              <Check size={36} color="#16A34A" style={{ marginBottom:'14px' }}/>
              <div style={{ fontSize:'16px', fontWeight:'800', color:'#0F172A' }}>Saving {selectedCount} rules…</div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step==='upload' || step==='review') && (
          <div style={{ padding:'14px 24px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', flexShrink:0 }}>
            {step==='review' ? (
              <>
                <button onClick={()=>setStep('upload')} style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', color:'#64748B' }}>← Re-upload</button>
                <button onClick={saveWindows} disabled={selectedCount===0}
                  style={{ padding:'9px 22px', borderRadius:'8px', background:selectedCount>0?'#16A34A':'#E2E8F0', color:selectedCount>0?'#fff':'#94A3B8', border:'none', fontSize:'13px', fontWeight:'700', cursor:selectedCount>0?'pointer':'not-allowed', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
                  <Check size={14}/> Save {selectedCount} window{selectedCount!==1?'s':''}
                </button>
              </>
            ) : (
              <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', color:'#64748B' }}>Cancel</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Availability Rule Modal ────────────────────────────────────────────────────

function AvailabilityRuleModal({ rule, fields, club, primary, preselectedDate, preselectedField, onClose, onSaved }: {
  rule:AvailabilityRule|null; fields:TryoutField[]; club:{id:string}|null;
  primary:string; preselectedDate:string|null; preselectedField:string|null;
  onClose:()=>void; onSaved:()=>void;
}) {
  const todayStr = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({
    field_name: preselectedField ?? rule?.field_name ?? (fields[0]?.name??''),
    sub_zone: rule?.sub_zone ?? '',
    rule_date: preselectedDate ?? rule?.rule_date ?? todayStr,
    unavailable_from: rule?.unavailable_from ?? '15:00',
    unavailable_until: rule?.unavailable_until ?? '17:00',
    label: rule?.label ?? '',
    rule_type: (rule?.rule_type ?? 'permit') as 'block'|'permit',
  });
  const [saving, setSaving] = useState(false);
  const selField = fields.find(f=>f.name===form.field_name);
  async function save() {
    if (!club || !form.rule_date) return; setSaving(true);
    const payload = {
      field_name: form.field_name, sub_zone: form.sub_zone||null,
      rule_date: form.rule_date, day_of_week: null,
      unavailable_from: form.unavailable_from,
      unavailable_until: form.unavailable_until, label: form.label||null,
      season_label: null, rule_type: form.rule_type,
      valid_from: null, valid_until: null,
    };
    if (rule) { await supabase.from('field_availability_rules').update(payload).eq('id',rule.id); }
    else { await supabase.from('field_availability_rules').insert({ ...payload, club_id:club.id }); }
    setSaving(false); onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose}>
      <MHead title={rule?'Edit Rule':'Add Availability Rule'} onClose={onClose}/>
      <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:'14px' }}>
        {/* Rule type toggle */}
        <div>
          {lbl('Rule type')}
          <div style={{ display:'flex', gap:'6px' }}>
            {([['permit','✅ Allocated pitch time','Your permitted hours from a facility booking or agreement'],['block','🚫 Unavailable','Groundskeeping, line painting, shared use, etc.']] as const).map(([v,label,desc])=>(
              <button key={v} onClick={()=>setForm(f=>({...f,rule_type:v}))}
                style={{ flex:1, padding:'9px 12px', borderRadius:'9px', border:`1.5px solid ${form.rule_type===v?(v==='permit'?'#16A34A':'#F59E0B'):'#E2E8F0'}`, background:form.rule_type===v?(v==='permit'?'#F0FDF4':'#FFFBEB'):'#FAFAFA', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                <div style={{ fontSize:'12.5px', fontWeight:'700', color: form.rule_type===v?(v==='permit'?'#15803D':'#92400E'):'#374151' }}>{label}</div>
                <div style={{ fontSize:'10.5px', color:'#94A3B8', marginTop:'2px' }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div style={{ gridColumn:'1/-1' }}>{lbl('Pitch')}<select value={form.field_name} onChange={e=>setForm(f=>({...f,field_name:e.target.value,sub_zone:''}))} style={inp}>{fields.map(f=><option key={f.id} value={f.name}>{f.name}</option>)}</select></div>
          <div>{lbl('Zone (optional)')}<select value={form.sub_zone} onChange={e=>setForm(f=>({...f,sub_zone:e.target.value}))} style={inp}><option value="">Whole field</option>{selField?.sub_zones?.map(z=><option key={z}>{z}</option>)}</select></div>
          <div>{lbl('Date')}<input type="date" value={form.rule_date} onChange={e=>setForm(f=>({...f,rule_date:e.target.value}))} style={inp}/></div>
          <div>{lbl(form.rule_type==='permit'?'Available from':'Blocked from')}<input type="time" value={form.unavailable_from} onChange={e=>setForm(f=>({...f,unavailable_from:e.target.value}))} style={inp}/></div>
          <div>{lbl(form.rule_type==='permit'?'Available until':'Blocked until')}<input type="time" value={form.unavailable_until} onChange={e=>setForm(f=>({...f,unavailable_until:e.target.value}))} style={inp}/></div>
          <div style={{ gridColumn:'1/-1' }}>{lbl('Label (optional)')}<input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder={form.rule_type==='permit'?'e.g. Fall permit, Spring booking':'e.g. Groundskeeping, External booking'} style={inp}/></div>
        </div>
      </div>
      <MFoot onClose={onClose} onSave={save} saving={saving} disabled={!form.field_name||!form.rule_date} primary={primary} label={rule?'Save changes':'Add rule'}/>
    </Overlay>
  );
}

// ── Shared modal shells ────────────────────────────────────────────────────────

function Overlay({ onClose, children }: { onClose:()=>void; children:React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'20px' }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:'14px', width:'480px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
function MHead({ title, onClose }: { title:string; onClose:()=>void }) {
  return (
    <div style={{ padding:'16px 22px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <span style={{ fontSize:'15px', fontWeight:'800', color:'#0F172A' }}>{title}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={15} color="#94A3B8"/></button>
    </div>
  );
}
function MFoot({ onClose, onSave, saving, disabled, primary, label }: { onClose:()=>void; onSave:()=>void; saving:boolean; disabled:boolean; primary:string; label:string }) {
  return (
    <div style={{ padding:'12px 22px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'flex-end', gap:'8px' }}>
      <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:'8px', border:'1px solid #E2E8F0', background:'#fff', fontSize:'13px', cursor:'pointer', fontFamily:'inherit', color:'#64748B' }}>Cancel</button>
      <button onClick={onSave} disabled={saving||disabled} style={{ padding:'8px 18px', borderRadius:'8px', background:disabled?'#E2E8F0':primary, color:disabled?'#94A3B8':'#fff', border:'none', fontSize:'13px', fontWeight:'700', cursor:disabled?'not-allowed':'pointer', fontFamily:'inherit' }}>{saving?'Saving…':label}</button>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function IBtn({ title, onClick, danger, children }: { title:string; onClick:()=>void; danger?:boolean; children:React.ReactNode }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ width:'30px', height:'30px', borderRadius:'7px', border:'none', background:h?(danger?'#FEF2F2':'#F1F5F9'):'transparent', color:danger?'#EF4444':'#64748B', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.1s' }}>
      {children}
    </button>
  );
}
function Section({ title, color, children }: { title:string; color:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:'20px' }}>
      <div style={{ fontSize:'10px', fontWeight:'800', color, textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:'10px' }}>{title}</div>
      {children}
    </div>
  );
}
function Empty({ icon, title, sub }: { icon:string; title:string; sub:string }) {
  return (
    <div style={{ padding:'64px 32px', textAlign:'center' }}>
      <div style={{ fontSize:'36px', marginBottom:'10px' }}>{icon}</div>
      <div style={{ fontSize:'15px', fontWeight:'700', color:'#0F172A', marginBottom:'6px' }}>{title}</div>
      <div style={{ fontSize:'13px', color:'#94A3B8', lineHeight:1.6 }}>{sub}</div>
    </div>
  );
}
