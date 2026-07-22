import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

// Public page — no auth, no layout
// URL: /maroons/fields

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function isActiveClosure(c: { closed_from: string; closed_until: string | null }) {
  const now = new Date();
  if (new Date(c.closed_from) > now) return false;
  if (!c.closed_until) return true;
  return new Date(c.closed_until) > now;
}

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

export default async function PublicFieldStatusPage({ params }: { params: Promise<{ clubSlug: string }> }) {
  const { clubSlug } = await params;

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name, primary_color, logo_url')
    .eq('slug', clubSlug)
    .single();

  if (!club) notFound();

  const primary = (club.primary_color && club.primary_color !== '#000000') ? club.primary_color : '#22C55E';

  const [{ data: fields }, { data: closures }] = await Promise.all([
    supabase.from('tryout_fields').select('id, name, sub_zones, is_active').eq('club_id', club.id).eq('is_active', true).order('sort_order').order('name'),
    supabase.from('field_closures').select('*').eq('club_id', club.id).order('closed_from', { ascending: false }).limit(50),
  ]);

  const activeClosures = (closures ?? []).filter(isActiveClosure);

  const fieldList = (fields ?? []);
  const updatedAt = new Date().toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

  return (
    <html>
      <head>
        <meta charSet="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>{club.name} — Field Status</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F0F2F5; min-height: 100vh; color: #0F172A; }
          .header { background: ${primary}; padding: 28px 20px; text-align: center; }
          .header img { height: 52px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; border-radius: 8px; }
          .header-eyebrow { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.65); text-transform: uppercase; letter-spacing: 2.5px; margin-bottom: 5px; }
          .header-title { font-size: 24px; font-weight: 900; color: #fff; letter-spacing: -0.5px; }
          .header-sub { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 4px; }
          .body { max-width: 600px; margin: 0 auto; padding: 20px 16px 48px; }
          .status-banner { border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
          .status-banner.closed { background: #FEF2F2; border: 1.5px solid #FCA5A5; }
          .status-banner.open   { background: #F0FDF4; border: 1.5px solid #86EFAC; }
          .field-card { background: #fff; border-radius: 12px; padding: 16px 18px; margin-bottom: 10px; border: 1.5px solid #E2E8F0; }
          .field-card.closed { border-color: #FCA5A5; }
          .field-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .field-name { font-size: 16px; font-weight: 800; color: #0F172A; }
          .pill { font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; white-space: nowrap; }
          .pill.open   { background: #F0FDF4; color: #16A34A; }
          .pill.closed { background: #FEF2F2; color: #EF4444; }
          .zones { font-size: 12px; color: #94A3B8; margin-top: 5px; }
          .closure-detail { font-size: 12px; color: #EF4444; margin-top: 6px; }
          .closure-message { margin-top: 8px; padding: 10px 13px; background: #FFF5F5; border-radius: 7px; font-size: 12.5px; color: #374151; line-height: 1.6; font-style: italic; border-left: 3px solid #EF4444; }
          .section-label { font-size: 10px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 1.5px; margin: 20px 0 10px; }
          .footer { text-align: center; font-size: 11px; color: #CBD5E1; margin-top: 32px; }
          .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
          .dot.open   { background: #22C55E; }
          .dot.closed { background: #EF4444; animation: pulse 1.5s infinite; }
          @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        `}</style>
      </head>
      <body>
        <div className="header">
          {club.logo_url && <img src={club.logo_url} alt={club.name}/>}
          <div className="header-eyebrow">Field Status</div>
          <div className="header-title">{club.name}</div>
          <div className="header-sub">Updated {updatedAt}</div>
        </div>

        <div className="body">

          {/* Top status banner */}
          {activeClosures.length > 0 ? (
            <div className="status-banner closed">
              <div className="dot closed"/>
              <div>
                <div style={{ fontWeight:'800', fontSize:'13px', color:'#EF4444' }}>
                  {activeClosures.length} field{activeClosures.length!==1?'s':''} currently closed
                </div>
                <div style={{ fontSize:'12px', color:'#B91C1C', marginTop:'2px' }}>
                  Check individual fields below for details
                </div>
              </div>
            </div>
          ) : (
            <div className="status-banner open">
              <div className="dot open"/>
              <div>
                <div style={{ fontWeight:'800', fontSize:'13px', color:'#16A34A' }}>All fields open</div>
                <div style={{ fontSize:'12px', color:'#15803D', marginTop:'2px' }}>No active closures at this time</div>
              </div>
            </div>
          )}

          {/* Field list */}
          <div className="section-label">Fields ({fieldList.length})</div>
          {fieldList.map(f => {
            const closure = activeClosures.find(c => c.field_name === f.name);
            const closed = !!closure;
            return (
              <div key={f.id} className={`field-card${closed?' closed':''}`}>
                <div className="field-header">
                  <div className="field-name">{f.name}</div>
                  <span className={`pill ${closed?'closed':'open'}`}>{closed?'CLOSED':'OPEN'}</span>
                </div>
                {(f.sub_zones as string[])?.length > 0 && (
                  <div className="zones">Zones: {(f.sub_zones as string[]).join(' · ')}</div>
                )}
                {closure && (
                  <>
                    <div className="closure-detail">
                      {closure.reason && <span>{closure.reason} · </span>}
                      {closure.closed_until
                        ? <>Until {fmtDt(closure.closed_until)}</>
                        : 'Until further notice'
                      }
                    </div>
                    {closure.notify_message && (
                      <div className="closure-message">"{closure.notify_message}"</div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Recent past closures */}
          {(closures ?? []).filter(c => !isActiveClosure(c)).slice(0, 5).length > 0 && (
            <>
              <div className="section-label">Recent Closures</div>
              {(closures ?? []).filter(c => !isActiveClosure(c)).slice(0, 5).map(c => (
                <div key={c.id} style={{ background:'#F8FAFC', borderRadius:'8px', padding:'12px 16px', marginBottom:'6px', border:'1px solid #E2E8F0' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'13px', fontWeight:'700', color:'#374151' }}>{c.field_name}</span>
                    <span style={{ fontSize:'11px', color:'#94A3B8' }}>Reopened</span>
                  </div>
                  <div style={{ fontSize:'11.5px', color:'#94A3B8', marginTop:'3px' }}>
                    {fmtDt(c.closed_from)} → {c.closed_until ? fmtDt(c.closed_until) : '—'}
                    {c.reason && ` · ${c.reason}`}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="footer">
            Bookmark this page to check field status before heading out.<br/>
            Powered by <a href="https://pulse-fc.app" style={{ color:'#CBD5E1' }}>Pulse FC</a>
          </div>
        </div>

        {/* Auto-refresh every 5 minutes */}
        <script dangerouslySetInnerHTML={{ __html: 'setTimeout(()=>location.reload(),300000)' }}/>
      </body>
    </html>
  );
}
