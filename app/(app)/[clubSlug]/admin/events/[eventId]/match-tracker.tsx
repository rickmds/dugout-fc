import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../../lib/supabase';
import { useAuth } from '../../../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../../../constants/colors';
import { useClub } from '../../../../../../hooks/useClub';
import ClubHeader from '../../../../../../components/ui/ClubHeader';
import {
  Formation,
  FORMATIONS_BY_FORMAT,
  DEFAULT_FORMATION_PER_FORMAT,
  detectFormat,
  getFormationById,
} from '../../../../../../constants/formations';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_W    = 40;
const TOKEN_H    = 50;
const BENCH_SZ   = 56;
const SNAP_THRESH = TOKEN_W * 2;

const PITCH_GREEN  = '#1e5c35';
const PITCH_LINE   = 'rgba(255,255,255,0.55)';
const PITCH_DARK   = 'rgba(0,0,0,0.18)';

// ─── Types ────────────────────────────────────────────────────────────────────

type GameStatus = 'not_started' | 'half1' | 'half_time' | 'half2' | 'full_time';

type GameSession = {
  id: string;
  half_length_seconds: number;
  half1_started_at: string | null;
  half1_ended_at: string | null;
  half2_started_at: string | null;
  half2_ended_at: string | null;
  status: GameStatus;
};

type Period = {
  id: string;
  player_id: string;
  half: number;
  on_at: string;
  off_at: string | null;
};

type Player = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  isGuest?: boolean;
};

type PitchLayout = { pageX: number; pageY: number; width: number; height: number };
type DragState   = { playerId: string; pageX: number; pageY: number } | null;
type EqRotation  = { minute: number; playerOn: string; playerOff: string };
type PlayerStatEntry = { goals: number; assists: number; yellow_cards: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMSS(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtMins(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60);
  return m < 1 ? `<1'` : `${m}'`;
}

function secondsPlayed(periods: Period[], pid: string, now: Date): number {
  return periods.filter(p => p.player_id === pid).reduce((sum, p) => {
    const on  = new Date(p.on_at).getTime();
    const off = p.off_at ? new Date(p.off_at).getTime() : now.getTime();
    return sum + Math.max(0, (off - on) / 1000);
  }, 0);
}

function totalElapsedForSession(s: GameSession, ref: Date): number {
  const halfLen = s.half_length_seconds;
  let total = 0;
  if (s.half1_started_at) {
    const end = s.half1_ended_at ? new Date(s.half1_ended_at).getTime() : ref.getTime();
    total += Math.min(halfLen, Math.max(0, (end - new Date(s.half1_started_at).getTime()) / 1000));
  }
  if (s.half2_started_at) {
    const end = s.half2_ended_at ? new Date(s.half2_ended_at).getTime() : ref.getTime();
    total += Math.min(halfLen, Math.max(0, (end - new Date(s.half2_started_at).getTime()) / 1000));
  }
  return total;
}

function getEqColor(playerSecs: number, targetSecs: number, remainingSecs: number): string | null {
  const deficit = targetSecs - playerSecs;
  if (deficit <= 30) return null;
  return deficit > remainingSecs ? '#EF4444' : '#F97316';
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getContrastColor(hex: string): '#000000' | '#ffffff' {
  const c = hex.replace('#', '');
  if (c.length < 6) return '#ffffff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000000' : '#ffffff';
}

function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

function remapToFormation(cur: (string | null)[], from: Formation, to: Formation): (string | null)[] {
  const next: (string | null)[] = new Array(to.positions.length).fill(null);
  const pool: Array<{ pid: string; label: string }> = [];
  cur.forEach((pid, i) => { if (pid) pool.push({ pid, label: from.positions[i]?.label ?? '' }); });
  const used = new Set<string>();

  // Pass 1: match by position label (GK→GK, CB→CB, etc.)
  to.positions.forEach((slot, i) => {
    const m = pool.find(p => !used.has(p.pid) && p.label === slot.label);
    if (m) { next[i] = m.pid; used.add(m.pid); }
  });

  // Pass 2: fill any remaining players into empty slots — no one disappears from the pitch
  for (const p of pool.filter(p => !used.has(p.pid))) {
    const idx = next.findIndex(v => v === null);
    if (idx !== -1) next[idx] = p.pid;
  }

  return next;
}

// ─── Pitch markings (computed from layout) ───────────────────────────────────

function PitchMarkings({ w, h }: { w: number; h: number }) {
  const circleD = w * 0.28;
  const penW    = w * 0.60;
  const penH    = h * 0.155;
  const goalW   = w * 0.27;
  const goalH   = h * 0.055;

  const line = (style: object) => (
    <View style={[{ position: 'absolute', backgroundColor: PITCH_LINE }, style]} />
  );

  return (
    <>
      {/* Pitch stripes — subtle alternating bands */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <View
          key={i}
          style={{ position: 'absolute', left: 0, right: 0, top: `${i * 12.5}%`, height: `${12.5}%`,
            backgroundColor: i % 2 === 0 ? 'transparent' : PITCH_DARK }}
        />
      ))}

      {/* Outer border */}
      <View style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8,
        borderWidth: 1.5, borderColor: PITCH_LINE, borderRadius: 2 }} />

      {/* Center line */}
      {line({ left: 8, right: 8, top: '50%', height: 1.5, marginTop: -0.75 })}

      {/* Center circle */}
      <View style={{
        position: 'absolute', width: circleD, height: circleD, borderRadius: circleD / 2,
        borderWidth: 1.5, borderColor: PITCH_LINE,
        top: '50%', left: '50%',
        marginTop: -circleD / 2, marginLeft: -circleD / 2,
      }} />
      {/* Center spot */}
      <View style={{
        position: 'absolute', width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: PITCH_LINE, top: '50%', left: '50%', marginTop: -2.5, marginLeft: -2.5,
      }} />

      {/* Top penalty area */}
      <View style={{
        position: 'absolute', left: (w - penW) / 2, width: penW, height: penH, top: 8,
        borderWidth: 1.5, borderColor: PITCH_LINE, borderTopWidth: 0,
      }} />
      {/* Top goal area */}
      <View style={{
        position: 'absolute', left: (w - goalW) / 2, width: goalW, height: goalH, top: 8,
        borderWidth: 1.5, borderColor: PITCH_LINE, borderTopWidth: 0,
      }} />
      {/* Top penalty spot */}
      <View style={{
        position: 'absolute', width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: PITCH_LINE,
        top: h * 0.11 + 8, left: w / 2 - 2.5,
      }} />

      {/* Bottom penalty area */}
      <View style={{
        position: 'absolute', left: (w - penW) / 2, width: penW, height: penH, bottom: 8,
        borderWidth: 1.5, borderColor: PITCH_LINE, borderBottomWidth: 0,
      }} />
      {/* Bottom goal area */}
      <View style={{
        position: 'absolute', left: (w - goalW) / 2, width: goalW, height: goalH, bottom: 8,
        borderWidth: 1.5, borderColor: PITCH_LINE, borderBottomWidth: 0,
      }} />
      {/* Bottom penalty spot */}
      <View style={{
        position: 'absolute', width: 5, height: 5, borderRadius: 2.5,
        backgroundColor: PITCH_LINE,
        bottom: h * 0.11 + 8, left: w / 2 - 2.5,
      }} />

      {/* Corner arcs (simplified dots) */}
      {[
        { top: 8, left: 8 }, { top: 8, right: 8 },
        { bottom: 8, left: 8 }, { bottom: 8, right: 8 },
      ].map((pos, i) => (
        <View key={i} style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4,
          borderWidth: 1.5, borderColor: PITCH_LINE, ...pos }} />
      ))}
    </>
  );
}

// ─── Content component (used by both Modal and route) ────────────────────────

type MatchTrackerContentProps = { eventId: string; clubSlug: string; onClose: () => void };

