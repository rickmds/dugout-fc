'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Plus, X, Trash2, Pencil, AlertOctagon, CheckCircle, Clock, CloudRain, Sun, Cloud, Zap, Snowflake, Wind, RefreshCw, Sparkles, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type TryoutField = {
  id: string; club_id: string; name: string; sub_zones: string[];
  is_active: boolean; sort_order: number; rental_cost_per_hour: number | null;
};
type FieldClosure = {
  id: string; club_id: string; field_name: string; sub_zones: string[];
  closed_from: string; closed_until: string | null; duration_label: string;
  reason: string | null; notify_message: string | null;
  emails_sent_at: string | null; emails_sent_count: number; push_sent: boolean;
  created_at: string;
};
type ClosureAck = { closure_id: string; coach_email: string; coach_name: string | null; acknowledged_at: string; };
type ClosureTemplate = { id: string; name: string; reason: string | null; message_template: string | null; duration_label: string | null; };
type AvailabilityRule = {
  id: string; field_name: string; sub_zone: string | null; day_of_week: string;
  unavailable_from: string; unavailable_until: string; label: string | null; season_label: string | null;
};

type WeatherHour = { time: string; precipitation_probability: number; weathercode: number; temperature_2m: number; };

const DAYS_OF_WEEK = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DURATION_OPTIONS = [
  { value: 'rest_of_day',  label: 'Rest of today' },
  { value: 'hours',        label: 'Next few hours' },
  { value: 'date_range',   label: 'Specific dates' },
  { value: 'indefinite',   label: 'Until further notice' },
];
const QUICK_REASONS = ['Rain / Wet conditions','Scheduled maintenance','Unsafe conditions','Tournament / event','Frozen ground','Other'];

const inp: React.CSSProperties = { width:'100%', padding:'8px 11px', borderRadius:'8px', border:'1.5px solid #E2E8F0', fontSize:'13px', color:'#0F172A', background:'#fff', outline:'none', fontFamily:'inherit', boxSizing:'border-box' };
const lbl = (t: string) => <label style={{ fontSize:'10px', fontWeight:'800', color:'#94A3B8', letterSpacing:'1.5px', textTransform:'uppercase', display:'block', marginBottom:'5px' }}>{t}</label>;

