'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { FlipBoard } from '@/components/FlipBoard';
import LogoCropModal from '@/components/LogoCropModal';
import { toParseAllPayload, streamParseAll } from '@/lib/parseAllClient';
import { sameCoachName } from '@/lib/nameMatch';
import { safeAccent, contrastText } from '@/lib/colorContrast';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'auth' | 'club' | 'upload' | 'processing' | 'review' | 'done';
type Conf = 'high' | 'medium' | 'low';

type TRow = { id: string; name: string; alt_names: string[]; age_group: string; gender: string; conf: Conf; reason: string };
type PRow = { id: string; full_name: string; jersey_number: string; position: string; parent_email: string; local_team_id: string; conf: Conf; reason: string };
type ERow = { id: string; title: string; type: string; home_away: string; event_date: string; event_time: string; location: string; address: string; lat: string; lng: string; uniform: string; duration_minutes: string; arrival_buffer_minutes: string; field_notes: string; field_type: string; notes: string; coach_notes: string; local_team_id: string; conf: Conf; reason: string };
type CRow = { id: string; full_name: string; email: string; local_team_id: string };

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  payload: { base64?: string; mimeType?: string; text?: string; name: string };
};

type FileOutcome = { name: string; ok: boolean; error?: string };

// One entry per uploaded CSV/Excel file — lets the review screen offer
// "actually, parent email is this column" when the AI didn't find/use the
// right one. Not populated for PDF/image uploads (no reliable per-row
// correspondence to remap against there).
type RawTable = { fileName: string; headers: string[]; rows: Record<string, string>[] };

type ParentInvite = { inviteId: string; playerName: string; email: string };
type CoachPayload = { club_id: string; clubName: string; clubColor: string; coaches: { full_name: string; email: string; team_ids: string[] }[] };

type ClubResult = { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Error-message helpers ─────────────────────────────────────────────────
// Supabase Auth error strings are usually already short and parent/coach
// readable ("Invalid login credentials") — allowlist the common ones and
// fall back to something generic for anything else (provider internals,
// rate-limit text) instead of showing raw SDK output.
const FRIENDLY_AUTH_SNIPPETS = [
  'invalid login credentials',
  'already registered',
  'password should be at least',
  'email not confirmed',
  'unable to validate email address',
  'valid password',
  'rate limit',
];
function friendlyAuthError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  const lower = message.toLowerCase();
  return FRIENDLY_AUTH_SNIPPETS.some(s => lower.includes(s)) ? message : fallback;
}

// For our own /api/* JSON error responses: 401/403 means the session died
// mid-wizard (apiAuth.ts returns a bare "Unauthorized"/"Forbidden"); 5xx
// usually carries a raw Postgres/internal error. Anything else is a message
// the route wrote deliberately to be shown (e.g. "That URL slug is already
// taken.") so it's trusted as-is.
function friendlyApiError(status: number, rawMessage: string | undefined, fallback: string): string {
  if (status === 401 || status === 403) return 'Your session expired — refresh and log in again.';
  if (status >= 500) return fallback;
  return rawMessage ?? fallback;
}

