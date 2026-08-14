const items = [
  'Season set up in 40 seconds',
  'Lineup built in 2 minutes, not 45',
  'Zero "what time?" texts',
  'Every parent notified before you put your phone down',
  'RSVPs locked before kick-off',
  'No family left at the wrong field',
  'Coaches save 4–6 hours a week',
  'Tryout chaos replaced by one dashboard',
  'Equal play time calculated instantly',
  'Attendance tracked, parents notified automatically',
  'Roster imported from any spreadsheet',
  'One app your parents actually open',
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
