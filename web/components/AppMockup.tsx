export default function AppMockup() {
  return (
    <div className="relative select-none py-8 px-4" aria-hidden>
      {/* Glow */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 w-52 h-24 blur-3xl rounded-full opacity-25"
        style={{ background: '#dc2626' }}
      />

      {/* Phone shell */}
      <div
        className="relative w-[255px] bg-[#0f0f0f] rounded-[44px] overflow-hidden"
        style={{
          height: 540,
          transform: 'rotate(3deg)',
          boxShadow:
            '0 0 0 1px #2a2a2a, 0 0 0 7px #111, inset 0 0 0 1px #1e1e1e, 0 50px 100px rgba(0,0,0,0.95)',
        }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[72px] h-5 bg-black rounded-full z-20" />

        {/* Screen */}
        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: '#111' }}>

          {/* Status bar */}
          <div className="flex justify-between items-center px-5 pt-8 pb-1 flex-shrink-0" style={{ fontSize: 9, fontWeight: 600, color: '#fff' }}>
            <span style={{ fontWeight: 700 }}>9:41</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="9" viewBox="0 0 12 9" fill="white">
                <rect x="0"   y="5" width="2" height="4" rx="0.4" opacity="0.35"/>
                <rect x="3.3" y="3" width="2" height="6" rx="0.4" opacity="0.55"/>
                <rect x="6.6" y="1" width="2" height="8" rx="0.4" opacity="0.8"/>
                <rect x="9.9" y="0" width="2" height="9" rx="0.4"/>
              </svg>
              <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                <path d="M6 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="white"/>
                <path d="M3.5 4.5C4.2 3.8 5 3.5 6 3.5s1.8.3 2.5 1" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                <path d="M1.2 2.5C2.6 1.1 4.2.5 6 .5s3.4.6 4.8 2" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 3, padding: '1.5px 2px' }}>
                <div style={{ width: 16, height: 8, borderRadius: 1.5, overflow: 'hidden', background: '#2a2a2a' }}>
                  <div style={{ width: '55%', height: '100%', background: '#fff', borderRadius: 1 }} />
                </div>
                <div style={{ width: 2, height: 5, background: 'rgba(255,255,255,0.35)', borderRadius: 1, marginLeft: 1.5 }} />
              </div>
            </div>
          </div>

          {/* Good afternoon */}
          <p className="px-4 flex-shrink-0" style={{ fontSize: 8, color: '#888', paddingTop: 4, paddingBottom: 0 }}>Good afternoon, MDS</p>

          {/* Club header */}
          <div className="px-4 flex items-center justify-between flex-shrink-0" style={{ paddingTop: 8, paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {/* Club logo */}
              <div style={{ width: 36, height: 36, borderRadius: 11, border: '2px solid #dc2626', background: '#1a0808', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                  <path d="M9 1L1.5 4.5v5.5C1.5 14.8 4.8 18.5 9 19.5c4.2-1 7.5-4.7 7.5-9.5V4.5L9 1Z" stroke="#dc2626" strokeWidth="1.2" strokeLinejoin="round" fill="#dc262615"/>
                  <path d="M5.5 10.5l2.5 2.5 4.5-5" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p style={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1, marginBottom: 3 }}>MDS Academy</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ color: '#666', fontSize: 8 }}>U10 Boys Premier</span>
                  <svg width="6" height="5" viewBox="0 0 6 5" fill="none">
                    <path d="M1 1.5l2 2 2-2" stroke="#555" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
            {/* Icon buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                <svg key="bell" width="11" height="12" viewBox="0 0 11 12" fill="none">
                  <path d="M5.5 1a3 3 0 0 1 3 3v2.5L9.5 8h-8L2.5 6.5V4a3 3 0 0 1 3-3Z" stroke="#777" strokeWidth="0.9" strokeLinejoin="round"/>
                  <path d="M4.5 10a1 1 0 0 0 2 0" stroke="#777" strokeWidth="0.9" strokeLinecap="round"/>
                </svg>,
                <svg key="grid" width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="0.5" y="0.5" width="3.5" height="3.5" rx="0.8" stroke="#777" strokeWidth="0.75"/>
                  <rect x="6"   y="0.5" width="3.5" height="3.5" rx="0.8" stroke="#777" strokeWidth="0.75"/>
                  <rect x="0.5" y="6"   width="3.5" height="3.5" rx="0.8" stroke="#777" strokeWidth="0.75"/>
                  <rect x="6"   y="6"   width="3.5" height="3.5" rx="0.8" stroke="#777" strokeWidth="0.75"/>
                </svg>,
                <svg key="gear" width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="5" r="1.6" stroke="#777" strokeWidth="0.75"/>
                  <path d="M5 1v1.2M5 7.8V9M1 5h1.2M7.8 5H9M2.1 2.1l.85.85M7.05 7.05l.85.85M7.9 2.1l-.85.85M2.95 7.05l-.85.85" stroke="#777" strokeWidth="0.75" strokeLinecap="round"/>
                </svg>,
              ] as React.ReactNode[]).map((icon, i) => (
                <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="px-4 flex-shrink-0" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingBottom: 10 }}>
            {[
              {
                value: '13', label: 'Players',
                icon: <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                  <path d="M10 11v-1a3 3 0 0 0-3-3H3a3 3 0 0 0-3 3v1" stroke="#dc2626" strokeWidth="0.95" strokeLinecap="round"/>
                  <circle cx="5" cy="3.5" r="2.5" stroke="#dc2626" strokeWidth="0.95"/>
                  <path d="M13 11v-1a3 3 0 0 0-2.3-2.9M10.5 1.1a2.5 2.5 0 0 1 0 4.8" stroke="#dc2626" strokeWidth="0.95" strokeLinecap="round"/>
                </svg>,
              },
              {
                value: '5', label: 'Upcoming',
                icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="0.5" y="1.5" width="12" height="11" rx="2" stroke="#dc2626" strokeWidth="0.95"/>
                  <path d="M0.5 5h12" stroke="#dc2626" strokeWidth="0.95"/>
                  <path d="M3.5 0.5v2M9.5 0.5v2" stroke="#dc2626" strokeWidth="0.95" strokeLinecap="round"/>
                </svg>,
              },
            ].map(({ value, label, icon }) => (
              <div key={label} style={{ background: '#1a1a1a', borderRadius: 18, padding: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, background: '#dc262618', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  {icon}
                </div>
                <p style={{ color: '#dc2626', fontWeight: 900, fontSize: 22, lineHeight: 1 }}>{value}</p>
                <p style={{ color: '#666', fontSize: 7.5, marginTop: 2 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Next Event */}
          <div className="px-4 flex-shrink-0" style={{ paddingBottom: 8 }}>
            <p style={{ color: '#555', fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>Next Event</p>
            <div style={{ background: '#1a1a1a', borderRadius: 18, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 11, background: '#0e1f36', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                  <path d="M0 5h16" stroke="#4a90e2" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M4 1H2a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 2 9h2" stroke="#4a90e2" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 1h2a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14 9h-2" stroke="#4a90e2" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="4" cy="5" r="1.2" fill="#4a90e2"/>
                  <circle cx="12" cy="5" r="1.2" fill="#4a90e2"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 10.5, lineHeight: 1 }}>Training Session</p>
                <p style={{ color: '#dc2626', fontSize: 8.5, fontWeight: 600, marginTop: 2 }}>Wednesday · 5:30 PM</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  <svg width="6" height="7" viewBox="0 0 6 7" fill="none">
                    <path d="M3 .5a2 2 0 0 0-2 2c0 1.5 2 4 2 4s2-2.5 2-4a2 2 0 0 0-2-2Z" stroke="#555" strokeWidth="0.7" fill="#55555518"/>
                    <circle cx="3" cy="2.5" r=".7" fill="#555"/>
                  </svg>
                  <p style={{ color: '#555', fontSize: 7.5 }}>MDS Training Ground</p>
                </div>
              </div>
              <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
                <path d="M1 1l3 3.5L1 8" stroke="#444" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* From the Coach */}
          <div className="px-4 flex-shrink-0" style={{ paddingBottom: 8 }}>
            <p style={{ color: '#555', fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>From the Coach</p>
            <div style={{ background: '#1a1a1a', borderRadius: 18, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 11, background: '#280a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                  <path d="M13 4.5H9.5l-2-3H1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1Z" stroke="#dc2626" strokeWidth="0.95" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 10.5, lineHeight: 1 }}>Game this weekend</p>
                <p style={{ color: '#666', fontSize: 7.5, lineHeight: 1.4, marginTop: 2 }}>Please update availability for this weekend&apos;s game</p>
                <p style={{ color: '#444', fontSize: 7, marginTop: 2 }}>10d ago</p>
              </div>
              <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
                <path d="M1 1l3 3.5L1 8" stroke="#444" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-4 flex-shrink-0" style={{ paddingBottom: 8 }}>
            <p style={{ color: '#555', fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>Quick Actions</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                {
                  label: 'Add Player',
                  icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M9 12.5v-1a3 3 0 0 0-3-3H3a3 3 0 0 0-3 3v1" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round"/>
                    <circle cx="4.5" cy="4" r="2.5" stroke="#dc2626" strokeWidth="0.9"/>
                    <path d="M11 4.5v4M9 6.5h4" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round"/>
                  </svg>,
                },
                {
                  label: 'Add Event',
                  icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="0.5" y="1.5" width="12" height="11" rx="2" stroke="#dc2626" strokeWidth="0.9"/>
                    <path d="M0.5 5h12" stroke="#dc2626" strokeWidth="0.9"/>
                    <path d="M3.5 0.5v2M9.5 0.5v2" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round"/>
                    <path d="M6.5 8v3M5 9.5h3" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round"/>
                  </svg>,
                },
                {
                  label: 'Invite',
                  icon: <svg width="13" height="11" viewBox="0 0 13 11" fill="none">
                    <circle cx="4.5" cy="3" r="2.5" stroke="#dc2626" strokeWidth="0.9"/>
                    <path d="M3 10.5c0-2 1.3-3.5 3.5-3.5.5 0 1 .08 1.5.24" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round"/>
                    <path d="M10.5 7.5L12 9l1.5-2" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="11" cy="4" r="2" stroke="#dc2626" strokeWidth="0.9"/>
                  </svg>,
                },
                {
                  label: 'Team Chat',
                  icon: <svg width="13" height="12" viewBox="0 0 13 12" fill="none">
                    <path d="M11.5 7.5a1.5 1.5 0 0 1-1.5 1.5H3.5L1 11.5V2A1.5 1.5 0 0 1 2.5.5h8A1.5 1.5 0 0 1 12 2v5.5Z" stroke="#dc2626" strokeWidth="0.9" strokeLinejoin="round"/>
                    <path d="M4 4.5h5M4 6.5h3" stroke="#dc2626" strokeWidth="0.9" strokeLinecap="round"/>
                  </svg>,
                },
              ].map(({ label, icon }) => (
                <div key={label} style={{ background: '#1a1a1a', borderRadius: 16, padding: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 9, background: '#280a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                    {icon}
                  </div>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: 8.5 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Tab bar */}
          <div
            className="flex-shrink-0"
            style={{ borderTop: '1px solid #1e1e1e', background: '#0f0f0f', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '8px 0 4px' }}
          >
            {([
              {
                label: 'Home', active: true,
                icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 7L7 1.5l6 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2.5 6V13h3V9.5h3V13H11.5V6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>,
              },
              {
                label: 'Schedule', active: false,
                icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="0.5" y="1.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1"/>
                  <path d="M0.5 5h12" stroke="currentColor" strokeWidth="1"/>
                  <path d="M3.5 0.5v2M9.5 0.5v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>,
              },
              {
                label: 'Roster', active: false,
                icon: <svg width="15" height="12" viewBox="0 0 15 12" fill="none">
                  <path d="M11 11.5v-1a3 3 0 0 0-3-3H3a3 3 0 0 0-3 3v1" stroke="currentColor" strokeWidth="1"/>
                  <circle cx="5.5" cy="3.5" r="2.5" stroke="currentColor" strokeWidth="1"/>
                  <path d="M14.5 11.5v-1a3 3 0 0 0-2.5-2.95M11 1.1a2.5 2.5 0 0 1 0 4.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>,
              },
              {
                label: 'Chat', active: false,
                icon: <svg width="14" height="13" viewBox="0 0 14 13" fill="none">
                  <path d="M12.5 8A1.5 1.5 0 0 1 11 9.5H3.5L1 12.5V2A1.5 1.5 0 0 1 2.5.5h9A1.5 1.5 0 0 1 13 2v6Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
                </svg>,
              },
            ] as { label: string; active: boolean; icon: React.ReactNode }[]).map(({ label, active, icon }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? '#dc2626' : '#555' }}>
                {icon}
                <span style={{ fontSize: 6.5, fontWeight: 700 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Home indicator */}
          <div className="flex-shrink-0" style={{ background: '#0f0f0f', display: 'flex', justifyContent: 'center', paddingBottom: 8, paddingTop: 2 }}>
            <div style={{ width: 80, height: 4, background: '#2a2a2a', borderRadius: 10 }} />
          </div>

        </div>
      </div>
    </div>
  );
}
