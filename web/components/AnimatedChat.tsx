'use client';
import { useEffect, useRef, useState } from 'react';

const messages = [
  { from: 'Sarah M.', time: '6:47pm', text: 'Is training still on Thursday??' },
  { from: 'David P.', time: '6:52pm', text: 'Same — is it the usual field?' },
  { from: 'Lisa T.',  time: '7:03pm', text: 'What time is the game Saturday and what kit?' },
  { from: 'James K.', time: '7:11pm', text: 'Ryan can\'t make it Saturday btw' },
  { from: 'Sarah M.', time: '7:14pm', text: 'Also can someone give Ethan a lift from the south end?' },
  { from: 'Mike H.',  time: '7:29pm', text: 'Which field — Riverside or the back pitch?' },
  { from: 'Lisa T.',  time: '8:02pm', text: 'Anyone know if it\'s home or away kit?? 🙈' },
];

export default function AnimatedChat() {
  const ref      = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(0);
  const [typing,  setTyping]  = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    function next() {
      if (i >= messages.length) return;
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setVisible(v => v + 1);
        i++;
        if (i < messages.length) setTimeout(next, 480);
      }, 600);
    }
    setTimeout(next, 200);
  }, [started]);

  return (
    <div ref={ref} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1a1a1a' }}>
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center gap-3" style={{ background: '#0b1e15', borderBottom: '1px solid #162010' }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-extrabold text-[#22c55e]"
          style={{ background: '#122a1a' }}>U14</div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[14px] font-semibold leading-none mb-1">U14 Boys — Parents 🏆</p>
          <p className="text-[#4a7a5a] text-[11px]">47 members</p>
        </div>
        <div className="w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center text-black text-[9px] font-extrabold">
          {visible > 0 ? visible + 40 : 40}
        </div>
      </div>

      {/* Messages */}
      <div className="p-4 flex flex-col gap-3.5" style={{ background: '#090909', minHeight: 280 }}>
        {messages.slice(0, visible).map((m, i) => (
          <div key={i}
            className="flex flex-col gap-1"
            style={{ animation: 'chatMsgIn 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>
            <span className="text-[10px] text-[#3a3a3a] font-medium ml-1">{m.from} · {m.time}</span>
            <div className="inline-block max-w-[88%] px-3 py-2 rounded-2xl rounded-tl-sm"
              style={{ background: '#141414', border: '1px solid #1e1e1e' }}>
              <p className="text-[#888] text-[13px] leading-relaxed">{m.text}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex items-center gap-1.5 ml-1" style={{ animation: 'chatMsgIn 0.2s ease both' }}>
            <div className="flex gap-1 px-3 py-2.5 rounded-2xl rounded-tl-sm" style={{ background: '#141414', border: '1px solid #1e1e1e' }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#444]"
                  style={{ animation: `typingDot 1.2s ease ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        {visible === messages.length && (
          <p className="text-[#383838] text-[11px] italic mt-1 ml-1"
            style={{ animation: 'chatMsgIn 0.4s ease both' }}>
            Coach Rick is typing…
          </p>
        )}
      </div>
    </div>
  );
}