function weatherIcon(code: number, size = 18) {
  if (code === 0)                        return <Sun size={size} color="#F59E0B" />;
  if (code <= 3)                         return <Cloud size={size} color="#94A3B8" />;
  if (code <= 48)                        return <Wind size={size} color="#64748B" />;
  if (code <= 67 || (code >= 80 && code <= 82)) return <CloudRain size={size} color="#3B82F6" />;
  if (code <= 77)                        return <Snowflake size={size} color="#818CF8" />;
  return <Zap size={size} color="#F59E0B" />;
}
function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3)  return 'Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Storm';
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

  const [tab, setTab] = useState<'fields'|'closures'|'availability'|'templates'>('fields');
  const [fields,     setFields]     = useState<TryoutField[]>([]);
  const [closures,   setClosures]   = useState<FieldClosure[]>([]);
  const [acks,       setAcks]       = useState<ClosureAck[]>([]);
  const [templates,  setTemplates]  = useState<ClosureTemplate[]>([]);
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
  const [showTplModal,     setShowTplModal]      = useState(false);
  const [editTpl,          setEditTpl]          = useState<ClosureTemplate|null>(null);
  const [savingLocation,   setSavingLocation]   = useState(false);

  // Club lat/lng
  const clubAny = club as (typeof club & { latitude?: number; longitude?: number; timezone?: string }) | null;

  const load = useCallback(async () => {
    if (!club) return;
    const [{ data: fi }, { data: cl }, { data: ac }, { data: tp }, { data: ru }] = await Promise.all([
      supabase.from('tryout_fields').select('*').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('field_closures').select('*').eq('club_id', club.id).order('created_at', { ascending: false }),
      supabase.from('field_closure_acknowledgements').select('*'),
      supabase.from('field_closure_templates').select('*').eq('club_id', club.id).order('name'),
      supabase.from('field_availability_rules').select('*').eq('club_id', club.id).order('field_name').order('day_of_week'),
    ]);
    setFields((fi ?? []) as TryoutField[]);
    setClosures((cl ?? []) as FieldClosure[]);
    setAcks((ac ?? []) as ClosureAck[]);
    setTemplates((tp ?? []) as ClosureTemplate[]);
    setRules((ru ?? []) as AvailabilityRule[]);
    setLoading(false);
  }, [club]);

  useEffect(() => { load(); }, [load]);

  // Weather fetch via Open-Meteo (free, no API key)
  useEffect(() => {
    if (!clubAny?.latitude || !clubAny?.longitude) return;
    const tz = clubAny.timezone ?? 'America/New_York';
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${clubAny.latitude}&longitude=${clubAny.longitude}&hourly=precipitation_probability,weathercode,temperature_2m&timezone=${encodeURIComponent(tz)}&forecast_days=7`)
      .then(r => r.json())
      .then(d => {
        const hours: WeatherHour[] = (d.hourly?.time ?? []).map((t: string, i: number) => ({
          time: t,
          precipitation_probability: d.hourly.precipitation_probability[i],
          weathercode: d.hourly.weathercode[i],
          temperature_2m: d.hourly.temperature_2m[i],
        }));
        // Keep 3pm–8pm window for next 7 days
        const now = new Date();
        const relevant = hours.filter(h => {
          const dt = new Date(h.time);
          const hour = dt.getHours();
          const dayDiff = Math.floor((dt.getTime() - now.getTime()) / 86400000);
          return hour >= 15 && hour <= 20 && dayDiff >= 0 && dayDiff < 7;
        });
        setWeather(relevant);
      }).catch(() => {});
  }, [clubAny?.latitude, clubAny?.longitude, clubAny?.timezone]);

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

  async function deleteField(id: string) {
    await supabase.from('tryout_fields').delete().eq('id', id);
    load();
  }

  async function deleteRule(id: string) {
    await supabase.from('field_availability_rules').delete().eq('id', id);
    load();
  }

  async function deleteTpl(id: string) {
    await supabase.from('field_closure_templates').delete().eq('id', id);
    load();
  }

  if (loading) return <div style={{ padding:'48px', color:'#94A3B8', fontSize:'14px' }}>Loading…</div>;

  const activeClosures = closures.filter(isActiveClosure);
  const pastClosures   = closures.filter(c => !isActiveClosure(c));

  // Max rain % in the 3pm–8pm window today
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPm = weather.filter(h => h.time.startsWith(todayStr));
  const maxRain  = todayPm.length ? Math.max(...todayPm.map(h => h.precipitation_probability)) : null;

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
          {([['fields','Fields'],['closures','Closures'],['availability','Availability'],['templates','Templates']] as const).map(([v,label])=>(
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
                          <div style={{ fontSize:'11.5px', color:'#94A3B8', marginTop:'3px' }}>
                            Zones: {f.sub_zones.join(' · ')}
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
                        <IBtn title="Delete" onClick={()=>deleteField(f.id)} danger><Trash2 size={13}/></IBtn>
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
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'14px' }}>
              <button onClick={()=>{setEditRule(null);setShowRuleModal(true);}}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', background:primary, color:'#fff', border:'none', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={14}/> Add Rule
              </button>
            </div>
            <div style={{ marginBottom:'8px', fontSize:'12px', color:'#94A3B8', background:'#F8FAFC', borderRadius:'8px', padding:'10px 14px', border:'1px solid #E2E8F0' }}>
              Recurring unavailabilities block field time in the Practice Schedule — e.g. groundskeeping every Friday 3–5pm. Sessions won't be bookable during these windows.
            </div>
            {rules.length===0 ? (
              <Empty icon="📅" title="No rules yet" sub="Add a recurring unavailability to block time in the schedule builder." />
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {rules.map(r=>(
                  <div key={r.id} style={{ background:'#fff', borderRadius:'10px', border:'1px solid #E2E8F0', padding:'12px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                    <div style={{ width:'6px', height:'36px', borderRadius:'3px', background:'#FDE68A', flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'13px', fontWeight:'700', color:'#0F172A' }}>{r.field_name}{r.sub_zone?` · ${r.sub_zone}`:''}</div>
                      <div style={{ fontSize:'11.5px', color:'#64748B', marginTop:'2px' }}>
                        {r.day_of_week} · {r.unavailable_from}–{r.unavailable_until}
                        {r.label && <span style={{ marginLeft:'8px', color:'#94A3B8' }}>{r.label}</span>}
                      </div>
                    </div>
                    <IBtn title="Edit" onClick={()=>{setEditRule(r);setShowRuleModal(true);}}><Pencil size={13}/></IBtn>
                    <IBtn title="Delete" onClick={()=>deleteRule(r.id)} danger><Trash2 size={13}/></IBtn>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {tab==='templates' && (
          <div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'14px' }}>
              <button onClick={()=>{setEditTpl(null);setShowTplModal(true);}}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', borderRadius:'8px', background:primary, color:'#fff', border:'none', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={14}/> New Template
              </button>
            </div>
            <div style={{ marginBottom:'8px', fontSize:'12px', color:'#94A3B8', background:'#F8FAFC', borderRadius:'8px', padding:'10px 14px', border:'1px solid #E2E8F0' }}>
              Save your most-used closure messages. Pick a template when closing a field and edit before sending.
            </div>
            {templates.length===0 ? (
              <Empty icon="📋" title="No templates yet" sub='Create a template like "Standard Rain Closure" to speed up common closures.' />
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {templates.map(t=>(
                  <div key={t.id} style={{ background:'#fff', borderRadius:'10px', border:'1px solid #E2E8F0', padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:'13px', fontWeight:'800', color:'#0F172A', marginBottom:'4px' }}>{t.name}</div>
                        {t.reason && <div style={{ fontSize:'11.5px', color:'#64748B', marginBottom:'4px' }}>Reason: {t.reason}</div>}
                        {t.message_template && <div style={{ fontSize:'12px', color:'#94A3B8', lineHeight:1.5, fontStyle:'italic' }}>"{t.message_template.slice(0,140)}{t.message_template.length>140?'…':''}"</div>}
                      </div>
                      <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
                        <IBtn title="Edit" onClick={()=>{setEditTpl(t);setShowTplModal(true);}}><Pencil size={13}/></IBtn>
                        <IBtn title="Delete" onClick={()=>deleteTpl(t.id)} danger><Trash2 size={13}/></IBtn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
          target={closeTarget} fields={fields} templates={templates}
          club={club as ({id:string;name:string}&Record<string,unknown>)|null}
          primary={primary}
          onClose={()=>{setShowCloseModal(false);setCloseTarget(null);}}
          onSaved={()=>{setShowCloseModal(false);setCloseTarget(null);load();setTab('closures');}}
        />
      )}
      {showRuleModal && (
        <AvailabilityRuleModal
          rule={editRule} fields={fields}
          club={club as {id:string}|null} primary={primary}
          onClose={()=>setShowRuleModal(false)} onSaved={load}
        />
      )}
      {showTplModal && (
        <TemplateModal
          tpl={editTpl} club={club as {id:string}|null} primary={primary}
          onClose={()=>setShowTplModal(false)} onSaved={load}
        />
      )}
    </div>
  );
}

// ── Weather Widget ─────────────────────────────────────────────────────────────

function WeatherWidget({ weather, hasLocation, onSave, saving, primary }: {
  weather: WeatherHour[]; hasLocation: boolean;
  onSave:(lat:number,lng:number)=>void; saving:boolean; primary:string;
}) {
  const [showSetup,    setShowSetup]    = useState(false);
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

  function useMyLocation() {
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
            <button onClick={useMyLocation} disabled={locating}
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
      <div style={{ fontSize:'10px', fontWeight:'800', color:'#0369A1', textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:'10px' }}>Afternoon Forecast (3pm–8pm)</div>
      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
        {Object.entries(days).map(([day, hours]) => {
          const maxRain = Math.max(...hours.map(h=>h.precipitation_probability));
          const code = hours[Math.floor(hours.length/2)]?.weathercode ?? 0;
          const date = new Date(day+'T12:00:00');
          const label = date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
          return (
            <div key={day} style={{ background:'#fff', borderRadius:'8px', padding:'10px 14px', border:`1.5px solid ${maxRain>=60?'#FCA5A5':maxRain>=30?'#FDE68A':'#E0F2FE'}`, minWidth:'130px', textAlign:'center' }}>
              <div style={{ fontSize:'11px', fontWeight:'700', color:'#0369A1', marginBottom:'5px' }}>{label}</div>
              <div style={{ margin:'4px 0' }}>{weatherIcon(code, 22)}</div>
              <div style={{ fontSize:'11px', color:'#64748B', marginBottom:'3px' }}>{weatherLabel(code)}</div>
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

function ClosureCard({ closure, acks, onReopen, primary }: { closure:FieldClosure; acks:ClosureAck[]; onReopen?:()=>void; primary:string; }) {
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
          "{closure.notify_message}"
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

function CloseFieldModal({ target, fields, templates, club, primary, onClose, onSaved }: {
  target: TryoutField|null; fields: TryoutField[]; templates: ClosureTemplate[];
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
  const [selectedTpl,    setSelectedTpl]    = useState('');
  const [drafting,       setDrafting]       = useState(false);
  const [draftError,     setDraftError]     = useState('');
  const [sending,        setSending]        = useState(false);
  const [step,           setStep]           = useState<'config'|'preview'>('config');
  const [blastCount,     setBlastCount]     = useState<{sessions:number;coaches:number;parents:number}|null>(null);

  // Apply template
  function applyTemplate(tplId: string) {
    const t = templates.find(t=>t.id===tplId);
    if (!t) return;
    setSelectedTpl(tplId);
    if (t.reason) setReason(t.reason);
    if (t.message_template) setMessage(t.message_template);
    if (t.duration_label) setDuration(t.duration_label);
  }

  // AI draft
  async function draftMessage() {
    if (!message.trim()) return;
    setDrafting(true);
    setDraftError('');
    const fieldNames = selectedFields.join(', ');
    const durationDesc = duration==='rest_of_day'?'for the rest of today':duration==='hours'?`for the next ${customHours} hours`:duration==='indefinite'?'until further notice':'for a specific period';
    const prompt = `You are writing a field closure notification for a youth soccer club called "${club?.name ?? 'our club'}". The admin has written these raw notes: "${message.trim()}". Field(s) affected: ${fieldNames}. Duration: ${durationDesc}${reason ? `. Reason: ${reason}` : ''}. Rewrite it as a single short paragraph (2-3 sentences max) for parents and coaches. Be direct and clear — no fluff, no filler phrases like "We understand this may be disappointing". End with "We'll update you when the field reopens." Return only the message text.`;
    try {
      const res = await fetch('/api/ai', {
        method:'POST', headers:{'Content-Type':'application/json'},
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
    // Quick blast radius estimate from tryout_practice_slots
    if (!club) return;
    const now = new Date();
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today = dayNames[now.getDay()] as string;
    const { data: affectedSlots } = await supabase
      .from('tryout_practice_slots')
      .select('team, day_of_week')
      .eq('club_id', club.id)
      .in('field_name', selectedFields);
    const sessions = (affectedSlots ?? []).filter(s => {
      if (duration==='rest_of_day'||duration==='hours') return s.day_of_week===today;
      return true;
    }).length;
    const teams = new Set((affectedSlots ?? []).map(s=>s.team).filter(Boolean));
    const { data: coaches } = await supabase
      .from('tryout_coach_assignments')
      .select('coach_id')
      .eq('club_id', club.id)
      .in('team', [...teams]);
    const { data: players } = await supabase
      .from('tryout_assignments')
      .select('player_id')
      .eq('club_id', club.id)
      .in('team', [...teams]);
    setBlastCount({ sessions, coaches: new Set((coaches??[]).map(c=>c.coach_id)).size, parents: (players??[]).length });
    setStep('preview');
  }

  async function send() {
    setSending(true);
    const closedFrom = new Date().toISOString();
    const closedUntil = getClosedUntil();
    const { error } = await fetch('/api/fields/close', {
      method:'POST', headers:{'Content-Type':'application/json'},
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

            {/* Template picker */}
            <div>
              {lbl('Use a template')}
              {templates.length === 0 ? (
                <div style={{ fontSize:'12px', color:'#94A3B8', padding:'8px 12px', background:'#F8FAFC', borderRadius:'7px', border:'1px solid #E2E8F0' }}>
                  No templates yet — create them in the Templates tab to speed up common closures.
                </div>
              ) : (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                  {templates.map(t=>(
                    <button key={t.id} onClick={()=>applyTemplate(t.id)}
                      style={{ padding:'5px 13px', borderRadius:'7px', border:`1.5px solid ${selectedTpl===t.id?primary:'#E2E8F0'}`, background:selectedTpl===t.id?`${primary}10`:'#F8FAFC', color:selectedTpl===t.id?primary:'#374151', fontSize:'12.5px', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                  "{message}"
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

function FieldModal({ field, fields, club, primary, onClose, onSaved }: {
  field:TryoutField|null; fields:TryoutField[]; club:{id:string}|null;
  primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  const [form, setForm] = useState({ name: field?.name??'', sub_zones: field?.sub_zones?.join(', ')??'', rental_cost_per_hour: field?.rental_cost_per_hour?.toString()??'' });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!club||!form.name.trim()) return; setSaving(true);
    const zones = form.sub_zones.split(',').map(z=>z.trim()).filter(Boolean);
    const cost  = form.rental_cost_per_hour ? parseFloat(form.rental_cost_per_hour) : null;
    if (field) {
      await supabase.from('tryout_fields').update({ name:form.name.trim(), sub_zones:zones, rental_cost_per_hour:cost }).eq('id',field.id);
    } else {
      await supabase.from('tryout_fields').insert({ club_id:club.id, name:form.name.trim(), sub_zones:zones, rental_cost_per_hour:cost, is_active:true, sort_order:fields.length });
    }
    setSaving(false); onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose}>
      <MHead title={field?'Edit Field':'Add Field'} onClose={onClose}/>
      <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div>{lbl('Field name *')}<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Vets Field" style={inp}/></div>
        <div>{lbl('Zones (comma-separated)')}<input value={form.sub_zones} onChange={e=>setForm(f=>({...f,sub_zones:e.target.value}))} placeholder="e.g. Zone 1A, Zone 1B, Zone 1C" style={inp}/></div>
        <div>{lbl('Rental cost per hour ($)')}<input type="number" min="0" step="5" value={form.rental_cost_per_hour} onChange={e=>setForm(f=>({...f,rental_cost_per_hour:e.target.value}))} placeholder="0" style={inp}/></div>
      </div>
      <MFoot onClose={onClose} onSave={save} saving={saving} disabled={!form.name.trim()} primary={primary} label={field?'Save changes':'Add field'}/>
    </Overlay>
  );
}

// ── Availability Rule Modal ────────────────────────────────────────────────────

function AvailabilityRuleModal({ rule, fields, club, primary, onClose, onSaved }: {
  rule:AvailabilityRule|null; fields:TryoutField[]; club:{id:string}|null;
  primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  const [form, setForm] = useState({
    field_name: rule?.field_name ?? (fields[0]?.name??''),
    sub_zone: rule?.sub_zone ?? '', day_of_week: rule?.day_of_week ?? 'Mon',
    unavailable_from: rule?.unavailable_from ?? '15:00', unavailable_until: rule?.unavailable_until ?? '17:00',
    label: rule?.label ?? '', season_label: rule?.season_label ?? '',
  });
  const [saving, setSaving] = useState(false);
  const selField = fields.find(f=>f.name===form.field_name);
  async function save() {
    if (!club) return; setSaving(true);
    if (rule) { await supabase.from('field_availability_rules').update({ ...form, sub_zone:form.sub_zone||null, label:form.label||null, season_label:form.season_label||null }).eq('id',rule.id); }
    else { await supabase.from('field_availability_rules').insert({ ...form, club_id:club.id, sub_zone:form.sub_zone||null, label:form.label||null, season_label:form.season_label||null }); }
    setSaving(false); onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose}>
      <MHead title={rule?'Edit Rule':'Add Availability Rule'} onClose={onClose}/>
      <div style={{ padding:'18px 22px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
        <div style={{ gridColumn:'1/-1' }}>{lbl('Field')}<select value={form.field_name} onChange={e=>setForm(f=>({...f,field_name:e.target.value,sub_zone:''}))} style={inp}>{fields.map(f=><option key={f.id} value={f.name}>{f.name}</option>)}</select></div>
        <div>{lbl('Zone (optional)')}<select value={form.sub_zone} onChange={e=>setForm(f=>({...f,sub_zone:e.target.value}))} style={inp}><option value="">Whole field</option>{selField?.sub_zones?.map(z=><option key={z}>{z}</option>)}</select></div>
        <div>{lbl('Day of week')}<select value={form.day_of_week} onChange={e=>setForm(f=>({...f,day_of_week:e.target.value}))} style={inp}>{DAYS_OF_WEEK.map(d=><option key={d}>{d}</option>)}</select></div>
        <div>{lbl('From')}<input type="time" value={form.unavailable_from} onChange={e=>setForm(f=>({...f,unavailable_from:e.target.value}))} style={inp}/></div>
        <div>{lbl('Until')}<input type="time" value={form.unavailable_until} onChange={e=>setForm(f=>({...f,unavailable_until:e.target.value}))} style={inp}/></div>
        <div style={{ gridColumn:'1/-1' }}>{lbl('Label')}<input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="e.g. Groundskeeping, External booking" style={inp}/></div>
      </div>
      <MFoot onClose={onClose} onSave={save} saving={saving} disabled={!form.field_name} primary={primary} label={rule?'Save changes':'Add rule'}/>
    </Overlay>
  );
}

// ── Template Modal ─────────────────────────────────────────────────────────────

function TemplateModal({ tpl, club, primary, onClose, onSaved }: {
  tpl:ClosureTemplate|null; club:{id:string}|null; primary:string; onClose:()=>void; onSaved:()=>void;
}) {
  const [form, setForm] = useState({ name:tpl?.name??'', reason:tpl?.reason??'', message_template:tpl?.message_template??'', duration_label:tpl?.duration_label??'rest_of_day' });
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!club||!form.name.trim()) return; setSaving(true);
    if (tpl) { await supabase.from('field_closure_templates').update({ name:form.name, reason:form.reason||null, message_template:form.message_template||null, duration_label:form.duration_label||null }).eq('id',tpl.id); }
    else { await supabase.from('field_closure_templates').insert({ club_id:club.id, name:form.name, reason:form.reason||null, message_template:form.message_template||null, duration_label:form.duration_label||null }); }
    setSaving(false); onSaved(); onClose();
  }
  return (
    <Overlay onClose={onClose}>
      <MHead title={tpl?'Edit Template':'New Template'} onClose={onClose}/>
      <div style={{ padding:'18px 22px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div>{lbl('Template name *')}<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder='e.g. "Standard Rain Closure"' style={inp}/></div>
        <div>{lbl('Default reason')}<input value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} placeholder="e.g. Rain / Wet conditions" style={inp}/></div>
        <div>{lbl('Default duration')}<select value={form.duration_label} onChange={e=>setForm(f=>({...f,duration_label:e.target.value}))} style={inp}>{DURATION_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div>{lbl('Message template')}<textarea value={form.message_template} onChange={e=>setForm(f=>({...f,message_template:e.target.value}))} rows={4} placeholder="The notification message sent to parents and coaches…" style={{ ...inp, resize:'vertical', lineHeight:1.6 }}/></div>
      </div>
      <MFoot onClose={onClose} onSave={save} saving={saving} disabled={!form.name.trim()} primary={primary} label={tpl?'Save changes':'Create template'}/>
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
