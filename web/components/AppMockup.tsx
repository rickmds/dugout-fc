export default function AppMockup() {
  return (
    <div className="relative select-none py-8 px-4" aria-hidden>

      {/* Glow layers */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#22c55e] opacity-20 blur-3xl rounded-full" />
      <div className="absolute top-12 right-6 w-24 h-24 bg-[#22c55e] opacity-8 blur-2xl rounded-full" />

      {/* Phone */}
      <div
        className="relative w-[255px] bg-[#0f0f0f] rounded-[44px] overflow-hidden"
        style={{
          height: '510px',
          transform: 'rotate(3deg)',
          boxShadow: '0 0 0 1px #2a2a2a, 0 0 0 7px #111, inset 0 0 0 1px #1e1e1e, 0 50px 100px rgba(0,0,0,0.9)',
        }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-20" />

        {/* Screen content */}
        <div className="absolute inset-0 flex flex-col bg-[#0a0a0a]">

          {/* Status bar */}
          <div className="flex justify-between items-center px-6 pt-4 pb-0.5 text-[9px] font-medium text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1 text-white">
              <span style={{ fontSize: 8 }}>●●●●</span>
              <span style={{ fontSize: 8 }}>WiFi</span>
              <span style={{ fontSize: 8 }}>▮</span>
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-2 pb-3">
            <div>
              <p className="text-[9px] text-[#4b5563] font-medium">MDS Academy</p>
              <p className="text-white font-extrabold text-[15px] tracking-tight">U14 Boys</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#252525] flex items-center justify-center">
                <span style={{ fontSize: 9 }}>🔔</span>
              </div>
              <div className="w-7 h-7 rounded-full bg-[#22c55e] flex items-center justify-center text-black font-extrabold text-[9px]">RC</div>
            </div>
          </div>

          {/* Next game card */}
          <div className="mx-3 mb-2 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #111 100%)', border: '1px solid #222' }}>
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[8px] text-[#4b5563] font-bold uppercase tracking-widest">Next Game</span>
                <span className="bg-[#22c55e] text-black text-[7px] font-extrabold px-1.5 py-0.5 rounded-full">2 DAYS</span>
              </div>
              <p className="text-white font-bold text-[12px] mb-0.5">vs Maroons SC</p>
              <p className="text-[#6b7280] text-[8px] mb-2.5">Sat 28 Jun · 10:00am · Riverside Park</p>
              <div className="flex gap-1.5">
                <div className="flex-1 bg-[#22c55e] rounded-xl py-1.5 text-center text-[8px] font-extrabold text-black">✓  Attending</div>
                <div className="flex-1 rounded-xl py-1.5 text-center text-[8px] font-bold text-[#4b5563]" style={{ border: '1px solid #252525' }}>✕  Can't go</div>
              </div>
            </div>
          </div>

          {/* Squad card */}
          <div className="mx-3 mb-2 bg-[#111] rounded-2xl p-3" style={{ border: '1px solid #1e1e1e' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] text-[#4b5563] font-bold uppercase tracking-widest">Squad Availability</span>
              <span className="text-[9px] text-white font-extrabold">11 / 14</span>
            </div>
            <div className="flex gap-0.5 mb-1.5">
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full"
                  style={{ background: i < 11 ? '#22c55e' : '#1e1e1e' }}
                />
              ))}
            </div>
            <div className="flex justify-between">
              <span className="text-[7px] text-[#22c55e] font-semibold">11 attending</span>
              <span className="text-[7px] text-[#4b5563]">3 pending</span>
            </div>
          </div>

          {/* Announcement */}
          <div className="mx-3 mb-2 bg-[#111] rounded-2xl p-3" style={{ border: '1px solid #1e1e1e' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span style={{ fontSize: 9 }}>📣</span>
              <span className="text-[8px] text-[#4b5563] font-bold uppercase tracking-widest">Announcement</span>
            </div>
            <p className="text-white text-[9px] font-bold mb-0.5">Home kit Saturday</p>
            <p className="text-[#6b7280] text-[8px] leading-relaxed">Wear green. Arrive 30 mins early for warm-up.</p>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Tab bar */}
          <div className="flex justify-around items-center py-2.5 px-3" style={{ borderTop: '1px solid #1a1a1a', background: '#0a0a0a' }}>
            {[
              { label: 'Home', emoji: '⊞', active: true },
              { label: 'Schedule', emoji: '📅', active: false },
              { label: 'Roster', emoji: '👥', active: false },
              { label: 'Chat', emoji: '💬', active: false },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-0.5 px-1">
                <span style={{ fontSize: 13 }}>{t.emoji}</span>
                <span className={`text-[6.5px] font-bold ${t.active ? 'text-[#22c55e]' : 'text-[#3a3a3a]'}`}>{t.label}</span>
                {t.active && <div className="w-1 h-0.5 rounded-full bg-[#22c55e]" />}
              </div>
            ))}
          </div>

          {/* Home indicator */}
          <div className="flex justify-center pb-1.5">
            <div className="w-20 h-0.5 rounded-full bg-[#2a2a2a]" />
          </div>

        </div>
      </div>
    </div>
  );
}
