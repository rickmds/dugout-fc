'use client';

import { useRef, useState } from 'react';
import { X, Upload, Plus, Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDashboard } from './DashboardContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type Conf = 'high' | 'medium' | 'low';

type TRow = { id: string; name: string; age_group: string; gender: string; conf: Conf };
type CRow = { id: string; full_name: string; email: string; team_ids: string[] };
type PRow = { id: string; full_name: string; jersey_number: string; position: string; parent_email: string; local_team_id: string; conf: Conf };
type ERow = { id: string; title: string; type: string; event_date: string; event_time: string; location: string; local_team_id: string; conf: Conf };
type CreatedTeam = { localId: string; dbId: string; name: string };

const STEPS = ['Branding', 'Teams', 'Coaches', 'Roster', 'Schedule', 'Done'];

function uid() { return Math.random().toString(36).slice(2, 10); }

async function fileToPayload(file: File): Promise<{ base64: string; mimeType: string } | { text: string }> {
  const mimeType = file.type || 'text/plain';
  if (mimeType === 'text/csv' || mimeType === 'text/plain' || file.name.endsWith('.csv')) {
    const text = await file.text();
    return { text };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => { const r = reader.result as string; resolve({ base64: r.split(',')[1], mimeType }); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function matchTeamId(name: string, createdTeams: CreatedTeam[]): string {
  if (!name) return '';
  const n = name.toLowerCase().trim();
  return (
    createdTeams.find((t) => t.name.toLowerCase().trim() === n)?.localId ??
    createdTeams.find((t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()))?.localId ??
    ''
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function ConfBadge({ c }: { c: Conf }) {
  if (c === 'high') return null;
  const isAmber = c === 'medium';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: isAmber ? '#FEF3C7' : '#FEE2E2', color: isAmber ? '#92400E' : '#991B1B', flexShrink: 0 }}>
      {isAmber ? 'Review' : 'Check'}
    </span>
  );
}

function DropZone({ onFile, primary, label }: { onFile: (f: File) => void; primary: string; label: string }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
      style={{ border: `2px dashed ${over ? primary : '#CBD5E1'}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: over ? `${primary}08` : '#FAFAFA', transition: 'all 0.15s' }}
    >
      <Upload size={28} color={over ? primary : '#CBD5E1'} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 14 }}>CSV, PDF, or image · drag & drop or click to browse</div>
      <span style={{ display: 'inline-block', background: primary, color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 8 }}>Browse files</span>
      <input ref={ref} type="file" accept=".csv,.pdf,.png,.jpg,.jpeg,image/*,text/csv,application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function Spinner({ primary }: { primary: string }) {
  return (
    <>
      <style>{`@keyframes wzspin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ width: 48, height: 48, border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'wzspin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Reading your file…</div>
        <div style={{ fontSize: 13, color: '#94A3B8' }}>Claude is extracting your data</div>
      </div>
    </>
  );
}

const inp: React.CSSProperties = { background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#0F172A', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const sel: React.CSSProperties = { ...inp, cursor: 'pointer', appearance: 'none' };

// ── Step 0 — Branding ─────────────────────────────────────────────────────────

function Step0({ primary, onDone }: { primary: string; onDone: () => void }) {
  const { club, reload } = useDashboard();
  const [name, setName]         = useState(club?.name ?? '');
  const [color, setColor]       = useState(club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl]   = useState(club?.logo_url ?? '');
  const [saving, setSaving]     = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  async function handleLogoChange(file: File) {
    setLogoFile(file);
    const preview = URL.createObjectURL(file);
    setLogoUrl(preview);
  }

  async function save() {
    if (!club) return;
    setSaving(true);
    let finalLogoUrl = club.logo_url ?? '';
    if (logoFile) {
      const ext  = logoFile.name.split('.').pop();
      const path = `${club.id}/logo.${ext}`;
      await supabase.storage.from('club-assets').upload(path, logoFile, { upsert: true });
      const { data } = supabase.storage.from('club-assets').getPublicUrl(path);
      finalLogoUrl = data.publicUrl;
    }
    await supabase.from('clubs').update({ name: name.trim() || club.name, primary_color: color, logo_url: finalLogoUrl || null }).eq('id', club.id);
    reload();
    setSaving(false);
    onDone();
  }

  const initials = (name || club?.name || '').split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: '#F8FAFC', borderRadius: 12, border: '1.5px solid #E2E8F0' }}>
        <div onClick={() => logoRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 14, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, border: '2px solid rgba(0,0,0,0.08)' }}>
          {logoUrl ? <img src={logoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{initials}</span>}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{name || club?.name}</div>
          <button onClick={() => logoRef.current?.click()} style={{ fontSize: 12, color, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', marginTop: 2 }}>
            {logoUrl ? 'Change logo' : 'Upload logo'}
          </button>
        </div>
        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoChange(f); }} />
      </div>

      {/* Club name */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Club name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={club?.name ?? 'Club name'} style={{ ...inp, fontSize: 15, padding: '10px 12px' }} />
      </div>

      {/* Color */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>Primary colour</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 48, height: 40, borderRadius: 8, border: '1.5px solid #E2E8F0', cursor: 'pointer', padding: 2, background: 'none' }} />
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#22C55E" style={{ ...inp, width: 140 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {['#22C55E','#3B82F6','#EF4444','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'].map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '3px solid #0F172A' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }} />
            ))}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{ marginTop: 4, padding: '11px 0', background: color, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving…' : 'Save branding & continue →'}
      </button>
    </div>
  );
}

