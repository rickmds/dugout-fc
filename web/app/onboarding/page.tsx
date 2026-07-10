'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { FlipBoard } from '@/components/FlipBoard';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'auth' | 'club' | 'upload' | 'processing' | 'review' | 'done';
type Conf = 'high' | 'medium' | 'low';

type TRow = { id: string; name: string; age_group: string; gender: string; conf: Conf };
type PRow = { id: string; full_name: string; jersey_number: string; position: string; parent_email: string; local_team_id: string; conf: Conf };
type ERow = { id: string; title: string; type: string; home_away: string; event_date: string; event_time: string; location: string; address: string; lat: string; lng: string; uniform: string; duration_minutes: string; arrival_buffer_minutes: string; field_notes: string; field_type: string; notes: string; coach_notes: string; local_team_id: string; conf: Conf };
type CRow = { id: string; full_name: string; email: string; local_team_id: string };

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  payload: { base64?: string; mimeType?: string; text?: string; name: string };
};

type ParentInvite = { inviteId: string; playerName: string; email: string };
type CoachPayload = { club_id: string; clubName: string; clubColor: string; coaches: { full_name: string; email: string; team_id: string | null; team_name: string }[] };

type ClubResult = { id: string; name: string; slug: string; primaryColor: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function toPayload(file: File): Promise<{ base64?: string; mimeType?: string; text?: string; name: string }> {
  const mimeType = file.type || 'text/plain';
  if (mimeType === 'text/csv' || mimeType === 'text/plain' || file.name.endsWith('.csv')) {
    return { text: await file.text(), name: file.name };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => { const r = reader.result as string; resolve({ base64: r.split(',')[1], mimeType, name: file.name }); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function matchTeamId(name: string | null | undefined, rows: TRow[]): string {
  if (!name) return '';
  const n = name.toLowerCase().trim();
  return (
    rows.find(t => t.name.toLowerCase().trim() === n)?.id ??
    rows.find(t => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()))?.id ??
    ''
  );
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

const STEP_KEYS = [
  { key: 'auth',   label: 'Account' },
  { key: 'club',   label: 'Club'    },
  { key: 'upload', label: 'Import'  },
  { key: 'review', label: 'Review'  },
  { key: 'done',   label: 'Done'    },
];

function StepBar({ current }: { current: Step }) {
  const mapped = current === 'processing' ? 'upload' : current;
  const idx    = STEP_KEYS.findIndex(s => s.key === mapped);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEP_KEYS.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all
                ${active ? 'bg-[#22c55e] border-[#22c55e] text-black'
                : done   ? 'bg-[#22c55e22] border-[#22c55e] text-[#22c55e]'
                         : 'bg-[#111] border-[#333] text-[#555]'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap
                ${active ? 'text-[#22c55e]' : done ? 'text-[#6b7280]' : 'text-[#374151]'}`}>
                {s.label}
              </span>
            </div>
            {i < STEP_KEYS.length - 1 && (
              <div className={`flex-1 h-px mx-1 mb-4 transition-all ${done ? 'bg-[#22c55e44]' : 'bg-[#222]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#111] border border-[#222] rounded-2xl p-8">{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-[#6b7280] uppercase tracking-widest mb-2">{children}</label>;
}

function Btn({ children, onClick, disabled, variant = 'primary', type = 'button' }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-sm transition-all disabled:cursor-not-allowed
        ${variant === 'primary'
          ? 'bg-[#22c55e] text-black hover:bg-[#16a34a] disabled:opacity-40'
          : 'border border-[#333] text-[#9ca3af] hover:border-[#444] hover:text-white disabled:opacity-40'}`}
    >
      {children}
    </button>
  );
}

function ConfBadge({ conf }: { conf?: Conf }) {
  if (!conf || conf === 'high') return null;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
      conf === 'medium' ? 'bg-amber-900/40 text-amber-400' : 'bg-red-900/40 text-red-400'
    }`}>
      {conf === 'medium' ? 'Review' : 'Check'}
    </span>
  );
}

const SI: React.CSSProperties = { padding: '6px 8px', fontSize: 13 };

// ─── Google Places ────────────────────────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: { types?: string[] }
          ) => {
            addListener: (event: string, handler: () => void) => void;
            getPlace: () => {
              formatted_address?: string;
              geometry?: { location?: { lat: () => number; lng: () => number } };
            };
          };
        };
        event: { clearInstanceListeners: (instance: object) => void };
      };
    };
  }
}

let _mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (!_mapsPromise) {
    _mapsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY}&libraries=places`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return _mapsPromise;
}

function PlacesInput({ value, onChange, onSelect, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (place: { address: string; lat: number; lng: number }) => void;
  placeholder?: string;
}) {
  type ACInstance = { addListener: (e: string, h: () => void) => void; getPlace: () => { formatted_address?: string; geometry?: { location?: { lat: () => number; lng: () => number } } } };
  const ref = useRef<HTMLInputElement>(null);
  const acRef = useRef<ACInstance | null>(null);

  function initAutocomplete() {
    if (acRef.current || !ref.current) return;
    loadGoogleMaps().then(() => {
      if (!ref.current || !window.google || acRef.current) return;
      try {
        acRef.current = new window.google.maps.places.Autocomplete(ref.current, { types: ['establishment', 'geocode'] });
        acRef.current.addListener('place_changed', () => {
          if (!acRef.current) return;
          const place = acRef.current.getPlace();
          const address = place.formatted_address ?? '';
          const lat = place.geometry?.location?.lat() ?? 0;
          const lng = place.geometry?.location?.lng() ?? 0;
          if (address) onSelect({ address, lat, lng });
        });
      } catch {
        // autocomplete unavailable — plain text input still works
      }
    }).catch(() => { /* maps failed to load — no autocomplete */ });
  }

  useEffect(() => {
    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current);
      }
    };
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={initAutocomplete}
      placeholder={placeholder ?? 'Search address…'}
      style={{ ...SI, flex: 1, minWidth: 0, fontSize: 12 }}
    />
  );
}

// ─── Step 1: Auth ─────────────────────────────────────────────────────────────

function AuthStep({ onDone }: { onDone: (user: User) => void }) {
  const [mode, setMode]     = useState<'login' | 'signup'>('signup');
  const [email, setEmail]   = useState('');
  const [pw, setPw]         = useState('');
  const [name, setName]     = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (mode === 'signup') {
      const { data, error: err } = await supabase.auth.signUp({ email, password: pw });
      if (err || !data.user) { setError(err?.message ?? 'Sign up failed'); setLoading(false); return; }
      await supabase.from('profiles').upsert({ id: data.user.id, full_name: name, role: 'org_admin' });
      onDone(data.user);
    } else {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (err || !data.user) { setError(err?.message ?? 'Login failed'); setLoading(false); return; }
      onDone(data.user);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="Pulse FC" style={{ height: '48px', width: 'auto' }} />
          
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-1">Add your club to Pulse FC</h1>
        <p className="text-[#9ca3af] text-sm">Create your account to get started</p>
      </div>
      <Card>
        <div className="flex rounded-xl border border-[#222] overflow-hidden mb-6">
          {(['signup', 'login'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2.5 text-sm font-bold transition-all
                ${mode === m ? 'bg-[#22c55e] text-black' : 'text-[#6b7280] hover:text-white'}`}>
              {m === 'signup' ? 'Create account' : 'Log in'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <div>
              <Label>Your name</Label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" required />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div>
            <Label>Password</Label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min. 6 characters" required minLength={6} />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Btn type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account →' : 'Log in →'}
          </Btn>
        </form>
      </Card>
    </div>
  );
}

