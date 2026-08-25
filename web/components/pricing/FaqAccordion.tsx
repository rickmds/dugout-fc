'use client';

import { useState } from 'react';

export default function FaqAccordion({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      {faqs.map(({ q, a }, i) => (
        <div
          key={q}
          style={{ borderBottom: '1px solid #1a1a1a', cursor: 'pointer' }}
          onClick={() => setOpenFaq(openFaq === i ? null : i)}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 0', gap: '16px',
          }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#fff', flex: 1 }}>{q}</span>
            <span style={{
              fontSize: '18px', color: '#555', flexShrink: 0,
              transform: openFaq === i ? 'rotate(45deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}>+</span>
          </div>
          {openFaq === i && (
            <div style={{ paddingBottom: '20px' }}>
              <p style={{ fontSize: '14px', color: '#888', lineHeight: '1.7', margin: 0 }}>{a}</p>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
