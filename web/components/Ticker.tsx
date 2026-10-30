const items = [
  'Season set up in 40 seconds',
  'Lineup built in 2 minutes, not 45',
  'Zero "what time?" texts',
  'Every parent notified before you put your phone down',
  'RSVPs locked before kick-off',
  'No family left at the wrong field',
  'Coaches save 4–6 hours a week',
  'Tryout fees collected online, split and reconciled automatically',
  'Equal play time calculated instantly',
  'Attendance tracked, parents notified automatically',
  'Roster imported from any spreadsheet',
  'One app your parents actually open',
];

export default function Ticker() {
  const repeated = [...items, ...items];
  return (
    <div className="overflow-hidden select-none" style={{ borderTop: '1px solid #EDE6DA', borderBottom: '1px solid #EDE6DA', padding: '12px 0', background: '#F3EEE4' }}>
      <div className="ticker-track inline-flex gap-10">
        {repeated.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-3 text-[12px] font-semibold whitespace-nowrap" style={{ color: '#8A8071' }}>
            <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#3FA86B', opacity: 0.8 }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