// ─── Step 2: Club ─────────────────────────────────────────────────────────────

function ClubStep({ onDone }: { onDone: (data: ClubResult) => void }) {
  const [name, setName]           = useState('');
  const [slug, setSlug]           = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [primary, setPrimary]     = useState('#22c55e');
  const [logoFile, setLogoFile]   = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  useEffect(() => { if (!slugEdited) setSlug(slugify(name)); }, [name, slugEdited]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Logo must be under 3MB.'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError('');
  }

  async function submit() {
    if (!name.trim() || !slug.trim()) { setError('Club name and slug are required.'); return; }
    setError('');
    setLoading(true);
    let logoBase64: string | null = null, logoMime: string | null = null, logoName: string | null = null;
    if (logoFile) {
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(logoFile);
      });
      logoMime = logoFile.type;
      logoName = logoFile.name;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_club', name: name.trim(), slug: slug.trim(), primary_color: primary, user_id: user?.id, logo_base64: logoBase64, logo_mime: logoMime, logo_name: logoName }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? 'Failed to create club'); setLoading(false); return; }
    onDone({ id: json.club.id, name: name.trim(), slug: slug.trim(), primaryColor: primary });
    setLoading(false);
  }

  const initials = name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || 'FC';

  return (
    <div>
      <h2 className="text-xl font-extrabold text-white mb-1">Club identity</h2>
      <p className="text-[#9ca3af] text-sm mb-6">Your logo and colours appear throughout the app</p>
      <Card>
        <div className="flex flex-col gap-5">

          {/* Live preview */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a]">
            <label className="cursor-pointer">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 border-2"
                style={{ background: `${primary}18`, borderColor: primary }}>
                {logoPreview
                  ? <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                  : <span className="text-base font-extrabold" style={{ color: primary }}>{initials}</span>}
              </div>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
            <div>
              <p className="text-white font-bold text-sm">{name || 'Your Club'}</p>
              <p className="text-[#555] text-xs mt-0.5">pulse-fc.app/{slug || 'your-club'}</p>
              <p className="text-[#22c55e] text-xs mt-1 font-medium">Click logo to upload</p>
            </div>
            <div className="ml-auto">
              <div className="w-6 h-6 rounded-full border border-[#333]" style={{ background: primary }} />
            </div>
          </div>

          <div>
            <Label>Club name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MDS Academy" />
          </div>

          <div>
            <Label>Club URL slug</Label>
            <div className="flex items-center bg-[#111] border border-[#222] rounded-xl overflow-hidden focus-within:border-[#22c55e]">
              <span className="px-3 text-[#4b5563] text-sm whitespace-nowrap">pulse-fc.app/</span>
              <input value={slug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                className="border-0 rounded-none bg-transparent flex-1 !border-0 focus:!border-0" placeholder="mds-academy" />
            </div>
          </div>

          <div>
            <Label>Primary colour</Label>
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 flex-shrink-0">
                <div className="w-10 h-10 rounded-lg border border-[#333]" style={{ background: primary }} />
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
              <input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#22c55e"
                className="!w-32" />
              <div className="flex gap-2 flex-wrap">
                {['#22C55E','#3B82F6','#EF4444','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'].map(c => (
                  <button key={c} onClick={() => setPrimary(c)}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: primary === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Btn onClick={submit} disabled={loading}>{loading ? 'Creating…' : 'Continue →'}</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Step 3: Upload ───────────────────────────────────────────────────────────

function UploadStep({ onAnalyse, onSkip }: {
  onAnalyse: (files: UploadedFile[]) => void;
  onSkip: () => void;
}) {
  const [files, setFiles]       = useState<UploadedFile[]>([]);
  const [converting, setConverting] = useState(false);
  const [over, setOver]         = useState(false);
  const ref                     = useRef<HTMLInputElement>(null);

  async function addFiles(fl: FileList | null) {
    if (!fl) return;
    setConverting(true);
    const added: UploadedFile[] = [];
    for (const f of Array.from(fl)) {
      added.push({ id: uid(), name: f.name, size: f.size, payload: await toPayload(f) });
    }
    setFiles(p => [...p, ...added]);
    setConverting(false);
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-white mb-1">Import your club data</h2>
      <p className="text-[#9ca3af] text-sm mb-6">
        Drop your roster, schedule, team lists — any format, any number of files. Claude reads them all at once.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => { e.preventDefault(); setOver(false); await addFiles(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all mb-4
          ${over ? 'border-[#22c55e] bg-[#22c55e08]' : 'border-[#2a2a2a] bg-[#0d0d0d] hover:border-[#22c55e44]'}`}
      >
        <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V8M12 8L9 11M12 8l3 3" stroke={over ? '#22c55e' : '#444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 18h16" stroke={over ? '#22c55e' : '#444'} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="text-center">
          <p className={`font-semibold transition-colors ${over ? 'text-[#22c55e]' : 'text-[#888]'}`}>
            Drop your files here
          </p>
          <p className="text-xs text-[#3a3a3a] mt-1">
            Roster spreadsheets · Season schedules · Team lists · Any format
          </p>
        </div>
        <div className="px-6 py-2.5 rounded-xl bg-[#22c55e] text-black text-sm font-bold">Browse files</div>
        <input ref={ref} type="file" multiple className="hidden"
          accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,image/*,text/csv,application/pdf"
          onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }} />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 bg-[#111] border border-[#222] rounded-lg px-3 py-2">
              <span className="text-sm">📄</span>
              <span className="text-white text-sm font-medium truncate max-w-[200px]">{f.name}</span>
              <span className="text-[#444] text-xs">·</span>
              <span className="text-[#555] text-xs">{(f.size / 1024).toFixed(0)}KB</span>
              <button onClick={(e) => { e.stopPropagation(); setFiles(p => p.filter(x => x.id !== f.id)); }}
                className="text-[#555] hover:text-red-400 transition-colors ml-1 text-xs">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Btn onClick={onSkip} variant="ghost">Nothing to upload — add manually</Btn>
        <Btn onClick={() => onAnalyse(files)} disabled={files.length === 0 || converting}>
          {converting
            ? 'Reading files…'
            : files.length > 0
              ? `Analyse ${files.length} file${files.length > 1 ? 's' : ''} with Claude →`
              : 'Analyse with Claude →'}
        </Btn>
      </div>
    </div>
  );
}

// ─── Processing — Flip scoreboard ────────────────────────────────────────────

type ProcessingCounts = { teams: number; players: number; events: number; coaches: number };

function ProcessingStep({ done, counts, onComplete }: {
  done: boolean;
  counts: ProcessingCounts | null;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'counting' | 'ready'>('loading');
  const [nums, setNums]   = useState<ProcessingCounts>({ teams: 0, players: 0, events: 0, coaches: 0 });
  const startedRef        = useRef(Date.now());
  const onCompleteRef     = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Rapid random flip while loading — classic departure-board effect
  useEffect(() => {
    if (phase !== 'loading') return;
    const id = setInterval(() => {
      setNums({
        teams:   Math.floor(Math.random() * 99),
        players: Math.floor(Math.random() * 999),
        events:  Math.floor(Math.random() * 999),
        coaches: Math.floor(Math.random() * 99),
      });
    }, 110);
    return () => clearInterval(id);
  }, [phase]);

  // When done + counts arrive: enforce min 2.5s of loading, then count up
  useEffect(() => {
    if (!done || !counts) return;
    const elapsed = Date.now() - startedRef.current;
    const wait    = Math.max(0, 2500 - elapsed);

    const timer = setTimeout(() => {
      setPhase('counting');
      const duration = 1200;
      const t0 = Date.now();

      const id = setInterval(() => {
        const p = Math.min((Date.now() - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
        setNums({
          teams:   Math.round(counts.teams   * e),
          players: Math.round(counts.players * e),
          events:  Math.round(counts.events  * e),
          coaches: Math.round(counts.coaches * e),
        });
        if (p >= 1) {
          clearInterval(id);
          setNums(counts);
          setPhase('ready');
          setTimeout(() => onCompleteRef.current(), 1200);
        }
      }, 16);
    }, wait);

    return () => clearTimeout(timer);
  }, [done, counts]);

  const ROWS: { label: string; key: keyof ProcessingCounts; pad: number }[] = [
    { label: 'Teams',   key: 'teams',   pad: 2 },
    { label: 'Players', key: 'players', pad: 3 },
    { label: 'Events',  key: 'events',  pad: 3 },
    { label: 'Coaches', key: 'coaches', pad: 2 },
  ];

  return (
    <div className="flex flex-col items-center gap-8 py-10">

      {/* Header */}
      <div className="text-center">
        <div className="text-4xl mb-3">⚽</div>
        <h2 className="text-xl font-extrabold text-white mb-1">
          {phase === 'ready' ? 'Club data ready' : 'Scanning your files'}
        </h2>
        <p className="text-sm text-[#555]">
          {phase === 'ready'
            ? 'Review everything before going live'
            : 'Claude is reading your roster, schedule and coaches'}
        </p>
      </div>

      {/* Scoreboard panel */}
      <div className="w-full max-w-md bg-[#080808] border border-[#1c1c1c] rounded-2xl overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center gap-2.5 px-5 py-3 bg-[#0d0d0d] border-b border-[#151515]">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 bg-[#22c55e] ${phase !== 'ready' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-bold text-[#333] uppercase tracking-[3px]">
            {phase === 'loading' ? 'Scanning · Live' : phase === 'counting' ? 'Counting · Live' : 'Full time · Complete'}
          </span>
          {phase === 'ready' && (
            <span className="ml-auto text-[10px] font-bold text-[#22c55e]">✓</span>
          )}
        </div>

        {/* Four digit counters */}
        <div className="grid grid-cols-4 divide-x divide-[#111]">
          {ROWS.map(({ label, key, pad }) => {
            const val    = nums[key];
            const digits = String(val).padStart(pad, '0').slice(-pad).split('');
            return (
              <div key={label} className="flex flex-col items-center py-7 gap-3">
                {/* Digit cards */}
                <div className="flex gap-1">
                  {digits.map((d, i) => (
                    <div key={i} className="relative w-8 h-11 bg-[#101010] border border-[#1e1e1e] rounded-md flex items-center justify-center overflow-hidden">
                      {/* Split-flap seam */}
                      <div className="absolute left-0 right-0 h-px bg-[#000] top-1/2" />
                      <span
                        className={`relative z-10 text-xl font-black tabular-nums leading-none select-none ${
                          phase === 'loading'  ? 'text-[#1e1e1e]'  :
                          phase === 'counting' ? 'text-[#22c55e]'  :
                                                'text-white'
                        }`}
                        style={{ fontFamily: 'ui-monospace, monospace' }}
                      >
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[2px] text-[#333]">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Status footer */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-[#111] min-h-[44px]">
          {phase !== 'ready' ? (
            <>
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#22c55e33] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[11px] text-[#2a2a2a]">
                {phase === 'loading' ? 'Claude is working…' : 'Tallying up…'}
              </span>
            </>
          ) : (
            <span className="text-[11px] font-bold text-[#22c55e]">
              Import complete — heading to review
            </span>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Review ───────────────────────────────────────────────────────────────────

const POSITIONS = ['', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF', 'Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
const AGE_GROUPS = ['', 'U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Adult'];

function ReviewStep({
  clubId, clubName, primaryColor,
  teams, setTeams,
  players, setPlayers,
  events, setEvents,
  coaches, setCoaches,
  onConfirm,
}: {
  clubId: string; clubName: string; primaryColor: string;
  teams: TRow[];   setTeams:   React.Dispatch<React.SetStateAction<TRow[]>>;
  players: PRow[]; setPlayers: React.Dispatch<React.SetStateAction<PRow[]>>;
  events: ERow[];  setEvents:  React.Dispatch<React.SetStateAction<ERow[]>>;
  coaches: CRow[]; setCoaches: React.Dispatch<React.SetStateAction<CRow[]>>;
  onConfirm: (invites: ParentInvite[], coachPayload: CoachPayload | null) => void;
}) {
  const [tOpen, setTOpen] = useState(true);
  const [pOpen, setPOpen] = useState(true);
  const [eOpen, setEOpen] = useState(true);
  const [cOpen, setCOpen] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError]     = useState('');
  const moreRef = useRef<HTMLInputElement>(null);

  type EventDefaults = { duration: number; arriveEarly: number; rsvpLockHours: number };
  const [bulk, setBulk] = useState<{ game: EventDefaults; training: EventDefaults }>({
    game:     { duration: 90, arriveEarly: 30, rsvpLockHours: 24 },
    training: { duration: 90, arriveEarly: 15, rsvpLockHours: 2  },
  });
  function updateBulk(type: 'game' | 'training', field: keyof EventDefaults, val: string | number) {
    setBulk(b => ({ ...b, [type]: { ...b[type], [field]: val } }));
  }

  const unassigned  = players.filter(p => !p.local_team_id).length;
  const teamOpts    = teams.filter(t => t.name.trim());

  function updateT(id: string, f: keyof TRow, v: string)  { setTeams(p   => p.map(r => r.id === id ? { ...r, [f]: v } : r)); }
  function updateP(id: string, f: keyof PRow, v: string)  { setPlayers(p => p.map(r => r.id === id ? { ...r, [f]: v } : r)); }
  function updateE(id: string, f: keyof ERow, v: string)  { setEvents(p  => p.map(r => r.id === id ? { ...r, [f]: v } : r)); }
  function updateVenue(id: string, venue: 'home' | 'away') {
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const stripped = e.title.replace(/^(vs |@ )/i, '').trim();
      const newTitle = stripped ? `${venue === 'away' ? '@' : 'vs'} ${stripped}` : e.title;
      return { ...e, home_away: venue, title: newTitle };
    }));
  }
  function updateC(id: string, f: keyof CRow, v: string)  { setCoaches(p => p.map(r => r.id === id ? { ...r, [f]: v } : r)); }

  // ── Add more files (merge into existing data) ─────────────────────────────

  async function handleMoreFiles(fl: FileList | null) {
    if (!fl) return;
    setMerging(true);
    const payloads: { base64?: string; mimeType?: string; text?: string; name: string }[] = [];
    for (const f of Array.from(fl)) payloads.push(await toPayload(f));

    const res  = await fetch('/api/ai/parse-all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: payloads }),
    });
    const data = await res.json();

    // Compute merged teams first so player/event matching uses the full set
    const mergedTeams = [...teams];
    for (const t of (data.teams ?? [])) {
      if (!mergedTeams.some(x => x.name.toLowerCase().trim() === (t.name ?? '').toLowerCase().trim())) {
        mergedTeams.push({ id: uid(), name: t.name ?? '', age_group: t.age_group ?? '', gender: t.gender ?? '', conf: (t.confidence ?? 'high') as Conf });
      }
    }
    setTeams(mergedTeams);

    setPlayers(prev => {
      const existingNames = new Set(prev.map(p => p.full_name.toLowerCase().trim()));
      const newRows: PRow[] = (data.players ?? []).map((p: Record<string, string>) => ({
        id: uid(), full_name: p.full_name ?? '', jersey_number: p.jersey_number ?? '',
        position: p.position ?? '', parent_email: p.parent_email ?? '',
        local_team_id: matchTeamId(p.team_name, mergedTeams),
        conf: existingNames.has((p.full_name ?? '').toLowerCase().trim()) ? 'medium' : (p.confidence ?? 'high') as Conf,
      }));
      return [...prev, ...newRows];
    });

    setEvents(prev => [
      ...prev,
      ...(data.events ?? []).map((e: Record<string, string>) => ({
        id: uid(), title: e.title ?? '', type: e.type ?? 'training',
        home_away: e.home_away ?? '',
        event_date: e.event_date ?? '', event_time: e.event_time ?? '',
        location: e.location ?? '', address: e.address ?? '', lat: '', lng: '',
        uniform: e.uniform ?? '', duration_minutes: e.duration_minutes ?? '',
        arrival_buffer_minutes: e.arrival_buffer_minutes ?? '',
        field_notes: e.field_notes ?? '', field_type: e.field_type ?? '',
        notes: e.notes ?? '', coach_notes: e.coach_notes ?? '',
        local_team_id: matchTeamId(e.team_name, mergedTeams),
        conf: (e.confidence ?? 'high') as Conf,
      })),
    ]);

    setCoaches(prev => {
      const existingEmails = new Set(prev.map(c => c.email.toLowerCase().trim()));
      return [
        ...prev,
        ...(data.coaches ?? [])
          .filter((c: Record<string, string>) => c.email && !existingEmails.has(c.email.toLowerCase().trim()))
          .map((c: Record<string, string>) => ({ id: uid(), full_name: c.full_name ?? '', email: c.email ?? '', local_team_id: matchTeamId(c.team_name, mergedTeams) })),
      ];
    });

    setMerging(false);
  }

  // ── Confirm — write everything to DB ─────────────────────────────────────

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Teams
      const created: { localId: string; dbId: string }[] = [];
      for (const t of teams.filter(r => r.name.trim())) {
        const { data } = await supabase.from('teams')
          .insert({ club_id: clubId, name: t.name.trim(), age_group: t.age_group.trim() || null })
          .select('id').single();
        if (data) created.push({ localId: t.id, dbId: (data as { id: string }).id });
      }
      const dbId = (lid: string) => created.find(c => c.localId === lid)?.dbId;

      // 2. Players + invite records
      const invites: ParentInvite[] = [];
      for (const p of players.filter(r => r.full_name.trim())) {
        const tId = dbId(p.local_team_id);
        if (!tId) continue;
        const { data: pd } = await supabase.from('players')
          .insert({ team_id: tId, full_name: p.full_name.trim(), jersey_number: p.jersey_number ? parseInt(p.jersey_number) : null, position: p.position || null })
          .select('id').single();
        if (pd && p.parent_email.trim()) {
          const { data: inv } = await supabase.from('invites')
            .insert({ team_id: tId, player_id: (pd as { id: string }).id, email: p.parent_email.trim(), created_by: user?.id })
            .select('id').single();
          if (inv) invites.push({ inviteId: (inv as { id: string }).id, playerName: p.full_name.trim(), email: p.parent_email.trim() });
        }
      }

      // 3. Events — apply bulk defaults per event type
      const bulkFor = (type: string) =>
        type === 'game' ? bulk.game : type === 'training' ? bulk.training : null;

      const calcRsvpLock = (date: string, time: string, hours: number): string | null => {
        if (!date) return null;
        const dt = new Date(`${date}T${time || '12:00:00'}`);
        dt.setTime(dt.getTime() - hours * 60 * 60 * 1000);
        return dt.toISOString();
      };

      for (const e of events.filter(r => r.title.trim() && r.event_date)) {
        const tId = dbId(e.local_team_id);
        if (!tId) continue;
        const d = bulkFor(e.type);
        // Ensure game title has correct vs/@ prefix based on home_away
        let savedTitle = e.title.trim();
        if (e.type === 'game' && e.home_away) {
          const stripped = savedTitle.replace(/^(vs |@ )/i, '');
          savedTitle = `${e.home_away === 'away' ? '@' : 'vs'} ${stripped}`;
        }
        // Default uniform: training→training, game→home_away, other→null
        const savedUniform = e.uniform || (e.type === 'training' ? 'training' : e.type === 'game' ? e.home_away || null : null);
        await supabase.from('events').insert({
          team_id: tId, title: savedTitle, type: e.type,
          event_date: e.event_date, event_time: e.event_time || null,
          location: e.location || null,
          address: e.address || null,
          lat: e.lat ? parseFloat(e.lat) : null,
          lng: e.lng ? parseFloat(e.lng) : null,
          uniform: savedUniform || null,
          field_notes: e.field_notes || null,
          field_type: e.field_type || null,
          notes: e.notes || null,
          coach_notes: e.coach_notes || null,
          created_by: user?.id,
          duration_minutes:       d ? d.duration    : null,
          arrival_buffer_minutes: d ? d.arriveEarly : null,
          rsvp_lock_at:           d ? calcRsvpLock(e.event_date, e.event_time, d.rsvpLockHours) : null,
        });
      }

      // 4. Prepare coach payload — emails sent on Done screen, not here
      const validCoaches = coaches.filter(c => c.full_name.trim() && c.email.trim());
      const coachPayload: CoachPayload | null = validCoaches.length ? {
        club_id: clubId, clubName, clubColor: primaryColor,
        coaches: validCoaches.map(c => ({
          full_name: c.full_name.trim(),
          email:     c.email.trim(),
          team_id:   c.local_team_id ? (dbId(c.local_team_id) ?? null) : null,
          team_name: c.local_team_id ? (teams.find(t => t.id === c.local_team_id)?.name ?? '') : '',
        })),
      } : null;

      onConfirm(invites, coachPayload);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  // ── Section chrome ────────────────────────────────────────────────────────

  function SectionWrap({ label, count, warning, open, onToggle, children }: {
    label: string; count: number; warning?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
  }) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 cursor-pointer select-none" onClick={onToggle}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{label}</span>
            <span className="text-xs font-bold bg-[#22c55e20] text-[#22c55e] px-2 py-0.5 rounded-full">{count}</span>
            {warning && <span className="text-xs text-amber-400">{warning}</span>}
          </div>
          <span className="text-[#444] text-xs">{open ? '▲' : '▼'}</span>
        </div>
        {open && <div className="px-5 pb-5 border-t border-[#1a1a1a]">{children}</div>}
      </div>
    );
  }

  const colHdr = (cols: string[], template: string) => (
    <div className="grid text-[10px] font-bold text-[#444] uppercase tracking-wider mt-4 mb-2 px-1"
      style={{ gridTemplateColumns: template }}>
      {cols.map(h => <span key={h}>{h}</span>)}
    </div>
  );

  if (saving) return (
    <FlipBoard
      title="Setting up your club…"
      rows={[
        { label: 'Teams',   pad: 2 },
        { label: 'Players', pad: 3 },
        { label: 'Events',  pad: 3 },
        { label: 'Coaches', pad: 2 },
      ]}
    />
  );

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Review your club data</h2>
          <p className="text-[#9ca3af] text-sm mt-1">Everything Claude extracted — edit anything before confirming</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {merging && <span className="text-xs text-[#22c55e] animate-pulse">Merging…</span>}
          <button
            onClick={() => moreRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-bold text-[#22c55e] bg-[#22c55e12] border border-[#22c55e33] px-3 py-2 rounded-lg hover:bg-[#22c55e20] transition-all whitespace-nowrap"
          >
            + Upload more files
          </button>
          <input ref={moreRef} type="file" multiple className="hidden"
            accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,image/*,text/csv,application/pdf"
            onChange={(e) => { handleMoreFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {/* ── Schedule defaults ──────────────────────────────────────────── */}
      <div className="mb-5 p-4 rounded-xl border border-[#1e2a1e] bg-[#0a120a]">
        <p className="text-[11px] font-bold text-[#22c55e] uppercase tracking-widest mb-3">Schedule defaults — applied to all events on confirm</p>
        <div className="grid grid-cols-2 gap-3">
          {(['game', 'training'] as const).map(type => (
            <div key={type} className="bg-[#0d0d0d] border border-[#1a2a1a] rounded-xl p-4">
              <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-3">
                {type === 'game' ? '⚽ Games' : '🏃 Training'}
              </p>
              <div className="flex flex-col gap-2.5">

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#6b7280]">Duration</span>
                  <select value={bulk[type].duration} onChange={e => updateBulk(type, 'duration', Number(e.target.value))} style={{ ...SI, fontSize: 11, width: 'auto' }}>
                    {Array.from({ length: (120 - 30) / 5 + 1 }, (_, i) => 30 + i * 5).map(m => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#6b7280]">Arrive early</span>
                  <select value={bulk[type].arriveEarly} onChange={e => updateBulk(type, 'arriveEarly', Number(e.target.value))} style={{ ...SI, fontSize: 11, width: 'auto' }}>
                    {Array.from({ length: 60 / 5 + 1 }, (_, i) => i * 5).map(m => (
                      <option key={m} value={m}>{m === 0 ? 'On time' : `${m} min`}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#6b7280]">RSVP lock</span>
                  <select value={bulk[type].rsvpLockHours} onChange={e => updateBulk(type, 'rsvpLockHours', Number(e.target.value))} style={{ ...SI, fontSize: 11, width: 'auto' }}>
                    {[1,2,4,6,12,24,48].map(h => <option key={h} value={h}>{h}h before</option>)}
                  </select>
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">

        {/* Teams */}
        <SectionWrap label="Teams" count={teamOpts.length} open={tOpen} onToggle={() => setTOpen(o => !o)}>
          {colHdr(['Team name','Age group','Gender',''], '1fr 120px 100px 32px')}
          <div className="flex flex-col gap-1.5">
            {teams.map(t => (
              <div key={t.id} className={`grid gap-2 items-center p-1.5 rounded-lg border ${
                t.conf === 'low' ? 'border-red-900/60 bg-red-950/20' : t.conf === 'medium' ? 'border-amber-900/60 bg-amber-950/20' : 'border-[#1e1e1e]'
              }`} style={{ gridTemplateColumns: '1fr 120px 100px 32px' }}>
                <div className="flex items-center gap-2">
                  <input value={t.name} onChange={e => updateT(t.id, 'name', e.target.value)} placeholder="Team name" style={SI} />
                  <ConfBadge conf={t.conf} />
                </div>
                <select value={t.age_group} onChange={e => updateT(t.id, 'age_group', e.target.value)} style={SI}>
                  {AGE_GROUPS.map(a => <option key={a} value={a}>{a || '—'}</option>)}
                </select>
                <select value={t.gender} onChange={e => updateT(t.id, 'gender', e.target.value)} style={SI}>
                  <option value="">—</option><option>Boys</option><option>Girls</option><option>Mixed</option>
                </select>
                <button onClick={() => setTeams(p => p.filter(x => x.id !== t.id))}
                  className="text-[#333] hover:text-red-400 transition-colors text-sm text-center">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setTeams(p => [...p, { id: uid(), name: '', age_group: '', gender: '', conf: 'high' }])}
            className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
            + Add team
          </button>
        </SectionWrap>

        {/* Players */}
        <SectionWrap label="Players" count={players.filter(p => p.full_name.trim()).length}
          warning={unassigned > 0 ? `${unassigned} unassigned` : undefined}
          open={pOpen} onToggle={() => setPOpen(o => !o)}>
          {unassigned > 0 && teamOpts.length > 0 && (
            <div className="mt-4 mb-3 flex items-center gap-3 p-3 rounded-xl bg-amber-950/30 border border-amber-900/40">
              <span className="text-amber-400 text-xs font-bold flex-shrink-0">{unassigned} unassigned</span>
              <select onChange={e => {
                if (!e.target.value) return;
                const v = e.target.value;
                setPlayers(p => p.map(r => !r.local_team_id ? { ...r, local_team_id: v } : r));
                e.target.value = '';
              }} style={{ ...SI, width: 'auto', flex: 1 }}>
                <option value="">Bulk assign all to…</option>
                {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="overflow-x-auto">
            {colHdr(['#','Name','','Position','Parent email','Team',''], '48px 1fr 72px 120px 1fr 150px 32px')}
            <div className="flex flex-col gap-1.5 min-w-[620px]">
              {players.map(p => (
                <div key={p.id} className={`grid gap-1.5 items-center p-1.5 rounded-lg border ${
                  p.conf === 'low' ? 'border-red-900/60 bg-red-950/20' : p.conf === 'medium' ? 'border-amber-900/60 bg-amber-950/20' : 'border-[#1e1e1e]'
                }`} style={{ gridTemplateColumns: '48px 1fr 72px 120px 1fr 150px 32px' }}>
                  <input value={p.jersey_number} onChange={e => updateP(p.id, 'jersey_number', e.target.value)} placeholder="#" style={{ ...SI, textAlign: 'center' }} />
                  <input value={p.full_name}     onChange={e => updateP(p.id, 'full_name', e.target.value)}     placeholder="Full name" style={SI} />
                  <div className="flex justify-center items-center"><ConfBadge conf={p.conf} /></div>
                  <select value={p.position} onChange={e => updateP(p.id, 'position', e.target.value)} style={SI}>
                    {POSITIONS.map(pos => <option key={pos} value={pos}>{pos || '—'}</option>)}
                  </select>
                  <input value={p.parent_email} onChange={e => updateP(p.id, 'parent_email', e.target.value)} placeholder="Parent email" type="email" style={SI} />
                  <select value={p.local_team_id} onChange={e => updateP(p.id, 'local_team_id', e.target.value)}
                    style={{ ...SI, color: p.local_team_id ? undefined : '#f59e0b' }}>
                    <option value="">Unassigned</option>
                    {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => setPlayers(p2 => p2.filter(x => x.id !== p.id))}
                    className="text-[#333] hover:text-red-400 transition-colors text-sm text-center">✕</button>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setPlayers(p => [...p, { id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '', local_team_id: teamOpts[0]?.id ?? '', conf: 'high' }])}
            className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
            + Add player
          </button>
        </SectionWrap>

        {/* Schedule */}
        {(() => {
          const noAddr = events.filter(e => e.title.trim() && !e.address).length;
          return (
            <SectionWrap label="Schedule" count={events.filter(e => e.title.trim()).length}
              warning={noAddr > 0 ? `${noAddr} missing venue address` : undefined}
              open={eOpen} onToggle={() => setEOpen(o => !o)}>

              {(() => {
                const noAddrInner = events.filter(e => e.title.trim() && !e.address).length;
                return noAddrInner > 0 ? (
                  <div className="mt-4 mb-3 flex items-start gap-3 p-3 rounded-xl bg-amber-950/30 border border-amber-900/40">
                    <span className="text-amber-400 text-xs">⚠</span>
                    <p className="text-amber-300 text-xs leading-relaxed">
                      <strong>{noAddrInner} event{noAddrInner !== 1 ? 's' : ''}</strong> have no street address — satellite maps won&apos;t load for those events. Add addresses below and Google will autocomplete.
                    </p>
                  </div>
                ) : null;
              })()}

              <div className="overflow-x-auto">
                {colHdr(['Date','Time','Title','Type','Address · Field · Surface · Kit · Notes','Team',''], '140px 100px 1fr 200px 1fr 140px 32px')}
                <div className="flex flex-col gap-3 min-w-[1000px]">
                  {events.map(e => (
                    <div key={e.id} className={`rounded-xl border overflow-hidden ${
                      e.conf === 'low' ? 'border-red-900/60' : e.conf === 'medium' ? 'border-amber-900/60' : !e.address ? 'border-amber-900/40' : 'border-[#1e1e1e]'
                    }`}>
                      <div className={`grid gap-2 items-center px-2 py-2.5 ${
                        e.conf === 'low' ? 'bg-red-950/20' : e.conf === 'medium' ? 'bg-amber-950/20' : !e.address ? 'bg-amber-950/10' : ''
                      }`} style={{ gridTemplateColumns: '140px 100px 1fr 200px 1fr 140px 32px' }}>
                        <input type="date" value={e.event_date} onChange={ev => updateE(e.id, 'event_date', ev.target.value)} style={SI} />
                        <input type="time" value={e.event_time} onChange={ev => updateE(e.id, 'event_time', ev.target.value)} style={SI} />
                        <div className="flex items-center gap-1">
                          <input value={e.title} onChange={ev => updateE(e.id, 'title', ev.target.value)} placeholder="Title" style={SI} />
                          <ConfBadge conf={e.conf} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                          <select value={e.type} onChange={ev => {
                            const t = ev.target.value;
                            setEvents(prev => prev.map(r => r.id !== e.id ? r : {
                              ...r, type: t,
                              uniform: t === 'training' ? 'training' : (r.uniform === 'training' ? '' : r.uniform),
                              home_away: t === 'game' ? r.home_away : '',
                            }));
                          }} style={{ ...SI, flexShrink: 0 }}>
                            <option value="game">Game</option>
                            <option value="training">Training</option>
                            <option value="other">Other</option>
                          </select>
                          {e.type === 'game' && (
                            <div style={{ display: 'flex', gap: 3 }}>
                              {(['home', 'away'] as const).map(v => (
                                <button key={v} onClick={() => updateVenue(e.id, v)}
                                  style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: e.home_away === v ? 700 : 500, border: `1.5px solid ${e.home_away === v ? '#22c55e' : '#333'}`, background: e.home_away === v ? 'rgba(34,197,94,0.15)' : 'transparent', color: e.home_away === v ? '#22c55e' : '#777', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  {v === 'home' ? 'Home' : 'Away'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input value={e.location} onChange={ev => updateE(e.id, 'location', ev.target.value)} placeholder="Venue name" style={SI} />
                        <select value={e.local_team_id} onChange={ev => updateE(e.id, 'local_team_id', ev.target.value)} style={SI}>
                          <option value="">—</option>
                          {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button onClick={() => setEvents(p => p.filter(x => x.id !== e.id))}
                          className="text-[#333] hover:text-red-400 transition-colors text-sm text-center">✕</button>
                      </div>
                      {/* Row 2 — address + field details */}
                      <div className="grid gap-2 px-2 border-t border-[#1a1a1a]"
                        style={{ gridTemplateColumns: e.type === 'other' ? '2fr 1fr auto auto' : '2fr 1fr auto', paddingBottom: '8px', paddingTop: '8px' }}>
                        {/* Address with Places autocomplete */}
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${!e.address ? 'bg-amber-950/30' : 'bg-[#0d0d0d]'}`}>
                          {!e.address && <span className="text-amber-400 text-[10px] font-bold flex-shrink-0">⚠</span>}
                          <PlacesInput
                            value={e.address}
                            onChange={v => updateE(e.id, 'address', v)}
                            onSelect={({ address, lat, lng }) => {
                              setEvents(prev => prev.map(ev => ev.id === e.id
                                ? { ...ev, address, lat: String(lat), lng: String(lng) }
                                : ev));
                            }}
                            placeholder={e.address ? e.address : 'Street address for map…'}
                          />
                        </div>
                        {/* Field notes */}
                        <input
                          value={e.field_notes}
                          onChange={ev => updateE(e.id, 'field_notes', ev.target.value)}
                          placeholder="Field / pitch…"
                          style={{ ...SI, fontSize: 12 }}
                        />
                        {/* Surface pills */}
                        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                          {(['turf', 'grass'] as const).map(s => (
                            <button key={s} onClick={() => updateE(e.id, 'field_type', e.field_type === s ? '' : s)}
                              style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: e.field_type === s ? 700 : 500, border: `1.5px solid ${e.field_type === s ? '#22c55e' : '#333'}`, background: e.field_type === s ? 'rgba(34,197,94,0.15)' : 'transparent', color: e.field_type === s ? '#22c55e' : '#666', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {s === 'turf' ? 'Turf' : 'Grass'}
                            </button>
                          ))}
                        </div>
                        {/* Kit pills — only for "other" type; games use venue, training is always Tng */}
                        {e.type === 'other' && (
                          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                            {(['home', 'away', 'training'] as const).map(u => (
                              <button key={u} onClick={() => updateE(e.id, 'uniform', e.uniform === u ? '' : u)}
                                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: e.uniform === u ? 700 : 500, border: `1.5px solid ${e.uniform === u ? '#22c55e' : '#333'}`, background: e.uniform === u ? 'rgba(34,197,94,0.15)' : 'transparent', color: e.uniform === u ? '#22c55e' : '#666', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {u === 'home' ? 'Home' : u === 'away' ? 'Away' : 'Tng'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Row 3 — notes */}
                      <div className="grid gap-2 px-2 pb-2.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <input
                          value={e.notes}
                          onChange={ev => updateE(e.id, 'notes', ev.target.value)}
                          placeholder="Team message (visible to all)…"
                          style={{ ...SI, fontSize: 12 }}
                        />
                        <input
                          value={e.coach_notes}
                          onChange={ev => updateE(e.id, 'coach_notes', ev.target.value)}
                          placeholder="Coach notes (coach only)…"
                          style={{ ...SI, fontSize: 12 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setEvents(p => [...p, { id: uid(), title: '', type: 'training', home_away: '', event_date: '', event_time: '', location: '', address: '', lat: '', lng: '', uniform: '', duration_minutes: '', arrival_buffer_minutes: '', field_notes: '', field_type: '', notes: '', coach_notes: '', local_team_id: teamOpts[0]?.id ?? '', conf: 'high' }])}
                className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
                + Add event
              </button>
            </SectionWrap>
          );
        })()}

        {/* Coaches */}
        <SectionWrap label="Coaches" count={coaches.filter(c => c.full_name.trim()).length} open={cOpen} onToggle={() => setCOpen(o => !o)}>
          <p className="text-[#555] text-xs mt-4 mb-3">
            We&apos;ll email coaches with sign-up instructions so they can access their team.
          </p>
          {colHdr(['Name','Email','Team',''], '1fr 1fr 160px 32px')}
          <div className="flex flex-col gap-1.5">
            {coaches.map(c => (
              <div key={c.id} className="grid gap-1.5 items-center p-1.5 rounded-lg border border-[#1e1e1e]"
                style={{ gridTemplateColumns: '1fr 1fr 160px 32px' }}>
                <input value={c.full_name} onChange={e => updateC(c.id, 'full_name', e.target.value)} placeholder="Full name" style={SI} />
                <input value={c.email}     onChange={e => updateC(c.id, 'email', e.target.value)}     placeholder="Email" type="email" style={SI} />
                <select value={c.local_team_id} onChange={e => updateC(c.id, 'local_team_id', e.target.value)} style={SI}>
                  <option value="">All teams</option>
                  {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={() => setCoaches(p => p.filter(x => x.id !== c.id))}
                  className="text-[#333] hover:text-red-400 transition-colors text-sm text-center">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setCoaches(p => [...p, { id: uid(), full_name: '', email: '', local_team_id: '' }])}
            className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
            + Add coach
          </button>
        </SectionWrap>

      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      {unassigned > 0 && (
        <p className="text-amber-400 text-xs mt-3">
          ⚠ {unassigned} players have no team assigned and will be skipped. Assign them above or remove them.
        </p>
      )}

      <div className="mt-6">
        <Btn onClick={confirm} disabled={saving}>
          {saving ? 'Setting up your club…' : 'Confirm & go live →'}
        </Btn>
      </div>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({ clubName, slug, parentInvites, coachPayload }: {
  clubName: string; slug: string; parentInvites: ParentInvite[]; coachPayload: CoachPayload | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(parentInvites.map(i => i.inviteId)));
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);

  const coachCount = coachPayload?.coaches.length ?? 0;

  async function sendInvites() {
    setSending(true);
    for (const inv of parentInvites.filter(i => selected.has(i.inviteId))) {
      await fetch('/api/send-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inv.inviteId, player_name: inv.playerName }),
      });
    }
    if (coachPayload && coachCount > 0) {
      await fetch('/api/invite-coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coachPayload),
      });
    }
    setSending(false);
    setSent(true);
  }

  function toggleAll() {
    if (selected.size === parentInvites.length) setSelected(new Set());
    else setSelected(new Set(parentInvites.map(i => i.inviteId)));
  }

  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-3xl bg-[#22c55e1a] border border-[#22c55e33] flex items-center justify-center text-4xl mx-auto mb-6">🎉</div>
      <h2 className="text-2xl font-extrabold text-white mb-2">{clubName} is live!</h2>
      <p className="text-[#9ca3af] mb-8">Your teams, roster, and schedule are all set up. Download the app to manage everything.</p>

      {parentInvites.length > 0 && !sent && (
        <div className="bg-[#111] border border-[#222] rounded-2xl p-6 mb-6 text-left">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-white">Send parent invites</p>
            <button onClick={toggleAll} className="text-xs text-[#555] hover:text-[#22c55e] transition-colors">
              {selected.size === parentInvites.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <p className="text-xs text-[#6b7280] mb-4">
            Parents get an email with a link to download the app and join their child&apos;s team.
          </p>
          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto mb-4">
            {parentInvites.map(inv => (
              <div key={inv.inviteId}
                onClick={() => setSelected(prev => { const n = new Set(prev); n.has(inv.inviteId) ? n.delete(inv.inviteId) : n.add(inv.inviteId); return n; })}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                  selected.has(inv.inviteId) ? 'border-[#22c55e33] bg-[#22c55e08]' : 'border-[#222]'
                }`}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                  selected.has(inv.inviteId) ? 'bg-[#22c55e] border-[#22c55e]' : 'border-[#444]'
                }`}>
                  {selected.has(inv.inviteId) && <span className="text-black text-[9px] font-black">✓</span>}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white leading-none">{inv.playerName}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">{inv.email}</p>
                </div>
              </div>
            ))}
          </div>
          {coachCount > 0 && (
            <p className="text-xs text-[#6b7280] mb-3">
              + {coachCount} coach invite{coachCount !== 1 ? 's' : ''} ({coachPayload!.coaches.map(c => c.full_name).join(', ')})
            </p>
          )}
          <div className="flex gap-3">
            <Btn onClick={() => setSent(true)} variant="ghost">Skip for now</Btn>
            <Btn onClick={sendInvites} disabled={sending || (selected.size === 0 && coachCount === 0)}>
              {sending ? 'Sending…' : `Send ${selected.size + coachCount} invite${selected.size + coachCount !== 1 ? 's' : ''} →`}
            </Btn>
          </div>
          <p className="text-[11px] text-[#444] mt-2">You can send or resend invites anytime from the dashboard → Staff &amp; Roster.</p>
        </div>
      )}

      {sent && (parentInvites.length > 0 || coachCount > 0) && (
        <div className="bg-[#22c55e12] border border-[#22c55e33] rounded-xl px-4 py-3 mb-6 text-left">
          <p className="text-[#22c55e] text-sm font-bold">✓ Invites sent</p>
          <p className="text-[#22c55e99] text-xs mt-0.5">Resend anytime from dashboard → Staff &amp; Roster.</p>
        </div>
      )}

      <div className="bg-[#111] border border-[#222] rounded-2xl p-6 flex flex-col gap-4">
        <a href="https://apps.apple.com/app/pulse-fc"
          className="flex items-center justify-center gap-3 py-4 rounded-xl bg-[#22c55e] text-black font-bold text-base hover:bg-[#16a34a] transition-all">
          <span className="text-xl">📱</span>
          Download Pulse FC on the App Store
        </a>
        <a href="/dashboard"
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[#333] text-[#9ca3af] text-sm font-semibold hover:border-[#444] hover:text-white transition-all">
          Go to dashboard →
        </a>
        <div className="py-2 px-4 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a] text-left">
          <p className="text-xs text-[#555] mb-0.5">Your club URL</p>
          <p className="text-sm font-mono text-[#22c55e]">pulse-fc.app/{slug}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const BACK_TARGET: Partial<Record<Step, Step>> = {
  club:       'auth',
  upload:     'club',
  processing: 'upload',
  review:     'upload',
};

export default function OnboardingPage() {
  const [step, setStep]             = useState<Step>('auth');
  const [clubId, setClubId]         = useState('');
  const [clubName, setClubName]     = useState('');
  const [clubSlug, setClubSlug]     = useState('');
  const [primaryColor, setPrimaryColor] = useState('#22c55e');

  const [teams,   setTeams]   = useState<TRow[]>([]);
  const [players, setPlayers] = useState<PRow[]>([]);
  const [events,  setEvents]  = useState<ERow[]>([]);
  const [coaches, setCoaches] = useState<CRow[]>([]);
  const [parentInvites, setParentInvites] = useState<ParentInvite[]>([]);
  const [pendingCoachPayload, setPendingCoachPayload] = useState<CoachPayload | null>(null);

  const abortRef        = useRef<AbortController | null>(null);
  const [processingDone, setProcessingDone]     = useState(false);
  const [processingCounts, setProcessingCounts] = useState<ProcessingCounts | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setStep('club');
    });
  }, []);

  function goBack() {
    const target = BACK_TARGET[step];
    if (!target) return;
    if (step === 'processing') {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    setStep(target);
  }

  function populateFromAI(data: Record<string, unknown[]>) {
    const teamRows: TRow[] = ((data.teams ?? []) as Record<string, string>[]).map(t => ({
      id: uid(), name: t.name ?? '', age_group: t.age_group ?? '', gender: t.gender ?? '', conf: (t.confidence ?? 'high') as Conf,
    }));
    setTeams(teamRows);
    setPlayers(((data.players ?? []) as Record<string, string>[]).map(p => ({
      id: uid(), full_name: p.full_name ?? '', jersey_number: p.jersey_number ?? '',
      position: p.position ?? '', parent_email: p.parent_email ?? '',
      local_team_id: matchTeamId(p.team_name, teamRows), conf: (p.confidence ?? 'high') as Conf,
    })));
    setEvents(((data.events ?? []) as Record<string, string>[]).map(e => ({
      id: uid(), title: e.title ?? '', type: e.type ?? 'training',
      home_away: e.home_away ?? '',
      event_date: e.event_date ?? '', event_time: e.event_time ?? '',
      location: e.location ?? '', address: e.address ?? '', lat: '', lng: '',
      uniform: e.uniform ?? '', duration_minutes: e.duration_minutes ?? '',
      arrival_buffer_minutes: e.arrival_buffer_minutes ?? '',
      field_notes: e.field_notes ?? '', field_type: e.field_type ?? '',
      notes: e.notes ?? '', coach_notes: e.coach_notes ?? '',
      local_team_id: matchTeamId(e.team_name, teamRows), conf: (e.confidence ?? 'high') as Conf,
    })));
    setCoaches(((data.coaches ?? []) as Record<string, string>[]).map(c => ({
      id: uid(), full_name: c.full_name ?? '', email: c.email ?? '', local_team_id: matchTeamId(c.team_name, teamRows),
    })));
  }

  async function handleAnalyse(uploadedFiles: UploadedFile[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessingDone(false);
    setProcessingCounts(null);
    setStep('processing');
    try {
      const res  = await fetch('/api/ai/parse-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles.map(f => f.payload) }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('parse-all error:', data);
        setTeams([{ id: uid(), name: '', age_group: '', gender: '', conf: 'high' }]);
        setPlayers([]); setEvents([]); setCoaches([]);
        setProcessingCounts({ teams: 0, players: 0, events: 0, coaches: 0 });
      } else {
        populateFromAI(data);
        const d = data as Record<string, unknown[]>;
        setProcessingCounts({
          teams:   Array.isArray(d.teams)   ? d.teams.length   : 0,
          players: Array.isArray(d.players) ? d.players.length : 0,
          events:  Array.isArray(d.events)  ? d.events.length  : 0,
          coaches: Array.isArray(d.coaches) ? d.coaches.length : 0,
        });
      }
      setProcessingDone(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('parse-all fetch failed:', err);
      setTeams([{ id: uid(), name: '', age_group: '', gender: '', conf: 'high' }]);
      setPlayers([]); setEvents([]); setCoaches([]);
      setProcessingCounts({ teams: 0, players: 0, events: 0, coaches: 0 });
      setProcessingDone(true);
    } finally {
      abortRef.current = null;
    }
  }

  function skipUpload() {
    setTeams([{ id: uid(), name: '', age_group: '', gender: '', conf: 'high' }]);
    setPlayers([]); setEvents([]); setCoaches([]);
    setStep('review');
  }

  const isReview  = step === 'review';
  const canGoBack = !!BACK_TARGET[step];

  return (
    <div className="min-h-screen bg-[#0a0a0a] py-12 px-4">
      <div className={`mx-auto transition-all duration-300 ${isReview ? 'max-w-6xl' : 'max-w-lg'}`}>

        {step !== 'auth' && step !== 'done' && (
          <div className="mb-10">
            {canGoBack && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#555] hover:text-white transition-colors mb-4"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
            )}
            <StepBar current={step} />
          </div>
        )}

        {step === 'auth' && (
          <AuthStep onDone={() => setStep('club')} />
        )}
        {step === 'club' && (
          <ClubStep onDone={(d) => {
            setClubId(d.id); setClubName(d.name); setClubSlug(d.slug); setPrimaryColor(d.primaryColor);
            setStep('upload');
          }} />
        )}
        {step === 'upload' && (
          <UploadStep onAnalyse={handleAnalyse} onSkip={skipUpload} />
        )}
        {step === 'processing' && (
          <ProcessingStep done={processingDone} counts={processingCounts} onComplete={() => setStep('review')} />
        )}
        {step === 'review' && (
          <ReviewStep
            clubId={clubId} clubName={clubName} primaryColor={primaryColor}
            teams={teams}   setTeams={setTeams}
            players={players} setPlayers={setPlayers}
            events={events}  setEvents={setEvents}
            coaches={coaches} setCoaches={setCoaches}
            onConfirm={(invites, coachPayload) => { setParentInvites(invites); setPendingCoachPayload(coachPayload); setStep('done'); }}
          />
        )}
        {step === 'done' && (
          <DoneStep clubName={clubName} slug={clubSlug} parentInvites={parentInvites} coachPayload={pendingCoachPayload} />
        )}

      </div>
    </div>
  );
}
