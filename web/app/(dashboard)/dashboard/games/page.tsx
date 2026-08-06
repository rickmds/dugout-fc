'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X, Trash2, RefreshCw, Undo2, Redo2, Pencil, GripVertical, Upload } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type GameSlot = {
  id: string; club_id: string; field_name: string;
  slot_date: string; start_time: string; end_time: string;
  home_team_id: string | null; away_team: string | null;
  age_group: string | null; game_format: string | null;
  status: 'open' | 'assigned' | 'cancelled'; notes: string | null;
  home_team?: { name: string; age_group: string | null } | null;
};

type Team      = { id: string; name: string; age_group: string | null; };
type Column    = { field: FieldDef; sub: 'A' | 'B' | null; slotName: string };
type FieldDef = { id: string; name: string; sort_order: number; field_group: string | null; is_full_field: boolean; sub_zones: string[] | null; scheduler_split: number; scheduler_format: string; is_active: boolean; half_a_name: string | null; half_b_name: string | null; has_lights: boolean; surface_type: string | null; field_notes: string | null; };
type Permit  = { id: string; field_name: string; rule_date: string | null; unavailable_from: string; unavailable_until: string; };
type SlotSnapshot = Pick<GameSlot, 'id' | 'field_name' | 'slot_date' | 'start_time' | 'end_time' | 'home_team_id' | 'away_team' | 'age_group' | 'game_format' | 'notes' | 'status'>;
type UndoEntry    = { label: string; before: SlotSnapshot[] };

type PendingGame = {
  id: string; club_id: string; game_date: string;
  age_group: string | null; gender: string | null;
  our_team: string | null; opponent: string;
  league: string | null; notes: string | null;
  raw_data: unknown; slot_id: string | null;
  status: 'unscheduled' | 'scheduled'; created_at: string;
};

// ── Format presets ────────────────────────────────────────────────────────────

const FORMAT_PRESETS = [
  { value: '7v7',   label: '7v7',   mins: 90,  display: '90 min' },
  { value: '9v9',   label: '9v9',   mins: 105, display: '1h 45m' },
  { value: '11v11', label: '11v11', mins: 120, display: '2h' },
] as const;
type FormatValue = typeof FORMAT_PRESETS[number]['value'];

function minsForFormat(fmt: string | null, fallback: number): number {
  return FORMAT_PRESETS.find(f => f.value === fmt)?.mins ?? fallback;
}

