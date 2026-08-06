'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Club = { id: string; name: string; logo_url: string | null; primary_color: string; };
type GameSlot = {
  id: string; field_name: string; slot_date: string;
  start_time: string; end_time: string; away_team: string | null;
  age_group: string | null; game_format: string | null;
  home_team?: { name: string } | null;
};

function fmtT(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; }
function fmtDateLong(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtDateShort(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtWeekday(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }); }

export default function PublicSchedulePage() {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [club,    setClub]    = useState<Club | null>(null);
  const [slots,   setSlots]   = useState<GameSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState('');

  useEffect(() => {
    async function load() {
      const { data: clubData, error: clubErr } = await supabase
        .from('clubs').select('id, name, logo_url, primary_color').eq('slug', clubSlug).single();
      if (clubErr || !clubData) { setError('Club not found'); setLoading(false); return; }
      setClub(clubData as Club);

      const { data: slotData } = await supabase
        .from('game_slots')
        .select('id, field_name, slot_date, start_time, end_time, away_team, age_group, game_format, home_team:teams(name)')
        .eq('club_id', clubData.id)
        .eq('status', 'assigned')
        .order('slot_date').order('start_time');

      setSlots((slotData ?? []) as unknown as GameSlot[]);
      setLoading(false);
    }
    load();
  }, [clubSlug]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFBFC' }}>
        <div style={{ color: '#94A3B8', fontSize: '14px' }}>Loading schedule…</div>
      </div>
    );
  }

  if (error || !club) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFBFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏟️</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#0F172A' }}>Club not found</div>
          <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '6px' }}>{error}</div>
        </div>
      </div>
    );
  }

  const primary = club.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';
  const today   = new Date().toISOString().slice(0, 10);

  // Group by date, optionally filter by team name
  const filterLc = filter.toLowerCase();
  const filtered = filterLc
    ? slots.filter(s =>
        s.home_team?.name?.toLowerCase().includes(filterLc) ||
        (s.away_team ?? '').toLowerCase().includes(filterLc) ||
        (s.age_group ?? '').toLowerCase().includes(filterLc) ||
        s.field_name.toLowerCase().includes(filterLc)
      )
    : slots;

  const upcoming = filtered.filter(s => s.slot_date >= today);
  const past     = filtered.filter(s => s.slot_date <  today);

  // Group by date
  function groupByDate(list: GameSlot[]): Map<string, GameSlot[]> {
    const m = new Map<string, GameSlot[]>();
    for (const s of list) {
      const prev = m.get(s.slot_date) ?? [];
      m.set(s.slot_date, [...prev, s]);
    }
    return m;
  }

  const upcomingGroups = groupByDate(upcoming);
  const pastGroups     = groupByDate(past);

  const [showPast, setShowPast] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#FAFBFC', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `3px solid ${primary}`, padding: '20px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
          {club.logo_url ? (
            <img src={club.logo_url} alt={club.name} style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover' }}/>
          ) : (
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '900', color: '#fff' }}>
              {club.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          )}
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: 0, letterSpacing: '-0.5px' }}>{club.name}</h1>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Game Schedule</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 24px 60px' }}>

        {/* Search */}
        <input
          value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filter by team, field, or age group…"
          style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '13px', color: '#0F172A', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '24px' }}
        />

        {/* Upcoming */}
        {upcomingGroups.size > 0 ? (
          <>
            {[...upcomingGroups.entries()].map(([date, daySlots]) => (
              <DateSection key={date} date={date} daySlots={daySlots} primary={primary}/>
            ))}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8', fontSize: '14px' }}>
            {filter ? 'No games match your search.' : 'No upcoming games scheduled.'}
          </div>
        )}

        {/* Past games toggle */}
        {pastGroups.size > 0 && (
          <div style={{ marginTop: '32px' }}>
            <button
              onClick={() => setShowPast(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', padding: '8px 0', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}
            >
              {showPast ? '▴' : '▾'} Past games ({pastGroups.size} dates)
            </button>
            {showPast && (
              <div style={{ marginTop: '12px', opacity: 0.65 }}>
                {[...pastGroups.entries()].reverse().map(([date, daySlots]) => (
                  <DateSection key={date} date={date} daySlots={daySlots} primary={primary}/>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DateSection({ date, daySlots, primary }: { date: string; daySlots: GameSlot[]; primary: string; }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${primary}15`, border: `1.5px solid ${primary}30`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '9px', fontWeight: '800', color: primary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{fmtWeekday(date)}</div>
          <div style={{ fontSize: '17px', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{new Date(date + 'T12:00:00').getDate()}</div>
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A' }}>{fmtDateLong(date)}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>{daySlots.length} game{daySlots.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '54px' }}>
        {daySlots.map(slot => (
          <div key={slot.id} style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flexShrink: 0, textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: primary }}>{fmtT(slot.start_time)}</div>
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>{fmtT(slot.end_time)}</div>
            </div>
            <div style={{ width: '1px', height: '32px', background: '#E2E8F0', flexShrink: 0 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {slot.home_team?.name ?? '?'} <span style={{ fontWeight: '400', color: '#94A3B8' }}>vs</span> {slot.away_team ?? 'TBD'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span>📍 {slot.field_name}</span>
                {slot.age_group && <span>· {slot.age_group}</span>}
                {slot.game_format && <span>· {slot.game_format}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
