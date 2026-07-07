'use client';

export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 255,
        background: '#0f0f0f',
        borderRadius: 44,
        overflow: 'hidden',
        position: 'relative',
        boxShadow:
          '0 0 0 1px #2a2a2a, 0 0 0 7px #111, inset 0 0 0 1px #1e1e1e, 0 50px 100px rgba(0,0,0,0.9)',
      }}
    >
      {/* Dynamic Island */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 88,
          height: 26,
          background: '#000',
          borderRadius: 20,
          zIndex: 20,
        }}
      />

      <div style={{ background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
        {/* Status bar */}
        <div
          style={{
            height: 52,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            padding: '0 20px 8px',
            fontSize: 10,
            fontWeight: 600,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <span>9:41</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {/* Signal bars */}
            <svg width="13" height="9" viewBox="0 0 13 9" fill="white">
              <rect x="0"   y="5" width="2.5" height="4" rx="0.5" opacity="0.4" />
              <rect x="3.5" y="3" width="2.5" height="6" rx="0.5" opacity="0.6" />
              <rect x="7"   y="1" width="2.5" height="8" rx="0.5" opacity="0.8" />
              <rect x="10.5" y="0" width="2.5" height="9" rx="0.5" />
            </svg>
            {/* WiFi */}
            <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
              <path d="M6 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="white" />
              <path d="M3.5 5.5C4.2 4.8 5 4.5 6 4.5s1.8.3 2.5 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M1.5 3.5C2.8 2.2 4.3 1.5 6 1.5s3.2.7 4.5 2" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            </svg>
            {/* Battery */}
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 3, padding: '1px 2px', position: 'relative' }}>
              <div style={{ width: 18, height: 8, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, background: '#4ade80', borderRadius: 1, width: '80%' }} />
              </div>
              <div style={{ width: 2, height: 5, background: 'rgba(255,255,255,0.4)', borderRadius: 1, marginLeft: 1 }} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div>{children}</div>

        {/* Home indicator */}
        <div
          style={{
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ width: 100, height: 5, background: '#2a2a2a', borderRadius: 10 }} />
        </div>
      </div>
    </div>
  );
}