// ── Step 1 — Teams ────────────────────────────────────────────────────────────

function Step1({ primary, createdTeams, setCreatedTeams, onDone, onSkip }: {
  primary: string;
  createdTeams: CreatedTeam[];
  setCreatedTeams: (t: CreatedTeam[]) => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const { club, teams: existingTeams, reload } = useDashboard();
  const [rows, setRows]   = useState<TRow[]>(() =>
    existingTeams.length > 0
      ? existingTeams.map((t) => ({ id: uid(), name: t.name, age_group: t.age_group ?? '', gender: '', conf: 'high' as Conf }))
      : [{ id: uid(), name: '', age_group: '', gender: '', conf: 'high' }]
  );
  const [parsing, setParsing] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [saving, setSaving]   = useState(false);

  async function handleFile(file: File) {
    setParsing(true); setShowDrop(false);
    const payload = await fileToPayload(file);
    const res = await fetch('/api/ai/parse-teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json() as { teams?: { name: string; age_group: string | null; gender: string | null; confidence: string }[]; error?: string };
    setParsing(false);
    if (data.error || !data.teams?.length) { alert(data.error ?? 'No teams found in the file.'); return; }
    setRows(data.teams.map((t) => ({ id: uid(), name: t.name, age_group: t.age_group ?? '', gender: t.gender ?? '', conf: (t.confidence as Conf) ?? 'medium' })));
  }

  function update(id: string, field: keyof TRow, val: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  async function save() {
    const toCreate = rows.filter((r) => r.name.trim());
    if (!toCreate.length || !club) return;
    setSaving(true);

    // If teams already exist (user came back), skip creating them again
    if (existingTeams.length > 0 && createdTeams.length > 0) { onDone(); setSaving(false); return; }

    const created: CreatedTeam[] = [];
    for (const r of toCreate) {
      const { data } = await supabase.from('teams').insert({ club_id: club.id, name: r.name.trim(), age_group: r.age_group.trim() || null }).select('id').single();
      if (data) created.push({ localId: r.id, dbId: (data as { id: string }).id, name: r.name.trim() });
    }
    setCreatedTeams(created);
    reload();
    setSaving(false);
    onDone();
  }

  const AGE_GROUPS = ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','Adult'];
  const validRows  = rows.filter((r) => r.name.trim()).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#64748B' }}>Add your teams manually or upload a document</span>
        <button onClick={() => setShowDrop((v) => !v)} style={{ fontSize: 13, color: primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
          <Upload size={13} /> Upload to auto-fill
        </button>
      </div>

      {showDrop && !parsing && <DropZone onFile={handleFile} primary={primary} label="Drop your teams document" />}
      {parsing && <Spinner primary={primary} />}

      {!parsing && (
        <>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 28px', gap: 8, padding: '0 4px' }}>
            {['Team name','Age group','Gender',''].map((h) => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 28px', gap: 8, alignItems: 'center', background: r.conf === 'low' ? '#FFF5F5' : r.conf === 'medium' ? '#FFFBEB' : '#fff', borderRadius: 8, padding: 6, border: `1px solid ${r.conf === 'low' ? '#FCA5A5' : r.conf === 'medium' ? '#FDE68A' : '#E2E8F0'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={r.name} onChange={(e) => update(r.id, 'name', e.target.value)} placeholder="Team name" style={inp} />
                  <ConfBadge c={r.conf} />
                </div>
                <div style={{ position: 'relative' }}>
                  <select value={r.age_group} onChange={(e) => update(r.id, 'age_group', e.target.value)} style={sel}>
                    <option value="">—</option>
                    {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={11} color="#94A3B8" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
                <div style={{ position: 'relative' }}>
                  <select value={r.gender} onChange={(e) => update(r.id, 'gender', e.target.value)} style={sel}>
                    <option value="">—</option>
                    <option value="Boys">Boys</option>
                    <option value="Girls">Girls</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                  <ChevronDown size={11} color="#94A3B8" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
                <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#CBD5E1', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button onClick={() => setRows((p) => [...p, { id: uid(), name: '', age_group: '', gender: '', conf: 'high' }])} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px dashed #E2E8F0`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={14} /> Add team
          </button>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onSkip} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Skip for now
            </button>
            <button onClick={save} disabled={saving || validRows === 0} style={{ flex: 1, padding: '10px 0', background: validRows > 0 ? primary : '#CBD5E1', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: validRows > 0 && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating teams…' : existingTeams.length > 0 ? `Continue with ${validRows} team${validRows !== 1 ? 's' : ''} →` : `Create ${validRows} team${validRows !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 2 — Coaches ──────────────────────────────────────────────────────────

function Step2({ primary, createdTeams, onDone, onSkip }: {
  primary: string; createdTeams: CreatedTeam[]; onDone: () => void; onSkip: () => void;
}) {
  const { club } = useDashboard();
  const [rows, setRows]   = useState<CRow[]>([{ id: uid(), full_name: '', email: '', team_ids: [] }]);
  const [saving, setSaving] = useState(false);

  function update(id: string, field: keyof CRow, val: string | string[]) {
    setRows((p) => p.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  function toggleTeam(coachId: string, teamLocalId: string) {
    setRows((p) => p.map((r) => {
      if (r.id !== coachId) return r;
      const next = r.team_ids.includes(teamLocalId) ? r.team_ids.filter((x) => x !== teamLocalId) : [...r.team_ids, teamLocalId];
      return { ...r, team_ids: next };
    }));
  }

  async function save() {
    const valid = rows.filter((r) => r.full_name.trim() && r.email.trim());
    if (!valid.length || !club) { onDone(); return; }
    setSaving(true);
    const teamMap: Record<string, string> = {};
    for (const ct of createdTeams) teamMap[ct.localId] = ct.name;
    const coaches = valid.map((r) => ({ full_name: r.full_name.trim(), email: r.email.trim(), teams: r.team_ids.map((id) => teamMap[id] ?? id).filter(Boolean) }));
    await fetch('/api/invite-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coaches, clubName: club.name, clubColor: club.primary_color ?? '#22C55E', dashboardUrl: 'https://pulse-fc.app/login' }) });
    setSaving(false);
    onDone();
  }

  const validCount = rows.filter((r) => r.full_name.trim() && r.email.trim()).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
        Add coaches and we&apos;ll send them an email with instructions to sign up. They&apos;ll be linked to their teams once they&apos;re registered.
      </p>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 8, padding: '0 4px' }}>
        {['Full name','Email','Teams',''].map((h) => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 8, alignItems: 'start', background: '#fff', borderRadius: 8, padding: 6, border: '1px solid #E2E8F0' }}>
            <input value={r.full_name} onChange={(e) => update(r.id, 'full_name', e.target.value)} placeholder="Jane Smith" style={inp} />
            <input value={r.email} onChange={(e) => update(r.id, 'email', e.target.value)} placeholder="jane@email.com" type="email" style={inp} />
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {createdTeams.length === 0
                ? <span style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>Add teams first</span>
                : createdTeams.map((t) => (
                  <button key={t.localId} onClick={() => toggleTeam(r.id, t.localId)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: `1.5px solid ${r.team_ids.includes(t.localId) ? primary : '#E2E8F0'}`, background: r.team_ids.includes(t.localId) ? `${primary}15` : '#fff', color: r.team_ids.includes(t.localId) ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t.name}
                  </button>
                ))
              }
            </div>
            <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#CBD5E1', display: 'flex', alignItems: 'center', marginTop: 6 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => setRows((p) => [...p, { id: uid(), full_name: '', email: '', team_ids: [] }])} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1.5px dashed #E2E8F0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Plus size={14} /> Add coach
      </button>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onSkip} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
          Skip for now
        </button>
        <button onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 0', background: primary, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Sending invites…' : validCount > 0 ? `Invite ${validCount} coach${validCount !== 1 ? 'es' : ''} →` : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

// ── Step 3 — Roster ───────────────────────────────────────────────────────────

function Step3({ primary, createdTeams, onDone, onSkip }: {
  primary: string; createdTeams: CreatedTeam[]; onDone: (rows: PRow[]) => void; onSkip: () => void;
}) {
  const { profile, teams: existingTeams } = useDashboard();
  const allTeams = createdTeams.length > 0 ? createdTeams : existingTeams.map((t) => ({ localId: t.id, dbId: t.id, name: t.name }));

  const [rows, setRows]     = useState<PRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving]  = useState(false);
  const [phase, setPhase]    = useState<'upload' | 'review'>('upload');

  const POSITIONS = ['','Goalkeeper','Defender','Midfielder','Forward','GK','CB','LB','RB','CM','CAM','CDM','LW','RW','ST'];

  async function handleFile(file: File) {
    setParsing(true);
    const payload = await fileToPayload(file);
    const res = await fetch('/api/ai/parse-roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json() as { players?: { full_name: string; jersey_number?: string; position?: string; parent_email?: string; team_name?: string; confidence?: string }[]; error?: string };
    setParsing(false);
    if (data.error || !data.players?.length) { alert(data.error ?? 'No players found.'); return; }
    setRows(data.players.map((p) => ({
      id: uid(),
      full_name: p.full_name ?? '',
      jersey_number: p.jersey_number ?? '',
      position: p.position ?? '',
      parent_email: p.parent_email ?? '',
      local_team_id: p.team_name ? matchTeamId(p.team_name, allTeams) : (allTeams[0]?.localId ?? ''),
      conf: (p.confidence as Conf) ?? 'high',
    })));
    setPhase('review');
  }

  function update(id: string, field: keyof PRow, val: string) {
    setRows((p) => p.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  async function save() {
    const valid = rows.filter((r) => r.full_name.trim());
    if (!valid.length) { onDone([]); return; }
    setSaving(true);
    const teamDbId = (localId: string) => allTeams.find((t) => t.localId === localId)?.dbId ?? localId;
    for (const p of valid) {
      const tId = teamDbId(p.local_team_id);
      if (!tId) continue;
      const { data: pd } = await supabase.from('players').insert({ team_id: tId, full_name: p.full_name.trim(), jersey_number: p.jersey_number ? parseInt(p.jersey_number) : null, position: p.position || null }).select('id').single();
      if (pd && p.parent_email.trim()) {
        await supabase.from('invites').insert({ team_id: tId, player_id: (pd as { id: string }).id, email: p.parent_email.trim(), created_by: profile?.id }).select().single();
      }
    }
    setSaving(false);
    onDone(valid);
  }

  const grouped: Record<string, PRow[]> = {};
  for (const r of rows) {
    const teamName = allTeams.find((t) => t.localId === r.local_team_id)?.name ?? 'Unassigned';
    grouped[teamName] = grouped[teamName] ?? [];
    grouped[teamName].push(r);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {phase === 'upload' && !parsing && (
        <>
          <DropZone onFile={handleFile} primary={primary} label="Drop your roster spreadsheet or PDF" />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onSkip} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Skip for now</button>
            <button onClick={() => { setRows([{ id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '', local_team_id: allTeams[0]?.localId ?? '', conf: 'high' }]); setPhase('review'); }} style={{ flex: 1, padding: '10px 0', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Add manually instead
            </button>
          </div>
        </>
      )}
      {parsing && <Spinner primary={primary} />}

      {phase === 'review' && !parsing && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{rows.length} players</span>
            <button onClick={() => setRows((p) => [...p, { id: uid(), full_name: '', jersey_number: '', position: '', parent_email: '', local_team_id: allTeams[0]?.localId ?? '', conf: 'high' }])} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={12} /> Add row
            </button>
          </div>

          {/* Group by team */}
          {Object.entries(grouped).map(([teamName, tRows]) => (
            <div key={teamName}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>{teamName} · {tRows.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '55px 1fr 110px 1fr 28px', gap: 6, padding: '0 4px', marginBottom: 4 }}>
                {['#','Name','Position','Parent email',''].map((h) => <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const }}>{h}</span>)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                {tRows.map((r) => (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '55px 1fr 110px 1fr 28px', gap: 6, alignItems: 'center', background: r.conf === 'low' ? '#FFF5F5' : r.conf === 'medium' ? '#FFFBEB' : '#fff', borderRadius: 8, padding: '5px 6px', border: `1px solid ${r.conf === 'low' ? '#FCA5A5' : r.conf === 'medium' ? '#FDE68A' : '#E2E8F0'}` }}>
                    <input value={r.jersey_number} onChange={(e) => update(r.id, 'jersey_number', e.target.value)} placeholder="#" style={{ ...inp, textAlign: 'center' as const }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input value={r.full_name} onChange={(e) => update(r.id, 'full_name', e.target.value)} placeholder="Player name" style={inp} />
                      <ConfBadge c={r.conf} />
                    </div>
                    <div style={{ position: 'relative' }}>
                      <select value={r.position} onChange={(e) => update(r.id, 'position', e.target.value)} style={sel}>
                        {POSITIONS.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
                      </select>
                      <ChevronDown size={10} color="#94A3B8" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                    <input value={r.parent_email} onChange={(e) => update(r.id, 'parent_email', e.target.value)} placeholder="parent@email.com" type="email" style={inp} />
                    <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#CBD5E1', display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {allTeams.length > 1 && (
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
              Players are grouped by the team Claude detected. Change a player&apos;s team using the team column if needed.
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onSkip} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Skip for now</button>
            <button onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 0', background: primary, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Adding players…' : `Add ${rows.filter((r) => r.full_name.trim()).length} player${rows.filter((r) => r.full_name.trim()).length !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 4 — Schedule ─────────────────────────────────────────────────────────

function Step4({ primary, createdTeams, onDone, onSkip }: {
  primary: string; createdTeams: CreatedTeam[]; onDone: () => void; onSkip: () => void;
}) {
  const { profile, teams: existingTeams } = useDashboard();
  const allTeams = createdTeams.length > 0 ? createdTeams : existingTeams.map((t) => ({ localId: t.id, dbId: t.id, name: t.name }));

  const [rows, setRows]      = useState<ERow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving]  = useState(false);
  const [phase, setPhase]    = useState<'upload' | 'review'>('upload');

  async function handleFile(file: File) {
    setParsing(true);
    const payload = await fileToPayload(file);
    const res = await fetch('/api/ai/parse-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json() as { events?: { title: string; type?: string; event_date?: string; event_time?: string; location?: string; team_name?: string; confidence?: string }[]; error?: string };
    setParsing(false);
    if (data.error || !data.events?.length) { alert(data.error ?? 'No events found.'); return; }
    setRows(data.events.map((e) => ({
      id: uid(),
      title: e.title ?? '',
      type: e.type ?? 'training',
      event_date: e.event_date ?? '',
      event_time: e.event_time ?? '',
      location: e.location ?? '',
      local_team_id: e.team_name ? matchTeamId(e.team_name, allTeams) : (allTeams[0]?.localId ?? ''),
      conf: (e.confidence as Conf) ?? 'high',
    })));
    setPhase('review');
  }

  function update(id: string, field: keyof ERow, val: string) {
    setRows((p) => p.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }

  async function save() {
    const valid = rows.filter((r) => r.title.trim() && r.event_date);
    if (!valid.length) { onDone(); return; }
    setSaving(true);
    const teamDbId = (localId: string) => allTeams.find((t) => t.localId === localId)?.dbId ?? localId;
    for (const e of valid) {
      const tId = teamDbId(e.local_team_id);
      if (!tId) continue;
      await supabase.from('events').insert({ team_id: tId, title: e.title.trim(), type: e.type, event_date: e.event_date, event_time: e.event_time || null, location: e.location || null, created_by: profile?.id });
    }
    setSaving(false);
    onDone();
  }

  const validCount = rows.filter((r) => r.title.trim() && r.event_date).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {phase === 'upload' && !parsing && (
        <>
          <DropZone onFile={handleFile} primary={primary} label="Drop your season schedule (PDF, image, or CSV)" />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onSkip} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Skip for now</button>
            <button onClick={() => { setRows([{ id: uid(), title: '', type: 'training', event_date: '', event_time: '', location: '', local_team_id: allTeams[0]?.localId ?? '', conf: 'high' }]); setPhase('review'); }} style={{ flex: 1, padding: '10px 0', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              Add manually instead
            </button>
          </div>
        </>
      )}
      {parsing && <Spinner primary={primary} />}

      {phase === 'review' && !parsing && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{rows.length} events</span>
            <button onClick={() => setRows((p) => [...p, { id: uid(), title: '', type: 'training', event_date: '', event_time: '', location: '', local_team_id: allTeams[0]?.localId ?? '', conf: 'high' }])} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={12} /> Add row
            </button>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 1fr 90px 1fr' + (allTeams.length > 1 ? ' 110px' : '') + ' 28px', gap: 6, padding: '0 4px' }}>
            {['Date','Time','Title','Type','Location', ...(allTeams.length > 1 ? ['Team'] : []),''].map((h) => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const }}>{h}</span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '120px 80px 1fr 90px 1fr' + (allTeams.length > 1 ? ' 110px' : '') + ' 28px', gap: 6, alignItems: 'center', background: r.conf === 'low' ? '#FFF5F5' : r.conf === 'medium' ? '#FFFBEB' : '#fff', borderRadius: 8, padding: '5px 6px', border: `1px solid ${r.conf === 'low' ? '#FCA5A5' : r.conf === 'medium' ? '#FDE68A' : '#E2E8F0'}` }}>
                <input value={r.event_date} onChange={(e) => update(r.id, 'event_date', e.target.value)} type="date" style={inp} />
                <input value={r.event_time} onChange={(e) => update(r.id, 'event_time', e.target.value)} type="time" style={inp} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input value={r.title} onChange={(e) => update(r.id, 'title', e.target.value)} placeholder="Event title" style={inp} />
                  <ConfBadge c={r.conf} />
                </div>
                <div style={{ position: 'relative' }}>
                  <select value={r.type} onChange={(e) => update(r.id, 'type', e.target.value)} style={sel}>
                    <option value="game">Game</option>
                    <option value="training">Training</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown size={10} color="#94A3B8" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>
                <input value={r.location} onChange={(e) => update(r.id, 'location', e.target.value)} placeholder="Location" style={inp} />
                {allTeams.length > 1 && (
                  <div style={{ position: 'relative' }}>
                    <select value={r.local_team_id} onChange={(e) => update(r.id, 'local_team_id', e.target.value)} style={sel}>
                      <option value="">—</option>
                      {allTeams.map((t) => <option key={t.localId} value={t.localId}>{t.name}</option>)}
                    </select>
                    <ChevronDown size={10} color="#94A3B8" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                )}
                <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#CBD5E1', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onSkip} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Skip for now</button>
            <button onClick={save} disabled={saving || validCount === 0} style={{ flex: 1, padding: '10px 0', background: validCount > 0 ? primary : '#CBD5E1', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: validCount > 0 && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating events…' : `Create ${validCount} event${validCount !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 5 — Done + Parent Invites ────────────────────────────────────────────

function Step5({ primary, savedPlayers, onClose }: { primary: string; savedPlayers: PRow[]; onClose: () => void }) {
  const { club } = useDashboard();
  const parents   = savedPlayers.filter((p) => p.parent_email.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set(parents.map((p) => p.id)));
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);

  async function sendInvites() {
    const toSend = parents.filter((p) => selected.has(p.id));
    if (!toSend.length || !club) return;
    setSending(true);
    const emails = toSend.map((p) => p.parent_email.trim()).filter(Boolean);
    if (emails.length) {
      const { data: invRows } = await supabase.from('invites').select('id, email, players(full_name)').in('email', emails);
      for (const inv of (invRows ?? []) as unknown as { id: string; email: string; players: { full_name: string } | null }[]) {
        await fetch('/api/send-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite_id: inv.id, player_name: inv.players?.full_name ?? null }) });
      }
    }
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Your club is live!</div>
        <div style={{ fontSize: 14, color: '#64748B', marginBottom: 28 }}>Invite emails sent. Parents will download the app and join automatically.</div>
        <button onClick={onClose} style={{ background: primary, color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Go to dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#15803D', marginBottom: 4 }}>🎉 Club is set up!</div>
        <div style={{ fontSize: 13, color: '#166534' }}>You can always add more teams, players, and events from the dashboard.</div>
      </div>

      {parents.length > 0 ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Send parent invites ({parents.length})</div>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
            These parents were found in your roster. They&apos;ll receive an email with a link to download the Pulse FC app and join their child&apos;s team.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
            {parents.map((p) => (
              <div key={p.id} onClick={() => setSelected((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${selected.has(p.id) ? primary : '#E2E8F0'}`, background: selected.has(p.id) ? `${primary}08` : '#fff', cursor: 'pointer' }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${selected.has(p.id) ? primary : '#CBD5E1'}`, background: selected.has(p.id) ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.has(p.id) && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{p.full_name}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{p.parent_email}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>Skip invites</button>
            <button onClick={sendInvites} disabled={sending || selected.size === 0} style={{ flex: 1, padding: '10px 0', background: selected.size > 0 ? primary : '#CBD5E1', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: selected.size > 0 && !sending ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: sending ? 0.7 : 1 }}>
              {sending ? 'Sending…' : `Send ${selected.size} invite${selected.size !== 1 ? 's' : ''} 📧`}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: primary, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Go to dashboard →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function SetupWizard({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const { club } = useDashboard();
  const primary  = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [step, setStep]               = useState(Math.max(0, Math.min(initialStep, 5)));
  const [createdTeams, setCreatedTeams] = useState<CreatedTeam[]>([]);
  const [savedPlayers, setSavedPlayers] = useState<PRow[]>([]);

  const titles = [
    'Club branding',
    'Your teams',
    'Coaches',
    'Player roster',
    'Season schedule',
    'All done!',
  ];
  const descs = [
    'Set your logo and brand colour — this appears throughout the app.',
    'Add your teams manually or upload a document and let AI do the work.',
    'Add your coaching staff. We\'ll send them an email invite.',
    'Upload your roster spreadsheet and Claude will map the columns automatically.',
    'Upload your season schedule — PDF, image, or spreadsheet. Skippable.',
    'Your club is live. Optionally send parent invite emails now.',
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 3 }}>
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>{titles[step]}</h2>
              <p style={{ fontSize: 13, color: '#64748B', margin: '3px 0 0' }}>{descs[step]}</p>
            </div>
            <button onClick={onClose} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X size={16} color="#64748B" />
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? primary : '#E2E8F0', transition: 'background 0.3s' }} />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
          {step === 0 && <Step0 primary={primary} onDone={() => setStep(1)} />}
          {step === 1 && <Step1 primary={primary} createdTeams={createdTeams} setCreatedTeams={setCreatedTeams} onDone={() => setStep(2)} onSkip={() => setStep(2)} />}
          {step === 2 && <Step2 primary={primary} createdTeams={createdTeams} onDone={() => setStep(3)} onSkip={() => setStep(3)} />}
          {step === 3 && <Step3 primary={primary} createdTeams={createdTeams} onDone={(rows) => { setSavedPlayers(rows); setStep(4); }} onSkip={() => setStep(4)} />}
          {step === 4 && <Step4 primary={primary} createdTeams={createdTeams} onDone={() => setStep(5)} onSkip={() => setStep(5)} />}
          {step === 5 && <Step5 primary={primary} savedPlayers={savedPlayers} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
