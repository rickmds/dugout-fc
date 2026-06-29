'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'auth' | 'club' | 'team' | 'players' | 'invites' | 'schedule' | 'done';

type ClubData = {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  tagline: string;
};

type TeamData = {
  name: string;
  ageGroup: string;
  season: string;
};

type PlayerRow = {
  id: string;
  full_name: string;
  jersey_number: string;
  position: string;
  parent_email: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Step progress bar ───────────────────────────────────────────────────────

const STEPS: { key: Step; label: string }[] = [
  { key: 'club',     label: 'Club'     },
  { key: 'team',     label: 'Team'     },
  { key: 'players',  label: 'Roster'   },
  { key: 'invites',  label: 'Parents'  },
  { key: 'schedule', label: 'Schedule' },
  { key: 'done',     label: 'Done'     },
];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((s, i) => {
        const done    = i < idx;
        const active  = i === idx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-800 border transition-all
                ${active  ? 'bg-[#22c55e] border-[#22c55e] text-black'
                : done    ? 'bg-[#22c55e22] border-[#22c55e] text-[#22c55e]'
                          : 'bg-[#111] border-[#333] text-[#555]'}`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-600 whitespace-nowrap
                ${active ? 'text-[#22c55e]' : done ? 'text-[#6b7280]' : 'text-[#374151]'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
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
  return (
    <div className="bg-[#111] border border-[#222] rounded-2xl p-8">
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-[#6b7280] uppercase tracking-widest mb-2">{children}</label>;
}

function Btn({
  children, onClick, disabled, variant = 'primary', type = 'button',
}: {
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
      className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-sm transition-all
        ${variant === 'primary'
          ? 'bg-[#22c55e] text-black hover:bg-[#16a34a] disabled:opacity-40'
          : 'border border-[#333] text-[#9ca3af] hover:border-[#444] hover:text-white'}
        disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

// ─── Step: Auth ──────────────────────────────────────────────────────────────

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
      await supabase.from('profiles').upsert({
        id: data.user.id, full_name: name, role: 'org_admin',
      });
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
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#22c55e1a] border border-[#22c55e33] mb-4">
          <span className="text-3xl">⚽</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-1">Add your club to Dugout FC</h1>
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

// ─── Step 1: Club details ─────────────────────────────────────────────────────

function ClubStep({ onDone }: { onDone: (data: ClubData & { id: string }) => void }) {
  const [name, setName]       = useState('');
  const [slug, setSlug]       = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [tagline, setTagline] = useState('');
  const [primary, setPrimary] = useState('#22c55e');
  const [secondary, setSecondary] = useState('#000000');
  const [logoFile, setLogoFile]     = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Logo must be under 3MB.'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError('');
  }

  function removeLogo() {
    setLogoFile(null);
    setLogoPreview(null);
  }

  async function submit() {
    if (!name.trim() || !slug.trim()) { setError('Club name and slug are required.'); return; }
    setError('');
    setLoading(true);

    // Convert logo to base64 if present
    let logoBase64: string | null = null;
    let logoMime: string | null = null;
    let logoName: string | null = null;
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
      body: JSON.stringify({
        action: 'create_club',
        name: name.trim(),
        slug: slug.trim(),
        tagline: tagline.trim() || null,
        primary_color: primary,
        secondary_color: secondary,
        user_id: user?.id,
        logo_base64: logoBase64,
        logo_mime: logoMime,
        logo_name: logoName,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? 'Failed to create club'); setLoading(false); return; }

    onDone({ id: json.club.id, name: name.trim(), slug: slug.trim(), tagline: tagline.trim(), primaryColor: primary, secondaryColor: secondary });
    setLoading(false);
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold text-white mb-1">Club details</h2>
      <p className="text-[#9ca3af] text-sm mb-6">Set up your club's identity</p>
      <Card>
        <div className="flex flex-col gap-5">
          <div>
            <Label>Club name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MDS Academy" />
          </div>
          <div>
            <Label>Club URL slug</Label>
            <div className="flex items-center gap-0 bg-[#111] border border-[#222] rounded-xl overflow-hidden focus-within:border-[#22c55e]">
              <span className="px-3 text-[#4b5563] text-sm whitespace-nowrap">dugoutfc.app/</span>
              <input
                value={slug}
                onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                className="border-0 rounded-none bg-transparent flex-1 !border-0 focus:!border-0"
                placeholder="mds-academy"
              />
            </div>
          </div>

          <div>
            <Label>Club tagline <span className="text-[#4b5563] normal-case font-normal">optional</span></Label>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Where great players are made"
              maxLength={80}
            />
          </div>

          {/* Logo upload */}
          <div>
            <Label>Club logo <span className="text-[#4b5563] normal-case font-normal">optional</span></Label>
            {logoPreview ? (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#111] border border-[#222]">
                <img src={logoPreview} alt="Club logo" className="w-16 h-16 rounded-xl object-contain bg-[#1a1a1a]" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{logoFile?.name}</p>
                  <p className="text-[#6b7280] text-xs mt-0.5">{logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB` : ''}</p>
                </div>
                <button onClick={removeLogo}
                  className="text-[#6b7280] hover:text-white text-sm px-3 py-1.5 rounded-lg border border-[#333] hover:border-[#444] transition-colors flex-shrink-0">
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-[#333] hover:border-[#22c55e] cursor-pointer transition-colors group bg-[#111]">
                <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center group-hover:border-[#22c55e22] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M9 12V4M9 4L6 7M9 4l3 3" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 14h12" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-[#555] text-sm font-medium group-hover:text-[#888] transition-colors">Upload your club logo</p>
                <p className="text-[#3a3a3a] text-xs">PNG, JPG, SVG · Max 3MB</p>
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
            )}
          </div>

          {/* Colour pickers */}
          <div className="flex gap-4">
            {([
              { label: 'Primary colour',   value: primary,   set: setPrimary },
              { label: 'Secondary colour', value: secondary, set: setSecondary },
            ] as const).map(({ label, value, set }) => (
              <div key={label} className="flex-1">
                <Label>{label}</Label>
                <div className="flex items-center gap-3 bg-[#111] border border-[#222] rounded-xl px-3 py-2.5 focus-within:border-[#22c55e] transition-colors">
                  <div className="relative w-8 h-8 flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg border border-[#333]" style={{ background: value }} />
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-sm text-[#9ca3af] font-mono">{value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Live brand preview */}
          <div className="rounded-xl p-4 border border-[#1e1e1e]" style={{ background: '#111' }}>
            <p className="text-[#3a3a3a] text-[10px] font-bold uppercase tracking-widest mb-3">Brand preview</p>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{ background: `${primary}18`, border: `2px solid ${primary}` }}>
                {logoPreview
                  ? <img src={logoPreview} alt="" className="w-8 h-8 object-contain" />
                  : <span className="text-sm font-extrabold" style={{ color: primary }}>
                      {name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'FC'}
                    </span>
                }
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-none mb-1">{name || 'Your Club Name'}</p>
                {tagline
                  ? <p className="text-[#888] text-xs mt-0.5 italic">{tagline}</p>
                  : <p className="text-[#555] text-xs">dugoutfc.app/{slug || 'your-club'}</p>
                }
              </div>
              <div className="ml-auto flex gap-1.5">
                <div className="w-5 h-5 rounded-full border border-[#333]" style={{ background: primary }} />
                <div className="w-5 h-5 rounded-full border border-[#333]" style={{ background: secondary }} />
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Btn onClick={submit} disabled={loading}>
            {loading ? 'Creating…' : 'Continue →'}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Step 2: First team ───────────────────────────────────────────────────────

function TeamStep({ clubId, onDone }: { clubId: string; onDone: (data: TeamData & { id: string }) => void }) {
  const [name, setName]         = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [season, setSeason]     = useState('2025/26');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit() {
    if (!name.trim()) { setError('Team name is required.'); return; }
    setError('');
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_team', club_id: clubId, name: name.trim(), age_group: ageGroup.trim(), season: season.trim(), user_id: user?.id }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? 'Failed to create team'); setLoading(false); return; }

    onDone({ id: json.team.id, name: name.trim(), ageGroup, season });
    setLoading(false);
  }

  return (
    <div>
      <h2 className="text-xl font-extrabold text-white mb-1">Create your first team</h2>
      <p className="text-[#9ca3af] text-sm mb-6">You can add more teams later</p>
      <Card>
        <div className="flex flex-col gap-5">
          <div>
            <Label>Team name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="U12 Boys" />
          </div>
          <div>
            <Label>Age group <span className="text-[#4b5563] normal-case font-normal">optional</span></Label>
            <input value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="U12, U14, U16…" />
          </div>
          <div>
            <Label>Season</Label>
            <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2025/26" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Btn onClick={submit} disabled={loading}>
            {loading ? 'Creating…' : 'Continue →'}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Step 3: Players ──────────────────────────────────────────────────────────

function PlayersStep({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const [players, setPlayers] = useState<PlayerRow[]>([
    { id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function update(id: string, field: keyof PlayerRow, value: string) {
    setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  }

  function addRow() {
    setPlayers((prev) => [...prev, { id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '' }]);
  }

  function removeRow(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  async function submit() {
    const valid = players.filter((p) => p.full_name.trim());
    if (valid.length === 0) { onDone(); return; }
    setSaving(true);

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_players', team_id: teamId, players: valid }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? 'Failed to save players'); setSaving(false); return; }
    onDone();
    setSaving(false);
  }

  const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];

  return (
    <div>
      <h2 className="text-xl font-extrabold text-white mb-1">Add your roster</h2>
      <p className="text-[#9ca3af] text-sm mb-6">Add players now or skip — you can always add them later</p>

      <div className="flex flex-col gap-3 mb-4">
        {players.map((p, i) => (
          <div key={p.id} className="bg-[#111] border border-[#222] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#4b5563] uppercase tracking-widest">Player {i + 1}</span>
              {players.length > 1 && (
                <button onClick={() => removeRow(p.id)} className="text-[#4b5563] hover:text-red-400 text-sm transition-colors">✕</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input value={p.full_name} onChange={(e) => update(p.id, 'full_name', e.target.value)} placeholder="Full name *" />
              </div>
              <input value={p.jersey_number} onChange={(e) => update(p.id, 'jersey_number', e.target.value)}
                placeholder="Jersey #" type="number" min="1" max="99" />
              <select value={p.position} onChange={(e) => update(p.id, 'position', e.target.value)}
                className="bg-[#111] border border-[#222] text-[#9ca3af] rounded-xl px-3 py-2 text-sm">
                <option value="">Position</option>
                {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
              </select>
              <div className="col-span-2">
                <input value={p.parent_email} onChange={(e) => update(p.id, 'parent_email', e.target.value)}
                  placeholder="Parent email (optional)" type="email" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRow}
        className="w-full py-3 rounded-xl border border-dashed border-[#333] text-[#6b7280] text-sm hover:border-[#22c55e] hover:text-[#22c55e] transition-all mb-6">
        + Add another player
      </button>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="flex gap-3">
        <Btn onClick={onDone} variant="ghost">Skip for now</Btn>
        <Btn onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : `Save ${players.filter(p => p.full_name.trim()).length > 0 ? players.filter(p => p.full_name.trim()).length + ' player' + (players.filter(p => p.full_name.trim()).length > 1 ? 's' : '') : 'roster'} →`}
        </Btn>
      </div>
    </div>
  );
}

// ─── Step 4: Invite parents ───────────────────────────────────────────────────

function InvitesStep({ teamId, clubName, teamName, onDone }: {
  teamId: string; clubName: string; teamName: string; onDone: () => void;
}) {
  const [players, setPlayers] = useState<{ id: string; full_name: string; parent_email?: string }[]>([]);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sent, setSent]       = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('players').select('id, full_name').eq('team_id', teamId);
      const { data: invites } = await supabase.from('invites').select('player_id, email').eq('team_id', teamId);
      const emailMap: Record<string, string> = {};
      for (const inv of invites ?? []) emailMap[(inv as any).player_id] = (inv as any).email;
      setPlayers((data ?? []).map((p: any) => ({ ...p, parent_email: emailMap[p.id] })));
      setLoading(false);
    }
    load();
  }, [teamId]);

  const [extraEmail, setExtraEmail] = useState('');

  async function sendInvite(playerId: string | null, email: string, playerName: string) {
    const key = playerId ?? email;
    setSending((p) => ({ ...p, [key]: true }));
    const token = uid() + uid();
    const { data: { user } } = await supabase.auth.getUser();

    await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_id: teamId, player_id: playerId, player_name: playerName,
        parent_email: email, team_name: teamName, club_name: clubName,
        invite_token: token, created_by: user?.id,
      }),
    });

    setSent((p) => ({ ...p, [key]: true }));
    setSending((p) => ({ ...p, [key]: false }));
  }

  async function sendAll() {
    const withEmail = players.filter((p) => p.parent_email);
    for (const p of withEmail) {
      if (!sent[p.id]) await sendInvite(p.id, p.parent_email!, p.full_name);
    }
  }

  if (loading) return <div className="text-center py-10 text-[#6b7280]">Loading roster…</div>;

  const withEmail = players.filter((p) => p.parent_email);

  return (
    <div>
      <h2 className="text-xl font-extrabold text-white mb-1">Invite parents</h2>
      <p className="text-[#9ca3af] text-sm mb-6">Send invite emails so parents can download the app and join the team</p>

      {players.length === 0 ? (
        <Card>
          <p className="text-[#6b7280] text-sm text-center py-4">No players added yet. You can invite parents from the Roster screen in the app.</p>
        </Card>
      ) : (
        <Card>
          {withEmail.length > 1 && (
            <button onClick={sendAll}
              className="w-full py-3 rounded-xl bg-[#22c55e1a] border border-[#22c55e33] text-[#22c55e] text-sm font-bold hover:bg-[#22c55e22] transition-all mb-5">
              Send all {withEmail.length} invites at once
            </button>
          )}

          <div className="flex flex-col gap-2">
            {players.map((p) => {
              const isSent    = sent[p.id];
              const isSending = sending[p.id];
              return (
                <div key={p.id} className="flex items-center gap-3 py-3 border-b border-[#1a1a1a] last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{p.full_name}</p>
                    {p.parent_email
                      ? <p className="text-xs text-[#6b7280]">{p.parent_email}</p>
                      : <p className="text-xs text-[#4b5563] italic">No parent email</p>}
                  </div>
                  {p.parent_email && (
                    <button
                      onClick={() => sendInvite(p.id, p.parent_email!, p.full_name)}
                      disabled={isSending || isSent}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all
                        ${isSent ? 'bg-[#22c55e1a] text-[#22c55e] border border-[#22c55e33]'
                                 : 'bg-[#1a1a1a] text-[#9ca3af] border border-[#333] hover:border-[#22c55e] hover:text-[#22c55e]'}`}
                    >
                      {isSending ? '…' : isSent ? '✓ Sent' : 'Send'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-5 border-t border-[#1a1a1a]">
            <Label>Invite someone not on the roster</Label>
            <div className="flex gap-2">
              <input value={extraEmail} onChange={(e) => setExtraEmail(e.target.value)}
                placeholder="parent@example.com" type="email" />
              <button
                onClick={() => { if (extraEmail) { sendInvite(null, extraEmail, ''); setExtraEmail(''); } }}
                className="px-4 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-sm text-[#9ca3af] hover:border-[#22c55e] hover:text-[#22c55e] transition-all whitespace-nowrap">
                Send
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-3 mt-6">
        <Btn onClick={onDone} variant="ghost">Skip</Btn>
        <Btn onClick={onDone}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 5: Schedule ─────────────────────────────────────────────────────────

function ScheduleStep({ onDone }: { onDone: () => void }) {
  return (
    <div>
      <h2 className="text-xl font-extrabold text-white mb-1">Upload your schedule</h2>
      <p className="text-[#9ca3af] text-sm mb-6">Add events manually or use AI to import from any format</p>
      <Card>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#22c55e1a] border border-[#22c55e33] flex items-center justify-center text-3xl">✨</div>
          <div>
            <p className="text-white font-semibold mb-1">AI Schedule Import is in the app</p>
            <p className="text-sm text-[#9ca3af]">
              Once you download Dugout FC, head to the Schedule tab → AI Import to upload your season schedule.
              Claude will extract all games and training sessions automatically.
            </p>
          </div>
        </div>
      </Card>
      <div className="flex gap-3 mt-6">
        <Btn onClick={onDone} variant="ghost">Skip</Btn>
        <Btn onClick={onDone}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 6: Done ─────────────────────────────────────────────────────────────

function DoneStep({ clubName, teamName, slug }: { clubName: string; teamName: string; slug: string }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-3xl bg-[#22c55e1a] border border-[#22c55e33] flex items-center justify-center text-4xl mx-auto mb-6">
        🎉
      </div>
      <h2 className="text-2xl font-extrabold text-white mb-2">{clubName} is live!</h2>
      <p className="text-[#9ca3af] mb-8">
        {teamName} is set up and ready. Download the app to manage your roster, schedule, and communicate with your team.
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <a
            href="https://apps.apple.com/app/dugout-fc"
            className="flex items-center justify-center gap-3 py-4 rounded-xl bg-[#22c55e] text-black font-bold text-base hover:bg-[#16a34a] transition-all"
          >
            <span className="text-xl">📱</span>
            Download Dugout FC on the App Store
          </a>
          <div className="py-3 px-4 rounded-xl bg-[#161616] border border-[#222]">
            <p className="text-xs text-[#6b7280] mb-1">Your club URL</p>
            <p className="text-sm font-mono text-[#22c55e]">dugoutfc.app/{slug}</p>
          </div>
        </div>
      </Card>

      <p className="text-xs text-[#4b5563] mt-6">
        Log in to the app with the same email and password you just created.
      </p>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep]     = useState<Step>('auth');
  const [user, setUser]     = useState<User | null>(null);
  const [clubId, setClubId] = useState('');
  const [clubName, setClubName] = useState('');
  const [clubSlug, setClubSlug] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUser(data.user); setStep('club'); }
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] py-12 px-4">
      <div className="max-w-lg mx-auto">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#111] border border-[#222] rounded-full px-4 py-2">
            <span className="text-lg">⚽</span>
            <span className="font-extrabold text-white text-sm tracking-wide">DUGOUT FC</span>
          </div>
        </div>

        {step !== 'auth' && step !== 'done' && <StepBar current={step} />}

        {step === 'auth'     && <AuthStep onDone={(u) => { setUser(u); setStep('club'); }} />}
        {step === 'club'     && <ClubStep onDone={(d) => { setClubId(d.id); setClubName(d.name); setClubSlug(d.slug); setStep('team'); }} />}
        {step === 'team'     && <TeamStep clubId={clubId} onDone={(d) => { setTeamId(d.id); setTeamName(d.name); setStep('players'); }} />}
        {step === 'players'  && <PlayersStep teamId={teamId} onDone={() => setStep('invites')} />}
        {step === 'invites'  && <InvitesStep teamId={teamId} clubName={clubName} teamName={teamName} onDone={() => setStep('schedule')} />}
        {step === 'schedule' && <ScheduleStep onDone={() => setStep('done')} />}
        {step === 'done'     && <DoneStep clubName={clubName} teamName={teamName} slug={clubSlug} />}

      </div>
    </div>
  );
}