export function MatchTrackerContent({ eventId, clubSlug, onClose }: MatchTrackerContentProps) {
  const { primaryColor, rgba } = useClub();
  const { profile, club } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [loading,         setLoading]         = useState(true);
  const [eventTitle,      setEventTitle]      = useState('');
  const [scoreHome,       setScoreHome]       = useState(0);
  const [scoreAway,       setScoreAway]       = useState(0);
  const [session,         setSession]         = useState<GameSession | null>(null);
  const [periods,         setPeriods]         = useState<Period[]>([]);
  const [allPlayers,      setAllPlayers]      = useState<Player[]>([]);
  const [tick,            setTick]            = useState(0);
  const [saving,          setSaving]          = useState(false);
  const [teamId,          setTeamId]          = useState<string | null>(null);
  const [teamAgeGroup,    setTeamAgeGroup]    = useState<string | null>(null);
  const [formation,       setFormation]       = useState<Formation | null>(null);
  const [pitchAssignments,setPitchAssignments]= useState<(string | null)[]>([]);
  const [lineupId,        setLineupId]        = useState<string | null>(null);
  const [pitchLayout,     setPitchLayout]     = useState<{ width: number; height: number } | null>(null);
  const [drag,            setDrag]            = useState<DragState>(null);
  const [hoveredSlot,     setHoveredSlot]     = useState<number | null>(null);
  const [setupVisible,    setSetupVisible]    = useState(false);
  const [halfInput,       setHalfInput]       = useState('35');
  const [overlay,         setOverlay]         = useState<'half_time' | 'full_time' | null>(null);
  const [fmPicker,        setFmPicker]        = useState(false);
  const [baseAssignments, setBaseAssignments] = useState<(string | null)[] | null>(null);
  const [eqTimeVisible,   setEqTimeVisible]   = useState(false);
  const [statsVisible,    setStatsVisible]    = useState(false);
  const [playerStats,     setPlayerStats]     = useState<Record<string, PlayerStatEntry>>({});
  const [statsSaving,     setStatsSaving]     = useState(false);
  const [clubId,          setClubId]          = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pendingCloseRef   = useRef(false);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const pitchViewRef      = useRef<View>(null);
  const pitchLayoutRef    = useRef<PitchLayout | null>(null);
  const dragStartRef      = useRef<string | null>(null);
  const hoveredSlotRef    = useRef<number | null>(null);
  const assignmentsRef    = useRef<(string | null)[]>([]);
  const formationRef      = useRef<Formation | null>(null);
  const periodsRef        = useRef<Period[]>([]);
  const sessionRef        = useRef<GameSession | null>(null);
  const teamIdRef         = useRef<string | null>(null);
  const lineupIdRef       = useRef<string | null>(null);
  const baseAssignmentsRef = useRef<(string | null)[] | null>(null);
  const benchViewRefs     = useRef<Map<string, View | null>>(new Map());
  const benchMeasure      = useRef<Map<string, { cx: number; cy: number; r: number }>>(new Map());
  const benchRef          = useRef<Player[]>([]);

  useEffect(() => { assignmentsRef.current     = pitchAssignments; }, [pitchAssignments]);
  useEffect(() => { formationRef.current       = formation; },        [formation]);
  useEffect(() => { periodsRef.current         = periods; },          [periods]);
  useEffect(() => { sessionRef.current         = session; },          [session]);
  useEffect(() => { teamIdRef.current          = teamId; },           [teamId]);
  useEffect(() => { lineupIdRef.current        = lineupId; },         [lineupId]);
  useEffect(() => { baseAssignmentsRef.current = baseAssignments; },  [baseAssignments]);

  // ── Confirm before leaving a live game ───────────────────────────────────
  function handleClose() {
    const blocked = session?.status === 'half1' || session?.status === 'half2' || session?.status === 'half_time';
    if (blocked) {
      Alert.alert(
        'Game in progress',
        'Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  }

  const bench = useMemo(() => {
    const on = new Set(pitchAssignments.filter(Boolean) as string[]);
    return allPlayers.filter(p => !on.has(p.id));
  }, [pitchAssignments, allPlayers]);
  useEffect(() => { benchRef.current = bench; }, [bench]);

  const pendingIncoming = useMemo<Set<string>>(() => {
    if (!baseAssignments) return new Set();
    const baseSet = new Set(baseAssignments.filter(Boolean) as string[]);
    return new Set((pitchAssignments.filter(Boolean) as string[]).filter(pid => !baseSet.has(pid)));
  }, [baseAssignments, pitchAssignments]);

  const pendingSubCount = pendingIncoming.size;
  const hasPendingSubs  = pendingSubCount > 0;

  const gameFormat         = detectFormat(teamAgeGroup);
  const availableFormations = FORMATIONS_BY_FORMAT[gameFormat] ?? [];

  // ── Clock ─────────────────────────────────────────────────────────────────

  function halfElapsed(s: GameSession): number {
    const now = Date.now();
    if (s.status === 'half1' && s.half1_started_at) return (now - new Date(s.half1_started_at).getTime()) / 1000;
    if (s.status === 'half2' && s.half2_started_at) return (now - new Date(s.half2_started_at).getTime()) / 1000;
    return 0;
  }

  function startTicker() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
  }

  function stopTicker() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!eventId) return;

    let loadedAgeGroup: string | null = null;
    const { data: ev } = await supabase.from('events').select('title, team_id, score_home, score_away').eq('id', eventId).single();
    if (ev) {
      setEventTitle((ev as any).title ?? '');
      setScoreHome((ev as any).score_home ?? 0);
      setScoreAway((ev as any).score_away ?? 0);
      const tid = (ev as any).team_id as string;
      setTeamId(tid);
      const { data: td } = await supabase.from('teams').select('age_group,club_id').eq('id', tid).single();
      loadedAgeGroup = (td as any)?.age_group ?? null;
      setTeamAgeGroup(loadedAgeGroup);
      setClubId((td as any)?.club_id ?? null);
    }

    const { data: sess } = await (supabase as any)
      .from('game_sessions').select('*').eq('event_id', eventId).maybeSingle();
    if (sess) {
      const s = sess as GameSession;
      setSession(s);
      if (s.status === 'half1' || s.status === 'half2') startTicker();
      const { data: pds } = await (supabase as any)
        .from('player_match_periods').select('id, player_id, half, on_at, off_at')
        .eq('game_session_id', s.id).order('on_at');
      setPeriods((pds ?? []) as Period[]);
    }

    const [rsvpsRes, guestsRes] = await Promise.all([
      supabase.from('event_rsvps').select('player_id').eq('event_id', eventId).eq('status', 'attending'),
      (supabase as any).from('event_guests').select('player_id,status').eq('event_id', eventId).eq('role', 'player').eq('status', 'confirmed'),
    ]);
    const regularIds = ((rsvpsRes.data ?? []) as any[]).map(r => r.player_id as string);
    const guestPlayerIds = ((guestsRes.data ?? []) as any[]).filter(g => g.player_id).map(g => g.player_id as string);
    const allIds = [...new Set([...regularIds, ...guestPlayerIds])];
    if (allIds.length > 0) {
      const { data: pls } = await supabase
        .from('players').select('id, full_name, jersey_number, position').in('id', allIds).order('jersey_number');
      const guestSet = new Set(guestPlayerIds);
      setAllPlayers(((pls ?? []) as Player[]).map(p => ({ ...p, isGuest: guestSet.has(p.id) })));
    }

    const { data: lineup } = await supabase
      .from('lineups')
      .select('id, formation, lineup_positions(player_id, x, y)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lineup) {
      const lid = (lineup as any).id as string;
      setLineupId(lid);
      let fm = getFormationById((lineup as any).formation);
      // Only fall back if the saved formation ID is completely unrecognized
      if (!fm) {
        const expectedFormat = detectFormat(loadedAgeGroup);
        fm = getFormationById(DEFAULT_FORMATION_PER_FORMAT[expectedFormat]);
      }
      if (fm) {
        setFormation(fm);
        const lps: Array<{ player_id: string; x: number; y: number }> = (lineup as any).lineup_positions ?? [];
        const assignments: (string | null)[] = new Array(fm.positions.length).fill(null);
        lps.forEach(lp => {
          let best = -1, bestD = Infinity;
          fm!.positions.forEach((pos, i) => {
            const d = Math.sqrt((lp.x - pos.x) ** 2 + (lp.y - pos.y) ** 2);
            if (d < bestD) { bestD = d; best = i; }
          });
          if (best >= 0) assignments[best] = lp.player_id;
        });
        setPitchAssignments(assignments);
      }
    }

    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); return () => stopTicker(); }, [load]);

  // ── Bench measurements ────────────────────────────────────────────────────

  useEffect(() => {
    // Remove stale entries for players no longer on bench
    const currentBenchIds = new Set(bench.map(p => p.id));
    for (const pid of benchMeasure.current.keys()) {
      if (!currentBenchIds.has(pid)) benchMeasure.current.delete(pid);
    }
    const t = setTimeout(() => {
      bench.forEach(p => {
        const el = benchViewRefs.current.get(p.id);
        if (el) el.measureInWindow((x, y, w, h) => {
          benchMeasure.current.set(p.id, { cx: x + w / 2, cy: y + h / 2, r: w / 2 + 8 });
        });
      });
    }, 250);
    return () => clearTimeout(t);
  }, [bench, pitchLayout]);

  // ── Auto-stop ─────────────────────────────────────────────────────────────

  // Fires every tick while game is live
  useEffect(() => {
    const s = sessionRef.current;
    if (!s || (s.status !== 'half1' && s.status !== 'half2')) return;
    if (halfElapsed(s) >= s.half_length_seconds) autoStop();
  }, [tick]);

  // Also fires when session first loads — catches phone-lock/resume where ticker may have been paused
  useEffect(() => {
    if (!session || (session.status !== 'half1' && session.status !== 'half2')) return;
    if (halfElapsed(session) >= session.half_length_seconds) autoStop();
  }, [session]);

  async function autoStop() {
    const s = sessionRef.current;
    if (!s || s.status === 'half_time' || s.status === 'full_time' || s.status === 'not_started') return;
    stopTicker();
    const isH1 = s.status === 'half1';
    // Use the exact theoretical end time — not Date.now() which may be late if phone was locked
    const startedAt = isH1 ? s.half1_started_at : s.half2_started_at;
    const endedAt = startedAt
      ? new Date(new Date(startedAt).getTime() + s.half_length_seconds * 1000).toISOString()
      : new Date().toISOString();
    await (supabase as any).from('game_sessions').update({
      status:         isH1 ? 'half_time' : 'full_time',
      half1_ended_at: isH1 ? endedAt : s.half1_ended_at,
      half2_ended_at: isH1 ? null : endedAt,
    }).eq('id', s.id);
    const openIds = periodsRef.current.filter(p => !p.off_at).map(p => p.id);
    if (openIds.length) {
      await (supabase as any).from('player_match_periods').update({ off_at: endedAt }).in('id', openIds);
      setPeriods(prev => prev.map(p => openIds.includes(p.id) ? { ...p, off_at: endedAt } : p));
    }
    setSession({ ...s, status: isH1 ? 'half_time' : 'full_time',
      half1_ended_at: isH1 ? endedAt : s.half1_ended_at,
      half2_ended_at: isH1 ? null : endedAt });
    setOverlay(isH1 ? 'half_time' : 'full_time');
  }

  // ── Score ─────────────────────────────────────────────────────────────────

  async function saveScore(home: number, away: number) {
    await supabase.from('events').update({ score_home: home, score_away: away }).eq('id', eventId);
  }

  function incHome() { const n = scoreHome + 1; setScoreHome(n); saveScore(n, scoreAway); }
  function decHome() { const n = Math.max(0, scoreHome - 1); setScoreHome(n); saveScore(n, scoreAway); }
  function incAway() { const n = scoreAway + 1; setScoreAway(n); saveScore(scoreHome, n); }
  function decAway() { const n = Math.max(0, scoreAway - 1); setScoreAway(n); saveScore(scoreHome, n); }

  // ── Player stats ─────────────────────────────────────────────────────────

  async function openStatsSheet() {
    const { data } = await (supabase as any)
      .from('event_player_stats')
      .select('player_id,goals,assists,yellow_cards')
      .eq('event_id', eventId);
    const map: Record<string, PlayerStatEntry> = {};
    // seed zeroes for all attending players so every row renders
    for (const p of allPlayers) map[p.id] = { goals: 0, assists: 0, yellow_cards: 0 };
    for (const row of (data ?? [])) map[row.player_id] = { goals: row.goals ?? 0, assists: row.assists ?? 0, yellow_cards: row.yellow_cards ?? 0 };
    setPlayerStats(map);
    setStatsVisible(true);
  }

  function adjStat(playerId: string, key: keyof PlayerStatEntry, delta: number) {
    setPlayerStats(prev => {
      const cur = prev[playerId] ?? { goals: 0, assists: 0, yellow_cards: 0 };
      return { ...prev, [playerId]: { ...cur, [key]: Math.max(0, cur[key] + delta) } };
    });
  }

  async function saveStats() {
    if (!teamId || !clubId || !profile) return;
    setStatsSaving(true);
    const rows = Object.entries(playerStats)
      .filter(([, s]) => s.goals > 0 || s.assists > 0 || s.yellow_cards > 0)
      .map(([pid, s]) => ({
        event_id: eventId, player_id: pid, team_id: teamId, club_id: clubId,
        goals: s.goals, assists: s.assists, yellow_cards: s.yellow_cards,
        created_by: profile.id,
      }));
    if (rows.length) {
      await (supabase as any)
        .from('event_player_stats')
        .upsert(rows, { onConflict: 'event_id,player_id' });
    }
    setStatsSaving(false);
    setStatsVisible(false);
  }

  // ── Start game ────────────────────────────────────────────────────────────

  async function startGame() {
    if (!eventId || !profile || !teamId) return;
    const mins = parseInt(halfInput, 10);
    if (!mins || mins < 1 || mins > 90) { Alert.alert('Invalid length', 'Enter a half length between 1 and 90 minutes.'); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const { data: sess, error } = await (supabase as any)
      .from('game_sessions')
      .insert({ event_id: eventId, team_id: teamId, half_length_seconds: mins * 60,
        half1_started_at: now, status: 'half1', created_by: profile.id })
      .select('*').single();
    if (error || !sess) {
      console.error('[MatchTracker]', JSON.stringify(error));
      Alert.alert('Error', error?.message ?? 'Could not start the game.');
      setSaving(false);
      return;
    }
    const starters = assignmentsRef.current.filter(Boolean) as string[];
    if (starters.length) {
      const rows = starters.map(pid => ({ game_session_id: (sess as any).id,
        event_id: eventId, team_id: teamId, player_id: pid, half: 1, on_at: now }));
      const { data: pds } = await (supabase as any).from('player_match_periods').insert(rows).select();
      setPeriods((pds ?? []) as Period[]);
    }
    setSession(sess as GameSession);
    setSetupVisible(false);
    startTicker();
    setSaving(false);
  }

  // ── Start half 2 ──────────────────────────────────────────────────────────

  async function startHalf2() {
    const s = sessionRef.current;
    const tid = teamIdRef.current;
    if (!s || !tid) return;
    setSaving(true);
    const now = new Date().toISOString();
    await (supabase as any).from('game_sessions').update({ status: 'half2', half2_started_at: now }).eq('id', s.id);
    // Use current pitch assignments as the source of truth for who starts half 2
    // (timestamp comparison against half1_ended_at is fragile due to DB precision)
    const on = assignmentsRef.current.filter(Boolean) as string[];
    if (on.length) {
      const rows = on.map(pid => ({ game_session_id: s.id, event_id: eventId, team_id: tid, player_id: pid, half: 2, on_at: now }));
      const { data: pds } = await (supabase as any).from('player_match_periods').insert(rows).select();
      setPeriods(prev => [...prev, ...((pds ?? []) as Period[])]);
    }
    setSession(prev => prev ? { ...prev, status: 'half2', half2_started_at: now } : null);
    setOverlay(null);
    startTicker();
    setSaving(false);
  }

  // ── Drag sub (staging only — no DB write until confirmSubs) ──────────────

  function doDragSub(benchPid: string, slotIdx: number) {
    const isLive = sessionRef.current?.status === 'half1' || sessionRef.current?.status === 'half2';

    if (isLive && baseAssignmentsRef.current === null) {
      // Snapshot confirmed state before first staged sub
      baseAssignmentsRef.current = [...assignmentsRef.current];
      setBaseAssignments([...assignmentsRef.current]);
    }

    const next = [...assignmentsRef.current];
    next[slotIdx] = benchPid;
    setPitchAssignments(next);
    // DB write happens only in confirmSubs
  }

  // ── Confirm staged subs ───────────────────────────────────────────────────

  async function confirmSubs() {
    const s   = sessionRef.current;
    const tid = teamIdRef.current;
    if (!s || !tid || !baseAssignments) return;
    setSaving(true);
    const now  = new Date().toISOString();
    const half = s.status === 'half2' ? 2 : 1;

    const baseSet = new Set(baseAssignments.filter(Boolean) as string[]);
    const curSet  = new Set(assignmentsRef.current.filter(Boolean) as string[]);
    const cameOff = [...baseSet].filter(pid => !curSet.has(pid));
    const cameOn  = [...curSet].filter(pid => !baseSet.has(pid));

    for (const pid of cameOff) {
      const open = periodsRef.current.find(p => p.player_id === pid && !p.off_at);
      if (open) {
        await (supabase as any).from('player_match_periods').update({ off_at: now }).eq('id', open.id);
        setPeriods(prev => prev.map(p => p.id === open.id ? { ...p, off_at: now } : p));
      }
    }
    if (cameOn.length) {
      const rows = cameOn.map(pid => ({
        game_session_id: s.id, event_id: eventId, team_id: tid,
        player_id: pid, half, on_at: now,
      }));
      const { data: pds } = await (supabase as any).from('player_match_periods').insert(rows).select();
      if (pds) setPeriods(prev => [...prev, ...(pds as Period[])]);
    }

    baseAssignmentsRef.current = null;
    setBaseAssignments(null);
    setSaving(false);
  }

  // ── Cancel staged subs ────────────────────────────────────────────────────

  function cancelSubs() {
    if (!baseAssignments) return;
    setPitchAssignments([...baseAssignments]);
    baseAssignmentsRef.current = null;
    setBaseAssignments(null);
  }

  // ── Sub rotation plan ─────────────────────────────────────────────────────

  function calcEqTime(): { targetMins: number; gameMinutes: number; rotations: EqRotation[] } | null {
    if (!session || allPlayers.length === 0) return null;
    const gameMinutes   = Math.round(session.half_length_seconds * 2 / 60);
    const onPitchIds    = new Set(pitchAssignments.filter(Boolean) as string[]);
    const starters      = allPlayers.filter(p => onPitchIds.has(p.id));
    const benchPlayers  = allPlayers.filter(p => !onPitchIds.has(p.id));
    if (starters.length === 0 || benchPlayers.length === 0) return null;
    const targetMins  = Math.round((gameMinutes * starters.length) / allPlayers.length);
    const baseMinute  = gameMinutes - targetMins;
    const rotations: EqRotation[] = benchPlayers.map((bp, i) => ({
      minute:    Math.max(1, Math.min(gameMinutes - 1, baseMinute + i * 3)),
      playerOn:  bp.full_name,
      playerOff: starters[i % starters.length].full_name,
    }));
    return { targetMins, gameMinutes, rotations };
  }

  // ── Formation change ──────────────────────────────────────────────────────

  async function changeFormation(newFm: Formation) {
    const lid = lineupIdRef.current;
    const fm  = formationRef.current;
    if (!lid || !fm) return;
    setSaving(true);
    setFmPicker(false);
    const next = remapToFormation(assignmentsRef.current, fm, newFm);

    // Safety net: any player that was on the pitch must remain on it
    const before = new Set(assignmentsRef.current.filter(Boolean) as string[]);
    const after  = new Set(next.filter(Boolean) as string[]);
    for (const pid of before) {
      if (!after.has(pid)) {
        const emptyIdx = next.findIndex(v => v === null);
        if (emptyIdx !== -1) next[emptyIdx] = pid;
      }
    }

    await supabase.from('lineups').update({ formation: newFm.id }).eq('id', lid);
    await supabase.from('lineup_positions').delete().eq('lineup_id', lid);
    const rows = next
      .map((pid, i) => pid ? { lineup_id: lid, player_id: pid, x: newFm.positions[i].x, y: newFm.positions[i].y, position_label: newFm.positions[i].label } : null)
      .filter(Boolean);
    if (rows.length) await supabase.from('lineup_positions').insert(rows as any);
    setFormation(newFm);
    setPitchAssignments(next);
    setSaving(false);
  }

  // ── PanResponder ──────────────────────────────────────────────────────────

  function benchPlayerAt(px: number, py: number): string | null {
    const currentBenchIds = new Set(benchRef.current.map(p => p.id));
    for (const [pid, m] of benchMeasure.current.entries()) {
      if (!currentBenchIds.has(pid)) continue;
      if (Math.sqrt((px - m.cx) ** 2 + (py - m.cy) ** 2) <= m.r) return pid;
    }
    return null;
  }

  function pitchSlotAt(px: number, py: number): number | null {
    const pl = pitchLayoutRef.current;
    const fm = formationRef.current;
    if (!pl || !fm) return null;
    let best = -1, bestD = SNAP_THRESH;
    fm.positions.forEach((pos, i) => {
      const sx = pl.pageX + (pos.x / 100) * pl.width;
      const sy = pl.pageY + (pos.y / 100) * pl.height;
      const d  = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best === -1 ? null : best;
  }

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: evt =>
      benchPlayerAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY) !== null,
    onMoveShouldSetPanResponder: () => dragStartRef.current !== null,
    onPanResponderGrant: evt => {
      const pid = benchPlayerAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      if (!pid) return;
      dragStartRef.current = pid;
      setDrag({ playerId: pid, pageX: evt.nativeEvent.pageX, pageY: evt.nativeEvent.pageY });
    },
    onPanResponderMove: evt => {
      if (!dragStartRef.current) return;
      const { pageX, pageY } = evt.nativeEvent;
      setDrag({ playerId: dragStartRef.current, pageX, pageY });
      const slot = pitchSlotAt(pageX, pageY);
      hoveredSlotRef.current = slot;
      setHoveredSlot(slot);
    },
    onPanResponderRelease: evt => {
      const pid  = dragStartRef.current;
      const slot = hoveredSlotRef.current;
      dragStartRef.current   = null;
      hoveredSlotRef.current = null;
      setDrag(null);
      setHoveredSlot(null);
      if (pid && slot !== null) doDragSub(pid, slot);
    },
    onPanResponderTerminate: () => {
      dragStartRef.current   = null;
      hoveredSlotRef.current = null;
      setDrag(null);
      setHoveredSlot(null);
    },
  })).current;

  // ── Render values ─────────────────────────────────────────────────────────

  const tokenTextColor = getContrastColor(primaryColor);
  const opponentName   = eventTitle.replace(/^vs\.?\s+/i, '').trim() || 'Them';

  const isLive    = session?.status === 'half1' || session?.status === 'half2';
  const elapsed   = session ? halfElapsed(session) : 0;
  // Freeze player times at the exact moment the clock stopped — never count past half/full time
  const referenceTime: Date = (() => {
    if (!session) return new Date();
    if (session.status === 'half_time' && session.half1_ended_at) return new Date(session.half1_ended_at);
    if (session.status === 'full_time' && session.half2_ended_at) return new Date(session.half2_ended_at);
    // Cap at theoretical half end time even if autoStop hasn't fired yet (e.g. phone was locked)
    if (session.status === 'half1' || session.status === 'half2') {
      const startedAt = session.status === 'half1' ? session.half1_started_at : session.half2_started_at;
      if (startedAt) {
        const theoreticalEnd = new Date(new Date(startedAt).getTime() + session.half_length_seconds * 1000);
        if (new Date() > theoreticalEnd) return theoreticalEnd;
      }
    }
    return new Date();
  })();
  const halfLen       = session?.half_length_seconds ?? 0;
  const progress      = halfLen > 0 ? Math.min(1, elapsed / halfLen) : 0;
  const totalGameSecs = halfLen * 2;
  const totalElapsed  = session ? totalElapsedForSession(session, referenceTime) : 0;
  const remainingSecs = Math.max(0, totalGameSecs - totalElapsed);
  const pitchSlots    = formation?.positions.length ?? 0;
  const eqTargetSecs  = (allPlayers.length > 0 && pitchSlots > 0 && totalGameSecs > 0 && bench.length > 0)
    ? (totalGameSecs * pitchSlots) / allPlayers.length
    : 0;
  const showEqColors  = eqTargetSecs > 0
    && !!session
    && session.status !== 'not_started'
    && session.status !== 'full_time'
    && totalElapsed >= 300;

  const statusConfig: Record<GameStatus | 'none', { label: string; color: string }> = {
    none:      { label: 'Pre-match',  color: PULSE_COLORS.ui.muted },
    not_started:{ label: 'Pre-match', color: PULSE_COLORS.ui.muted },
    half1:     { label: '1st Half',   color: primaryColor },
    half_time: { label: 'Half Time',  color: '#F59E0B' },
    half2:     { label: '2nd Half',   color: primaryColor },
    full_time: { label: 'Full Time',  color: PULSE_COLORS.ui.muted },
  };
  const sc = statusConfig[session?.status ?? 'none'];

  if (loading) {
    return (
      <View style={st.root}>
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
          <Text style={st.loadingText}>Loading match…</Text>
        </View>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const gameBlocked = session?.status === 'half1' || session?.status === 'half2' || session?.status === 'half_time';

  return (
    <View style={st.root}>

      <ClubHeader
        title="Match Tracker"
        subtitle={eventTitle}
        onBack={handleClose}
        right={
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}
            onPress={() => setFmPicker(true)}
          >
            <Ionicons name="swap-horizontal-outline" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{formation?.name ?? 'Formation'}</Text>
          </TouchableOpacity>
        }
      />

      {/* ── Match bar ── */}
      <View style={st.matchBar}>
        <View style={st.matchBarLeft}>
          {/* Status pill */}
          <View style={[st.statusPill, { borderColor: sc.color + '60', backgroundColor: sc.color + '18' }]}>
            {isLive && (
              <View style={[st.liveDot, { backgroundColor: sc.color,
                opacity: tick % 2 === 0 ? 1 : 0.5 }]} />
            )}
            <Text style={[st.statusPillText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {/* Clock */}
        <Text style={st.clock}>{fmtMSS(isLive ? elapsed : 0)}</Text>

        {/* Action */}
        <View style={st.matchBarRight}>
          {!session && (
            <TouchableOpacity style={[st.actionBtn, { backgroundColor: primaryColor }]} onPress={() => setSetupVisible(true)}>
              <Ionicons name="play" size={14} color="#000" />
              <Text style={st.actionBtnText}>Kick Off</Text>
            </TouchableOpacity>
          )}
          {session?.status === 'half_time' && (
            <TouchableOpacity style={[st.actionBtn, { backgroundColor: primaryColor }]} onPress={startHalf2} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#000" />
                : <><Ionicons name="play" size={14} color="#000" /><Text style={st.actionBtnText}>2nd Half</Text></>}
            </TouchableOpacity>
          )}
          {saving && !session && <ActivityIndicator size="small" color={primaryColor} />}
          {saving && session && <ActivityIndicator size="small" color={primaryColor} />}
        </View>
      </View>

      {/* Progress bar */}
      {(isLive || session?.status === 'half_time' || session?.status === 'full_time') && (
        <View style={st.progressTrack}>
          <View style={[st.progressFill, { width: `${progress * 100}%` as any,
            backgroundColor: isLive ? primaryColor : '#F59E0B' }]} />
        </View>
      )}

      {/* ── Live score strip ── */}
      <View style={st.scoreStrip}>
        {/* Home (us) side */}
        <View style={st.scoreSide}>
          {club?.logo_url ? (
            <Image source={{ uri: club.logo_url }} style={st.scoreLogo} />
          ) : (
            <View style={[st.scoreLogoFallback, { backgroundColor: primaryColor + '33' }]}>
              <Text style={[st.scoreLogoFallbackText, { color: primaryColor }]}>
                {(club?.name ?? 'US').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={incHome} hitSlop={8}>
            <Text style={[st.scoreDigit, { color: primaryColor }]}>{scoreHome}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={decHome} hitSlop={10}>
            <Ionicons name="remove-circle-outline" size={18} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        </View>

        <Text style={st.scoreSep}>—</Text>

        {/* Away (them) side */}
        <View style={[st.scoreSide, { flexDirection: 'row-reverse' }]}>
          <Text style={st.scoreOppName} numberOfLines={1}>{opponentName}</Text>
          <TouchableOpacity onPress={incAway} hitSlop={8}>
            <Text style={[st.scoreDigit, { color: PULSE_COLORS.ui.textSecondary }]}>{scoreAway}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={decAway} hitSlop={10}>
            <Ionicons name="remove-circle-outline" size={18} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Pitch + Bench ── */}
      <View style={st.pitchBench} {...pan.panHandlers}>

        {/* Pitch outer wrapper (no overflow: hidden → tokens can bleed slightly) */}
        <View
          ref={pitchViewRef}
          style={st.pitchWrapper}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            setPitchLayout({ width, height });
            pitchViewRef.current?.measureInWindow((px, py, pw, ph) => {
              pitchLayoutRef.current = { pageX: px, pageY: py, width: pw, height: ph };
            });
          }}
        >
          {/* Green surface + markings in clipped inner view */}
          <View style={st.pitchSurface} pointerEvents="none">
            {pitchLayout && (
              <PitchMarkings w={pitchLayout.width} h={pitchLayout.height} />
            )}
          </View>

          {/* Player tokens */}
          {formation && pitchLayout && formation.positions.map((pos, i) => {
            const pid       = pitchAssignments[i];
            const player    = pid ? allPlayers.find(p => p.id === pid) : null;
            const hovered   = hoveredSlot === i;
            const isPending = player ? pendingIncoming.has(player.id) : false;
            const secs      = player && isLive && !isPending ? secondsPlayed(periodsRef.current, player.id, referenceTime) : 0;
            // Pitch players accumulate every second — only flag red if they genuinely can't reach target even by playing the whole remaining game
            const eqCol = showEqColors && player && !isPending && (secs + remainingSecs < eqTargetSecs - 30)
              ? '#EF4444'
              : null;

            const cx = (pos.x / 100) * pitchLayout.width;
            const cy = (pos.y / 100) * pitchLayout.height;

            return (
              <View
                key={i}
                style={[
                  st.token,
                  { left: cx - TOKEN_W / 2, top: cy - TOKEN_H / 2, backgroundColor: isPending ? '#F59E0B' : primaryColor },
                  isPending && st.tokenPending,
                  hovered && st.tokenHover,
                  !player && st.tokenEmpty,
                  eqCol && { borderWidth: 2.5, borderColor: eqCol, shadowColor: eqCol, shadowOpacity: 0.85, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 14 },
                ]}
              >
                {player ? (
                  <>
                    {player.isGuest && <View style={[st.guestDot, { position: 'absolute', top: 2, right: 2 }]}><Text style={st.guestDotText}>G</Text></View>}
                    <Text style={[st.tokenNum, { color: tokenTextColor }]}>{player.jersey_number ?? initials(player.full_name)}</Text>
                    <Text style={[st.tokenName, { color: tokenTextColor + 'cc' }]} numberOfLines={1}>{firstName(player.full_name)}</Text>
                    {isLive && secs > 0 && (
                      <View style={st.tokenTimeBadge}>
                        <Text style={st.tokenTimeText}>{fmtMins(secs)}</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={st.tokenSlotLabel}>{pos.label}</Text>
                )}
              </View>
            );
          })}

          {/* No lineup state */}
          {!formation && (
            <View style={st.noLineup}>
              <Ionicons name="grid-outline" size={28} color="rgba(255,255,255,0.4)" />
              <Text style={st.noLineupText}>No lineup set</Text>
              <Text style={st.noLineupSub}>Tap Formation to pick one</Text>
            </View>
          )}
        </View>

        {/* ── Bench ── */}
        <View style={st.bench}>
          <View style={st.benchHeader}>
            <Text style={st.benchLabel}>BENCH</Text>
            {hasPendingSubs ? (
              <View style={st.subConfirmRow}>
                <TouchableOpacity onPress={cancelSubs} style={st.cancelSubsBtn}>
                  <Text style={st.cancelSubsText}>Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmSubs}
                  disabled={saving}
                  style={[st.confirmSubsBtn, { backgroundColor: primaryColor }]}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#000" />
                    : <Text style={st.confirmSubsText}>
                        Confirm {pendingSubCount} Sub{pendingSubCount !== 1 ? 's' : ''}
                      </Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={st.benchRight}>
                {isLive && bench.length > 0 && (
                  <Text style={st.benchHint}>Drag to sub ·</Text>
                )}
                {session && (
                  <TouchableOpacity
                    style={[st.subPlanChip, { backgroundColor: rgba(0.08), borderColor: rgba(0.22) }]}
                    onPress={() => setEqTimeVisible(true)}
                  >
                    <Ionicons name="timer-outline" size={11} color={primaryColor} />
                    <Text style={[st.subPlanChipText, { color: primaryColor }]}>
                      Equal Time
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <View style={st.benchRow}>
            {bench.map(player => {
              const secs     = secondsPlayed(periodsRef.current, player.id, referenceTime);
              const wasSub   = secs > 0;
              const dragging = drag?.playerId === player.id;
              const eqCol    = showEqColors ? getEqColor(secs, eqTargetSecs, remainingSecs) : null;
              return (
                <View
                  key={player.id}
                  ref={el => { benchViewRefs.current.set(player.id, el); }}
                  style={[
                    st.benchToken,
                    dragging && st.benchDragging,
                    wasSub && [st.benchTokenUsed, { borderColor: rgba(0.35), backgroundColor: rgba(0.06) }],
                    eqCol && {
                      borderColor: eqCol,
                      backgroundColor: eqCol + '22',
                      shadowColor: eqCol,
                      shadowOpacity: 0.9,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 14,
                    },
                  ]}
                >
                  {(wasSub && !eqCol) && <View style={[st.usedDot, { backgroundColor: primaryColor }]} />}
                  {eqCol && <View style={[st.usedDot, { backgroundColor: eqCol }]} />}
                  {player.isGuest && <View style={st.guestDot}><Text style={st.guestDotText}>G</Text></View>}
                  <Text style={[st.benchNum, { color: eqCol ?? (wasSub ? primaryColor : PULSE_COLORS.ui.text) }]}>
                    {player.jersey_number ?? initials(player.full_name)}
                  </Text>
                  <Text style={[st.benchName, eqCol && { color: eqCol + 'cc' }]} numberOfLines={1}>{firstName(player.full_name)}</Text>
                  {wasSub && <Text style={[st.benchTime, { color: eqCol ?? primaryColor }]}>{fmtMins(secs)}</Text>}
                </View>
              );
            })}
            {bench.length === 0 && session && (
              <Text style={st.benchEmpty}>All players on the pitch</Text>
            )}
            {bench.length === 0 && !session && (
              <Text style={st.benchEmpty}>Drag bench players to set your lineup</Text>
            )}
          </View>
        </View>
      </View>

      {/* ── Drag ghost (root level = screen coords) ── */}
      {drag && (() => {
        const p = allPlayers.find(pl => pl.id === drag.playerId);
        return (
          <View
            style={[st.ghost, { left: drag.pageX - BENCH_SZ / 2, top: drag.pageY - BENCH_SZ / 2 }]}
            pointerEvents="none"
          >
            <Text style={st.ghostNum}>{p?.jersey_number ?? (p ? initials(p.full_name) : '?')}</Text>
            <Text style={st.ghostName} numberOfLines={1}>{p ? firstName(p.full_name) : ''}</Text>
          </View>
        );
      })()}

      {/* ── Half-time / Full-time overlay ── */}
      <Modal
        visible={overlay !== null}
        transparent
        animationType="fade"
        onDismiss={() => { if (pendingCloseRef.current) { pendingCloseRef.current = false; onClose(); } }}
      >
        <View style={st.overlayBg}>
          <View style={st.overlayCard}>
            <Text style={[st.overlayTitle, { color: overlay === 'half_time' ? '#F59E0B' : primaryColor }]}>
              {overlay === 'half_time' ? 'HALF TIME' : 'FULL TIME'}
            </Text>
            <Text style={st.overlaySub}>
              {overlay === 'half_time' ? `${halfLen / 60} minutes played` : 'Match complete'}
            </Text>

            {/* Score entry — prominent at full time */}
            {overlay === 'full_time' && (
              <View style={st.scoreEntry}>
                <Text style={st.scoreEntryLabel}>FINAL SCORE</Text>
                <View style={st.scoreEntryRow}>

                  {/* Home */}
                  <View style={st.scoreEntryTeam}>
                    <View style={st.scoreEntryId}>
                      {club?.logo_url ? (
                        <Image source={{ uri: club.logo_url }} style={st.scoreEntryLogo} />
                      ) : (
                        <View style={[st.scoreEntryLogoFb, { backgroundColor: primaryColor + '33' }]}>
                          <Text style={[st.scoreEntryLogoFbText, { color: primaryColor }]}>
                            {(club?.name ?? 'US').slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={[st.scoreEntryName, { color: primaryColor }]} numberOfLines={1}>
                        {(club?.name ?? 'Us').split(' ')[0]}
                      </Text>
                    </View>
                    <Text style={[st.scoreEntryNum, { color: primaryColor }]}>{scoreHome}</Text>
                    <View style={st.scoreEntryBtns}>
                      <TouchableOpacity onPress={decHome} style={st.scoreEntryBtn} hitSlop={8}>
                        <Ionicons name="remove" size={20} color={PULSE_COLORS.ui.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={incHome} style={[st.scoreEntryBtn, { borderColor: primaryColor + '55', backgroundColor: primaryColor + '18' }]} hitSlop={8}>
                        <Ionicons name="add" size={20} color={primaryColor} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={st.scoreEntrySep}>—</Text>

                  {/* Away */}
                  <View style={st.scoreEntryTeam}>
                    <View style={st.scoreEntryId}>
                      <View style={st.scoreEntryOppBadge}>
                        <Ionicons name="shield-outline" size={12} color={PULSE_COLORS.ui.muted} />
                      </View>
                      <Text style={st.scoreEntryName} numberOfLines={1}>{opponentName}</Text>
                    </View>
                    <Text style={[st.scoreEntryNum, { color: PULSE_COLORS.ui.textSecondary }]}>{scoreAway}</Text>
                    <View style={st.scoreEntryBtns}>
                      <TouchableOpacity onPress={decAway} style={st.scoreEntryBtn} hitSlop={8}>
                        <Ionicons name="remove" size={20} color={PULSE_COLORS.ui.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={incAway} style={[st.scoreEntryBtn, { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' }]} hitSlop={8}>
                        <Ionicons name="add" size={20} color={PULSE_COLORS.ui.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                </View>
              </View>
            )}

            {overlay === 'full_time' && (
              <TouchableOpacity
                style={[st.logStatsBtn, { borderColor: primaryColor + '50', backgroundColor: primaryColor + '12' }]}
                onPress={openStatsSheet}
              >
                <Ionicons name="football-outline" size={14} color={primaryColor} />
                <Text style={[st.logStatsBtnText, { color: primaryColor }]}>Log Goals & Assists</Text>
                <Ionicons name="chevron-forward" size={14} color={primaryColor + '80'} />
              </TouchableOpacity>
            )}

            <View style={st.overlaySummary}>
              <View style={st.overlaySummaryHeader}>
                <Text style={st.overlaySummaryHdr}>Player</Text>
                <Text style={st.overlaySummaryHdr}>Time</Text>
              </View>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {[...allPlayers]
                  .sort((a, b) => secondsPlayed(periods, b.id, referenceTime) - secondsPlayed(periods, a.id, referenceTime))
                  .map(player => {
                    const secs = secondsPlayed(periods, player.id, referenceTime);
                    return (
                      <View key={player.id} style={st.summaryRow}>
                        <View style={st.summaryLeft}>
                          {player.jersey_number != null && (
                            <View style={[st.summaryJersey, { backgroundColor: rgba(0.12), borderColor: rgba(0.25) }]}>
                              <Text style={[st.summaryJerseyNum, { color: primaryColor }]}>{player.jersey_number}</Text>
                            </View>
                          )}
                          <Text style={st.summaryName} numberOfLines={1}>{player.full_name}</Text>
                        </View>
                        <Text style={[st.summaryTime, { color: secs > 0 ? primaryColor : PULSE_COLORS.ui.muted }]}>
                          {secs > 0 ? fmtMSS(secs) : '—'}
                        </Text>
                      </View>
                    );
                  })}
              </ScrollView>
            </View>

            {overlay === 'half_time'
              ? <TouchableOpacity style={[st.overlayBtn, { backgroundColor: primaryColor }]} onPress={startHalf2} disabled={saving}>
                  {saving
                    ? <ActivityIndicator size="small" color={tokenTextColor} />
                    : <Text style={[st.overlayBtnText, { color: tokenTextColor }]}>Start 2nd Half</Text>}
                </TouchableOpacity>
              : <TouchableOpacity style={[st.overlayBtn, { backgroundColor: primaryColor }]} onPress={async () => { await saveScore(scoreHome, scoreAway); pendingCloseRef.current = true; setOverlay(null); }}>
                  <Text style={[st.overlayBtnText, { color: tokenTextColor }]}>Save Result & Close</Text>
                </TouchableOpacity>}
          </View>
        </View>
      </Modal>

      {/* ── Start match modal ── */}
      <Modal visible={setupVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={st.sheetBg}>
            <View style={st.sheet}>
              <View style={st.sheetHandle} />
              <Text style={st.sheetTitle}>Start Match</Text>
              <Text style={st.sheetBody}>How long is each half?</Text>
              <View style={st.halfInputRow}>
                {[25, 30, 35, 40, 45].map(mins => (
                  <TouchableOpacity
                    key={mins}
                    style={[st.halfChip, halfInput === String(mins) && [st.halfChipActive, { backgroundColor: rgba(0.12), borderColor: primaryColor }]]}
                    onPress={() => { Keyboard.dismiss(); setHalfInput(String(mins)); }}
                  >
                    <Text style={[st.halfChipText, halfInput === String(mins) && [st.halfChipTextActive, { color: primaryColor }]]}>
                      {mins}'
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={st.halfCustomRow}>
                <TextInput
                  style={st.halfCustomInput}
                  value={halfInput}
                  onChangeText={setHalfInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="Custom"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  selectTextOnFocus
                  onSubmitEditing={Keyboard.dismiss}
                />
                <TouchableOpacity onPress={Keyboard.dismiss} style={[st.halfDoneBtn, { backgroundColor: rgba(0.12), borderColor: rgba(0.3) }]}>
                  <Text style={[st.halfDoneText, { color: primaryColor }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[st.kickOffBtn, { backgroundColor: primaryColor }]} onPress={() => { Keyboard.dismiss(); startGame(); }} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={st.kickOffText}>Kick Off</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={st.sheetCancel} onPress={() => { Keyboard.dismiss(); setSetupVisible(false); }}>
                <Text style={st.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Equal playing time sheet ── */}
      <Modal visible={eqTimeVisible} transparent animationType="slide" onRequestClose={() => setEqTimeVisible(false)}>
        <View style={st.sheetBg}>
          <View style={st.sheet}>
            <View style={st.sheetHandle} />
            <Text style={st.sheetTitle}>Equal Playing Time</Text>
            {(() => {
              const eq = calcEqTime();
              if (!eq) {
                return (
                  <Text style={st.sheetBody}>
                    {allPlayers.length === 0
                      ? 'No confirmed players yet.'
                      : 'All players are already on the pitch — no subs needed.'}
                  </Text>
                );
              }
              const subEvery = eq.rotations.length > 0
                ? Math.round(eq.gameMinutes / (eq.rotations.length + 1))
                : null;
              return (
                <>
                  <View style={st.eqTargetCard}>
                    <Text style={[st.eqTargetNum, { color: primaryColor }]}>{eq.targetMins}'</Text>
                    <Text style={st.eqTargetLabel}>target per player</Text>
                    <Text style={st.eqTargetSub}>{allPlayers.length} players · {eq.gameMinutes} min game</Text>
                  </View>
                  {subEvery !== null && (
                    <Text style={st.eqHint}>
                      Make a sub roughly every {subEvery} minutes — you choose who.
                    </Text>
                  )}
                </>
              );
            })()}
            <TouchableOpacity style={st.sheetCancel} onPress={() => setEqTimeVisible(false)}>
              <Text style={st.sheetCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Goals & Assists sheet ── */}
      <Modal visible={statsVisible} transparent animationType="slide" onRequestClose={() => setStatsVisible(false)}>
        <View style={st.sheetBg}>
          <View style={[st.sheet, { maxHeight: '85%' }]}>
            <View style={st.sheetHandle} />
            <Text style={st.sheetTitle}>Goals & Assists</Text>
            <Text style={st.sheetBody}>Tap + to log stats per player. Yellow card column tracks discipline.</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {allPlayers.map(player => {
                const s = playerStats[player.id] ?? { goals: 0, assists: 0, yellow_cards: 0 };
                return (
                  <View key={player.id} style={st.statsRow}>
                    <View style={st.statsRowLeft}>
                      <View style={[st.statsJersey, { backgroundColor: primaryColor + '22', borderColor: primaryColor + '40' }]}>
                        <Text style={[st.statsJerseyNum, { color: primaryColor }]}>{player.jersey_number ?? '—'}</Text>
                      </View>
                      <Text style={st.statsPlayerName} numberOfLines={1}>{firstName(player.full_name)}</Text>
                    </View>
                    <View style={st.statsCounters}>
                      {([
                        { key: 'goals' as const,        label: 'G', color: primaryColor },
                        { key: 'assists' as const,      label: 'A', color: '#3B82F6' },
                        { key: 'yellow_cards' as const, label: 'Y', color: '#F59E0B' },
                      ]).map(({ key, label, color }) => (
                        <View key={key} style={st.counterGroup}>
                          <Text style={[st.counterLabel, { color }]}>{label}</Text>
                          <View style={st.counterRow}>
                            <TouchableOpacity onPress={() => adjStat(player.id, key, -1)} hitSlop={8} style={st.counterBtn}>
                              <Ionicons name="remove" size={14} color={PULSE_COLORS.ui.muted} />
                            </TouchableOpacity>
                            <Text style={[st.counterVal, s[key] > 0 && { color }]}>{s[key]}</Text>
                            <TouchableOpacity onPress={() => adjStat(player.id, key, 1)} hitSlop={8} style={[st.counterBtn, { borderColor: color + '50', backgroundColor: color + '12' }]}>
                              <Ionicons name="add" size={14} color={color} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[st.kickOffBtn, { backgroundColor: primaryColor }]}
              onPress={saveStats}
              disabled={statsSaving}
            >
              {statsSaving
                ? <ActivityIndicator size="small" color={tokenTextColor} />
                : <Text style={[st.kickOffText, { color: tokenTextColor }]}>Save Stats</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={st.sheetCancel} onPress={() => setStatsVisible(false)}>
              <Text style={st.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Formation picker ── */}
      <Modal visible={fmPicker} transparent animationType="slide">
        <View style={st.sheetBg}>
          <View style={st.sheet}>
            <View style={st.sheetHandle} />
            <Text style={st.sheetTitle}>Change Formation</Text>
            <Text style={st.sheetBody}>Players will be remapped to the closest matching positions.</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340, marginTop: 4 }}>
              {availableFormations.map(fm => {
                const active = formation?.id === fm.id;
                return (
                  <TouchableOpacity
                    key={fm.id}
                    style={[st.fmOption, active && [st.fmOptionActive, { borderColor: rgba(0.4), backgroundColor: rgba(0.06) }]]}
                    onPress={() => changeFormation(fm)}
                    disabled={saving || active}
                  >
                    <View style={st.fmOptionLeft}>
                      <View style={[st.fmOptionBadge, active && [st.fmOptionBadgeActive, { backgroundColor: rgba(0.15) }]]}>
                        <Text style={[st.fmOptionBadgeText, active && [st.fmOptionBadgeTextActive, { color: primaryColor }]]}>
                          {fm.name}
                        </Text>
                      </View>
                      <Text style={st.fmOptionNick}>{fm.nickname}</Text>
                    </View>
                    {active
                      ? <Ionicons name="checkmark-circle" size={20} color={primaryColor} />
                      : <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.border} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={st.sheetCancel} onPress={() => setFmPicker(false)}>
              <Text style={st.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#0F0F0F' },
  center:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: PULSE_COLORS.ui.muted },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#0F0F0F',
  },
  backBtn:      { width: 40, height: 36, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  headerSub:    { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  fmChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  fmChipText: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.brand.green },

  // Match bar
  matchBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#161616',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#222',
    gap: 12,
  },
  matchBarLeft:  { flex: 1 },
  matchBarRight: { flex: 1, alignItems: 'flex-end' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  liveDot:       { width: 6, height: 6, borderRadius: 3 },
  statusPillText:{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  clock: {
    fontSize: 44, fontWeight: '900', color: PULSE_COLORS.ui.text,
    fontVariant: ['tabular-nums'], letterSpacing: -1,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: PULSE_COLORS.brand.green,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9,
  },
  actionBtnText: { fontSize: 13, fontWeight: '800', color: '#000' },

  // Progress bar
  progressTrack: { height: 3, backgroundColor: '#222' },
  progressFill:  { height: 3, borderRadius: 1.5 },

  // Live score strip
  scoreStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#161616', borderBottomWidth: 1, borderBottomColor: '#222',
    gap: 12,
  },
  scoreSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreLogo: { width: 22, height: 22, borderRadius: 11 },
  scoreLogoFallback: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreLogoFallbackText: { fontSize: 7, fontWeight: '900' },
  scoreOppName: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    flexShrink: 1, letterSpacing: 0.3,
  },
  scoreDigit: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'], minWidth: 22, textAlign: 'center' },
  scoreSep: { fontSize: 20, fontWeight: '700', color: '#444' },

  // Full-time score entry
  scoreEntry: {
    backgroundColor: '#1A1A1A', borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: '#2A2A2A',
  },
  scoreEntryLabel: { fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 1.5, textAlign: 'center', marginBottom: 16 },
  scoreEntryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreEntryTeam: { flex: 1, alignItems: 'center', gap: 6 },
  scoreEntryId: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  scoreEntryLogo: { width: 18, height: 18, borderRadius: 9 },
  scoreEntryLogoFb: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreEntryLogoFbText: { fontSize: 6, fontWeight: '900' },
  scoreEntryOppBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  scoreEntryName: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, flexShrink: 1 },
  scoreEntryNum: { fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'], textAlign: 'center', lineHeight: 52 },
  scoreEntryBtns: { flexDirection: 'row', gap: 8 },
  scoreEntryBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1,
    borderColor: '#333', backgroundColor: '#252525',
    alignItems: 'center', justifyContent: 'center',
  },
  scoreEntrySep: { fontSize: 24, fontWeight: '700', color: '#333', paddingTop: 20 },

  // Pitch wrapper
  pitchBench:   { flex: 1 },
  pitchWrapper: {
    flex: 1,
    margin: 10,
    borderRadius: 14,
    overflow: 'visible', // allow token labels to bleed slightly
    position: 'relative',
  },
  pitchSurface: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: PITCH_GREEN,
    borderRadius: 14,
    overflow: 'hidden',
  },

  // Tokens
  token: {
    position: 'absolute',
    width: TOKEN_W, height: TOKEN_H,
    borderRadius: 10,
    backgroundColor: PULSE_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 3,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  tokenHover: {
    backgroundColor: '#60A5FA',
    transform: [{ scale: 1.2 }],
    shadowColor: '#60A5FA', shadowOpacity: 0.8, shadowRadius: 10,
    elevation: 12,
  },
  tokenPending: {
    borderWidth: 2,
    borderColor: '#FDE68A',
  },
  tokenEmpty: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed',
    shadowOpacity: 0,
    elevation: 0,
  },
  tokenNum:       { fontSize: 13, fontWeight: '900', lineHeight: 16 },
  tokenName:      { fontSize: 8,  fontWeight: '700', maxWidth: TOKEN_W - 4, lineHeight: 10 },
  tokenTimeBadge: {
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1, marginTop: 2,
  },
  tokenTimeText:  { fontSize: 7, fontWeight: '800', color: '#fff' },
  tokenSlotLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },

  // No lineup
  noLineup: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  noLineupText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  noLineupSub:  { fontSize: 12, color: 'rgba(255,255,255,0.3)' },

  // Bench
  bench: {
    backgroundColor: '#161616',
    borderTopWidth: 1, borderTopColor: '#222',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16,
  },
  benchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  benchLabel:  { fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.muted, letterSpacing: 2 },
  benchHint:   { fontSize: 10, color: PULSE_COLORS.ui.muted, fontStyle: 'italic' },
  subConfirmRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelSubsBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  cancelSubsText: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  confirmSubsBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
  confirmSubsText:{ fontSize: 12, fontWeight: '800', color: '#000' },
  benchRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  benchToken: {
    width: BENCH_SZ, height: BENCH_SZ, borderRadius: BENCH_SZ / 2,
    backgroundColor: '#1E1E1E',
    borderWidth: 1.5, borderColor: '#2E2E2E',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  benchTokenUsed: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.06)',
  },
  benchDragging: { opacity: 0.15, transform: [{ scale: 0.9 }] },
  usedDot: {
    position: 'absolute', top: 2, right: 2,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: PULSE_COLORS.brand.green,
  },
  benchNum:     { fontSize: 14, fontWeight: '900', color: PULSE_COLORS.ui.text },
  benchNumUsed: { color: PULSE_COLORS.brand.green },
  benchName:    { fontSize: 7, fontWeight: '700', color: PULSE_COLORS.ui.muted, maxWidth: BENCH_SZ - 6 },
  benchTime:    { fontSize: 7, color: PULSE_COLORS.brand.green, fontVariant: ['tabular-nums'], fontWeight: '700' },
  benchEmpty:   { fontSize: 12, color: PULSE_COLORS.ui.muted, paddingVertical: 4 },

  // Ghost
  ghost: {
    position: 'absolute', zIndex: 999,
    width: BENCH_SZ, height: BENCH_SZ, borderRadius: BENCH_SZ / 2,
    backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3B82F6', shadowOpacity: 0.8, shadowRadius: 16, elevation: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  ghostNum:  { fontSize: 14, fontWeight: '900', color: '#fff' },
  ghostName: { fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.85)', maxWidth: BENCH_SZ - 6 },

  // Overlay
  overlayBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  overlayCard: {
    width: '100%', backgroundColor: '#161616',
    borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: '#2E2E2E',
    shadowColor: '#000', shadowOpacity: 0.7, shadowRadius: 20, elevation: 20,
  },
  overlayTitle: {
    fontSize: 36, fontWeight: '900', textAlign: 'center',
    letterSpacing: 3, marginBottom: 4,
  },
  overlaySub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', marginBottom: 20 },
  overlaySummary: {
    backgroundColor: '#1E1E1E', borderRadius: 16,
    borderWidth: 1, borderColor: '#2E2E2E', overflow: 'hidden', marginBottom: 16,
  },
  overlaySummaryHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#2E2E2E',
    backgroundColor: '#252525',
  },
  overlaySummaryHdr: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  summaryLeft:      { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  summaryJersey: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryJerseyNum: { fontSize: 10, fontWeight: '900', color: PULSE_COLORS.brand.green },
  summaryName:      { fontSize: 14, color: PULSE_COLORS.ui.text, fontWeight: '500', flex: 1 },
  summaryTime:      { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  overlayBtn: {
    backgroundColor: PULSE_COLORS.brand.green,
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  overlayBtnText: { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 0.5 },

  // Sheet (bottom sheet style)
  sheetBg:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40,
    borderWidth: 1, borderColor: '#2E2E2E', borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#3E3E3E',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  sheetBody:  { fontSize: 13, color: PULSE_COLORS.ui.muted, marginBottom: 20 },

  // Half input
  halfInputRow:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
  halfChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#2E2E2E',
    alignItems: 'center',
  },
  halfChipActive: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: PULSE_COLORS.brand.green },
  halfChipText:     { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.muted },
  halfChipTextActive: { color: PULSE_COLORS.brand.green },
  halfCustomRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  halfCustomInput: {
    flex: 1,
    backgroundColor: '#1E1E1E', borderRadius: 14,
    borderWidth: 1, borderColor: '#2E2E2E',
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 16, color: PULSE_COLORS.ui.text,
    textAlign: 'center',
  },
  halfDoneBtn: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  halfDoneText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green },
  kickOffBtn: {
    backgroundColor: PULSE_COLORS.brand.green,
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  kickOffText:  { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 0.5 },
  sheetCancel:  { alignItems: 'center', paddingVertical: 14 },
  sheetCancelText: { fontSize: 15, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // Bench right-side area
  benchRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subPlanChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 16,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  subPlanChipText: { fontSize: 11, fontWeight: '700' },

  // Equal time sheet content
  eqTargetCard: {
    alignItems: 'center', paddingVertical: 20, marginBottom: 18,
    borderRadius: 16, backgroundColor: '#1A1A1A',
    borderWidth: 1, borderColor: '#2E2E2E',
  },
  eqTargetNum:   { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  eqTargetLabel: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text, marginTop: 2 },
  eqTargetSub:   { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 4 },
  eqHint: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 19, marginTop: 4 },

  // Formation picker
  fmOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1E1E1E', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#2E2E2E', marginBottom: 8,
  },
  fmOptionActive: { borderColor: 'rgba(34,197,94,0.4)', backgroundColor: 'rgba(34,197,94,0.06)' },
  fmOptionLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fmOptionBadge: {
    backgroundColor: '#2E2E2E', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  fmOptionBadgeActive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  fmOptionBadgeText:   { fontSize: 14, fontWeight: '800', color: PULSE_COLORS.ui.muted },
  fmOptionBadgeTextActive: { color: PULSE_COLORS.brand.green },
  fmOptionNick: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  // Log stats button
  logStatsBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14 },
  logStatsBtnText: { flex: 1, fontSize: 14, fontWeight: '700' },

  // Stats sheet
  statsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  statsRowLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statsJersey:    { width: 28, height: 28, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statsJerseyNum: { fontSize: 11, fontWeight: '900' },
  statsPlayerName:{ fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text, flex: 1 },
  statsCounters:  { flexDirection: 'row', gap: 12 },
  counterGroup:   { alignItems: 'center', gap: 4 },
  counterLabel:   { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  counterRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  counterBtn:     { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: '#333', backgroundColor: '#252525', alignItems: 'center', justifyContent: 'center' },
  counterVal:     { fontSize: 15, fontWeight: '900', color: PULSE_COLORS.ui.muted, minWidth: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },

  guestDot: {
    backgroundColor: 'rgba(249,115,22,0.9)',
    borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  guestDotText: { fontSize: 7, fontWeight: '900', color: '#fff', letterSpacing: 0.3 },
});

// ─── Route wrapper (thin — keep for any direct navigation) ───────────────────

export default function MatchTrackerScreen() {
  const { clubSlug, eventId } = useLocalSearchParams<{ clubSlug: string; eventId: string }>();
  const navigation = useNavigation();
  return (
    <MatchTrackerContent
      eventId={eventId!}
      clubSlug={clubSlug!}
      onClose={() => navigation.goBack()}
    />
  );
}
