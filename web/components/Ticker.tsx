const items = [
  'AI Schedule Import',
  'Drag & Drop Lineup Builder',
  'Live RSVP Tracking',
  'Parent Announcements',
  'One-Tap Attendance',
  'Team Chat',
  'Equal Play Time Planner',
  'Push Notifications',
  'Roster Management',
  'Game Day Countdown',
  'Substitution Planner',
  'Direct Messaging',
];

export default function Ticker() {
  const repeated = [...items, ...items];
  return (
    <div className="overflow-hidden select-none" style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111', padding: '12px 0' }}>
      <div className="ticker-track inline-flex gap-10">
        {repeated.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-3 text-[12px] font-semibold whitespace-nowrap" style={{ color: '#3a3a3a' }}>
            <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#22c55e', opacity: 0.6 }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
