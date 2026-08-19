'use client';

import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

type PlaceSuggestion = { place_id: string; description: string };

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '9px',
  border: '1px solid #E2E8F0', fontSize: '13.5px', color: '#0F172A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

// Shared by the event location picker and the Add Field form — both want
// the same "search an address, pick a suggestion, get back lat/lng" flow
// against the server-side /api/places proxy (keeps the Places key off the
// client, unlike the mobile app which calls Google directly).
export default function LocationAutocomplete({
  value, onChange, onSelect, placeholder = 'Street address or location…',
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: { address: string; name: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [fetching, setFetching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(() => fetchSuggestions(v), 350);
  }

  async function fetchSuggestions(q: string) {
    setFetching(true);
    try {
      const res  = await fetch(`/api/places?input=${encodeURIComponent(q)}`);
      const json = await res.json();
      setSuggestions((json.predictions ?? []).slice(0, 5));
    } catch { setSuggestions([]); }
    setFetching(false);
  }

  async function pick(s: PlaceSuggestion) {
    onChange(s.description);
    setSuggestions([]);
    try {
      const res  = await fetch(`/api/places?place_id=${encodeURIComponent(s.place_id)}`);
      const json = await res.json();
      const loc  = json.result?.geometry?.location;
      onSelect({ address: s.description, name: json.result?.name ?? s.description, lat: loc?.lat ?? null, lng: loc?.lng ?? null });
    } catch {
      onSelect({ address: s.description, name: s.description, lat: null, lng: null });
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingRight: fetching ? '36px' : '13px' }}
        />
        {fetching && (
          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', border: '2px solid #E2E8F0', borderTopColor: '#64748B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        )}
      </div>
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', overflow: 'hidden' }}>
          {suggestions.map((s, i) => (
            <button key={s.place_id} onClick={() => pick(s)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              <MapPin size={13} color="#94A3B8" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#374151', lineHeight: '1.4' }}>{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
