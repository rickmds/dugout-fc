const notifications = [
  { name: 'Sarah M.',  attending: true,  delay: '0.6s'  },
  { name: 'David P.',  attending: true,  delay: '1.4s'  },
  { name: 'Ryan K.',   attending: false, delay: '2.2s'  },
  { name: 'Ethan L.',  attending: true,  delay: '3.0s'  },
  { name: 'Lisa T.',   attending: true,  delay: '3.8s'  },
];

export default function LivePreview() {
  return (
    <div className="relative w-full max-w-[360px]" aria-hidden>
      {/* Subtle glow behind the card */}
      <div className="absolute -inset-6 rounded-3xl"
        style={{ background: 'radial-gradient(ellipse at 50% 60%, #22c55e0a 0%, transparent 70%)' }} />

      <div className="relative rounded-2xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #1c1c1c' }}>

        {/* Card header */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #161616' }}>
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[11px] text-[#444] font-bold uppercase tracking-widest">Next game</p>
            <span className="text-[10px] font-extrabold text-[#22c55e]"
              style={{ background: '#22c55e0f', border: '1px solid #22c55e1f', padding: '2px 8px', borderRadius: 99 }}>
              2 days
            </span>
          </div>
          <p className="text-white font-extrabold text-[17px] tracking-tight">vs Maroons SC</p>
          <p className="text-[#555] text-[13px]">Sat · 10:00am · Riverside Park · Home kit</p>
        </div>

        {/* Attendance bar */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #161616' }}>
          <div className="flex justify-between items-baseline mb-2.5">
            <span className="text-[13px] font-bold text-white">Squad availability</span>
            <span className="text-[12px] font-extrabold text-[#22c55e]">11 / 14</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full"
                style={{ background: i < 11 ? '#22c55e' : '#1e1e1e' }} />
            ))}
          </div>
        </div>

        {/* Live notifications */}
        <div className="px-5 py-4">
          <p className="text-[10px] text-[#383838] font-bold uppercase tracking-widest mb-3">Recent RSVPs</p>
          <div className="flex flex-col gap-2.5">
            {notifications.map((n, i) => (
              <div key={i} className="notif flex items-center gap-3" style={{ animationDelay: n.delay }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold flex-shrink-0"
                  style={n.attending
                    ? { background: '#0e2016', border: '1px solid #22c55e28', color: '#22c55e' }
                    : { background: '#1a0e0e', border: '1px solid #c55e2228', color: '#c55e22' }}>
                  {n.name.split(' ').map(p => p[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[#ccc] text-[13px] font-medium">{n.name}</span>
                </div>
                <span className="text-[12px] font-bold flex-shrink-0"
                  style={{ color: n.attending ? '#22c55e' : '#c55e22' }}>
                  {n.attending ? '✓ Attending' : '✗ Can\'t go'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RSVP lock */}
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderTop: '1px solid #141414', background: '#090909' }}>
          <span className="text-[11px] text-[#383838]">RSVP closes in</span>
          <span className="text-[11px] font-extrabold text-[#555]">14h 23m</span>
        </div>
      </div>

      {/* Floating notification pill above */}
      <div className="absolute -top-4 -right-3 notif"
        style={{ animationDelay: '4.4s', background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 99, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" style={{ boxShadow: '0 0 4px #22c55e' }} />
        <span className="text-[11px] font-semibold text-[#888] whitespace-nowrap">Mike H. is attending</span>
      </div>
    </div>
  );
}