// Garbage/negative jersey numbers are never valid — fall back to null
// instead of letting NaN silently serialize as null with no distinction
// from "left blank", or letting a negative number reach the insert as-is.
function parseJersey(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Some teams have two names in play (e.g. a league's own schedule-export
// name vs. the club's preferred display name) — a row's team_name might be
// either one, so match against a team's primary name AND its alt_names.
function teamNames(t: TRow): string[] { return [t.name, ...(t.alt_names ?? [])].filter(Boolean); }

function matchTeamId(name: string | null | undefined, rows: TRow[]): string {
  if (!name) return '';
  const n = name.toLowerCase().trim();
  return (
    rows.find(t => teamNames(t).some(x => x.toLowerCase().trim() === n))?.id ??
    rows.find(t => teamNames(t).some(x => x.toLowerCase().includes(n) || n.includes(x.toLowerCase())))?.id ??
    ''
  );
}

// Boys first (youngest to oldest), then Girls, then anything else — matches
// how clubs think about their team list, not alphabetical/upload order.
function genderRank(gender: string): number {
  const g = gender.trim().toLowerCase();
  if (g === 'boys') return 0;
  if (g === 'girls') return 1;
  if (g === 'mixed') return 2;
  return 3;
}
function ageRank(ageGroup: string): number {
  const m = ageGroup.match(/\d+/);
  return m ? parseInt(m[0], 10) : 999;
}
function compareTeams(a: TRow, b: TRow): number {
  const g = genderRank(a.gender) - genderRank(b.gender);
  if (g !== 0) return g;
  return ageRank(a.age_group) - ageRank(b.age_group);
}

// Chronological — blank/unparseable dates sink to the end instead of the
// top so a handful of "TBD" rows don't push the real schedule down.
function compareEvents(a: ERow, b: ERow): number {
  const ad = a.event_date || '9999-99-99';
  const bd = b.event_date || '9999-99-99';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.event_time || '99:99';
  const bt = b.event_time || '99:99';
  return at < bt ? -1 : at > bt ? 1 : 0;
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

function Btn({ children, onClick, disabled, variant = 'primary', type = 'button', accent }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  type?: 'button' | 'submit';
  accent?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={variant === 'primary' && accent ? { background: accent, color: contrastText(accent) } : undefined}
      className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-sm transition-all disabled:cursor-not-allowed
        ${variant === 'primary'
          ? accent ? 'disabled:opacity-40 hover:opacity-90' : 'bg-[#22c55e] text-black hover:bg-[#16a34a] disabled:opacity-40'
          : 'border border-[#333] text-[#9ca3af] hover:border-[#444] hover:text-white disabled:opacity-40'}`}
    >
      {children}
    </button>
  );
}

// Clicking the badge shows exactly what the AI wasn't sure about, instead
// of leaving the coach to guess why a row got flagged. Positioned via
// getBoundingClientRect + `fixed` so it always escapes ancestor
// `overflow-hidden` (team cards clip their contents for rounded corners).
function ConfBadge({ conf, reason }: { conf?: Conf; reason?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!conf || conf === 'high') return null;

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) });
    }
    setOpen(o => !o);
  };

  const color = conf === 'medium' ? 'amber' : 'red';
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 cursor-pointer transition-colors ${
          color === 'amber' ? 'bg-amber-900/40 text-amber-400 hover:bg-amber-900/60' : 'bg-red-900/40 text-red-400 hover:bg-red-900/60'
        }`}
      >
        {conf === 'medium' ? 'Review' : 'Check'}
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-72 rounded-xl border px-3.5 py-3 shadow-2xl"
            style={{ top: pos.top, left: pos.left, background: '#161616', borderColor: color === 'amber' ? '#78350f88' : '#7f1d1d88' }}
          >
            <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wide ${color === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
              {conf === 'medium' ? 'Worth reviewing' : 'Needs a closer look'}
            </p>
            <p className="text-[12px] leading-relaxed text-[#ccc]">
              {reason?.trim() || "The AI wasn't fully confident about this row — double-check the details before continuing."}
            </p>
          </div>
        </>
      )}
    </>
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
  // Supabase can require email confirmation before a session exists — in
  // that case signUp() returns a user but no session, so there's nothing
  // to advance into. Rather than proceed and hit RLS failures, park the
  // user here with instructions instead of leaving them stuck downstream.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email, password: pw });
        if (err || !data.user) { setError(friendlyAuthError(err?.message, 'Sign up failed. Please try again.')); return; }
        if (!data.session) {
          setAwaitingConfirmation(true);
          return;
        }
        const { error: profErr } = await supabase.from('profiles').upsert({ id: data.user.id, full_name: name, role: 'org_admin' });
        if (profErr) {
          console.error('profiles upsert failed:', profErr);
          setError('Something went wrong creating your account. Please try again.');
          return;
        }
        onDone(data.user);
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (err || !data.user) { setError(friendlyAuthError(err?.message, 'Login failed. Please try again.')); return; }
        onDone(data.user);
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
            <img src="/logo.png" alt="Pulse FC" width={48} height={48} style={{ height: '48px', width: 'auto' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Check your email</h1>
        </div>
        <Card>
          <p className="text-[#9ca3af] text-sm text-center">
            We sent a confirmation link to <span className="text-white font-semibold">{email}</span>. Click it, then come back here and log in to continue setting up your club.
          </p>
          <div className="mt-6">
            <Btn onClick={() => { setAwaitingConfirmation(false); setMode('login'); setError(''); }}>Back to log in</Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
          <img src="/logo.png" alt="Pulse FC" width={48} height={48} style={{ height: '48px', width: 'auto' }} />
          
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
  const [cropFile, setCropFile]   = useState<File | null>(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const eyedropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- keeps the editable slug field in sync with the club name until the admin types into it directly (slugEdited flips that off)
  useEffect(() => { if (!slugEdited) setSlug(slugify(name)); }, [name, slugEdited]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Logo must be under 3MB.'); return; }
    setError('');
    setCropFile(file);
  }

  function handleCropSave(blob: Blob, dataUrl: string) {
    setLogoFile(new File([blob], 'logo.png', { type: 'image/png' }));
    setLogoPreview(dataUrl);
    setCropFile(null);
  }

  async function pickColorFromScreen() {
    try {
      // @ts-expect-error — EyeDropper isn't in TS's lib.dom yet
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) setPrimary(result.sRGBHex);
    } catch {
      // user cancelled — no-op
    }
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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'create_club', name: name.trim(), slug: slug.trim(), primary_color: primary, user_id: session?.user?.id, logo_base64: logoBase64, logo_mime: logoMime, logo_name: logoName }),
      });
      const json = await res.json();
      if (!res.ok) { setError(friendlyApiError(res.status, json.error, 'Failed to create club. Please try again.')); setLoading(false); return; }
      onDone({ id: json.club.id, name: name.trim(), slug: slug.trim(), primaryColor: primary, logoUrl: logoPreview });
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please check your connection and try again.');
      setLoading(false);
    }
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
                  // eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up
                  ? <img src={logoPreview} alt="" className="w-full h-full object-contain" />
                  : <span className="text-base font-extrabold" style={{ color: primary }}>{initials}</span>}
              </div>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
            <div>
              <p className="text-white font-bold text-sm">{name || 'Your Club'}</p>
              <p className="text-[#555] text-xs mt-0.5">pulse-fc.app/{slug || 'your-club'}</p>
              <p className="text-[#22c55e] text-xs mt-1 font-medium">{logoPreview ? 'Click logo to reposition or replace' : 'Click logo to upload'}</p>
            </div>
            <div className="ml-auto">
              <div className="w-6 h-6 rounded-full border border-[#333]" style={{ background: primary }} />
            </div>
          </div>

          {cropFile && (
            <LogoCropModal file={cropFile} bgColor={`${primary}18`} onCancel={() => setCropFile(null)} onSave={handleCropSave} />
          )}

          <div>
            <Label>Club name <span className="text-red-400">*</span></Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MDS Academy" required />
          </div>

          <div>
            <Label>Club URL slug <span className="text-red-400">*</span></Label>
            <div className="flex items-center bg-[#111] border border-[#222] rounded-xl overflow-hidden focus-within:border-[#22c55e]">
              <span className="px-3 text-[#4b5563] text-sm whitespace-nowrap">pulse-fc.app/</span>
              <input value={slug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                className="border-0 rounded-none bg-transparent flex-1 !border-0 focus:!border-0" placeholder="mds-academy" required />
            </div>
          </div>

          <div>
            <Label>Primary colour</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="relative w-10 h-10 flex-shrink-0 rounded-lg border border-[#333] hover:border-[#555] transition-colors cursor-pointer group" title="Open colour picker">
                <div className="absolute inset-0 rounded-lg" style={{ background: primary }} />
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 group-hover:bg-black/20 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-0 group-hover:opacity-90 transition-opacity">
                    <path d="M12 22s7-6.5 7-12A7 7 0 1 0 5 10c0 5.5 7 12 7 12z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
                    <circle cx="12" cy="10" r="2.5" stroke="#fff" strokeWidth="2"/>
                  </svg>
                </div>
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </label>

              {eyedropperSupported && (
                <button type="button" onClick={pickColorFromScreen} title="Pick exact colour from anywhere on screen"
                  className="w-10 h-10 flex-shrink-0 rounded-lg border border-[#333] hover:border-[#22c55e] flex items-center justify-center transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M19.5 4.5a2.5 2.5 0 0 1 0 3.54l-1.6 1.6-3.54-3.54 1.6-1.6a2.5 2.5 0 0 1 3.54 0Z" stroke="#9ca3af" strokeWidth="1.6" strokeLinejoin="round"/>
                    <path d="M14.36 6.1 4 16.46 3 21l4.54-1L17.9 9.64" stroke="#9ca3af" strokeWidth="1.6" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}

              <input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#22c55e"
                className="!w-32" />
              <div className="flex gap-2 flex-wrap">
                {['#22C55E','#3B82F6','#EF4444','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'].map(c => (
                  <button key={c} onClick={() => setPrimary(c)}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: primary === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
                ))}
              </div>
            </div>
            {eyedropperSupported && (
              <p className="text-[#555] text-xs mt-2">Tip: use the eyedropper to pick a colour straight from your uploaded logo.</p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Btn onClick={submit} disabled={loading}>{loading ? 'Creating…' : 'Continue →'}</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Step 3: Upload ───────────────────────────────────────────────────────────

function UploadStep({ onAnalyse, onSkip, accent = '#22c55e' }: {
  onAnalyse: (files: UploadedFile[]) => void;
  onSkip: () => void;
  accent?: string;
}) {
  const [files, setFiles]       = useState<UploadedFile[]>([]);
  const [converting, setConverting] = useState(false);
  const [over, setOver]         = useState(false);
  const [fileError, setFileError] = useState('');
  const ref                     = useRef<HTMLInputElement>(null);

  async function addFiles(fl: FileList | null) {
    if (!fl) return;
    setConverting(true);
    setFileError('');
    const added: UploadedFile[] = [];
    const failed: string[] = [];
    for (const f of Array.from(fl)) {
      try {
        added.push({ id: uid(), name: f.name, size: f.size, payload: await toParseAllPayload(f) });
      } catch (err) {
        console.error('Failed to read file', f.name, err);
        failed.push(f.name);
      }
    }
    setFiles(p => [...p, ...added]);
    if (failed.length) {
      setFileError(`Couldn't read ${failed.length === 1 ? 'this file' : 'these files'}: ${failed.join(', ')}. Try a different file or format.`);
    }
    setConverting(false);
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold text-white mb-1">Import your club data</h2>
      <p className="text-[#9ca3af] text-sm mb-6">
        Drop your roster, schedule, team lists — any format, any number of files. Pulse FC reads them all at once.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => { e.preventDefault(); setOver(false); await addFiles(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
        style={{ borderColor: over ? accent : undefined }}
        className={`flex flex-col items-center justify-center gap-3 p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all mb-4
          ${over ? 'bg-[#22c55e08]' : 'border-[#2a2a2a] bg-[#0d0d0d] hover:border-[#22c55e44]'}`}
      >
        <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V8M12 8L9 11M12 8l3 3" stroke={over ? accent : '#444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 18h16" stroke={over ? accent : '#444'} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="font-semibold transition-colors" style={{ color: over ? accent : '#888' }}>
            Drop your files here
          </p>
          <p className="text-xs text-[#3a3a3a] mt-1">
            Roster spreadsheets · Season schedules · Team lists · Any format
          </p>
        </div>
        <div className="px-6 py-2.5 rounded-xl text-sm font-bold" style={{ background: accent, color: contrastText(accent) }}>Browse files</div>
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

      {fileError && <p className="text-red-400 text-sm mb-4">{fileError}</p>}

      <div className="flex gap-3">
        <Btn onClick={onSkip} variant="ghost">Nothing to upload — add manually</Btn>
        <Btn onClick={() => onAnalyse(files)} disabled={files.length === 0 || converting}>
          {converting
            ? 'Reading files…'
            : files.length > 0
              ? `Analyse ${files.length} file${files.length > 1 ? 's' : ''} with Pulse FC →`
              : 'Analyse with Pulse FC →'}
        </Btn>
      </div>
    </div>
  );
}

// ─── Processing — Flip scoreboard ────────────────────────────────────────────

type ProcessingCounts = { teams: number; players: number; events: number; coaches: number };

function ProcessingStep({ done, failed, counts, liveCounts, onComplete, accent = '#22c55e' }: {
  done: boolean;
  failed?: boolean;
  counts: ProcessingCounts | null;
  liveCounts: ProcessingCounts | null;
  onComplete: () => void;
  accent?: string;
}) {
  const [phase, setPhase] = useState<'loading' | 'counting' | 'ready'>('loading');
  const [nums, setNums]   = useState<ProcessingCounts>({ teams: 0, players: 0, events: 0, coaches: 0 });
  const onCompleteRef     = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // While loading, the digits are the real extraction counts as they
  // stream in (derived at render time — no need to copy into state) — the
  // number climbs as each file/chunk actually finishes, not a decorative
  // random-digit animation with no relationship to real progress.
  const displayNums = phase === 'loading'
    ? (liveCounts ?? { teams: 0, players: 0, events: 0, coaches: 0 })
    : nums;

  // Once done + final counts arrive, tween from the live count up to the
  // (possibly slightly different, e.g. after final team-alias
  // consolidation) final total — no artificial minimum wait now that the
  // numbers on screen are real throughout. Reacting to a server-data
  // signal by kicking off a local timed animation is exactly what this
  // effect is for; the phase/interval state it drives can't be computed
  // during render.
  useEffect(() => {
    if (!done || !counts) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('counting');
    const duration = 1200;
    const t0 = Date.now();
    // Tween from wherever the live count left off, not from zero.
    const startNums = liveCounts ?? { teams: 0, players: 0, events: 0, coaches: 0 };

    const id = setInterval(() => {
      const p = Math.min((Date.now() - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setNums({
        teams:   Math.round(startNums.teams   + (counts.teams   - startNums.teams)   * e),
        players: Math.round(startNums.players + (counts.players - startNums.players) * e),
        events:  Math.round(startNums.events  + (counts.events  - startNums.events)  * e),
        coaches: Math.round(startNums.coaches + (counts.coaches - startNums.coaches) * e),
      });
      if (p >= 1) {
        clearInterval(id);
        setNums(counts);
        setPhase('ready');
        setTimeout(() => onCompleteRef.current(), 1200);
      }
    }, 16);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, counts]);

  const ROWS: { label: string; key: keyof ProcessingCounts; pad: number }[] = [
    { label: 'Teams',   key: 'teams',   pad: 2 },
    { label: 'Players', key: 'players', pad: 3 },
    { label: 'Events',  key: 'events',  pad: 3 },
    { label: 'Coaches', key: 'coaches', pad: 2 },
  ];

  // The scoreboard panel is fixed near-black regardless of a club's brand
  // color — fall back to the default green if their color wouldn't read
  // against it (same reasoning as the dashboard sidebar).
  const safe = safeAccent(accent, '#080808');

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
            : 'Pulse FC is reading your roster, schedule and coaches'}
        </p>
      </div>

      {/* Scoreboard panel */}
      <div className="w-full max-w-md bg-[#080808] border border-[#1c1c1c] rounded-2xl overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center gap-2.5 px-5 py-3 bg-[#0d0d0d] border-b border-[#151515]">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${phase !== 'ready' ? 'animate-pulse' : ''}`} style={{ background: safe }} />
          <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-[3px]">
            {phase === 'loading' ? 'Scanning · Live' : phase === 'counting' ? 'Counting · Live' : 'Full time · Complete'}
          </span>
          {phase === 'ready' && (
            <span className="ml-auto text-[10px] font-bold" style={{ color: safe }}>✓</span>
          )}
        </div>

        {/* Four digit counters */}
        <div className="grid grid-cols-4 divide-x divide-[#111]">
          {ROWS.map(({ label, key, pad }) => {
            const val    = displayNums[key];
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
                        className="relative z-10 text-xl font-black tabular-nums leading-none select-none"
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          color: phase === 'loading' ? `${safe}99` : phase === 'counting' ? safe : '#fff',
                        }}
                      >
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[2px] text-[#6b7280]">{label}</span>
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
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: `${safe}55`, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[11px] text-[#6b7280]">
                {phase === 'loading' ? 'Pulse FC is working…' : 'Tallying up…'}
              </span>
            </>
          ) : (
            <span className="text-[11px] font-bold" style={{ color: failed ? '#f97316' : safe }}>
              {failed ? 'AI scouting failed — fill in details manually' : 'Import complete — heading to review'}
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
  fileOutcomes, setFileOutcomes,
  filePayloads, setFilePayloads,
  rawTables,
  saving, setSaving,
  onConfirm,
}: {
  clubId: string; clubName: string; primaryColor: string;
  teams: TRow[];   setTeams:   React.Dispatch<React.SetStateAction<TRow[]>>;
  players: PRow[]; setPlayers: React.Dispatch<React.SetStateAction<PRow[]>>;
  events: ERow[];  setEvents:  React.Dispatch<React.SetStateAction<ERow[]>>;
  coaches: CRow[]; setCoaches: React.Dispatch<React.SetStateAction<CRow[]>>;
  fileOutcomes: FileOutcome[]; setFileOutcomes: React.Dispatch<React.SetStateAction<FileOutcome[]>>;
  filePayloads: Record<string, UploadedFile['payload']>; setFilePayloads: React.Dispatch<React.SetStateAction<Record<string, UploadedFile['payload']>>>;
  rawTables: RawTable[];
  // Lifted to the parent so the wizard's outer Back button can hide itself
  // while a save is in flight instead of letting the coach navigate away
  // mid-write and get silently teleported to Done if it later succeeds.
  saving: boolean; setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  onConfirm: (invites: ParentInvite[], coachPayload: CoachPayload | null, skippedCoachNames: string[]) => void;
}) {
  // Ids whose open/closed state has been manually toggled away from the
  // default. Below 5 teams every card defaults open; at 5+ they default
  // closed so a big club's team list is scannable instead of a wall of
  // expanded rosters.
  const [teamOpenOverrides, setTeamOpenOverrides] = useState<Set<string>>(new Set());
  const [mergeFromId, setMergeFromId] = useState('');
  const [mergeToId, setMergeToId]     = useState('');
  const [unassignedOpen, setUnassignedOpen]   = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError]     = useState('');
  const moreRef = useRef<HTMLInputElement>(null);

  // Rows already written to the DB by a previous confirm() attempt — keyed
  // by local row id, surviving across retries (unlike a plain local variable
  // inside confirm()) so a retry after a partial failure only writes the
  // rows that actually failed, instead of re-inserting the whole club's
  // worth of data every time. Same "don't duplicate on retry" principle as
  // mergeParsedData's dedup for the AI-import path above.
  const savedTeamIds   = useRef<Map<string, string>>(new Map()); // local team id   -> db id
  const savedPlayerIds = useRef<Map<string, string>>(new Map()); // local player id -> db id
  const savedInviteIds = useRef<Map<string, string>>(new Map()); // local player id -> db invite id
  const savedEventIds  = useRef<Set<string>>(new Set());         // local event ids already saved

  type EventDefaults = { duration: number; arriveEarly: number; rsvpLockHours: number };
  const [bulk, setBulk] = useState<{ game: EventDefaults; training: EventDefaults }>({
    game:     { duration: 90, arriveEarly: 30, rsvpLockHours: 24 },
    training: { duration: 90, arriveEarly: 15, rsvpLockHours: 2  },
  });
  function updateBulk(type: 'game' | 'training', field: keyof EventDefaults, val: string | number) {
    setBulk(b => ({ ...b, [type]: { ...b[type], [field]: val } }));
  }

  const teamOpts  = teams.filter(t => t.name.trim()).sort(compareTeams);
  const teamIdSet = new Set(teamOpts.map(t => t.id));
  // Covers both blank local_team_id and a stale id left behind by a deleted
  // team — either way the row needs a human to re-point it somewhere.
  const isUnassigned = (localTeamId: string) => !teamIdSet.has(localTeamId);
  const unassigned = players.filter(p => isUnassigned(p.local_team_id)).length;

  function updateT(id: string, f: keyof TRow, v: string)  { setTeams(p   => p.map(r => r.id === id ? { ...r, [f]: v } : r)); }
  function updateP(id: string, f: keyof PRow, v: string)  { setPlayers(p => p.map(r => r.id === id ? { ...r, [f]: v } : r)); }

  // ── Manual column remapping (CSV/Excel imports only — see rawTables) ──
  // The AI/deterministic parser sometimes doesn't recognise a column (e.g.
  // "Email Primary" instead of "Parent Email"), leaving a field blank for
  // every row even though the source data is right there. Rather than
  // hand-typing each one, let the coach pick which raw column a field
  // should actually come from and bulk-apply it, matched by player name.
  function normName(s: string) { return s.trim().toLowerCase().replace(/\s+/g, ' '); }

  function findRawHeader(headers: string[], ...candidates: string[]): string | null {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const c of candidates) {
      const target = norm(c);
      const found = headers.find(h => norm(h) === target);
      if (found) return found;
    }
    return null;
  }

  function rawRowName(row: Record<string, string>, headers: string[]): string {
    const nameHeader = findRawHeader(headers, 'Full Name', 'Name', 'Player Name', 'Player');
    if (nameHeader) return (row[nameHeader] ?? '').trim();
    const first = findRawHeader(headers, 'First Name', 'First');
    const last  = findRawHeader(headers, 'Last Name', 'Last');
    if (first || last) return [first ? row[first] : '', last ? row[last] : ''].filter(Boolean).join(' ').trim();
    return '';
  }

  function applyColumnRemap(field: 'parent_email' | 'jersey_number' | 'position', table: RawTable, column: string) {
    const byName = new Map<string, string>();
    for (const row of table.rows) {
      const name = normName(rawRowName(row, table.headers));
      const val = (row[column] ?? '').trim();
      if (name && val) byName.set(name, val);
    }
    if (byName.size === 0) return;
    setPlayers(prev => prev.map(p => {
      const val = byName.get(normName(p.full_name));
      return val ? { ...p, [field]: val } : p;
    }));
  }
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

  // ── Team merge ──────────────────────────────────────────────────────────────

  const teamCardDefaultOpen = teamOpts.length <= 4;
  function isTeamOpen(id: string) {
    return teamOpenOverrides.has(id) ? !teamCardDefaultOpen : teamCardDefaultOpen;
  }
  function toggleTeamOpen(id: string) {
    setTeamOpenOverrides(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  // Re-points every player/event/coach on the merged-away team onto the
  // survivor, then drops the merged-away team row. The survivor keeps its
  // own name — rename it inline afterward if neither original name was right.
  function mergeTeams(intoId: string, fromIds: string[]) {
    const froms = fromIds.filter(id => id !== intoId);
    if (!froms.length) return;
    setPlayers(prev => prev.map(p => froms.includes(p.local_team_id) ? { ...p, local_team_id: intoId } : p));
    setEvents(prev  => prev.map(e => froms.includes(e.local_team_id) ? { ...e, local_team_id: intoId } : e));
    setCoaches(prev => prev.map(c => froms.includes(c.local_team_id) ? { ...c, local_team_id: intoId } : c));
    setTeams(prev => prev.filter(t => !froms.includes(t.id)));
  }

  // ── Add more files / retry a failed one (both merge into existing data) ───

  async function mergeParsedData(payloads: { base64?: string; mimeType?: string; text?: string; name: string }[]) {
    setMerging(true);
    const { data: { session: mfSession } } = await supabase.auth.getSession();
    const outcome = await streamParseAll(payloads, mfSession?.access_token, undefined);

    if (!outcome.ok) {
      setFileOutcomes(prev => {
        const retried = new Set(payloads.map(p => p.name));
        return [...prev.filter(f => !retried.has(f.name)), ...payloads.map(p => ({ name: p.name, ok: false, error: outcome.error || 'Import failed' }))];
      });
      setMerging(false);
      return;
    }
    const data = outcome.data;

    // Compute merged teams first so player/event matching uses the full set.
    // Match new teams against existing ones by name OR alt_name — never
    // overwrite an existing team's name (the coach may have already edited
    // it), just fold in any new alias so future matching still resolves.
    const mergedTeams = teams.map(t => ({ ...t, alt_names: [...(t.alt_names ?? [])] }));
    for (const t of (data.teams ?? []) as Record<string, unknown>[]) {
      const incomingName = typeof t.name === 'string' ? t.name : '';
      const incomingAlts = Array.isArray(t.alt_names) ? t.alt_names.filter((n): n is string => typeof n === 'string') : [];
      const incomingAll = [incomingName, ...incomingAlts].filter(Boolean);
      const existing = mergedTeams.find(x => teamNames(x).some(n =>
        incomingAll.some(inc => inc.toLowerCase().trim() === n.toLowerCase().trim())
      ));
      if (existing) {
        for (const alt of incomingAll) {
          if (!teamNames(existing).some(n => n.toLowerCase().trim() === alt.toLowerCase().trim())) existing.alt_names.push(alt);
        }
      } else {
        mergedTeams.push({
          id: uid(), name: incomingName, alt_names: incomingAlts,
          age_group: typeof t.age_group === 'string' ? t.age_group : '',
          gender: typeof t.gender === 'string' ? t.gender : '',
          conf: (typeof t.confidence === 'string' ? t.confidence : 'high') as Conf,
          reason: typeof t.reason === 'string' ? t.reason : '',
        });
      }
    }
    setTeams(mergedTeams);

    // A retry or an overlapping "+ Upload more files" run can hand back
    // data that's already in the review list (a retry that partially
    // succeeded before failing, or two files covering the same roster).
    // Skip exact repeats — same person/game on the same team — rather than
    // silently stacking duplicates the coach would have to spot by hand.
    setPlayers(prev => {
      const existingKeys = new Set(prev.map(p => `${p.local_team_id}|${p.full_name.toLowerCase().trim()}`));
      const newRows: PRow[] = [];
      for (const p of (data.players ?? []) as Record<string, string>[]) {
        const local_team_id = matchTeamId(p.team_name, mergedTeams);
        const key = `${local_team_id}|${(p.full_name ?? '').toLowerCase().trim()}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        newRows.push({
          id: uid(), full_name: p.full_name ?? '', jersey_number: p.jersey_number ?? '',
          position: p.position ?? '', parent_email: p.parent_email ?? '',
          local_team_id, conf: (p.confidence ?? 'high') as Conf,
          reason: p.reason ?? '',
        });
      }
      return [...prev, ...newRows];
    });

    setEvents(prev => {
      const existingKeys = new Set(prev.map(e => `${e.local_team_id}|${e.event_date}|${e.event_time}|${e.title.toLowerCase().trim()}`));
      const newRows: ERow[] = [];
      for (const e of (data.events ?? []) as Record<string, string>[]) {
        const local_team_id = matchTeamId(e.team_name, mergedTeams);
        const key = `${local_team_id}|${e.event_date ?? ''}|${e.event_time ?? ''}|${(e.title ?? '').toLowerCase().trim()}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        newRows.push({
          id: uid(), title: e.title ?? '', type: e.type ?? 'training',
          home_away: e.home_away ?? '',
          event_date: e.event_date ?? '', event_time: e.event_time ?? '',
          location: e.location ?? '', address: e.address ?? '', lat: '', lng: '',
          uniform: e.uniform ?? '', duration_minutes: e.duration_minutes ?? '',
          arrival_buffer_minutes: e.arrival_buffer_minutes ?? '',
          field_notes: e.field_notes ?? '', field_type: e.field_type ?? '',
          notes: e.notes ?? '', coach_notes: e.coach_notes ?? '',
          local_team_id, conf: (e.confidence ?? 'high') as Conf,
          reason: e.reason ?? '',
        });
      }
      return [...prev, ...newRows];
    });

    setCoaches(prev => {
      const existingEmails = new Set(prev.filter(c => c.email).map(c => c.email.toLowerCase().trim()));
      const noEmailRows = prev.filter(c => !c.email);
      const newRows: CRow[] = [];
      for (const c of (data.coaches ?? []) as Record<string, string>[]) {
        const local_team_id = matchTeamId(c.team_name, mergedTeams);
        const full_name = (c.full_name ?? '').trim();
        const email = (c.email ?? '').toLowerCase().trim();
        if (email) {
          if (existingEmails.has(email)) continue;
          existingEmails.add(email);
        } else {
          // Nickname-aware — a team-mapping doc's "Richard Breheny" and a
          // roster doc's "Head Coach: Rick Breheny" are the same person.
          const dup = noEmailRows.some(x => x.local_team_id === local_team_id && sameCoachName(x.full_name, full_name))
            || newRows.some(x => !x.email && x.local_team_id === local_team_id && sameCoachName(x.full_name, full_name));
          if (dup) continue;
        }
        newRows.push({ id: uid(), full_name, email: c.email ?? '', local_team_id });
      }
      return [...prev, ...newRows];
    });

    // Record the new files' payloads (so they're retryable too) and fold in
    // this response's per-file outcomes, replacing any prior outcome for the
    // same file (a retry supersedes the failure it was retrying).
    setFilePayloads(prev => ({ ...prev, ...Object.fromEntries(payloads.map(p => [p.name, p])) }));
    const incomingOutcomes = Array.isArray(data.fileOutcomes) ? data.fileOutcomes as FileOutcome[] : [];
    setFileOutcomes(prev => {
      const incomingNames = new Set(incomingOutcomes.map(f => f.name));
      return [...prev.filter(f => !incomingNames.has(f.name)), ...incomingOutcomes];
    });

    setMerging(false);
  }

  async function handleMoreFiles(fl: FileList | null) {
    if (!fl) return;
    const payloads: { base64?: string; mimeType?: string; text?: string; name: string }[] = [];
    for (const f of Array.from(fl)) payloads.push(await toParseAllPayload(f));
    await mergeParsedData(payloads);
  }

  const [retryingFile, setRetryingFile] = useState<string | null>(null);
  async function retryFile(name: string) {
    const payload = filePayloads[name];
    if (!payload) return;
    setRetryingFile(name);
    await mergeParsedData([payload]);
    setRetryingFile(null);
  }

  // ── Confirm — write everything to DB ─────────────────────────────────────

  async function confirm() {
    setError('');

    // A skipped/failed AI import (skipUpload, or handleAnalyse's failure
    // fallback) seeds one blank-name team, which teamOpts filters out —
    // without this guard, a rushed coach could click Confirm on an
    // apparently-normal Review screen and go live with zero real teams.
    if (!teamOpts.length) {
      setError('Add at least one team before going live.');
      return;
    }

    // Validate every non-empty parent/coach email before writing anything —
    // there's no <form onSubmit> here, so the browser's native type="email"
    // constraint never fires on these inputs, and garbage strings would
    // otherwise flow straight into invites.email and on to Resend.
    const badEmails: string[] = [];
    for (const p of players) {
      const email = p.parent_email.trim();
      if (email && !EMAIL_RE.test(email)) badEmails.push(`${p.full_name.trim() || 'Player'}: "${email}"`);
    }
    for (const c of coaches) {
      const email = c.email.trim();
      if (email && !EMAIL_RE.test(email)) badEmails.push(`${c.full_name.trim() || 'Coach'}: "${email}"`);
    }
    if (badEmails.length) {
      setError(`Fix these email addresses before continuing — ${badEmails.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Teams — skip any local row a previous confirm() attempt already saved.
      const created: { localId: string; dbId: string }[] = [];
      const failedTeams: string[] = [];
      for (const t of teams.filter(r => r.name.trim())) {
        const already = savedTeamIds.current.get(t.id);
        if (already) { created.push({ localId: t.id, dbId: already }); continue; }
        const { data, error: teamErr } = await supabase.from('teams')
          .insert({ club_id: clubId, name: t.name.trim(), age_group: t.age_group.trim() || null })
          .select('id').single();
        if (teamErr || !data) { failedTeams.push(t.name.trim()); continue; }
        const newDbId = (data as { id: string }).id;
        savedTeamIds.current.set(t.id, newDbId);
        created.push({ localId: t.id, dbId: newDbId });
      }
      const dbId = (lid: string) => created.find(c => c.localId === lid)?.dbId;

      // 2. Players + invite records — same skip-if-already-saved treatment,
      // tracked independently since a player can be saved while its invite
      // still fails (or vice versa on a retry after the player already exists).
      const invites: ParentInvite[] = [];
      const failedPlayers: string[] = [];
      const failedInvites: string[] = [];
      for (const p of players.filter(r => r.full_name.trim())) {
        const tId = dbId(p.local_team_id);
        // Unassigned (or pointing at a team that itself failed above) —
        // already surfaced via the "N players have no team assigned" banner,
        // not a DB failure in its own right.
        if (!tId) continue;

        let playerDbId = savedPlayerIds.current.get(p.id);
        if (!playerDbId) {
          const { data: pd, error: playerErr } = await supabase.from('players')
            .insert({ team_id: tId, full_name: p.full_name.trim(), jersey_number: parseJersey(p.jersey_number), position: p.position || null })
            .select('id').single();
          if (playerErr || !pd) { failedPlayers.push(p.full_name.trim()); continue; }
          playerDbId = (pd as { id: string }).id;
          savedPlayerIds.current.set(p.id, playerDbId);
        }

        if (p.parent_email.trim()) {
          let inviteDbId = savedInviteIds.current.get(p.id);
          if (!inviteDbId) {
            const { data: inv, error: inviteErr } = await supabase.from('invites')
              .insert({ team_id: tId, club_id: clubId, player_id: playerDbId, email: p.parent_email.trim(), created_by: user?.id })
              .select('id').single();
            if (inviteErr || !inv) { failedInvites.push(`${p.full_name.trim()} (${p.parent_email.trim()})`); continue; }
            inviteDbId = (inv as { id: string }).id;
            savedInviteIds.current.set(p.id, inviteDbId);
          }
          invites.push({ inviteId: inviteDbId, playerName: p.full_name.trim(), email: p.parent_email.trim() });
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

      const failedEvents: string[] = [];
      for (const e of events.filter(r => r.title.trim() && r.event_date)) {
        const tId = dbId(e.local_team_id);
        if (!tId) continue; // unassigned — same reasoning as players above
        if (savedEventIds.current.has(e.id)) continue; // already saved by a previous attempt
        const d = bulkFor(e.type);
        // Ensure game title has correct vs/@ prefix based on home_away
        let savedTitle = e.title.trim();
        if (e.type === 'game' && e.home_away) {
          const stripped = savedTitle.replace(/^(vs |@ )/i, '');
          savedTitle = `${e.home_away === 'away' ? '@' : 'vs'} ${stripped}`;
        }
        // Default uniform: training→training, game→home_away, other→null
        const savedUniform = e.uniform || (e.type === 'training' ? 'training' : e.type === 'game' ? e.home_away || null : null);
        const { error: eventErr } = await supabase.from('events').insert({
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
        if (eventErr) failedEvents.push(savedTitle);
        else savedEventIds.current.add(e.id);
      }

      // If anything failed to save, stop here and tell the coach exactly
      // what didn't make it in — instead of silently proceeding to "you're
      // live" as if the whole import succeeded.
      const failures: string[] = [];
      if (failedTeams.length)   failures.push(`${failedTeams.length} team${failedTeams.length !== 1 ? 's' : ''} (${failedTeams.join(', ')})`);
      if (failedPlayers.length) failures.push(`${failedPlayers.length} player${failedPlayers.length !== 1 ? 's' : ''} (${failedPlayers.join(', ')})`);
      if (failedInvites.length) failures.push(`${failedInvites.length} parent invite${failedInvites.length !== 1 ? 's' : ''} (${failedInvites.join(', ')})`);
      if (failedEvents.length)  failures.push(`${failedEvents.length} event${failedEvents.length !== 1 ? 's' : ''} (${failedEvents.join(', ')})`);
      if (failures.length) {
        setError(`Some of your club data couldn't be saved — please try again: ${failures.join('; ')}`);
        setSaving(false);
        return;
      }

      // 4. Prepare coach payload — emails sent on Done screen, not here.
      // A coach can't be invited without an email (Supabase Auth needs an
      // identifier to create the account), but that's still a real coach
      // the club needs to know is missing — surface it instead of just
      // dropping the row with no trace.
      const validCoaches = coaches.filter(c => c.full_name.trim() && c.email.trim());
      const skippedCoachNames = coaches.filter(c => c.full_name.trim() && !c.email.trim()).map(c => c.full_name.trim());
      const coachPayload: CoachPayload | null = validCoaches.length ? {
        club_id: clubId, clubName, clubColor: primaryColor,
        coaches: validCoaches.map(c => ({
          full_name: c.full_name.trim(),
          email:     c.email.trim(),
          team_ids:  c.local_team_id && dbId(c.local_team_id) ? [dbId(c.local_team_id)!] : [],
        })),
      } : null;

      onConfirm(invites, coachPayload, skippedCoachNames);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  // ── Section chrome ────────────────────────────────────────────────────────

  const colHdr = (cols: string[], template: string) => (
    <div className="grid text-[10px] font-bold text-[#444] uppercase tracking-wider mt-4 mb-2 px-1"
      style={{ gridTemplateColumns: template }}>
      {cols.map((h, i) => <span key={i}>{h}</span>)}
    </div>
  );

  // ── Row renderers — plain functions (not JSX components) called directly,
  // so re-grouping which array feeds them by team never remounts the inputs
  // underneath a coach's fingers mid-keystroke. ─────────────────────────────

  function renderCoachRow(c: CRow) {
    return (
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
    );
  }

  function renderPlayerRow(p: PRow) {
    return (
      <div key={p.id} className={`grid gap-1.5 items-center p-1.5 rounded-lg border ${
        p.conf === 'low' ? 'border-red-900/60 bg-red-950/20' : p.conf === 'medium' ? 'border-amber-900/60 bg-amber-950/20' : 'border-[#1e1e1e]'
      }`} style={{ gridTemplateColumns: '48px 1fr 72px 120px 1fr 150px 32px' }}>
        <input value={p.jersey_number} onChange={e => updateP(p.id, 'jersey_number', e.target.value)} placeholder="#" style={{ ...SI, textAlign: 'center' }} />
        <input value={p.full_name}     onChange={e => updateP(p.id, 'full_name', e.target.value)}     placeholder="Full name" style={SI} />
        <div className="flex justify-center items-center"><ConfBadge conf={p.conf} reason={p.reason} /></div>
        <select value={p.position} onChange={e => updateP(p.id, 'position', e.target.value)} style={SI}>
          {POSITIONS.map(pos => <option key={pos} value={pos}>{pos || '—'}</option>)}
        </select>
        <input value={p.parent_email} onChange={e => updateP(p.id, 'parent_email', e.target.value)} placeholder="Parent email" type="email" style={SI} />
        <select value={p.local_team_id} onChange={e => updateP(p.id, 'local_team_id', e.target.value)}
          style={{ ...SI, color: isUnassigned(p.local_team_id) ? '#f59e0b' : undefined }}>
          <option value="">Unassigned</option>
          {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button onClick={() => setPlayers(p2 => p2.filter(x => x.id !== p.id))}
          className="text-[#333] hover:text-red-400 transition-colors text-sm text-center">✕</button>
      </div>
    );
  }

  function renderEventRow(e: ERow) {
    return (
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
            <ConfBadge conf={e.conf} reason={e.reason} />
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
    );
  }

  // Compact source→destination picker so merging doesn't require scrolling
  // through and expanding team cards to find and select the right pair —
  // matters once a club has dozens of teams.
  function renderMergeTool() {
    if (teamOpts.length < 2) return null;
    return (
      <div className="rounded-2xl border border-[#222] bg-[#111] p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-[#999] flex-shrink-0">Merge duplicate teams</span>
        <select value={mergeFromId} onChange={e => setMergeFromId(e.target.value)} style={{ ...SI, width: 'auto', minWidth: 170 }}>
          <option value="">Choose a team…</option>
          {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-xs text-[#555] flex-shrink-0">into</span>
        <select value={mergeToId} onChange={e => setMergeToId(e.target.value)} style={{ ...SI, width: 'auto', minWidth: 170 }}>
          <option value="">Choose a team…</option>
          {teamOpts.filter(t => t.id !== mergeFromId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button
          disabled={!mergeFromId || !mergeToId}
          onClick={() => { mergeTeams(mergeToId, [mergeFromId]); setMergeFromId(''); setMergeToId(''); }}
          style={{ background: primaryColor, color: contrastText(primaryColor) }}
          className="text-xs font-bold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0">
          Merge →
        </button>
        <span className="text-[#555] text-[11px] w-full">Everyone and everything on the first team moves onto the second, and the first team is removed.</span>
      </div>
    );
  }

  // One card per team: its own coaches, roster, and events grouped together
  // so it's obvious which events belong to which team at a glance.
  function renderTeamCard(t: TRow) {
    const teamCoaches = coaches.filter(c => c.local_team_id === t.id);
    const teamPlayers = players.filter(p => p.local_team_id === t.id);
    const teamEvents  = events.filter(e => e.local_team_id === t.id).sort(compareEvents);
    const open = isTeamOpen(t.id);
    return (
      <div key={t.id} className="rounded-2xl border overflow-hidden bg-[#111] border-[#222]">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex-1 grid gap-2 items-center min-w-0" style={{ gridTemplateColumns: '1fr 110px 90px' }}>
            <div className="flex items-center gap-2 min-w-0">
              <input value={t.name} onChange={e => updateT(t.id, 'name', e.target.value)} placeholder="Team name" style={{ ...SI, fontWeight: 700 }} />
              <ConfBadge conf={t.conf} reason={t.reason} />
            </div>
            <select value={t.age_group} onChange={e => updateT(t.id, 'age_group', e.target.value)} style={SI}>
              {AGE_GROUPS.map(a => <option key={a} value={a}>{a || '—'}</option>)}
            </select>
            <select value={t.gender} onChange={e => updateT(t.id, 'gender', e.target.value)} style={SI}>
              <option value="">—</option><option>Boys</option><option>Girls</option><option>Mixed</option>
            </select>
          </div>
          <span className="hidden sm:inline text-[11px] text-[#666] whitespace-nowrap flex-shrink-0">
            {teamCoaches.length} coach{teamCoaches.length !== 1 ? 'es' : ''} · {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''} · {teamEvents.length} event{teamEvents.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => setTeams(p => p.filter(x => x.id !== t.id))}
            className="text-[#333] hover:text-red-400 transition-colors text-sm flex-shrink-0">✕</button>
          <button onClick={() => toggleTeamOpen(t.id)} className="text-[#444] text-xs flex-shrink-0 w-4 text-center">{open ? '▲' : '▼'}</button>
        </div>
        {t.alt_names.length > 0 && (
          <p className="px-5 -mt-2 pb-3 text-[11px] text-[#555]">
            Also known as {t.alt_names.join(', ')} — schedule/roster rows using either name will land here.
          </p>
        )}
        {open && (
          <div className="px-5 pb-5 border-t border-[#1a1a1a] flex flex-col gap-5">
            <div>
              <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mt-4 mb-2">Coaches</p>
              {teamCoaches.length > 0 && colHdr(['Name','Email','Team',''], '1fr 1fr 160px 32px')}
              <div className="flex flex-col gap-1.5">{teamCoaches.map(renderCoachRow)}</div>
              <button onClick={() => setCoaches(p => [...p, { id: uid(), full_name: '', email: '', local_team_id: t.id }])}
                className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
                + Add coach
              </button>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">Roster</p>
              <div className="overflow-x-auto">
                {teamPlayers.length > 0 && colHdr(['#','Name','','Position','Parent email','Team',''], '48px 1fr 72px 120px 1fr 150px 32px')}
                <div className="flex flex-col gap-1.5 min-w-[620px]">{teamPlayers.map(renderPlayerRow)}</div>
              </div>
              <button onClick={() => setPlayers(p => [...p, { id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '', local_team_id: t.id, conf: 'high', reason: '' }])}
                className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
                + Add player
              </button>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">Events</p>
              <div className="overflow-x-auto">
                {teamEvents.length > 0 && colHdr(['Date','Time','Title','Type','Address · Field · Surface · Kit · Notes','Team',''], '140px 100px 1fr 200px 1fr 140px 32px')}
                <div className="flex flex-col gap-3 min-w-[1000px]">{teamEvents.map(renderEventRow)}</div>
              </div>
              <button onClick={() => setEvents(p => [...p, { id: uid(), title: '', type: 'training', home_away: '', event_date: '', event_time: '', location: '', address: '', lat: '', lng: '', uniform: '', duration_minutes: '', arrival_buffer_minutes: '', field_notes: '', field_type: '', notes: '', coach_notes: '', local_team_id: t.id, conf: 'high', reason: '' }])}
                className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
                + Add event
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Coaches intentionally left on "All teams" (blank local_team_id) — a DOC
  // or director, not tied to one roster.
  function renderClubWideCoaches() {
    const clubWide = coaches.filter(c => c.local_team_id === '');
    return (
      <div className="rounded-2xl border border-[#222] bg-[#111] overflow-hidden">
        <div className="px-5 py-4">
          <p className="text-sm font-bold text-white">Club-wide staff</p>
          <p className="text-[#555] text-xs mt-1">Coaches and directors with access to every team.</p>
        </div>
        <div className="px-5 pb-5">
          {clubWide.length > 0 && colHdr(['Name','Email','Team',''], '1fr 1fr 160px 32px')}
          <div className="flex flex-col gap-1.5">{clubWide.map(renderCoachRow)}</div>
          <button onClick={() => setCoaches(p => [...p, { id: uid(), full_name: '', email: '', local_team_id: '' }])}
            className="mt-3 w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
            + Add club-wide staff
          </button>
        </div>
      </div>
    );
  }

  // Players/events with no team, or pointing at a team that got deleted —
  // needs a human decision, so it never just silently vanishes from view.
  function renderUnassignedCard() {
    const uPlayers = players.filter(p => isUnassigned(p.local_team_id));
    const uEvents  = events.filter(e => isUnassigned(e.local_team_id)).sort(compareEvents);
    const uCoaches = coaches.filter(c => c.local_team_id && isUnassigned(c.local_team_id));
    const total = uPlayers.length + uEvents.length + uCoaches.length;
    if (total === 0) return null;
    return (
      <div className="rounded-2xl border border-amber-900/40 bg-amber-950/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 cursor-pointer select-none" onClick={() => setUnassignedOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-amber-300">Unassigned</span>
            <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{total}</span>
          </div>
          <span className="text-[#444] text-xs">{unassignedOpen ? '▲' : '▼'}</span>
        </div>
        {unassignedOpen && (
          <div className="px-5 pb-5 border-t border-amber-900/30 flex flex-col gap-5">
            {teamOpts.length > 0 && (uPlayers.length > 0 || uEvents.length > 0) && (
              <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-amber-950/30 border border-amber-900/40">
                <span className="text-amber-400 text-xs font-bold flex-shrink-0">Bulk assign everything above to…</span>
                <select onChange={e => {
                  if (!e.target.value) return;
                  const v = e.target.value;
                  setPlayers(p => p.map(r => isUnassigned(r.local_team_id) ? { ...r, local_team_id: v } : r));
                  setEvents(p  => p.map(r => isUnassigned(r.local_team_id) ? { ...r, local_team_id: v } : r));
                  e.target.value = '';
                }} style={{ ...SI, width: 'auto', flex: 1 }}>
                  <option value="">Choose a team…</option>
                  {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {uCoaches.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mt-4 mb-2">Coaches</p>
                {colHdr(['Name','Email','Team',''], '1fr 1fr 160px 32px')}
                <div className="flex flex-col gap-1.5">{uCoaches.map(renderCoachRow)}</div>
              </div>
            )}
            {uPlayers.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">Players</p>
                <div className="overflow-x-auto">
                  {colHdr(['#','Name','','Position','Parent email','Team',''], '48px 1fr 72px 120px 1fr 150px 32px')}
                  <div className="flex flex-col gap-1.5 min-w-[620px]">{uPlayers.map(renderPlayerRow)}</div>
                </div>
              </div>
            )}
            {uEvents.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">Events</p>
                <div className="overflow-x-auto">
                  {colHdr(['Date','Time','Title','Type','Address · Field · Surface · Kit · Notes','Team',''], '140px 100px 1fr 200px 1fr 140px 32px')}
                  <div className="flex flex-col gap-3 min-w-[1000px]">{uEvents.map(renderEventRow)}</div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setPlayers(p => [...p, { id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '', local_team_id: '', conf: 'high', reason: '' }])}
                className="flex-1 py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
                + Add player
              </button>
              <button onClick={() => setEvents(p => [...p, { id: uid(), title: '', type: 'training', home_away: '', event_date: '', event_time: '', location: '', address: '', lat: '', lng: '', uniform: '', duration_minutes: '', arrival_buffer_minutes: '', field_notes: '', field_type: '', notes: '', coach_notes: '', local_team_id: '', conf: 'high', reason: '' }])}
                className="flex-1 py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
                + Add event
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (saving) return (
    <FlipBoard
      title="Setting up your club…"
      accentColor={primaryColor}
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
          <p className="text-[#9ca3af] text-sm mt-1">Everything Pulse FC found — edit anything before confirming</p>
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

      {/* ── What Pulse FC figured out — visible reasoning, not a black box ── */}
      {(() => {
        const importedFiles = fileOutcomes.filter(f => f.ok);
        const aliasedTeams = teams.filter(t => (t.alt_names ?? []).length > 0);
        const totalCount = teams.length + players.length + coaches.length + events.length;
        if (importedFiles.length === 0 && totalCount === 0) return null;
        return (
          <div className="mb-5 p-4 rounded-xl border border-[#1e2a1e] bg-[#0a120a] text-xs text-[#9ca3af] leading-relaxed">
            {importedFiles.length > 0 && (
              <p>
                Imported from {importedFiles.length} file{importedFiles.length !== 1 ? 's' : ''}: {importedFiles.map(f => f.name).join(', ')} —{' '}
                <span className="text-white font-semibold">{teams.length} teams</span>,{' '}
                <span className="text-white font-semibold">{players.length} players</span>,{' '}
                <span className="text-white font-semibold">{coaches.length} coaches</span>,{' '}
                <span className="text-white font-semibold">{events.length} events</span>.
              </p>
            )}
            {aliasedTeams.length > 0 && (
              <p className="mt-1.5">
                🔗 Matched <span className="text-white font-semibold">{aliasedTeams.length} team{aliasedTeams.length !== 1 ? 's' : ''}</span> that
                went by two different names across your documents — look for &quot;Also known as&quot; on the team cards below.
              </p>
            )}
            <p className="mt-1.5 text-[#666]">
              Only your own teams get tracked as teams — opponents mentioned in a schedule become the other side of an event, not a new team.
            </p>
          </div>
        );
      })()}

      {/* ── Manual column remapping — only when a CSV/Excel raw table is
          available (PDFs/photos have no reliable row-by-row correspondence
          to remap against) ── */}
      {rawTables.length > 0 && players.length > 0 && (
        <div className="mb-5 p-4 rounded-xl border border-[#2a2410] bg-[#120f08]">
          <p className="text-[11px] font-bold text-[#eab308] uppercase tracking-widest mb-1">Didn&apos;t match a column right?</p>
          <p className="text-xs text-[#9ca3af] mb-3">
            Pick which column from your file a field should actually come from — applied to every player matched by name.
          </p>
          <div className="flex flex-col gap-2.5">
            {([
              { key: 'parent_email' as const, label: 'Parent email' },
              { key: 'jersey_number' as const, label: 'Jersey #' },
              { key: 'position' as const, label: 'Position' },
            ]).map(({ key, label }) => {
              const missing = players.filter(p => !p[key].trim()).length;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-[#ccc] w-28 shrink-0">{label}</span>
                  <span className="text-[11px] text-[#666] w-32 shrink-0">
                    {missing > 0 ? `${missing} player${missing !== 1 ? 's' : ''} missing` : 'all filled'}
                  </span>
                  <select
                    defaultValue=""
                    onChange={e => {
                      const raw = e.target.value;
                      const sep = raw.indexOf(' ');
                      if (sep < 0) return;
                      const table = rawTables[Number(raw.slice(0, sep))];
                      const column = raw.slice(sep + 1);
                      if (table && column) applyColumnRemap(key, table, column);
                      e.target.value = ''; // reset — picking the same column again should still re-apply
                    }}
                    style={{ ...SI, fontSize: 11, width: 'auto', flex: 1 }}
                  >
                    <option value="">— Choose a column —</option>
                    {rawTables.map((t, ti) => (
                      <optgroup key={ti} label={rawTables.length > 1 ? t.fileName : undefined}>
                        {t.headers.map(h => (
                          <option key={h} value={`${ti} ${h}`}>{h}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* ── Failed files — never just quietly fewer results ────────────── */}
      {fileOutcomes.some(f => !f.ok) && (
        <div className="mb-4 p-3 rounded-xl bg-red-950/30 border border-red-900/40">
          <p className="text-red-300 text-xs font-bold mb-2">
            ⚠ {fileOutcomes.filter(f => !f.ok).length} file{fileOutcomes.filter(f => !f.ok).length !== 1 ? 's' : ''} didn&apos;t fully import
          </p>
          <div className="flex flex-col gap-1.5">
            {fileOutcomes.filter(f => !f.ok).map(f => (
              <div key={f.name} className="flex items-center gap-3 text-xs">
                <span className="text-red-300 flex-1 truncate">{f.name}</span>
                <span className="text-red-400/70">{f.error || 'Failed to process'}</span>
                <button
                  onClick={() => retryFile(f.name)}
                  disabled={retryingFile === f.name || !filePayloads[f.name]}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                >
                  {retryingFile === f.name ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            ))}
          </div>
          <p className="text-red-400/60 text-[11px] mt-2">Retrying adds whatever comes through this time — if some records already made it in, double-check for duplicates below.</p>
        </div>
      )}

      {/* ── Missing-address roll-up (per-row warning still shown below) ──── */}
      {(() => {
        const noAddr = events.filter(e => e.title.trim() && !e.address).length;
        return noAddr > 0 ? (
          <div className="mb-4 flex items-start gap-3 p-3 rounded-xl bg-amber-950/30 border border-amber-900/40">
            <span className="text-amber-400 text-xs">⚠</span>
            <p className="text-amber-300 text-xs leading-relaxed">
              <strong>{noAddr} event{noAddr !== 1 ? 's' : ''}</strong> have no street address — satellite maps won&apos;t load for those events. Add addresses in the events below and Google will autocomplete.
            </p>
          </div>
        ) : null;
      })()}

      <div className="mb-4">{renderMergeTool()}</div>

      <div className="flex flex-col gap-4">
        {teamOpts.map(renderTeamCard)}

        <button onClick={() => setTeams(p => [...p, { id: uid(), name: '', alt_names: [], age_group: '', gender: '', conf: 'high', reason: '' }])}
          className="w-full py-2 rounded-xl border border-dashed border-[#222] text-[#555] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all">
          + Add team
        </button>

        {renderClubWideCoaches()}
        {renderUnassignedCard()}
      </div>

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      {unassigned > 0 && (
        <p className="text-amber-400 text-xs mt-3">
          ⚠ {unassigned} players have no team assigned and will be skipped. Assign them above or remove them.
        </p>
      )}

      <div className="mt-6">
        <Btn onClick={confirm} disabled={saving} accent={primaryColor}>
          {saving ? 'Setting up your club…' : 'Confirm & go live →'}
        </Btn>
      </div>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({ clubName, slug, logoUrl, primaryColor, parentInvites, coachPayload, skippedCoachNames, teamCount, playerCount, eventCount }: {
  clubName: string; slug: string; logoUrl: string | null; primaryColor: string;
  parentInvites: ParentInvite[]; coachPayload: CoachPayload | null; skippedCoachNames: string[];
  teamCount: number; playerCount: number; eventCount: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(parentInvites.map(i => i.inviteId)));
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  // How many of the attempted sends actually succeeded — null means "sent"
  // was set without ever calling sendInvites (the "Skip for now" path).
  const [sendStats, setSendStats] = useState<{ succeeded: number; failed: number } | null>(null);

  const coachCount = coachPayload?.coaches.length ?? 0;
  // The page behind every card here is solid black — check against that,
  // not the cards' own slightly-lighter dark gray, so the fallback only
  // kicks in when it genuinely needs to.
  const accent = safeAccent(primaryColor, '#000000');

  async function sendInvites() {
    setSending(true);
    const { data: { session } } = await supabase.auth.getSession();
    const authHeaders = {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
    let succeeded = 0;
    let failed = 0;
    for (const inv of parentInvites.filter(i => selected.has(i.inviteId))) {
      try {
        const res = await fetch('/api/send-invite', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ invite_id: inv.inviteId, player_name: inv.playerName }),
        });
        if (res.ok) succeeded++; else failed++;
      } catch {
        failed++;
      }
    }
    if (coachPayload && coachCount > 0) {
      try {
        const res = await fetch('/api/invite-coach', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify(coachPayload),
        });
        if (res.ok) succeeded += coachCount; else failed += coachCount;
      } catch {
        failed += coachCount;
      }
    }
    setSending(false);
    setSendStats({ succeeded, failed });
    setSent(true);
  }

  function toggleAll() {
    if (selected.size === parentInvites.length) setSelected(new Set());
    else setSelected(new Set(parentInvites.map(i => i.inviteId)));
  }

  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 overflow-hidden"
        style={{ background: `${accent}1a`, border: `1px solid ${accent}33` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external/dynamic URL (e.g. Supabase Storage), next/image requires remotePatterns config not yet set up */}
        {logoUrl ? <img src={logoUrl} alt={clubName} className="w-full h-full object-contain" /> : '🎉'}
      </div>
      <h2 className="text-2xl font-extrabold text-white mb-2">{clubName} is live!</h2>
      <p className="text-[#9ca3af] mb-3">
        {teamCount > 0
          ? 'Your teams, roster, and schedule are all set up. Download the app to manage everything.'
          : 'Your club is live — add your first team from the app or dashboard to get your roster and schedule going.'}
      </p>
      <p className="text-xs text-[#555] mb-8">
        <span className="text-white font-semibold">{teamCount}</span> team{teamCount !== 1 ? 's' : ''} · <span className="text-white font-semibold">{playerCount}</span> player{playerCount !== 1 ? 's' : ''} · <span className="text-white font-semibold">{eventCount}</span> event{eventCount !== 1 ? 's' : ''}
      </p>

      {(parentInvites.length > 0 || coachCount > 0) && !sent && (
        <div className="bg-[#111] border border-[#222] rounded-2xl p-6 mb-6 text-left">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-white">
              {parentInvites.length > 0 ? 'Send parent invites' : 'Send coach invites'}
            </p>
            {parentInvites.length > 0 && (
              <button onClick={toggleAll} className="text-xs text-[#555] transition-colors"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = accent}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ''}>
                {selected.size === parentInvites.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          {parentInvites.length > 0 && (
            <>
              <p className="text-xs text-[#6b7280] mb-4">
                Parents get an email with a link to download the app and join their child&apos;s team.
              </p>
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto mb-4">
                {parentInvites.map(inv => {
                  const isSelected = selected.has(inv.inviteId);
                  return (
                    <div key={inv.inviteId}
                      onClick={() => setSelected(prev => {
                        const n = new Set(prev);
                        if (n.has(inv.inviteId)) n.delete(inv.inviteId); else n.add(inv.inviteId);
                        return n;
                      })}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-all"
                      style={isSelected ? { borderColor: `${accent}33`, background: `${accent}08` } : { borderColor: '#222' }}>
                      <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                        style={isSelected ? { background: accent, borderColor: accent } : { borderColor: '#444' }}>
                        {isSelected && <span className="text-[9px] font-black" style={{ color: contrastText(accent) }}>✓</span>}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-white leading-none">{inv.playerName}</p>
                        <p className="text-xs text-[#6b7280] mt-0.5">{inv.email}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {coachCount > 0 && (
            <div className="mb-3">
              <p className="text-xs text-[#6b7280] mb-2">
                {parentInvites.length > 0 ? '+ ' : ''}{coachCount} coach invite{coachCount !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {coachPayload!.coaches.map(c => (
                  <span key={c.email} className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}30` }}>
                    {c.full_name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Btn onClick={() => setSent(true)} variant="ghost">Skip for now</Btn>
            <Btn onClick={sendInvites} disabled={sending || (selected.size === 0 && coachCount === 0)} accent={accent}>
              {sending ? 'Sending…' : `Send ${selected.size + coachCount} invite${selected.size + coachCount !== 1 ? 's' : ''} →`}
            </Btn>
          </div>
          <p className="text-[11px] text-[#444] mt-2">You can invite anyone you skip here later from the dashboard → Staff.</p>
        </div>
      )}

      {skippedCoachNames.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl px-4 py-3 mb-6 text-left">
          <p className="text-amber-400 text-sm font-bold mb-2">⚠ {skippedCoachNames.length} coach{skippedCoachNames.length !== 1 ? 'es' : ''} need an email to be invited</p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto mb-2">
            {skippedCoachNames.map((name, i) => (
              <span key={`${name}-${i}`} className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-900/25 text-amber-300 border border-amber-800/40">
                {name}
              </span>
            ))}
          </div>
          <p className="text-amber-400/70 text-xs">
            No email was found in your uploaded documents. Add {skippedCoachNames.length !== 1 ? 'them' : 'one'} from the dashboard → Staff → Invite staff.
          </p>
        </div>
      )}

      {sent && (parentInvites.length > 0 || coachCount > 0) && (
        sendStats && sendStats.failed > 0 ? (
          <div className="rounded-xl px-4 py-3 mb-6 text-left bg-amber-950/20 border border-amber-900/40">
            <p className="text-sm font-bold text-amber-400">
              Sent {sendStats.succeeded} of {sendStats.succeeded + sendStats.failed} invites — some failed
            </p>
            <p className="text-xs mt-0.5 text-amber-400/70">You can resend the rest anytime from the dashboard → Staff.</p>
          </div>
        ) : (
          <div className="rounded-xl px-4 py-3 mb-6 text-left" style={{ background: `${accent}12`, border: `1px solid ${accent}33` }}>
            <p className="text-sm font-bold" style={{ color: accent }}>✓ Invites sent</p>
            <p className="text-xs mt-0.5" style={{ color: `${accent}99` }}>Manage or invite more anytime from the dashboard → Staff.</p>
          </div>
        )
      )}

      <div className="bg-[#111] border border-[#222] rounded-2xl p-6 flex flex-col gap-4">
        <a href="https://apps.apple.com/us/app/pulse-fc/id6797330659"
          className="flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-base transition-all hover:opacity-90"
          style={{ background: accent, color: contrastText(accent) }}>
          <span className="text-xl">📱</span>
          Download Pulse FC on the App Store
        </a>
        <a href="/dashboard"
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[#333] text-[#9ca3af] text-sm font-semibold hover:border-[#444] hover:text-white transition-all">
          Go to dashboard →
        </a>
        <div className="py-2 px-4 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a] text-left">
          <p className="text-xs text-[#555] mb-0.5">Your club URL</p>
          <p className="text-sm font-mono" style={{ color: accent }}>pulse-fc.app/{slug}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// No 'upload' -> 'club' entry: by the time the wizard reaches Upload, the
// club has always already been created (ClubStep.onDone and resume() both
// set clubId before advancing here), and ClubStep re-mounts blank with no
// memory of the name/slug/color/logo just entered — going Back into it just
// re-submits the same info into a confusing "already taken" 409 for what is
// actually the coach's own club. There's nothing useful to go back to, so
// this step simply isn't reachable via Back once a club exists.
const BACK_TARGET: Partial<Record<Step, Step>> = {
  club:       'auth',
  processing: 'upload',
  review:     'upload',
};

export default function OnboardingPage() {
  const [step, setStep]             = useState<Step>('auth');
  const [clubId, setClubId]         = useState('');
  const [clubName, setClubName]     = useState('');
  const [clubSlug, setClubSlug]     = useState('');
  const [primaryColor, setPrimaryColor] = useState('#22c55e');
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);

  const [teams,   setTeams]   = useState<TRow[]>([]);
  const [players, setPlayers] = useState<PRow[]>([]);
  const [events,  setEvents]  = useState<ERow[]>([]);
  const [coaches, setCoaches] = useState<CRow[]>([]);
  const [parentInvites, setParentInvites] = useState<ParentInvite[]>([]);
  const [pendingCoachPayload, setPendingCoachPayload] = useState<CoachPayload | null>(null);
  const [skippedCoachNames, setSkippedCoachNames] = useState<string[]>([]);
  // Lifted from ReviewStep so the outer Back button (rendered here) can hide
  // itself while Confirm & go live is still saving.
  const [reviewSaving, setReviewSaving] = useState(false);

  // Per-uploaded-file success/failure, and the original payload for each —
  // kept around so a failed file can be retried without re-uploading.
  const [fileOutcomes, setFileOutcomes] = useState<FileOutcome[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, UploadedFile['payload']>>({});
  // Raw CSV/Excel headers+rows from the last import — lets the review
  // screen offer manual column remapping when the AI didn't find/use the
  // right column for a field (e.g. an email column named unusually).
  const [rawTables, setRawTables] = useState<RawTable[]>([]);

  const abortRef        = useRef<AbortController | null>(null);
  const [processingDone, setProcessingDone]         = useState(false);
  const [processingFailed, setProcessingFailed]     = useState(false);
  const [processingCounts, setProcessingCounts]     = useState<ProcessingCounts | null>(null);
  // Real counts as they climb during extraction — ProcessingStep shows
  // these instead of a random-number animation while work is in flight.
  const [liveCounts, setLiveCounts] = useState<ProcessingCounts | null>(null);

  useEffect(() => {
    async function resume() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // stay on 'auth' — not logged in yet

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, club_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.club_id) {
        const [{ data: club }, { count: teamCount }] = await Promise.all([
          supabase.from('clubs').select('id, name, slug, primary_color, logo_url').eq('id', profile.club_id).single(),
          supabase.from('teams').select('id', { count: 'exact', head: true }).eq('club_id', profile.club_id),
        ]);

        if (club) {
          setClubId(club.id); setClubName(club.name); setClubSlug(club.slug);
          setPrimaryColor(club.primary_color ?? '#22c55e'); setClubLogoUrl(club.logo_url ?? null);
        }

        if ((teamCount ?? 0) > 0) {
          // This club already has at least one team — it's not an orphan
          // from an abandoned session, it's a club that's live or far
          // enough along that re-running the wizard would create
          // duplicates. Send them to the real dashboard instead.
          window.location.href = '/dashboard';
          return;
        }

        // Club exists but has zero teams — the previous session was
        // abandoned right after Step 1. Resume into Step 2 rather than
        // creating a second club for the same user.
        setStep('upload');
        return;
      }

      // Authenticated with no profiles row at all yet — e.g. a first-time
      // Google/Apple sign-in that landed here with nothing set up. Mark
      // them org_admin now so the create-club call in ClubStep is
      // authorized (the email/password path does this in AuthStep before
      // advancing; this covers the OAuth path, which skips AuthStep).
      if (!profile) {
        await supabase.from('profiles').upsert({ id: user.id, role: 'org_admin' });
      }
      setStep('club');
    }
    resume();
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

  function populateFromAI(data: Record<string, unknown>) {
    const teamRows: TRow[] = ((data.teams ?? []) as Record<string, unknown>[]).map(t => ({
      id: uid(),
      name: typeof t.name === 'string' ? t.name : '',
      alt_names: Array.isArray(t.alt_names) ? t.alt_names.filter((n): n is string => typeof n === 'string') : [],
      age_group: typeof t.age_group === 'string' ? t.age_group : '',
      gender: typeof t.gender === 'string' ? t.gender : '',
      conf: (typeof t.confidence === 'string' ? t.confidence : 'high') as Conf,
      reason: typeof t.reason === 'string' ? t.reason : '',
    }));
    setTeams(teamRows);
    setPlayers(((data.players ?? []) as Record<string, string>[]).map(p => ({
      id: uid(), full_name: p.full_name ?? '', jersey_number: p.jersey_number ?? '',
      position: p.position ?? '', parent_email: p.parent_email ?? '',
      local_team_id: matchTeamId(p.team_name, teamRows), conf: (p.confidence ?? 'high') as Conf,
      reason: p.reason ?? '',
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
      reason: e.reason ?? '',
    })));
    // The server already dedupes coaches within one parse-all response
    // (same reasoning as team alt_names — different files/chunks can each
    // extract the same person under a different name), but this is cheap
    // insurance against anything that slips through.
    {
      const rows: CRow[] = [];
      const emails = new Set<string>();
      for (const c of (data.coaches ?? []) as Record<string, string>[]) {
        const local_team_id = matchTeamId(c.team_name, teamRows);
        const full_name = (c.full_name ?? '').trim();
        const email = (c.email ?? '').toLowerCase().trim();
        if (email) {
          if (emails.has(email)) continue;
          emails.add(email);
        } else if (rows.some(x => !x.email && x.local_team_id === local_team_id && sameCoachName(x.full_name, full_name))) {
          continue;
        }
        rows.push({ id: uid(), full_name, email: c.email ?? '', local_team_id });
      }
      setCoaches(rows);
    }
  }

  async function handleAnalyse(uploadedFiles: UploadedFile[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessingDone(false);
    setProcessingCounts(null);
    setLiveCounts({ teams: 0, players: 0, events: 0, coaches: 0 });
    setFilePayloads(Object.fromEntries(uploadedFiles.map(f => [f.name, f.payload])));
    setStep('processing');
    try {
      const { data: { session: analyseSession } } = await supabase.auth.getSession();
      const outcome = await streamParseAll(
        uploadedFiles.map(f => f.payload),
        analyseSession?.access_token,
        controller.signal,
        counts => setLiveCounts(counts),
      );
      if (!outcome.ok) {
        console.error('parse-all error:', outcome.error);
        setTeams([{ id: uid(), name: '', alt_names: [], age_group: '', gender: '', conf: 'high', reason: '' }]);
        setPlayers([]); setEvents([]); setCoaches([]); setRawTables([]);
        setFileOutcomes(uploadedFiles.map(f => ({ name: f.name, ok: false, error: outcome.error || 'Import failed' })));
        setProcessingCounts({ teams: 0, players: 0, events: 0, coaches: 0 });
        setProcessingFailed(true);
      } else {
        const data = outcome.data;
        populateFromAI(data);
        const d = data as Record<string, unknown[]>;
        setFileOutcomes(Array.isArray(d.fileOutcomes) ? d.fileOutcomes as FileOutcome[] : []);
        setRawTables(Array.isArray(d.rawTables) ? d.rawTables as RawTable[] : []);
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
      setTeams([{ id: uid(), name: '', alt_names: [], age_group: '', gender: '', conf: 'high', reason: '' }]);
      setPlayers([]); setEvents([]); setCoaches([]);
      setProcessingCounts({ teams: 0, players: 0, events: 0, coaches: 0 });
      setProcessingFailed(true);
      setProcessingDone(true);
    } finally {
      abortRef.current = null;
    }
  }

  function skipUpload() {
    setTeams([{ id: uid(), name: '', alt_names: [], age_group: '', gender: '', conf: 'high', reason: '' }]);
    setPlayers([]); setEvents([]); setCoaches([]);
    setStep('review');
  }

  const isReview  = step === 'review';
  const canGoBack = !!BACK_TARGET[step] && !(step === 'review' && reviewSaving);

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
            setClubId(d.id); setClubName(d.name); setClubSlug(d.slug); setPrimaryColor(d.primaryColor); setClubLogoUrl(d.logoUrl);
            setStep('upload');
          }} />
        )}
        {step === 'upload' && (
          <UploadStep onAnalyse={handleAnalyse} onSkip={skipUpload} accent={primaryColor} />
        )}
        {step === 'processing' && (
          <ProcessingStep done={processingDone} failed={processingFailed} counts={processingCounts} liveCounts={liveCounts} onComplete={() => setStep('review')} accent={primaryColor} />
        )}
        {step === 'review' && (
          <ReviewStep
            clubId={clubId} clubName={clubName} primaryColor={primaryColor}
            teams={teams}   setTeams={setTeams}
            players={players} setPlayers={setPlayers}
            events={events}  setEvents={setEvents}
            coaches={coaches} setCoaches={setCoaches}
            fileOutcomes={fileOutcomes} setFileOutcomes={setFileOutcomes}
            filePayloads={filePayloads} setFilePayloads={setFilePayloads}
            rawTables={rawTables}
            saving={reviewSaving} setSaving={setReviewSaving}
            onConfirm={(invites, coachPayload, skipped) => { setParentInvites(invites); setPendingCoachPayload(coachPayload); setSkippedCoachNames(skipped); setStep('done'); }}
          />
        )}
        {step === 'done' && (
          <DoneStep
            clubName={clubName} slug={clubSlug} logoUrl={clubLogoUrl} primaryColor={primaryColor}
            parentInvites={parentInvites} coachPayload={pendingCoachPayload} skippedCoachNames={skippedCoachNames}
            teamCount={teams.length} playerCount={players.length} eventCount={events.length}
          />
        )}

      </div>
    </div>
  );
}
