'use client';

import { useMemo, useState } from 'react';
import { Lightbulb, ChevronLeft, Search } from 'lucide-react';
import { EVAL_IDEA_PILLARS, EVAL_IDEAS, type EvalIdeaPillar, type EvalIdeaCategory } from '@/lib/evaluationIdeas';

export type IdeaType = 'strengths' | 'weaknesses' | 'outcomeGoals' | 'performanceGoals';

// Small "Ideas" button next to a note section's label — opens a popover of
// category chips (grouped into the same four pillars the report card rates
// players on), and clicking a category reveals ready-made phrases for this
// specific section type. Picking one hands the text back to the caller,
// which drops it into the player's next empty slot for that field.
//
// suggestedCategoryIds (passed for the two Goals sections, derived via
// getUsedCategoryIds from whatever strengths/weaknesses are already filled
// in for this player) surfaces a "Suggested for this player" row up top —
// goal ideas that actually follow from what the coach already identified,
// not a disconnected browse of the full library.
export function IdeaPickerButton({ type, primary, onPick, suggestedCategoryIds }: {
  type: IdeaType; primary: string; onPick: (text: string) => void; suggestedCategoryIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pillar, setPillar] = useState<EvalIdeaPillar>('technical');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const suggested = useMemo(
    () => (suggestedCategoryIds?.length ? EVAL_IDEAS.filter(c => suggestedCategoryIds.includes(c.id)) : []),
    [suggestedCategoryIds],
  );
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return EVAL_IDEAS.filter(c => c.label.toLowerCase().includes(q));
  }, [search]);
  const categories = EVAL_IDEAS.filter(c => c.pillar === pillar);
  const activeCategory: EvalIdeaCategory | null =
    (searchMatches ?? categories).find(c => c.id === categoryId)
    ?? suggested.find(c => c.id === categoryId)
    ?? null;

  function toggle() {
    setOpen(o => !o);
    setCategoryId(null);
    setSearch('');
  }
  function pick(text: string) {
    onPick(text);
    setOpen(false);
    setCategoryId(null);
    setSearch('');
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={toggle} type="button"
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: primary, fontSize: '10px', fontWeight: '800', letterSpacing: '0.3px', textTransform: 'uppercase', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        <span style={{ position: 'relative' }}>
          <Lightbulb size={11} />
          {suggested.length > 0 && (
            <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '5px', height: '5px', borderRadius: '50%', background: primary }} />
          )}
        </span>
        Ideas
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            width: '340px', maxWidth: 'calc(100vw - 32px)', maxHeight: '420px', overflowY: 'auto',
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.14)', padding: '10px',
          }}>
            {!activeCategory && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '6px 9px', marginBottom: '9px' }}>
                <Search size={12} color="#94A3B8" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search categories…"
                  style={{ border: 'none', outline: 'none', fontSize: '12px', flex: 1, fontFamily: 'inherit', color: '#0F172A' }}
                />
              </div>
            )}

            {!activeCategory && !search && suggested.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '9.5px', fontWeight: '800', color: primary, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Suggested for this player
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {suggested.map(c => (
                    <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
                      style={{ padding: '6px 10px', borderRadius: '99px', border: `1px solid ${primary}`, background: `${primary}14`, color: primary, fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <div style={{ borderBottom: '1px solid #F1F5F9', margin: '10px 0' }} />
              </div>
            )}

            {!activeCategory && !search && (
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                {EVAL_IDEA_PILLARS.map(p => (
                  <button key={p.id} type="button" onClick={() => { setPillar(p.id); setCategoryId(null); }}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: '6px', fontFamily: 'inherit',
                      border: `1px solid ${pillar === p.id ? primary : '#E2E8F0'}`,
                      background: pillar === p.id ? primary : '#fff',
                      color: pillar === p.id ? '#fff' : '#64748B',
                      fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {!activeCategory ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {(searchMatches ?? categories).map(c => (
                  <button key={c.id} type="button" onClick={() => setCategoryId(c.id)}
                    style={{ padding: '6px 10px', borderRadius: '99px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#334155', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {c.label}
                  </button>
                ))}
                {searchMatches && searchMatches.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#94A3B8', padding: '6px 2px' }}>No categories match &ldquo;{search}&rdquo;.</div>
                )}
              </div>
            ) : (
              <div>
                <button type="button" onClick={() => setCategoryId(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', color: primary, fontSize: '11.5px', fontWeight: '700', cursor: 'pointer', padding: 0, marginBottom: '8px', fontFamily: 'inherit' }}>
                  <ChevronLeft size={13} /> {activeCategory.label}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activeCategory[type].map((text, i) => (
                    <button key={i} type="button" onClick={() => pick(text)}
                      style={{ textAlign: 'left', padding: '8px 10px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '12px', color: '#0F172A', cursor: 'pointer', lineHeight: 1.4, fontFamily: 'inherit' }}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