function formatForAgeGroup(ageGroup: string | null | undefined): FormatValue | null {
  if (!ageGroup) return null;
  const match = ageGroup.match(/(\d+)/);
  if (!match) return null;
  const age = parseInt(match[1], 10);
  if (age <= 10) return '7v7';
  if (age <= 12) return '9v9';
  return '11v11';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToTime(mins: number) { return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; }
function fmtT(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; }

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px', borderRadius: '8px',
  border: '1.5px solid #E2E8F0', fontSize: '13px', color: '#0F172A',
  background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const lbl = (t: string) => (
  <label style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', letterSpacing: '1.5px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>{t}</label>
);

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GamesPage() {
  const { club } = useDashboard();
  const primary = club?.primary_color && club.primary_color !== '#000000' ? club.primary_color : '#22C55E';

  const [slots,        setSlots]        = useState<GameSlot[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [fields,       setFields]       = useState<FieldDef[]>([]);
  const [permits,      setPermits]      = useState<Permit[]>([]);
  const [blockRules,   setBlockRules]   = useState<Permit[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filling,      setFilling]      = useState(false);
  const [editSlot,       setEditSlot]       = useState<GameSlot | null>(null);
  const [fieldEditTarget, setFieldEditTarget] = useState<FieldDef | null>(null);
  const [showRefresh,  setShowRefresh]  = useState(false);
  const [defaultFmt,   setDefaultFmt]   = useState<FormatValue>('7v7');

  // Pending / unscheduled games
  const [pendingGames,    setPendingGames]    = useState<PendingGame[]>([]);
  const [selectedPending, setSelectedPending] = useState<PendingGame | null>(null);
  const [pendingToAssign, setPendingToAssign] = useState<PendingGame | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [panelOpen,       setPanelOpen]       = useState(true);

  const defaultMins = FORMAT_PRESETS.find(f => f.value === defaultFmt)?.mins ?? 90;

  // Undo / redo
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const [undoLen,    setUndoLen]    = useState(0);
  const [redoLen,    setRedoLen]    = useState(0);
  const slotsRef    = useRef<GameSlot[]>([]);
  const preEditRef  = useRef<UndoEntry | null>(null);
  const undoFn      = useRef(async () => {});
  const redoFn      = useRef(async () => {});

  useEffect(() => { slotsRef.current = slots; }, [slots]);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!club) return;
    const [{ data: sl }, { data: tm }, { data: fi }, { data: pe }, { data: bl }, { data: pg }] = await Promise.all([
      supabase.from('game_slots').select('*, home_team:teams(name, age_group)').eq('club_id', club.id).order('slot_date').order('start_time'),
      supabase.from('teams').select('id, name, age_group').eq('club_id', club.id).order('name'),
      supabase.from('tryout_fields').select('id, name, sort_order, field_group, is_full_field, sub_zones, scheduler_split, scheduler_format, is_active, half_a_name, half_b_name, has_lights, surface_type, field_notes').eq('club_id', club.id).order('sort_order').order('name'),
      supabase.from('field_availability_rules').select('id, field_name, rule_date, unavailable_from, unavailable_until').eq('club_id', club.id).eq('rule_type', 'permit').not('rule_date', 'is', null),
      supabase.from('field_availability_rules').select('id, field_name, rule_date, unavailable_from, unavailable_until').eq('club_id', club.id).eq('rule_type', 'block').not('rule_date', 'is', null),
      supabase.from('pending_games').select('*').eq('club_id', club.id).order('game_date').order('created_at'),
    ]);
    setSlots((sl ?? []) as GameSlot[]);
    setTeams((tm ?? []) as Team[]);
    setFields((fi ?? []) as FieldDef[]);
    setPermits((pe ?? []) as Permit[]);
    setBlockRules((bl ?? []) as Permit[]);
    setPendingGames((pg ?? []) as PendingGame[]);
    setLoading(false);
    return { slots: sl ?? [], permits: pe ?? [] };
  }, [club]);

  useEffect(() => { load(); }, [load]);

  // Auto-fill on first load when there are permits but no slots yet
  const autoFilled = useRef(false);
  useEffect(() => {
    if (loading || autoFilled.current) return;
    if (permits.length > 0 && slots.length === 0 && club) {
      autoFilled.current = true;
      doFill(permits, [], defaultFmt, true);
    }
  }, [loading, permits.length, slots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dedup: if the DB has duplicate slots (same field+date+time), clean them up silently
  useEffect(() => {
    if (!club || slots.length === 0) return;
    const seen = new Set<string>();
    const toDelete: string[] = [];
    // Sort assigned first so we keep those and delete open duplicates
    const sorted = [...slots].sort((a, b) =>
      a.status === 'assigned' && b.status !== 'assigned' ? -1 :
      b.status === 'assigned' && a.status !== 'assigned' ? 1 : 0
    );
    for (const s of sorted) {
      const key = `${s.field_name}|${s.slot_date}|${s.start_time}`;
      if (seen.has(key)) toDelete.push(s.id);
      else seen.add(key);
    }
    if (toDelete.length === 0) return;
    async function cleanup() {
      for (let i = 0; i < toDelete.length; i += 100) {
        await supabase.from('game_slots').delete().in('id', toDelete.slice(i, i + 100));
      }
      load();
    }
    cleanup();
  }, [slots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill / Refresh ─────────────────────────────────────────────────────

  function isSlotBlocked(fieldName: string, date: string, slotStart: number, slotEnd: number): boolean {
    return blockRules.some(b =>
      b.rule_date === date &&
      b.field_name === fieldName &&
      toMins(b.unavailable_from) < slotEnd &&
      toMins(b.unavailable_until) > slotStart
    );
  }

  async function doFill(allPermits: Permit[], existingSlots: GameSlot[], format: FormatValue, silent = false) {
    if (!club) return 0;
    if (!silent) setFilling(true);

    const mins = FORMAT_PRESETS.find(f => f.value === format)?.mins ?? 90;

    // Dedup check per exact slot (field + date + start_time) — prevents any duplicate insertions
    const existingKeys = new Set(existingSlots.map(s => `${s.field_name}|${s.slot_date}|${s.start_time}`));

    const rows: object[] = [];
    for (const p of allPermits) {
      if (!p.rule_date) continue;

      const field = fields.find(f => f.name === p.field_name);
      if (field && field.is_active === false) continue; // skip paused fields
      const split = field?.scheduler_split ?? 1;
      let cur = toMins(p.unavailable_from);
      const end = toMins(p.unavailable_until);

      if (split === 2) {
        while (cur + mins <= end) {
          const t = minsToTime(cur);
          // Skip any time window covered by a block rule
          if (!isSlotBlocked(p.field_name, p.rule_date, cur, cur + mins)) {
            if (!existingKeys.has(`${p.field_name} [A]|${p.rule_date}|${t}`)) {
              rows.push({ club_id: club.id, field_name: `${p.field_name} [A]`, slot_date: p.rule_date, start_time: t, end_time: minsToTime(cur + mins), game_format: format, status: 'open' });
              existingKeys.add(`${p.field_name} [A]|${p.rule_date}|${t}`);
            }
            if (!existingKeys.has(`${p.field_name} [B]|${p.rule_date}|${t}`)) {
              rows.push({ club_id: club.id, field_name: `${p.field_name} [B]`, slot_date: p.rule_date, start_time: t, end_time: minsToTime(cur + mins), game_format: format, status: 'open' });
              existingKeys.add(`${p.field_name} [B]|${p.rule_date}|${t}`);
            }
          }
          cur += mins;
        }
      } else {
        while (cur + mins <= end) {
          const t = minsToTime(cur);
          if (!isSlotBlocked(p.field_name, p.rule_date, cur, cur + mins) &&
              !existingKeys.has(`${p.field_name}|${p.rule_date}|${t}`)) {
            rows.push({ club_id: club.id, field_name: p.field_name, slot_date: p.rule_date, start_time: t, end_time: minsToTime(cur + mins), game_format: format, status: 'open' });
            existingKeys.add(`${p.field_name}|${p.rule_date}|${t}`);
          }
          cur += mins;
        }
      }
    }

    if (rows.length > 0) await supabase.from('game_slots').insert(rows);
    await load();
    if (!silent) setFilling(false);
    return rows.length;
  }

  // Unified field editor — handles name rename, format change, split toggle, and all field details
  async function editField(field: FieldDef, changes: { name?: string; format?: string; split?: number; active?: boolean; halfAName?: string | null; halfBName?: string | null; hasLights?: boolean; surfaceType?: string | null; fieldNotes?: string | null; }) {
    if (!club) return;
    const oldName  = field.name;
    const newName  = changes.name?.trim() || oldName;
    const newFmt   = changes.format  ?? field.scheduler_format;
    const newSplit = changes.split   ?? field.scheduler_split;

    const dbUpd: Record<string, unknown> = {};
    if (newName  !== oldName)                    dbUpd.name             = newName;
    if (newFmt   !== field.scheduler_format)     dbUpd.scheduler_format = newFmt;
    if (newSplit !== field.scheduler_split)      dbUpd.scheduler_split  = newSplit;
    if (changes.active !== undefined && changes.active !== field.is_active) dbUpd.is_active = changes.active;
    if (changes.halfAName !== undefined)  dbUpd.half_a_name  = changes.halfAName;
    if (changes.halfBName !== undefined)  dbUpd.half_b_name  = changes.halfBName;
    if (changes.hasLights !== undefined)  dbUpd.has_lights   = changes.hasLights;
    if (changes.surfaceType !== undefined) dbUpd.surface_type = changes.surfaceType;
    if (changes.fieldNotes !== undefined) dbUpd.field_notes  = changes.fieldNotes;
    if (Object.keys(dbUpd).length) {
      await supabase.from('tryout_fields').update(dbUpd).eq('id', field.id);
    }

    // Rename slots and permits if field name changed
    if (newName !== oldName) {
      await Promise.all([
        supabase.from('game_slots').update({ field_name: newName }).eq('club_id', club.id).eq('field_name', oldName),
        supabase.from('game_slots').update({ field_name: `${newName} [A]` }).eq('club_id', club.id).eq('field_name', `${oldName} [A]`),
        supabase.from('game_slots').update({ field_name: `${newName} [B]` }).eq('club_id', club.id).eq('field_name', `${oldName} [B]`),
        supabase.from('field_availability_rules').update({ field_name: newName }).eq('club_id', club.id).eq('field_name', oldName),
        supabase.from('field_closures').update({ field_name: newName }).eq('club_id', club.id).eq('field_name', oldName),
      ]);
    }

    const splitChanged  = newSplit !== field.scheduler_split;
    const formatChanged = newFmt   !== field.scheduler_format;

    if (splitChanged || formatChanged) {
      const variants = [newName, `${newName} [A]`, `${newName} [B]`];
      if (splitChanged) {
        // Split change — delete ALL slots (assigned slots become invalid in the new layout)
        await supabase.from('game_slots').delete().eq('club_id', club.id).in('field_name', variants);
      } else {
        // Format-only change — keep assigned slots, only regenerate open ones
        await supabase.from('game_slots').delete().eq('club_id', club.id).eq('status', 'open').in('field_name', variants);
      }

      const fieldPermits = permits.filter(p => p.field_name === oldName && p.rule_date);
      const mins = FORMAT_PRESETS.find(f => f.value === newFmt)?.mins ?? 90;
      const rows: object[] = [];
      for (const p of fieldPermits) {
        if (!p.rule_date) continue;
        let cur = toMins(p.unavailable_from);
        const end = toMins(p.unavailable_until);
        if (newSplit === 2) {
          while (cur + mins <= end) {
            rows.push({ club_id: club.id, field_name: `${newName} [A]`, slot_date: p.rule_date, start_time: minsToTime(cur), end_time: minsToTime(cur + mins), game_format: newFmt, status: 'open' });
            rows.push({ club_id: club.id, field_name: `${newName} [B]`, slot_date: p.rule_date, start_time: minsToTime(cur), end_time: minsToTime(cur + mins), game_format: newFmt, status: 'open' });
            cur += mins;
          }
        } else {
          while (cur + mins <= end) {
            rows.push({ club_id: club.id, field_name: newName, slot_date: p.rule_date, start_time: minsToTime(cur), end_time: minsToTime(cur + mins), game_format: newFmt, status: 'open' });
            cur += mins;
          }
        }
      }
      if (rows.length) await supabase.from('game_slots').insert(rows);
    }

    setFields(prev => prev.map(f => f.id === field.id ? {
      ...f, name: newName, scheduler_format: newFmt, scheduler_split: newSplit,
      is_active:    changes.active     !== undefined ? changes.active     : f.is_active,
      half_a_name:  changes.halfAName  !== undefined ? changes.halfAName  : f.half_a_name,
      half_b_name:  changes.halfBName  !== undefined ? changes.halfBName  : f.half_b_name,
      has_lights:   changes.hasLights  !== undefined ? changes.hasLights  : f.has_lights,
      surface_type: changes.surfaceType !== undefined ? changes.surfaceType : f.surface_type,
      field_notes:  changes.fieldNotes !== undefined ? changes.fieldNotes : f.field_notes,
    } : f));
    await load();
  }

  // Reorder fields by drag-and-drop — updates sort_order in DB
  async function reorderFields(newOrder: FieldDef[]) {
    setFields(newOrder); // optimistic
    await Promise.all(newOrder.map((f, i) => supabase.from('tryout_fields').update({ sort_order: i }).eq('id', f.id)));
  }

  // ── Cascade chain ───────────────────────────────────────────────────────────
  // After a game is assigned/updated, shift every subsequent slot in that field+date
  // so next KO = previous game's end time.

  async function cascadeChain(fieldName: string, slotDate: string, changedStartTime: string, changedEndTime: string) {
    // Strip [A]/[B] suffix to find the parent permit ceiling
    const baseFieldName = fieldName.replace(/ \[A\]$| \[B\]$/, '');
    const permit = permits.find(p => p.field_name === baseFieldName && p.rule_date === slotDate);
    const permitEndMins = permit ? toMins(permit.unavailable_until) : 24 * 60;

    // Get all slots that were originally scheduled AFTER the changed slot
    const { data: later } = await supabase
      .from('game_slots')
      .select('id, game_format')
      .eq('field_name', fieldName)
      .eq('slot_date', slotDate)
      .gt('start_time', changedStartTime) // strictly after — excludes the saved slot
      .order('start_time');

    if (!later?.length) return;

    let cur = toMins(changedEndTime);
    const updates: { id: string; start_time: string; end_time: string }[] = [];
    const deletes: string[] = [];

    for (const slot of later) {
      const slotMins = minsForFormat(slot.game_format, defaultMins);
      if (cur >= permitEndMins || cur + slotMins > permitEndMins) {
        // Squeezed beyond the permit window — remove the slot
        deletes.push(slot.id);
        continue;
      }
      updates.push({ id: slot.id, start_time: minsToTime(cur), end_time: minsToTime(cur + slotMins) });
      cur += slotMins;
    }

    await Promise.all([
      ...updates.map(u => supabase.from('game_slots').update({ start_time: u.start_time, end_time: u.end_time }).eq('id', u.id)),
      ...deletes.map(id => supabase.from('game_slots').delete().eq('id', id)),
    ]);
  }

  // ── Undo / redo ─────────────────────────────────────────────────────────────

  function snapSlot(s: GameSlot): SlotSnapshot {
    return { id: s.id, field_name: s.field_name, slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time, home_team_id: s.home_team_id, away_team: s.away_team, age_group: s.age_group, game_format: s.game_format, notes: s.notes, status: s.status };
  }

  function currentStateOf(snaps: SlotSnapshot[]): SlotSnapshot[] {
    return snaps.map(s => { const cur = slotsRef.current.find(c => c.id === s.id); return cur ? snapSlot(cur) : s; });
  }

  async function restoreSnapshot(snaps: SlotSnapshot[]) {
    await Promise.all(snaps.map(s => supabase.from('game_slots').update({ start_time: s.start_time, end_time: s.end_time, home_team_id: s.home_team_id, away_team: s.away_team, age_group: s.age_group, game_format: s.game_format, notes: s.notes, status: s.status }).eq('id', s.id)));
    await load();
  }

  async function undo() {
    if (!undoStackRef.current.length) return;
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    redoStackRef.current = [...redoStackRef.current.slice(-9), { label: entry.label, before: currentStateOf(entry.before) }];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setUndoLen(undoStackRef.current.length);
    setRedoLen(redoStackRef.current.length);
    await restoreSnapshot(entry.before);
  }

  async function redo() {
    if (!redoStackRef.current.length) return;
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    undoStackRef.current = [...undoStackRef.current.slice(-9), { label: entry.label, before: currentStateOf(entry.before) }];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setUndoLen(undoStackRef.current.length);
    setRedoLen(redoStackRef.current.length);
    await restoreSnapshot(entry.before);
  }

  // Keep fn refs current so the keyboard listener always calls the latest version
  useEffect(() => { undoFn.current = undo; redoFn.current = redo; });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoFn.current(); }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redoFn.current(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line

  // Capture pre-edit snapshot whenever the user opens a slot
  useEffect(() => {
    if (!editSlot) return;
    const sm = editSlot.field_name.match(/^(.+) \[([AB])\]$/);
    const fieldNames = sm ? [`${sm[1]} [A]`, `${sm[1]} [B]`] : [editSlot.field_name];
    preEditRef.current = {
      label: editSlot.status === 'assigned' ? 'Edit game' : 'Assign game',
      before: slots.filter(s => fieldNames.includes(s.field_name) && s.slot_date === editSlot.slot_date).map(snapSlot),
    };
  }, [editSlot]); // eslint-disable-line

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function removeSlot(id: string) {
    await supabase.from('game_slots').delete().eq('id', id);
    setSlots(p => p.filter(s => s.id !== id));
    setEditSlot(null);
  }

  function isBlocked(slot: GameSlot): boolean {
    const f = fields.find(x => x.name === slot.field_name);
    if (!f?.field_group) return false;
    const grp = fields.filter(x => x.field_group === f.field_group && x.name !== f.name);
    const slotStart = toMins(slot.start_time);
    const slotEnd   = toMins(slot.end_time);
    // Two slots conflict if their time ranges overlap (not just share a start time)
    function overlaps(s: GameSlot) {
      return s.slot_date === slot.slot_date && s.status === 'assigned'
        && toMins(s.start_time) < slotEnd && toMins(s.end_time) > slotStart;
    }
    if (f.is_full_field) {
      // Full field blocked if any sub-zone has an overlapping assigned game
      return grp.filter(x => !x.is_full_field).some(sub => slots.some(s => s.field_name === sub.name && overlaps(s)));
    }
    // Sub-zone blocked if the full field has an overlapping assigned game
    const full = grp.find(x => x.is_full_field);
    return !!full && slots.some(s => s.field_name === full.name && overlaps(s));
  }

  function exportCSV() {
    const rows: string[][] = [
      ['Date', 'Day', 'Start', 'End', 'Field', 'Home', 'Away', 'Age Group', 'Format'],
      ...slots.filter(s => s.status === 'assigned').map(s => {
        const d = new Date(s.slot_date + 'T12:00:00');
        return [s.slot_date, d.toLocaleDateString('en-US', { weekday: 'long' }), fmtT(s.start_time), fmtT(s.end_time), s.field_name, s.home_team?.name ?? '', s.away_team ?? '', s.age_group ?? '', s.game_format ?? ''];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `games-${club?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'schedule'}.csv`;
    a.click();
  }

  // ── Slot click — intercepts open slots when a pending game is selected ────────

  function handleSlotClick(slot: GameSlot) {
    if (selectedPending && slot.status === 'open') {
      // Try to match our_team free text to an actual team in the DB
      let matchedTeamId: string | null = null;
      if (selectedPending.our_team) {
        const needle = selectedPending.our_team.toLowerCase().trim();
        const match = teams.find(t => {
          const hay = t.name.toLowerCase().trim();
          return hay === needle || hay.includes(needle) || needle.includes(hay);
        });
        matchedTeamId = match?.id ?? null;
      }
      const enriched: GameSlot = {
        ...slot,
        away_team: selectedPending.opponent,
        age_group: selectedPending.age_group ?? slot.age_group,
        home_team_id: matchedTeamId ?? slot.home_team_id,
      };
      setPendingToAssign(selectedPending);
      setEditSlot(enriched);
    } else {
      setPendingToAssign(null);
      setEditSlot(slot);
    }
  }

  // ── Grid data ────────────────────────────────────────────────────────────────

  const sortedDates  = [...new Set(slots.map(s => s.slot_date))].sort();
  // Show all fields — fields that temporarily lose slots (e.g. after split change) still appear
  const columns: Column[] = fields.flatMap<Column>(f =>
    f.scheduler_split === 2
      ? [{ field: f, sub: 'A' as const, slotName: `${f.name} [A]` }, { field: f, sub: 'B' as const, slotName: `${f.name} [B]` }]
      : [{ field: f, sub: null, slotName: f.name }]
  );

  function slotsFor(date: string, fn: string) {
    // Sort assigned before open so dedup keeps the assigned slot when there are duplicates
    const ordered = slots
      .filter(s => s.slot_date === date && s.field_name === fn)
      .sort((a, b) =>
        a.status === 'assigned' && b.status !== 'assigned' ? -1 :
        b.status === 'assigned' && a.status !== 'assigned' ? 1 :
        a.start_time.localeCompare(b.start_time)
      );
    const seen = new Set<string>();
    return ordered
      .filter(s => { if (seen.has(s.start_time)) return false; seen.add(s.start_time); return true; })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const assigned    = slots.filter(s => s.status === 'assigned').length;
  const open        = slots.filter(s => s.status === 'open').length;
  const unscheduled = pendingGames.filter(g => g.status === 'unscheduled').length;

  if (loading) return <div style={{ padding: '48px', color: '#94A3B8', fontSize: '14px' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', background: '#fff', borderBottom: `3px solid ${primary}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Club</div>
            <h1 style={{ fontSize: '22px', fontWeight: '900', color: '#0D1117', margin: '2px 0 0', letterSpacing: '-0.5px' }}>Game Scheduler</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {slots.length > 0 && (
              <div style={{ fontSize: '12px', color: '#64748B', marginRight: '4px' }}>
                <strong style={{ color: primary }}>{assigned}</strong> assigned · <strong style={{ color: '#94A3B8' }}>{open}</strong> open
              </div>
            )}
            {undoLen > 0 && (
              <button onClick={undo} title="Undo (⌘Z)" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', borderRadius: '8px', background: '#F1F5F9', color: '#374151', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Undo2 size={13}/> Undo
              </button>
            )}
            {redoLen > 0 && (
              <button onClick={redo} title="Redo (⌘⇧Z)" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 12px', borderRadius: '8px', background: '#F1F5F9', color: '#374151', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Redo2 size={13}/> Redo
              </button>
            )}
            {assigned > 0 && (
              <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#F1F5F9', color: '#374151', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Download size={13}/> Export CSV
              </button>
            )}
            {unscheduled > 0 && (
              <button onClick={() => setPanelOpen(p => !p)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: panelOpen ? `${primary}15` : '#FEF3C7', color: panelOpen ? primary : '#92400E', border: `1px solid ${panelOpen ? `${primary}40` : '#FDE68A'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                ⚽ {unscheduled} unscheduled
              </button>
            )}
            <button onClick={() => setImportModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#F1F5F9', color: '#374151', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Upload size={13}/> Import Schedule
            </button>
            <button onClick={() => setShowRefresh(true)} disabled={filling}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: filling ? '#F1F5F9' : primary, color: filling ? '#94A3B8' : '#fff', border: 'none', fontSize: '13px', fontWeight: '700', cursor: filling ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              <RefreshCw size={13} style={{ animation: filling ? 'spin 1s linear infinite' : 'none' }}/>
              {filling ? 'Filling…' : 'Refresh from permits'}
            </button>
          </div>
        </div>
      </div>

      {/* Body — flex row: optional pending panel on left, grid area on right */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>

        {/* Pending games panel */}
        {panelOpen && pendingGames.length > 0 && (
          <PendingPanel
            games={pendingGames} selected={selectedPending} primary={primary}
            onSelect={g => { setSelectedPending(g); if (!g) setPendingToAssign(null); }}
            onClose={() => setPanelOpen(false)}
            onDelete={async id => {
              await supabase.from('pending_games').delete().eq('id', id);
              setPendingGames(p => p.filter(g => g.id !== id));
              if (selectedPending?.id === id) { setSelectedPending(null); setPendingToAssign(null); }
            }}
          />
        )}

        {/* Grid area */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Assignment banner — shown when a pending game is selected */}
          {selectedPending && (
            <div style={{ flexShrink: 0, padding: '8px 20px', background: `${primary}12`, borderBottom: `2px solid ${primary}40`, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px' }}>⚽</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>Click an open slot to assign: </span>
                <span style={{ fontSize: '13px', fontWeight: '800', color: primary }}>vs {selectedPending.opponent}</span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {selectedPending.age_group ? ` · ${selectedPending.age_group}` : ''}
                  {' · '}{new Date(selectedPending.game_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <button onClick={() => { setSelectedPending(null); setPendingToAssign(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px', borderRadius: '6px', display: 'flex' }}>
                <X size={14}/>
              </button>
            </div>
          )}

          {slots.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', maxWidth: '400px', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', marginBottom: '8px' }}>
                  {permits.length === 0 ? 'No permits imported yet' : 'Setting up schedule…'}
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
                  {permits.length === 0
                    ? 'Import your field permits on the Fields page first.'
                    : 'Filling time slots from your permits — this only takes a moment.'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <div style={{ padding: '20px 24px 24px', minWidth: 'max-content' }}>
              <ScheduleGrid
                sortedDates={sortedDates} columns={columns}
                slotsFor={slotsFor} isBlocked={isBlocked}
                onSlotClick={handleSlotClick} onOpenFieldEdit={setFieldEditTarget} onReorderFields={reorderFields}
                primary={primary} allSlots={slots}
              />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import schedule modal */}
      {importModalOpen && club && (
        <ImportModal
          club={club} primary={primary}
          onClose={() => setImportModalOpen(false)}
          onImported={games => {
            setPendingGames(p => [...p, ...games]);
            setPanelOpen(true);
            setImportModalOpen(false);
          }}
        />
      )}

      {/* Refresh modal */}
      {showRefresh && (
        <RefreshModal
          permits={permits} slots={slots} fields={fields} primary={primary}
          defaultFmt={defaultFmt} setDefaultFmt={setDefaultFmt}
          onClose={() => setShowRefresh(false)}
          onFill={async (fmt) => { setShowRefresh(false); await doFill(permits, slots, fmt); }}
        />
      )}

      {/* Field edit modal */}
      {fieldEditTarget && (
        <FieldEditModal
          field={fieldEditTarget}
          primary={primary}
          onClose={() => setFieldEditTarget(null)}
          onSave={async (field, changes) => { await editField(field, changes); setFieldEditTarget(null); }}
          onDelete={async (field) => {
            const variants = [field.name, `${field.name} [A]`, `${field.name} [B]`];
            await Promise.all([
              supabase.from('game_slots').delete().eq('club_id', club!.id).in('field_name', variants),
              supabase.from('field_availability_rules').delete().eq('club_id', club!.id).eq('field_name', field.name),
              supabase.from('field_closures').delete().eq('club_id', club!.id).eq('field_name', field.name),
            ]);
            await supabase.from('tryout_fields').delete().eq('id', field.id);
            setFieldEditTarget(null);
            load();
          }}
        />
      )}

      {/* Assign game modal */}
      {editSlot && (() => {
        // Detect partner slot for split fields so the modal can offer "Full field"
        const splitMatch = editSlot.field_name.match(/^(.+) \[([AB])\]$/);
        const partnerSlot = splitMatch
          ? slots.find(s =>
              s.field_name === `${splitMatch[1]} [${splitMatch[2] === 'A' ? 'B' : 'A'}]` &&
              s.slot_date === editSlot.slot_date &&
              s.start_time === editSlot.start_time
            ) ?? null
          : null;
        const fieldDef = splitMatch ? fields.find(f => f.name === splitMatch[1]) ?? null : null;
        return (
          <AssignGameModal
            slot={editSlot} partnerSlot={partnerSlot} teams={teams} primary={primary}
            defaultMins={defaultMins} fieldDef={fieldDef}
            onClose={() => setEditSlot(null)}
            onSaved={async (savedStartTime, savedEndTime, fieldName, slotDate, partnerFieldName) => {
              if (preEditRef.current) {
                undoStackRef.current = [...undoStackRef.current.slice(-9), preEditRef.current];
                redoStackRef.current = [];
                setUndoLen(undoStackRef.current.length);
                setRedoLen(0);
                preEditRef.current = null;
              }
              // If this was a pending-game assignment, mark it as scheduled
              const assignedPending = pendingToAssign;
              const assignedSlot    = editSlot;
              if (assignedPending && assignedSlot) {
                await supabase.from('pending_games')
                  .update({ status: 'scheduled', slot_id: assignedSlot.id })
                  .eq('id', assignedPending.id);
                setPendingGames(prev => prev.map(g =>
                  g.id === assignedPending.id ? { ...g, status: 'scheduled', slot_id: assignedSlot.id } : g
                ));
                setSelectedPending(null);
                setPendingToAssign(null);
              }
              setEditSlot(null);
              await cascadeChain(fieldName, slotDate, savedStartTime, savedEndTime);
              if (partnerFieldName) await cascadeChain(partnerFieldName, slotDate, savedStartTime, savedEndTime);
              load();
            }}
            onCleared={async (clearedSlotId) => {
              // Find any pending game that was assigned to this slot and un-schedule it
              const linkedPending = pendingGames.find(g => g.slot_id === clearedSlotId && g.status === 'scheduled');
              if (linkedPending) {
                await supabase.from('pending_games')
                  .update({ status: 'unscheduled', slot_id: null })
                  .eq('id', linkedPending.id);
                setPendingGames(prev => prev.map(g =>
                  g.id === linkedPending.id ? { ...g, status: 'unscheduled', slot_id: null } : g
                ));
              }
            }}
            onDeleted={() => removeSlot(editSlot.id)}
          />
        );
      })()}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Schedule Grid ─────────────────────────────────────────────────────────────

function ScheduleGrid({ sortedDates, columns, slotsFor, isBlocked, onSlotClick, onOpenFieldEdit, onReorderFields, primary, allSlots }: {
  sortedDates: string[]; columns: Column[];
  slotsFor: (date: string, fn: string) => GameSlot[];
  isBlocked: (slot: GameSlot) => boolean;
  onSlotClick: (slot: GameSlot) => void;
  onOpenFieldEdit: (field: FieldDef) => void;
  onReorderFields: (newOrder: FieldDef[]) => Promise<void>;
  primary: string;
  allSlots: GameSlot[];
}) {
  const DATE_W = 110;
  const COL_W  = 190;
  const gridCols = `${DATE_W}px ${columns.map(() => `${COL_W}px`).join(' ')}`;

  // Drag-to-reorder state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // One FieldDef per actual field (no B duplicates)
  const uniqueFields = columns.filter(c => c.sub !== 'B').map(c => c.field);

  function handleDrop(targetFieldId: string) {
    if (!draggingId || draggingId === targetFieldId) return;
    const from = uniqueFields.findIndex(f => f.id === draggingId);
    const to   = uniqueFields.findIndex(f => f.id === targetFieldId);
    if (from === -1 || to === -1) return;
    const reordered = [...uniqueFields];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onReorderFields(reordered);
  }

  // Detect if a slot is part of a full-field game (partner [A]/[B] has same home team)
  function isFullFieldGame(slot: GameSlot): boolean {
    if (!slot.home_team_id) return false;
    const m = slot.field_name.match(/^(.+) \[([AB])\]$/);
    if (!m) return false;
    const partner = allSlots.find(s =>
      s.field_name === `${m[1]} [${m[2] === 'A' ? 'B' : 'A'}]` &&
      s.slot_date === slot.slot_date &&
      s.start_time === slot.start_time &&
      s.home_team_id === slot.home_team_id
    );
    return !!partner;
  }

  return (
    <div style={{ borderRadius: '12px', border: '1.5px solid #E2E8F0', background: '#fff' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10, background: '#FAFBFC' }}>
        <div style={{ padding: '10px 14px', fontSize: '10px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>Date</div>
        {columns.map(col => {
          const colSlots      = allSlots.filter(s => s.field_name === col.slotName);
          const assignedCount = colSlots.filter(s => s.status === 'assigned').length;
          const totalCount    = colSlots.length;
          const isDragging    = draggingId === col.field.id && col.sub !== 'B';
          const isDropTarget  = dragOverId === col.field.id && draggingId !== col.field.id && col.sub !== 'B';
          const isActive      = col.field.is_active !== false;

          // ── Half B column ─────────────────────────────────────────────────
          if (col.sub === 'B') {
            return (
              <div key={col.slotName} style={{ padding: '8px 10px', borderLeft: `1px solid ${primary}25`, background: `${primary}04`, opacity: isActive ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {col.field.half_b_name ?? 'Half B'}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '1px', fontWeight: '600', display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <span style={{ color: primary, fontWeight: '800' }}>{col.field.scheduler_format ?? '7v7'}</span>
                      {totalCount > 0 && <span style={{ color: assignedCount === totalCount ? '#22C55E' : '#94A3B8' }}>· {assignedCount}/{totalCount}</span>}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onOpenFieldEdit(col.field); }} title="Edit field"
                    style={{ flexShrink: 0, padding: '3px', border: 'none', background: 'none', cursor: 'pointer', color: '#CBD5E1', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = primary)}
                    onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}
                  ><Pencil size={11}/></button>
                </div>
              </div>
            );
          }

          // ── Primary column (draggable) ────────────────────────────────────
          return (
            <div
              key={col.slotName}
              draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(col.field.id); }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverId !== col.field.id) setDragOverId(col.field.id); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={e => { e.preventDefault(); handleDrop(col.field.id); setDraggingId(null); setDragOverId(null); }}
              style={{ padding: '8px 10px', borderLeft: isDropTarget ? `2.5px solid ${primary}` : '1px solid #F1F5F9', background: isDropTarget ? `${primary}08` : 'transparent', opacity: isDragging ? 0.35 : isActive ? 1 : 0.5, transition: 'border-color 0.1s, background 0.1s', cursor: 'grab' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <GripVertical size={12} color="#CBD5E1" style={{ flexShrink: 0, cursor: 'grab' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {col.sub === 'A'
                      ? (col.field.half_a_name ?? `${col.field.name} — A`)
                      : col.field.name}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '1px', fontWeight: '600', display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {col.sub === 'A' && <span>Split ·</span>}
                    <span style={{ color: primary, fontWeight: '800' }}>{col.field.scheduler_format ?? '7v7'}</span>
                    {totalCount > 0 && <span style={{ color: assignedCount === totalCount ? '#22C55E' : '#94A3B8' }}>· {assignedCount}/{totalCount}</span>}
                    {!isActive && <span style={{ background: '#F1F5F9', color: '#94A3B8', borderRadius: '3px', padding: '0 3px', fontSize: '8px', fontWeight: '800', letterSpacing: '0.5px' }}>PAUSED</span>}
                    {col.field.has_lights && <span title="Has lights" style={{ fontSize: '10px' }}>💡</span>}
                    {col.field.surface_type && <span style={{ color: '#CBD5E1', fontSize: '8.5px' }}>· {col.field.surface_type}</span>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); onOpenFieldEdit(col.field); }} title="Edit field"
                  style={{ flexShrink: 0, padding: '3px', border: 'none', background: 'none', cursor: 'pointer', color: '#CBD5E1', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = primary)}
                  onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}
                ><Pencil size={11}/></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date rows */}
      {sortedDates.map((date, di) => (
        <div key={date} style={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: di > 0 ? '1px solid #F1F5F9' : 'none' }}>
          {/* Sticky date label */}
          <div style={{ padding: '12px 14px', background: '#FAFBFC', borderRight: '1px solid #E2E8F0', position: 'sticky', left: 0, zIndex: 2 }}>
            <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#0F172A' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>

          {/* Column cells */}
          {columns.map(col => {
            const cellSlots = slotsFor(date, col.slotName);
            return (
              <div key={col.slotName} style={{ padding: '7px 8px', borderLeft: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '56px' }}>
                {cellSlots.length === 0 ? (
                  <div style={{ color: '#E2E8F0', fontSize: '11px', paddingTop: '10px', textAlign: 'center' }}>—</div>
                ) : cellSlots.map(slot => {
                  const blocked    = isBlocked(slot);
                  const isAssigned = slot.status === 'assigned';
                  const isFull     = isFullFieldGame(slot);
                  const bg     = isAssigned ? `${primary}15` : '#F8FAFC';
                  const border  = isAssigned ? `1.5px solid ${primary}50` : '1px solid #E2E8F0';
                  return (
                    <div key={slot.id}
                      onClick={() => onSlotClick(slot)}
                      style={{ padding: '5px 8px', borderRadius: '6px', background: bg, border, cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.75'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: '700', color: isAssigned ? primary : '#64748B' }}>
                          {fmtT(slot.start_time)}
                        </div>
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                          {isFull && (
                            <div style={{ fontSize: '8px', fontWeight: '800', color: '#fff', background: primary, borderRadius: '3px', padding: '1px 4px', letterSpacing: '0.5px' }}>FULL</div>
                          )}
                          {slot.game_format && (
                            <div style={{ fontSize: '9px', fontWeight: '700', color: isAssigned ? primary : '#94A3B8', background: isAssigned ? `${primary}20` : '#F1F5F9', borderRadius: '3px', padding: '1px 4px' }}>
                              {slot.game_format}
                            </div>
                          )}
                        </div>
                      </div>
                      {isAssigned && (
                        <>
                          <div style={{ fontSize: '11px', fontWeight: '800', color: '#0F172A', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {slot.home_team?.name ?? '?'}
                          </div>
                          {slot.away_team && (
                            <div style={{ fontSize: '10px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              vs {slot.away_team}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Refresh Modal ─────────────────────────────────────────────────────────────

function RefreshModal({ permits, slots, fields, primary, defaultFmt, setDefaultFmt, onClose, onFill }: {
  permits: Permit[]; slots: GameSlot[]; fields: FieldDef[]; primary: string;
  defaultFmt: FormatValue; setDefaultFmt: (f: FormatValue) => void;
  onClose: () => void; onFill: (fmt: FormatValue) => Promise<void>;
}) {
  // Use base field name to handle split fields ([A]/[B] variants count as filled)
  const existingFieldDates = new Set(slots.map(s => `${s.field_name.replace(/ \[A\]$| \[B\]$/, '')}|${s.slot_date}`));
  const unfilled = permits.filter(p => p.rule_date && !existingFieldDates.has(`${p.field_name}|${p.rule_date}`));

  const [filling, setFilling] = useState(false);

  async function go() {
    setFilling(true);
    await onFill(defaultFmt);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '440px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Refresh from permits</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Fills any permit windows that don't have slots yet</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#94A3B8"/></button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {unfilled.length === 0 ? (
            <div style={{ padding: '14px 16px', background: '#F0FDF4', borderRadius: '10px', border: '1px solid #BBF7D0', fontSize: '13px', color: '#15803D' }}>
              ✅ All permit windows already have slots — nothing to add.
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#475569' }}>
                <strong>{unfilled.length}</strong> permit window{unfilled.length !== 1 ? 's' : ''} without slots yet. Choose the default format for new slots:
              </div>
              <div>
                {lbl('Default game format')}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {FORMAT_PRESETS.map(fp => (
                    <button key={fp.value} onClick={() => setDefaultFmt(fp.value as FormatValue)}
                      style={{ flex: 1, padding: '10px 8px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: defaultFmt === fp.value ? `2px solid ${primary}` : '2px solid #E2E8F0', background: defaultFmt === fp.value ? `${primary}12` : '#fff', transition: 'all 0.1s' }}>
                      <div style={{ fontSize: '14px', fontWeight: '800', color: defaultFmt === fp.value ? primary : '#374151' }}>{fp.label}</div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{fp.display}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Close</button>
          {unfilled.length > 0 && (
            <button onClick={go} disabled={filling}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', cursor: filling ? 'not-allowed' : 'pointer', background: filling ? '#E2E8F0' : primary, color: filling ? '#94A3B8' : '#fff' }}>
              {filling ? 'Filling…' : 'Fill slots'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assign Game Modal ─────────────────────────────────────────────────────────

function AssignGameModal({ slot, partnerSlot, teams, primary, defaultMins, fieldDef, onClose, onSaved, onCleared, onDeleted }: {
  slot: GameSlot; partnerSlot: GameSlot | null; teams: Team[]; primary: string; defaultMins: number; fieldDef: FieldDef | null;
  onClose: () => void;
  onSaved: (startTime: string, endTime: string, fieldName: string, slotDate: string, partnerFieldName?: string) => Promise<void>;
  onCleared: (clearedSlotId: string) => Promise<void>;
  onDeleted: () => void;
}) {
  const isAssigned = slot.status === 'assigned';
  const alreadyFullField = !!(partnerSlot?.home_team_id && partnerSlot.home_team_id === slot.home_team_id && slot.status === 'assigned');

  // Derive partner field name directly from the slot name — reliable even if partnerSlot prop is null
  const splitMatch      = slot.field_name.match(/^(.+) \[([AB])\]$/);
  const isSplitField    = !!splitMatch;
  const partnerFieldName = splitMatch ? `${splitMatch[1]} [${splitMatch[2] === 'A' ? 'B' : 'A'}]` : null;
  const baseFieldLabel  = splitMatch ? splitMatch[1] : slot.field_name;
  const halfALabel      = fieldDef?.half_a_name ?? `${baseFieldLabel} [A]`;
  const halfBLabel      = fieldDef?.half_b_name ?? `${baseFieldLabel} [B]`;
  const thisHalfLabel   = splitMatch?.[2] === 'A' ? halfALabel : splitMatch?.[2] === 'B' ? halfBLabel : slot.field_name;

  const [homeId,    setHomeId]    = useState(slot.home_team_id ?? '');
  const [away,      setAway]      = useState(slot.away_team ?? '');
  const [ageGroup,  setAgeGroup]  = useState(slot.age_group ?? '');
  const [format,    setFormat]    = useState<string>(slot.game_format ?? FORMAT_PRESETS[0].value);
  const [notes,     setNotes]     = useState(slot.notes ?? '');
  const [fullField, setFullField] = useState(() => alreadyFullField || (isSplitField && slot.game_format === '11v11'));
  const fullFieldRef = useRef(fullField);
  const [saving,    setSaving]    = useState(false);
  const [confirm,   setConfirm]   = useState(false);

  function toggleFullField() {
    const next = !fullFieldRef.current;
    fullFieldRef.current = next;
    setFullField(next);
  }

  useEffect(() => {
    if (isSplitField) {
      const next = format === '11v11';
      if (next !== fullFieldRef.current) { fullFieldRef.current = next; setFullField(next); }
    }
  }, [format]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = teams.find(t => t.id === homeId);
    if (t?.age_group) {
      if (!slot.age_group) setAgeGroup(t.age_group);
      const fmt = formatForAgeGroup(t.age_group);
      if (fmt) setFormat(fmt);
    }
  }, [homeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const gameMins   = minsForFormat(format, defaultMins);
  const newEndTime = minsToTime(toMins(slot.start_time) + gameMins);
  const endChanged = newEndTime !== slot.end_time;

  const updateData = {
    home_team_id: homeId || null,
    away_team:    away.trim() || null,
    age_group:    ageGroup.trim() || null,
    game_format:  format || null,
    end_time:     newEndTime,
    notes:        notes.trim() || null,
    status:       (homeId ? 'assigned' : 'open') as 'assigned' | 'open',
  };

  async function save() {
    setSaving(true);
    const isFullField = fullFieldRef.current;

    if (isFullField && splitMatch) {
      // Update [A] and [B] together in one query using LIKE on field_name
      await supabase.from('game_slots')
        .update(updateData)
        .eq('club_id', slot.club_id)
        .eq('slot_date', slot.slot_date)
        .eq('start_time', slot.start_time)
        .like('field_name', `${splitMatch[1]} [_]`);
    } else {
      await supabase.from('game_slots').update(updateData).eq('id', slot.id);
      // Was full-field before but toggled off — clear the partner
      if (!isFullField && alreadyFullField && partnerFieldName) {
        const defaultEnd = minsToTime(toMins(slot.start_time) + defaultMins);
        await supabase.from('game_slots')
          .update({ home_team_id: null, away_team: null, age_group: null, game_format: null, notes: null, end_time: defaultEnd, status: 'open' })
          .eq('club_id', slot.club_id).eq('slot_date', slot.slot_date).eq('start_time', slot.start_time).eq('field_name', partnerFieldName);
      }
    }

    setSaving(false);
    await onSaved(slot.start_time, newEndTime, slot.field_name, slot.slot_date, isFullField && partnerFieldName ? partnerFieldName : undefined);
  }

  async function clear() {
    const defaultEnd = minsToTime(toMins(slot.start_time) + defaultMins);
    const clearData = { home_team_id: null, away_team: null, age_group: null, game_format: null, notes: null, end_time: defaultEnd, status: 'open' as const };
    if (alreadyFullField && splitMatch) {
      await supabase.from('game_slots')
        .update(clearData)
        .eq('club_id', slot.club_id).eq('slot_date', slot.slot_date).eq('start_time', slot.start_time)
        .like('field_name', `${splitMatch[1]} [_]`);
      await onCleared(slot.id);
      await onSaved(slot.start_time, defaultEnd, slot.field_name, slot.slot_date, partnerFieldName ?? undefined);
    } else {
      await supabase.from('game_slots').update(clearData).eq('id', slot.id);
      await onCleared(slot.id);
      await onSaved(slot.start_time, defaultEnd, slot.field_name, slot.slot_date);
    }
  }

  const day = new Date(slot.slot_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A' }}>{isAssigned ? 'Edit Game' : 'Assign Game'}</div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
              {day} · {fmtT(slot.start_time)} · {thisHalfLabel}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} color="#94A3B8"/></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Full-field toggle — only shown for split fields */}
          {isSplitField && (
            <button
              onClick={toggleFullField}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: fullField ? `2px solid ${primary}` : '2px solid #E2E8F0', background: fullField ? `${primary}10` : '#FAFBFC', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: fullField ? `none` : '2px solid #CBD5E1', background: fullField ? primary : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {fullField && <span style={{ color: '#fff', fontSize: '11px', fontWeight: '900' }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: fullField ? primary : '#374151' }}>Full field — takes both halves</div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>
                  {fullField ? `Assigns this game to ${halfALabel} and ${halfBLabel}` : `Currently only on ${thisHalfLabel}`}
                </div>
              </div>
            </button>
          )}

          {/* Format */}
          <div>
            {lbl('Game format')}
            <div style={{ display: 'flex', gap: '6px' }}>
              {FORMAT_PRESETS.map(fp => (
                <button key={fp.value} onClick={() => setFormat(fp.value)}
                  style={{ flex: 1, padding: '9px 8px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', border: format === fp.value ? `2px solid ${primary}` : '2px solid #E2E8F0', background: format === fp.value ? `${primary}12` : '#fff', transition: 'all 0.1s' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: format === fp.value ? primary : '#374151' }}>{fp.label}</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{fp.display}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', padding: '8px 12px', background: '#F8FAFC', borderRadius: '8px', fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚽</span>
              <span>KO {fmtT(slot.start_time)} → ends {fmtT(newEndTime)}</span>
              {endChanged && <span style={{ color: primary, fontWeight: '700' }}>· next game pushed to {fmtT(newEndTime)}</span>}
            </div>
          </div>

          {/* Teams */}
          <div>
            {lbl('Home team')}
            <select value={homeId} onChange={e => setHomeId(e.target.value)} style={inp}>
              <option value="">— Open slot —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.age_group ? ` (${t.age_group})` : ''}</option>)}
            </select>
          </div>
          <div>
            {lbl('Away team')}
            <input value={away} onChange={e => setAway(e.target.value)} placeholder="e.g. Dynamo FC, Jersey United…" style={inp}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              {lbl('Age group')}
              <input value={ageGroup} onChange={e => setAgeGroup(e.target.value)} placeholder="U10, U12…" style={inp}/>
            </div>
            <div>
              {lbl('Notes')}
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional…" style={inp}/>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {isAssigned && (
              <button onClick={clear} style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#EF4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                {alreadyFullField ? 'Clear both halves' : 'Clear game'}
              </button>
            )}
            {confirm ? (
              <button onClick={onDeleted} style={{ padding: '7px 12px', borderRadius: '7px', border: 'none', background: '#EF4444', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                Confirm delete
              </button>
            ) : (
              <button onClick={() => setConfirm(true)} style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid #E2E8F0', background: '#fff', color: '#94A3B8', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Trash2 size={11}/> Delete slot
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancel</button>
            <button onClick={save} disabled={saving}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: saving ? '#E2E8F0' : primary, color: saving ? '#94A3B8' : '#fff' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Field Edit Modal ───────────────────────────────────────────────────────────

function FieldEditModal({ field, primary, onClose, onSave, onDelete }: {
  field: FieldDef; primary: string;
  onClose: () => void;
  onSave: (field: FieldDef, changes: {
    name?: string; format?: string; split?: number; active?: boolean;
    halfAName?: string | null; halfBName?: string | null;
    hasLights?: boolean; surfaceType?: string | null; fieldNotes?: string | null;
  }) => Promise<void>;
  onDelete: (field: FieldDef) => Promise<void>;
}) {
  const [name,        setName]        = useState(field.name);
  const [halfAName,   setHalfAName]   = useState(field.half_a_name ?? '');
  const [halfBName,   setHalfBName]   = useState(field.half_b_name ?? '');
  const [format,      setFormat]      = useState(field.scheduler_format ?? '7v7');
  const [split,       setSplit]       = useState(field.scheduler_split ?? 1);
  const [active,      setActive]      = useState(field.is_active !== false);
  const [hasLights,   setHasLights]   = useState(field.has_lights ?? false);
  const [surfaceType, setSurfaceType] = useState(field.surface_type ?? '');
  const [fieldNotes,  setFieldNotes]  = useState(field.field_notes ?? '');
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const changes: Parameters<typeof onSave>[1] = {};
    const trimName = name.trim();
    if (trimName && trimName !== field.name)              changes.name        = trimName;
    if (format      !== field.scheduler_format)           changes.format      = format;
    if (split       !== field.scheduler_split)            changes.split       = split;
    if (active      !== (field.is_active !== false))      changes.active      = active;
    if (hasLights   !== (field.has_lights ?? false))      changes.hasLights   = hasLights;
    const ha = halfAName.trim() || null;
    const hb = halfBName.trim() || null;
    if (ha !== field.half_a_name)                         changes.halfAName   = ha;
    if (hb !== field.half_b_name)                         changes.halfBName   = hb;
    const st = surfaceType || null;
    if (st !== field.surface_type)                        changes.surfaceType = st;
    const fn = fieldNotes.trim() || null;
    if (fn !== field.field_notes)                         changes.fieldNotes  = fn;
    await onSave(field, changes);
    setSaving(false);
  }

  const splitWillChange  = split !== field.scheduler_split;
  const splitWarning     = splitWillChange && split === 2
    ? 'Splitting a field deletes all existing open and assigned slots and regenerates them.'
    : splitWillChange && split === 1
    ? 'Removing the split deletes all existing slots for both halves.'
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.3px' }}>Edit Field</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{field.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={18} color="#94A3B8"/></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Name */}
          <div>
            {lbl('Field name')}
            <input value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus/>
          </div>

          {/* Format */}
          <div>
            {lbl('Game format')}
            <div style={{ display: 'flex', gap: '8px' }}>
              {FORMAT_PRESETS.map(fp => (
                <button key={fp.value} onClick={() => setFormat(fp.value)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: '9px', cursor: 'pointer', fontFamily: 'inherit', border: format === fp.value ? `2px solid ${primary}` : '2px solid #E2E8F0', background: format === fp.value ? `${primary}12` : '#fff', transition: 'all 0.12s' }}>
                  <div style={{ fontSize: '14px', fontWeight: '900', color: format === fp.value ? primary : '#374151' }}>{fp.label}</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{fp.display}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Split + Active */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              {lbl('Field split')}
              <button onClick={() => setSplit(s => s === 2 ? 1 : 2)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: '9px', border: split === 2 ? `2px solid ${primary}` : '2px solid #E2E8F0', background: split === 2 ? `${primary}10` : '#fff', color: split === 2 ? primary : '#374151', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>{split === 2 ? '⧠' : '□'}</span>
                {split === 2 ? 'Two halves' : 'Full field'}
              </button>
            </div>
            <div>
              {lbl('Status')}
              <button onClick={() => setActive(a => !a)}
                style={{ width: '100%', padding: '11px 14px', borderRadius: '9px', border: active ? '2px solid #22C55E' : '2px solid #E2E8F0', background: active ? '#F0FDF4' : '#fff', color: active ? '#16A34A' : '#94A3B8', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: active ? '#22C55E' : '#CBD5E1', display: 'inline-block', flexShrink: 0 }}/>
                {active ? 'Active' : 'Paused'}
              </button>
            </div>
          </div>

          {/* Split warning */}
          {splitWarning && (
            <div style={{ padding: '10px 14px', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FCD34D', fontSize: '12px', color: '#92400E' }}>
              ⚠️ {splitWarning}
            </div>
          )}

          {/* Half names — only when split = 2 */}
          {split === 2 && (
            <div>
              {lbl('Half names (optional)')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <input value={halfAName} onChange={e => setHalfAName(e.target.value)} placeholder={`e.g. ${name} West`} style={{ ...inp }}/>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>First half</div>
                </div>
                <div>
                  <input value={halfBName} onChange={e => setHalfBName(e.target.value)} placeholder={`e.g. ${name} East`} style={{ ...inp }}/>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Second half</div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px' }}>Leave blank to use "Half A" / "Half B". Names only affect the display label — they don't rename the underlying slots.</div>
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid #F1F5F9', margin: '0 -2px' }}/>

          {/* Surface type */}
          <div>
            {lbl('Surface type')}
            <select value={surfaceType} onChange={e => setSurfaceType(e.target.value)} style={inp}>
              <option value="">— Not specified —</option>
              <option>Natural Grass</option>
              <option>Artificial Turf</option>
              <option>Hybrid</option>
              <option>Indoor</option>
              <option>Other</option>
            </select>
          </div>

          {/* Lights */}
          <div>
            <button onClick={() => setHasLights(l => !l)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: hasLights ? `2px solid ${primary}` : '2px solid #E2E8F0', background: hasLights ? `${primary}10` : '#FAFBFC', cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left', boxSizing: 'border-box' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '5px', border: hasLights ? 'none' : '2px solid #CBD5E1', background: hasLights ? primary : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasLights && <span style={{ color: '#fff', fontSize: '12px', fontWeight: '900', lineHeight: 1 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: hasLights ? primary : '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Field has lights
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Night games and evening training possible</div>
              </div>
            </button>
          </div>

          {/* Notes */}
          <div>
            {lbl('Field notes')}
            <textarea
              value={fieldNotes}
              onChange={e => setFieldNotes(e.target.value)}
              placeholder="Parking, access codes, special instructions…"
              rows={3}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={async () => {
            if (!window.confirm(`Delete "${field.name}"? This removes all its permits, closures, and open game slots.`)) return;
            setDeleting(true);
            await onDelete(field);
          }} disabled={deleting}
            style={{ padding: '9px 14px', borderRadius: '9px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#EF4444', fontSize: '12px', fontWeight: '700', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {deleting ? 'Deleting…' : 'Delete field'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '9px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '9px 24px', borderRadius: '9px', border: 'none', fontSize: '13px', fontWeight: '800', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: saving ? '#E2E8F0' : primary, color: saving ? '#94A3B8' : '#fff' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import Schedule Modal ──────────────────────────────────────────────────────

type ParsedGame = {
  game_date: string; opponent: string;
  age_group?: string | null; gender?: string | null;
  our_team?: string | null; league?: string | null; notes?: string | null;
};

function ImportModal({ club, primary, onClose, onImported }: {
  club: { id: string; name: string };
  primary: string;
  onClose: () => void;
  onImported: (games: PendingGame[]) => void;
}) {
  const [file,           setFile]          = useState<File | null>(null);
  const [parsing,        setParsing]        = useState(false);
  const [parsed,         setParsed]         = useState<ParsedGame[]>([]);
  const [parseAttempted, setParseAttempted] = useState(false);
  const [checked,        setChecked]        = useState<Set<number>>(new Set());
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setError('');
    setParseAttempted(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('club_name', club.name);
      const res  = await fetch('/api/games/import-pending', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: fd,
      });
      const data = await res.json() as { games?: ParsedGame[]; error?: string };
      if (!res.ok) { setError(data.error ?? 'Parse failed'); setParsing(false); return; }
      const games = data.games ?? [];
      setParsed(games);
      setChecked(new Set(games.map((_, i) => i)));
      setParseAttempted(true);
    } catch {
      setError('Upload failed. Please try again.');
    }
    setParsing(false);
  }

  async function handleSave() {
    setSaving(true);
    const selected = parsed.filter((_, i) => checked.has(i));
    // Dedup: skip any game that already exists in pending_games with same date+opponent
    const { data: existing } = await supabase
      .from('pending_games')
      .select('game_date, opponent')
      .eq('club_id', club.id);
    const existingKeys = new Set((existing ?? []).map(e => `${e.game_date}|${e.opponent.toLowerCase().trim()}`));
    const rows = selected
      .filter(g => !existingKeys.has(`${g.game_date}|${g.opponent.toLowerCase().trim()}`))
      .map(g => ({
        club_id:   club.id,
        game_date: g.game_date,
        age_group: g.age_group ?? null,
        gender:    g.gender    ?? null,
        our_team:  g.our_team  ?? null,
        opponent:  g.opponent,
        league:    g.league    ?? null,
        notes:     g.notes     ?? null,
        raw_data:  g,
      }));
    const skipped = selected.length - rows.length;
    if (rows.length === 0) {
      setError(skipped > 0 ? `All ${skipped} selected game${skipped !== 1 ? 's' : ''} already exist in the queue — nothing new to add.` : 'Nothing to import.');
      setSaving(false);
      return;
    }
    const { data, error: err } = await supabase.from('pending_games').insert(rows).select();
    if (err) { setError(err.message); setSaving(false); return; }
    onImported((data ?? []) as PendingGame[]);
  }

  function toggleCheck(i: number) {
    setChecked(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  const allChecked = parsed.length > 0 && checked.size === parsed.length;

  function fmtDate(d: string) {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
    catch { return d; }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '640px', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>Import Unscheduled Games</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>Upload a CSV export from NCSA, EDP, or any league. AI extracts home games automatically.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}><X size={16} color="#94A3B8"/></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* Upload step */}
          {parsed.length === 0 && (
            <>
              <div style={{ border: '2px dashed #E2E8F0', borderRadius: '12px', padding: '28px', textAlign: 'center', background: '#FAFBFC', marginBottom: '14px' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>📁</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151', marginBottom: '3px' }}>Drop a schedule file or click to browse</div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: '14px' }}>CSV or text file · Works best with NCSA and EDP exports</div>
                <input type="file" accept=".csv,.txt,.tsv" onChange={e => { setFile(e.target.files?.[0] ?? null); setParseAttempted(false); setError(''); }}
                  style={{ display: 'block', margin: '0 auto', fontSize: '12px', color: '#64748B' }}/>
              </div>
              {file && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #86EFAC', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>📄 {file.name}</div>
                  <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '12px', fontFamily: 'inherit' }}>Remove</button>
                </div>
              )}
              {parseAttempted && parsed.length === 0 && (
                <div style={{ padding: '12px 14px', background: '#FFF7ED', borderRadius: '8px', border: '1px solid #FED7AA', color: '#92400E', fontSize: '12px', lineHeight: 1.5 }}>
                  <strong>No home games found.</strong> The AI may not have recognised which team is yours. Try uploading a file where your team name clearly appears in a "Home Team" column, or check that the file contains home games.
                </div>
              )}
              {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '12px' }}>{error}</div>}
            </>
          )}

          {/* Preview table */}
          {parsed.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>{parsed.length} home game{parsed.length !== 1 ? 's' : ''} found — select which to import</div>
                <button onClick={() => setChecked(allChecked ? new Set() : new Set(parsed.map((_, i) => i)))}
                  style={{ fontSize: '12px', fontWeight: '700', color: primary, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div style={{ border: '1.5px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 90px 80px', background: '#FAFBFC', borderBottom: '1px solid #E2E8F0', padding: '8px 12px', gap: '8px' }}>
                  {['', 'Date', 'Opponent', 'Age Group', 'League'].map((h, i) => (
                    <div key={i} style={{ fontSize: '9px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                  ))}
                </div>
                {parsed.map((g, i) => (
                  <div key={i} onClick={() => toggleCheck(i)}
                    style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 90px 80px', padding: '9px 12px', gap: '8px', borderTop: '1px solid #F1F5F9', cursor: 'pointer', background: checked.has(i) ? '#fff' : '#FAFBFC', opacity: checked.has(i) ? 1 : 0.5, transition: 'opacity 0.1s' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: checked.has(i) ? 'none' : '1.5px solid #CBD5E1', background: checked.has(i) ? primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked.has(i) && <span style={{ color: '#fff', fontSize: '10px', fontWeight: '900' }}>✓</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#374151' }}>{fmtDate(g.game_date)}</div>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.opponent}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>{g.age_group ?? '—'}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>{g.league ?? '—'}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setParsed([]); setFile(null); setError(''); }}
                style={{ marginTop: '10px', fontSize: '11.5px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                ← Upload a different file
              </button>

              {error && <div style={{ marginTop: '10px', padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '12px' }}>{error}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancel</button>
          {parsed.length === 0 ? (
            <button onClick={handleParse} disabled={!file || parsing}
              style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', cursor: !file || parsing ? 'not-allowed' : 'pointer', background: !file || parsing ? '#E2E8F0' : primary, color: !file || parsing ? '#94A3B8' : '#fff' }}>
              {parsing ? '⚽ Finding home games…' : '⚽ Find home games'}
            </button>
          ) : (
            <button onClick={handleSave} disabled={checked.size === 0 || saving}
              style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', cursor: checked.size === 0 || saving ? 'not-allowed' : 'pointer', background: checked.size === 0 || saving ? '#E2E8F0' : primary, color: checked.size === 0 || saving ? '#94A3B8' : '#fff' }}>
              {saving ? 'Importing…' : `Import ${checked.size} game${checked.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pending Games Panel ────────────────────────────────────────────────────────

function PendingPanel({ games, selected, primary, onSelect, onClose, onDelete }: {
  games: PendingGame[]; selected: PendingGame | null; primary: string;
  onSelect: (g: PendingGame | null) => void;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [filterDate,   setFilterDate]   = useState('');
  const [filterAge,    setFilterAge]    = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [filterFormat, setFilterFormat] = useState('');
  const [showScheduled, setShowScheduled] = useState(false);

  function fmtFromAge(ag: string | null): '7v7' | '9v9' | '11v11' | null {
    if (!ag) return null;
    const m = ag.match(/(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1]);
    if (n <= 10) return '7v7';
    if (n <= 12) return '9v9';
    return '11v11';
  }

  const unscheduled = games.filter(g => g.status === 'unscheduled');
  const scheduled   = games.filter(g => g.status === 'scheduled');

  const filtered = unscheduled.filter(g => {
    if (filterDate   && g.game_date   !== filterDate)   return false;
    if (filterAge    && g.age_group   !== filterAge)     return false;
    if (filterLeague && g.league      !== filterLeague)  return false;
    if (filterFormat && fmtFromAge(g.age_group) !== filterFormat) return false;
    return true;
  });

  const dates     = [...new Set(unscheduled.map(g => g.game_date))].sort();
  const ageGroups = ([...new Set(unscheduled.map(g => g.age_group).filter(Boolean))] as string[])
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? '99');
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? '99');
      return na - nb;
    });
  const leagues   = [...new Set(unscheduled.map(g => g.league).filter(Boolean))]   as string[];
  const formats   = ['7v7', '9v9', '11v11'].filter(f =>
    unscheduled.some(g => fmtFromAge(g.age_group) === f)
  );

  function fmtDate(d: string) {
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
    catch { return d; }
  }

  const selSt: React.CSSProperties = {
    fontSize: '11.5px', padding: '5px 8px', borderRadius: '6px',
    border: '1.5px solid #E2E8F0', background: '#fff', color: '#374151',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ width: '272px', flexShrink: 0, borderRight: '1.5px solid #E2E8F0', background: '#FAFBFC', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Panel header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '9.5px', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Pending Queue</div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#0F172A' }}>
            {unscheduled.length} unscheduled
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '5px', borderRadius: '6px', display: 'flex' }}>
          <X size={14}/>
        </button>
      </div>

      {/* Filters */}
      {unscheduled.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={selSt}>
            <option value="">All dates</option>
            {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
          {(ageGroups.length > 1 || leagues.length > 1) && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {ageGroups.length > 1 && (
                <select value={filterAge} onChange={e => setFilterAge(e.target.value)} style={{ ...selSt, width: 'auto', flex: 1 }}>
                  <option value="">All ages</option>
                  {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {leagues.length > 1 && (
                <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} style={{ ...selSt, width: 'auto', flex: 1 }}>
                  <option value="">All leagues</option>
                  {leagues.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              )}
            </div>
          )}
          {formats.length > 1 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['', ...formats] as string[]).map(f => (
                <button key={f} onClick={() => setFilterFormat(f)}
                  style={{ flex: 1, padding: '5px 4px', borderRadius: '6px', border: filterFormat === f ? `1.5px solid ${primary}` : '1.5px solid #E2E8F0', background: filterFormat === f ? `${primary}12` : '#fff', fontSize: '11px', fontWeight: '700', color: filterFormat === f ? primary : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {f || 'All'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instruction hint when nothing selected */}
      {!selected && unscheduled.length > 0 && (
        <div style={{ padding: '8px 12px', background: `${primary}08`, borderBottom: `1px solid ${primary}20`, flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.4 }}>
            Tap a game to select it, then click an open slot in the grid to assign it.
          </div>
        </div>
      )}

      {/* Game list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: '#94A3B8', fontSize: '12px' }}>
            {unscheduled.length === 0 ? 'All games scheduled ✓' : 'No games match filters'}
          </div>
        )}

        {filtered.map(g => {
          const isSel = selected?.id === g.id;
          return (
            <div key={g.id}
              onClick={() => onSelect(isSel ? null : g)}
              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.borderColor = `${primary}60`; }}
              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; }}
              style={{ marginBottom: '6px', padding: '10px 11px 8px', borderRadius: '9px', border: isSel ? `2px solid ${primary}` : '1.5px solid #E2E8F0', background: isSel ? `${primary}08` : '#fff', cursor: 'pointer', transition: 'border-color 0.1s', position: 'relative' }}>
              {/* Date + format */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <div style={{ fontSize: '9.5px', fontWeight: '800', color: isSel ? primary : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {fmtDate(g.game_date)}
                </div>
                {fmtFromAge(g.age_group) && (
                  <span style={{ fontSize: '9px', fontWeight: '800', color: isSel ? primary : '#94A3B8', background: isSel ? `${primary}15` : '#F1F5F9', borderRadius: '3px', padding: '1px 5px', letterSpacing: '0.3px' }}>
                    {fmtFromAge(g.age_group)}
                  </span>
                )}
              </div>
              {/* Our team — primary */}
              <div style={{ fontSize: '13px', fontWeight: '800', color: isSel ? primary : '#0F172A', lineHeight: 1.2, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.our_team ?? '—'}
              </div>
              {/* Opponent — secondary */}
              <div style={{ fontSize: '11.5px', fontWeight: '600', color: '#64748B', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                vs {g.opponent}
              </div>
              {/* Badges */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {g.age_group && (
                  <span style={{ fontSize: '9.5px', fontWeight: '700', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 5px' }}>{g.age_group}</span>
                )}
                {g.league && (
                  <span style={{ fontSize: '9.5px', fontWeight: '700', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', padding: '1px 5px' }}>{g.league}</span>
                )}
              </div>
              <button
                onClick={async e => {
                  e.stopPropagation();
                  if (window.confirm(`Remove "vs ${g.opponent}" from the queue?`)) await onDelete(g.id);
                }}
                style={{ position: 'absolute', top: '7px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#E2E8F0', fontSize: '12px', lineHeight: 1, padding: '2px 4px', borderRadius: '4px', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#E2E8F0')}
              >✕</button>
            </div>
          );
        })}

        {/* Scheduled section */}
        {scheduled.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <button onClick={() => setShowScheduled(s => !s)}
              style={{ width: '100%', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit', borderRadius: '6px' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F1F5F9'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              <span style={{ fontSize: '10px', fontWeight: '800', color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.8px' }}>✓ Scheduled ({scheduled.length})</span>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>{showScheduled ? '▲' : '▼'}</span>
            </button>
            {showScheduled && scheduled.map(g => (
              <div key={g.id} style={{ marginBottom: '4px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #DCFCE7', background: '#F0FDF4' }}>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#22C55E', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>✓ Slotted</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>vs {g.opponent}</div>
                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{fmtDate(g.game_date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
