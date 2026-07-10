import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../../lib/supabase';
import { useAuth } from '../../../../../../hooks/useAuth';
import { useLineup } from '../../../../../../hooks/useLineup';
import { FormationSelector } from '../../../../../../components/lineup/FormationSelector';
import { PULSE_COLORS } from '../../../../../../constants/colors';
import { useClub } from '../../../../../../hooks/useClub';
import ClubHeader from '../../../../../../components/ui/ClubHeader';
import type { PositionSlot } from '../../../../../../constants/formations';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventInfo = { id: string; title: string; event_date: string; team_id: string };
type TeamInfo  = { id: string; age_group: string | null };
type Player    = { id: string; full_name: string; jersey_number: number | null; position: string | null; isGuest?: boolean; isInjured?: boolean };
type BottomTab = 'formation' | 'players';
type DragState = { fromIdx: number; pageX: number; pageY: number } | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HINT_H   = 40;
const BOTTOM_H = 290;
const TOKEN        = 40;
const DRAG_TOKEN   = TOKEN * 1.25;          // ghost is bigger
const DRAG_THRESH  = 6;                     // px before drag starts
const SNAP_THRESH  = TOKEN * 1.8;           // px radius for snap-on-drop

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}
function firstName(name: string) {
  return name.split(' ')[0].slice(0, 8);
}

// ─── Pitch markings ───────────────────────────────────────────────────────────

function PitchMarkings({ w, h }: { w: number; h: number }) {
  const c = 'rgba(255,255,255,0.28)';
  const L = 1.5;
  const ccR = h * 0.12;
  const paW = w * 0.62; const paH = h * 0.175;
  const gaW = w * 0.30; const gaH = h * 0.065;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position:'absolute', top:h/2, left:0, right:0, height:L, backgroundColor:c }} />
      <View style={{ position:'absolute', width:ccR*2, height:ccR*2, borderRadius:ccR,
        borderWidth:L, borderColor:c, top:h/2-ccR, left:w/2-ccR }} />
      <View style={{ position:'absolute', width:5, height:5, borderRadius:2.5,
        backgroundColor:c, top:h/2-2.5, left:w/2-2.5 }} />
      <View style={{ position:'absolute', width:paW, height:paH, borderWidth:L,
        borderColor:c, top:0, left:(w-paW)/2 }} />
      <View style={{ position:'absolute', width:gaW, height:gaH, borderWidth:L,
        borderColor:c, top:0, left:(w-gaW)/2 }} />
      <View style={{ position:'absolute', width:5, height:5, borderRadius:2.5,
        backgroundColor:c, top:h*0.12-2.5, left:w/2-2.5 }} />
      <View style={{ position:'absolute', width:paW, height:paH, borderWidth:L,
        borderColor:c, bottom:0, left:(w-paW)/2 }} />
      <View style={{ position:'absolute', width:gaW, height:gaH, borderWidth:L,
        borderColor:c, bottom:0, left:(w-gaW)/2 }} />
      <View style={{ position:'absolute', width:5, height:5, borderRadius:2.5,
        backgroundColor:c, bottom:h*0.12-2.5, left:w/2-2.5 }} />
    </View>
  );
}

// ─── Slot token (visual only — touch handled by pitch PanResponder) ───────────

function SlotToken({
  label, player, isSelected, isTarget, isDimmed,
}: {
  label: string;
  player: Player | null;
  isSelected: boolean;
  isTarget: boolean;
  isDimmed: boolean;
}) {
  const { primaryColor } = useClub();
  const assigned = player !== null;
  return (
    <View
      style={[
        styles.token,
        assigned ? [styles.tokenAssigned, { backgroundColor: primaryColor }] : styles.tokenEmpty,
        isSelected && styles.tokenSelected,
        isTarget   && styles.tokenTarget,
        isDimmed   && styles.tokenDimmed,
      ]}
    >
      <Text style={[styles.tokenLabel, assigned ? styles.tokenLabelAssigned : styles.tokenLabelEmpty]}>
        {assigned
          ? (player.jersey_number != null ? String(player.jersey_number) : initials(player.full_name))
          : label}
      </Text>
      {assigned && (
        <Text style={styles.tokenName} numberOfLines={1}>{firstName(player.full_name)}</Text>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LineupScreen() {
  const { primaryColor, rgba } = useClub();
  const { clubSlug, eventId } = useLocalSearchParams<{ clubSlug: string; eventId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  // Pitch dimensions — computed from actual header height so nothing overflows
  const HEADER_H     = insets.top + 74; // ClubHeader: paddingTop(top+10)+marginTop(8)+row(40)+paddingBottom(16)
  const PITCH_AREA_H = SCREEN_H - HEADER_H - HINT_H - BOTTOM_H;
  const PITCH_W      = Math.min(SCREEN_W - 24, PITCH_AREA_H / 1.48);
  const PITCH_H      = PITCH_W * 1.48;

  const [event,   setEvent]   = useState<EventInfo | null>(null);
  const [team,    setTeam]    = useState<TeamInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const [assignments,     setAssignments]     = useState<Record<number, string>>({});
  const [selectedSlot,    setSelectedSlot]    = useState<number | null>(null);
  const [activeTab,       setActiveTab]       = useState<BottomTab>('formation');
  const [drag,            setDrag]            = useState<DragState>(null);
  const [aiSuggesting,    setAiSuggesting]    = useState(false);

  const lineup = useLineup(team?.age_group);

  // ── Mutable refs (safe to read in PanResponder callbacks) ─────────────────

  const assignmentsRef  = useRef(assignments);
  const positionsRef    = useRef<PositionSlot[]>([]);
  const pitchLayoutRef  = useRef({ x: 0, y: 0 });
  const playersRef      = useRef(players);
  const dragFromRef     = useRef<number | null>(null);
  const pitchViewRef    = useRef<View>(null);
  const pitchWRef       = useRef(PITCH_W);
  const pitchHRef       = useRef(PITCH_H);

  useEffect(() => { assignmentsRef.current = assignments; }, [assignments]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { pitchWRef.current = PITCH_W; pitchHRef.current = PITCH_H; }, [PITCH_W, PITCH_H]);

  // ── Pitch PanResponder ────────────────────────────────────────────────────

  const pitchPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, gs) =>
        Math.abs(gs.dx) > DRAG_THRESH / 2 || Math.abs(gs.dy) > DRAG_THRESH / 2,

      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const layout = pitchLayoutRef.current;
        const relX = (pageX - layout.x) / pitchWRef.current * 100;
        const relY = (pageY - layout.y) / pitchHRef.current * 100;
        const pos  = positionsRef.current;
        const asn  = assignmentsRef.current;

        // Detect if finger landed on an assigned token
        dragFromRef.current = null;
        for (let i = 0; i < pos.length; i++) {
          if (!asn[i]) continue;
          const dx = (pos[i].x - relX) / 100 * pitchWRef.current;
          const dy = (pos[i].y - relY) / 100 * pitchHRef.current;
          if (Math.sqrt(dx * dx + dy * dy) < TOKEN * 0.9) {
            dragFromRef.current = i;
            break;
          }
        }
      },

      onPanResponderMove: (evt, gs) => {
        if (dragFromRef.current === null) return;
        const moved = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        if (moved < DRAG_THRESH) return;
        setDrag({ fromIdx: dragFromRef.current, pageX: evt.nativeEvent.pageX, pageY: evt.nativeEvent.pageY });
      },

      onPanResponderRelease: (evt, gs) => {
        const { pageX, pageY } = evt.nativeEvent;
        const moved    = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        const wasDrag  = moved >= DRAG_THRESH && dragFromRef.current !== null;
        const layout   = pitchLayoutRef.current;
        const relX     = (pageX - layout.x) / pitchWRef.current * 100;
        const relY     = (pageY - layout.y) / pitchHRef.current * 100;
        const pos      = positionsRef.current;

        if (wasDrag) {
          // ── Drop: find nearest slot ──────────────────────────────────────
          let nearestIdx = -1; let nearestDist = SNAP_THRESH;
          pos.forEach((p, i) => {
            if (i === dragFromRef.current) return;
            const dx = (p.x - relX) / 100 * pitchWRef.current;
            const dy = (p.y - relY) / 100 * pitchHRef.current;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          });

          if (nearestIdx >= 0) {
            setAssignments((prev) => {
              const next = { ...prev };
              const from = dragFromRef.current!;
              const fromPlayer = next[from];
              const toPlayer   = next[nearestIdx];
              if (fromPlayer) next[nearestIdx] = fromPlayer; else delete next[nearestIdx];
              if (toPlayer)   next[from] = toPlayer;         else delete next[from];
              return next;
            });
          }

        } else {
          // ── Tap: find nearest slot ───────────────────────────────────────
          const asn = assignmentsRef.current;
          let nearestIdx = -1; let nearestDist = TOKEN * 1.2;
          pos.forEach((p, i) => {
            const dx = (p.x - relX) / 100 * pitchWRef.current;
            const dy = (p.y - relY) / 100 * pitchHRef.current;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
          });

          if (nearestIdx >= 0) {
            if (asn[nearestIdx]) {
              // Tap on assigned token → prompt remove
              const pl  = playersRef.current.find((p) => p.id === asn[nearestIdx]);
              const lbl = pos[nearestIdx]?.label ?? '';
              Alert.alert(
                `${lbl}  —  ${pl?.full_name ?? 'Player'}`,
                'Remove from this position?',
                [
                  { text: 'Keep', style: 'cancel' },
                  {
                    text: 'Remove', style: 'destructive',
                    onPress: () => setAssignments((prev) => {
                      const m = { ...prev }; delete m[nearestIdx]; return m;
                    }),
                  },
                ]
              );
            } else {
              // Tap on empty slot → select it
              setSelectedSlot(nearestIdx);
              setActiveTab('players');
            }
          }
        }

        dragFromRef.current = null;
        setDrag(null);
      },

      onPanResponderTerminate: () => {
        dragFromRef.current = null;
        setDrag(null);
      },
    })
  ).current;

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!eventId) return;

    const { data: ev } = await supabase
      .from('events').select('id, title, event_date, team_id').eq('id', eventId).single();
    if (!ev) { setLoading(false); return; }
    setEvent(ev as EventInfo);

    const { data: tm } = await supabase
      .from('teams').select('id, age_group').eq('id', ev.team_id).single();
    if (tm) setTeam(tm as TeamInfo);

    const [rsvpsRes, guestsRes] = await Promise.all([
      supabase.from('event_rsvps').select('player_id').eq('event_id', eventId).eq('status', 'attending'),
      (supabase as any).from('event_guests').select('player_id, full_name, status').eq('event_id', eventId).eq('role', 'player').neq('status', 'declined'),
    ]);
    const regularIds = (rsvpsRes.data ?? []).map((r: any) => r.player_id as string);
    const guestRows: any[] = guestsRes.data ?? [];
    const guestPlayerIds = guestRows.filter((g: any) => g.player_id).map((g: any) => g.player_id as string);
    const allIds = [...new Set([...regularIds, ...guestPlayerIds])];
    if (allIds.length > 0) {
      const { data: pls } = await supabase
        .from('players').select('id, full_name, jersey_number, position, is_injured').in('id', allIds).order('jersey_number');
      const guestIdSet = new Set(guestPlayerIds);
      setPlayers(((pls ?? []) as any[]).map(p => ({ ...p, isGuest: guestIdSet.has(p.id), isInjured: p.is_injured ?? false })));
    }

    const { data: existing } = await supabase
      .from('lineups')
      .select('id, formation, lineup_positions(player_id, x, y)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      lineup.setSelectedFormationId(existing.formation);
      const lps = (existing as any).lineup_positions ?? [];
      // Map positions after formation is updated — use a short delay for state settle
      setTimeout(() => {
        const fps = positionsRef.current;
        const map: Record<number, string> = {};
        lps.forEach((lp: { player_id: string; x: number; y: number }) => {
          const idx = fps.findIndex((fp) => Math.abs(fp.x - lp.x) < 1 && Math.abs(fp.y - lp.y) < 1);
          if (idx >= 0) map[idx] = lp.player_id;
        });
        setAssignments(map);
      }, 50);
    }

    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { lineup.loadFavourites(); }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!event || !lineup.selectedFormation || !profile) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('lineups').select('id').eq('event_id', event.id).maybeSingle();

      let lineupId: string;
      if (existing) {
        await supabase.from('lineups')
          .update({ formation: lineup.selectedFormationId }).eq('id', existing.id);
        lineupId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from('lineups')
          .insert({ event_id: event.id, formation: lineup.selectedFormationId, created_by: profile.id })
          .select('id').single();
        if (error || !created) throw error ?? new Error('Insert failed');
        lineupId = created.id;
      }

      await supabase.from('lineup_positions').delete().eq('lineup_id', lineupId);

      const pos  = lineup.selectedFormation.positions;
      const rows = Object.entries(assignments).map(([idxStr, playerId]) => {
        const p = pos[Number(idxStr)];
        return { lineup_id: lineupId, player_id: playerId, x: p.x, y: p.y, position_label: p.label };
      });
      if (rows.length > 0) await supabase.from('lineup_positions').insert(rows);

      // Push to coaches only (parents cannot see lineup)
      const { data: coachMembers } = await supabase
        .from('team_members')
        .select('profile_id')
        .eq('team_id', event.team_id)
        .eq('role', 'coach');
      const coachIds = (coachMembers ?? []).map((m: any) => m.profile_id as string).filter(Boolean);
      if (coachIds.length) {
        supabase.functions.invoke('send-push', {
          body: {
            profile_ids: coachIds,
            type: 'lineup_published',
            title: '📋 Lineup saved',
            body: `${event.title} lineup has been updated`,
            data: { type: 'lineup_published', event_id: event.id },
          },
        }).catch(() => {});
      }

      Alert.alert('Saved', 'Lineup saved.');
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save lineup. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAiSuggest() {
    if (!lineup.selectedFormationId || !event) {
      Alert.alert('Select a formation first', 'Choose a formation before using AI suggest.');
      return;
    }
    if (players.length < 7) {
      Alert.alert('Not enough players', 'Need at least 7 confirmed players to suggest a lineup.');
      return;
    }
    setAiSuggesting(true);
    try {
      const pos = lineup.selectedFormation?.positions ?? [];
      const { data, error } = await supabase.functions.invoke('suggest-lineup', {
        body: {
          players: players.map((p) => ({ ...p, rsvp_status: 'attending' })),
          formation: lineup.selectedFormationId,
          positions: pos,
          team_name: event.title,
        },
      });
      if (error || !data?.positions?.length) {
        Alert.alert('AI suggest failed', error?.message ?? 'Could not generate lineup. Try again.');
        return;
      }
      const newAssignments: Record<number, string> = {};
      (data.positions as Array<{ player_id: string; x: number; y: number }>) .forEach((p) => {
        const idx = pos.findIndex((fp) => Math.abs(fp.x - p.x) < 1 && Math.abs(fp.y - p.y) < 1);
        if (idx >= 0 && p.player_id) newAssignments[idx] = p.player_id;
      });
      setAssignments(newAssignments);
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setAiSuggesting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={primaryColor} size="large" /></View>;
  }

  const positions     = lineup.selectedFormation?.positions ?? [];
  positionsRef.current = positions;                              // sync ref every render
  const assignedIds   = new Set(Object.values(assignments));
  const assignedCount = assignedIds.size;
  const totalSlots    = positions.length;
  const selectedLabel = selectedSlot !== null ? positions[selectedSlot]?.label : null;

  // Nearest drop target during drag
  let dragTargetSlot = -1;
  if (drag) {
    const relX = (drag.pageX - pitchLayoutRef.current.x) / PITCH_W * 100;
    const relY = (drag.pageY - pitchLayoutRef.current.y) / PITCH_H * 100;
    let best = SNAP_THRESH;
    positions.forEach((p, i) => {
      if (i === drag.fromIdx) return;
      const dx = (p.x - relX) / 100 * PITCH_W;
      const dy = (p.y - relY) / 100 * PITCH_H;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { best = d; dragTargetSlot = i; }
    });
  }

  // Ghost player
  const ghostPlayer = drag
    ? (players.find((p) => p.id === assignments[drag.fromIdx]) ?? null)
    : null;

  return (
    <View style={styles.root}>

      <ClubHeader
        title="Lineup Builder"
        subtitle={event?.title}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={handleAiSuggest}
              disabled={aiSuggesting || saving}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              {aiSuggesting
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="sparkles-outline" size={14} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>AI</Text></>}
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{assignedCount}/{totalSlots}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Save</Text>}
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Pitch ── */}
      <View style={styles.pitchWrapper}>
        <View
          ref={pitchViewRef}
          {...pitchPan.panHandlers}
          onLayout={() => {
            pitchViewRef.current?.measureInWindow((x, y) => {
              pitchLayoutRef.current = { x, y };
            });
          }}
          style={[styles.pitch, { width: PITCH_W, height: PITCH_H }]}
        >
          <PitchMarkings w={PITCH_W} h={PITCH_H} />

          {positions.map((slot, idx) => {
            const playerId  = assignments[idx];
            const player    = playerId ? (players.find((p) => p.id === playerId) ?? null) : null;
            const isDimmed  = drag?.fromIdx === idx;
            const isTarget  = dragTargetSlot === idx;

            return (
              <View
                key={idx}
                style={{
                  position:  'absolute',
                  left:      `${slot.x}%` as any,
                  top:       `${slot.y}%` as any,
                  transform: [{ translateX: -(TOKEN / 2) }, { translateY: -(TOKEN / 2) }],
                }}
              >
                <SlotToken
                  label={slot.label}
                  player={player}
                  isSelected={selectedSlot === idx}
                  isTarget={isTarget}
                  isDimmed={isDimmed}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Selection hint ── */}
      <View style={[styles.hintStrip, selectedSlot !== null && !drag && styles.hintStripActive]}>
        {drag ? (
          <Text style={styles.hintIdleText}>
            {dragTargetSlot >= 0
              ? `Drop on  ${positions[dragTargetSlot]?.label ?? ''}  to swap`
              : 'Drag to a position'}
          </Text>
        ) : selectedSlot !== null ? (
          <>
            <View style={styles.hintDot} />
            <Text style={styles.hintText}>
              Tap a player below to fill <Text style={styles.hintLabel}>{selectedLabel}</Text>
            </Text>
            <TouchableOpacity onPress={() => setSelectedSlot(null)}>
              <Ionicons name="close-circle" size={18} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hintIdleText}>
            {assignedCount === 0
              ? 'Tap a position to assign · drag to rearrange'
              : assignedCount === totalSlots
                ? `All ${totalSlots} positions filled`
                : `${totalSlots - assignedCount} position${totalSlots - assignedCount !== 1 ? 's' : ''} remaining`}
          </Text>
        )}
      </View>

      {/* ── Bottom panel ── */}
      <View style={styles.bottomPanel}>
        <View style={styles.tabBar}>
          {(['formation', 'players'] as BottomTab[]).map((tab) => {
            const active = activeTab === tab;
            const icon   = tab === 'formation' ? 'grid-outline' : 'people-outline';
            const label  = tab === 'formation'
              ? (lineup.selectedFormation?.name ?? 'Formation')
              : `Players  ${assignedCount}/${players.length}`;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, active && [styles.tabActive, { borderBottomColor: primaryColor }]]}
                onPress={() => setActiveTab(tab)}
              >
                <Ionicons name={icon} size={14} color={active ? primaryColor : PULSE_COLORS.ui.muted} />
                <Text style={[styles.tabText, active && [styles.tabTextActive, { color: primaryColor }]]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'formation' ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingBottom: 8 }}>
            <FormationSelector
              format={lineup.format}
              onFormatChange={lineup.setFormat}
              selectedId={lineup.selectedFormationId}
              onSelect={(id) => { lineup.setSelectedFormationId(id); setAssignments({}); setSelectedSlot(null); }}
              favourites={lineup.favourites}
              onToggleFavourite={lineup.toggleFavourite}
            />
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.playersList}>
            {players.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={32} color={PULSE_COLORS.ui.muted} />
                <Text style={styles.emptyTitle}>No confirmed RSVPs yet</Text>
                <Text style={styles.emptyBody}>Players who RSVP attending will appear here</Text>
              </View>
            ) : (
              players.map((player) => {
                const isAssigned = assignedIds.has(player.id);
                const isTarget   = selectedSlot !== null && !isAssigned && !player.isInjured;
                return (
                  <TouchableOpacity
                    key={player.id}
                    style={[
                      styles.playerRow,
                      isAssigned && styles.playerRowDone,
                      isTarget   && [styles.playerRowTarget, { backgroundColor: rgba(0.05) }],
                      player.isInjured && styles.playerRowInjured,
                    ]}
                    onPress={() => {
                      if (player.isInjured) {
                        Alert.alert('Player injured', `${player.full_name} is flagged as injured and cannot be added to the lineup.`);
                        return;
                      }
                      if (isAssigned || selectedSlot === null) return;
                      const newMap = { ...assignments };
                      Object.keys(newMap).forEach((k) => {
                        if (newMap[Number(k)] === player.id) delete newMap[Number(k)];
                      });
                      newMap[selectedSlot] = player.id;
                      setAssignments(newMap);
                      setSelectedSlot(null);
                    }}
                    activeOpacity={(isAssigned || player.isInjured) ? 1 : 0.75}
                  >
                    <View style={[
                      styles.jersey,
                      isAssigned && [styles.jerseyDone, { backgroundColor: rgba(0.12), borderColor: primaryColor }],
                      player.isInjured && { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' },
                    ]}>
                      <Text style={[
                        styles.jerseyNum,
                        isAssigned && [styles.jerseyNumDone, { color: primaryColor }],
                        player.isInjured && { color: '#ef4444' },
                      ]}>
                        {player.jersey_number ?? '—'}
                      </Text>
                    </View>

                    <View style={styles.playerInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.playerName, isAssigned && styles.playerNameDone, player.isInjured && { color: PULSE_COLORS.ui.muted }]}>
                          {player.full_name}
                        </Text>
                        {player.isGuest && (
                          <View style={styles.guestBadge}>
                            <Text style={styles.guestBadgeText}>G</Text>
                          </View>
                        )}
                        {player.isInjured && (
                          <View style={styles.injuredBadge}>
                            <Ionicons name="bandage-outline" size={10} color="#ef4444" />
                            <Text style={styles.injuredBadgeText}>Injured</Text>
                          </View>
                        )}
                      </View>
                      {player.position && (
                        <Text style={[styles.playerPos, player.isInjured && { color: PULSE_COLORS.ui.muted }]}>{player.position}</Text>
                      )}
                    </View>

                    {player.isInjured ? (
                      <Ionicons name="bandage-outline" size={18} color="rgba(239,68,68,0.4)" />
                    ) : isAssigned ? (
                      <View style={styles.statusBadge}>
                        <Ionicons name="checkmark-circle" size={13} color={primaryColor} />
                        <Text style={[styles.statusText, { color: primaryColor }]}>On pitch</Text>
                      </View>
                    ) : isTarget ? (
                      <View style={[styles.assignBadge, { backgroundColor: primaryColor }]}>
                        <Text style={styles.assignText}>Assign</Text>
                      </View>
                    ) : (
                      <Ionicons name="ellipse-outline" size={18} color={PULSE_COLORS.ui.border} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}

      </View>

      {/* ── Drag ghost (renders above everything) ── */}
      {drag && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ghostLayer]}>
          <View
            style={[
              styles.ghost,
              {
                left: drag.pageX - DRAG_TOKEN / 2,
                top:  drag.pageY - DRAG_TOKEN / 2,
                width:        DRAG_TOKEN,
                height:       DRAG_TOKEN,
                borderRadius: DRAG_TOKEN / 2,
                backgroundColor: primaryColor,
                shadowColor: primaryColor,
              },
            ]}
          >
            <Text style={styles.ghostLabel}>
              {ghostPlayer
                ? (ghostPlayer.jersey_number != null
                    ? String(ghostPlayer.jersey_number)
                    : initials(ghostPlayer.full_name))
                : ''}
            </Text>
            {ghostPlayer && (
              <Text style={styles.ghostName} numberOfLines={1}>
                {firstName(ghostPlayer.full_name)}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PULSE_COLORS.ui.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 54, paddingBottom: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn:       { width: 32 },
  headerCenter:  { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle:   { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  headerSub:     { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countPill: {
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  countPillText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  saveBtn:       { paddingLeft: 4 },
  saveBtnText:   { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green },
  aiBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  aiBtnText:     { fontSize: 13, fontWeight: '700' },

  // Pitch
  pitchWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  pitch: {
    backgroundColor: '#1C5C1C',
    borderRadius: 8, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },

  // Slot token
  token: {
    width: TOKEN, height: TOKEN, borderRadius: TOKEN / 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, paddingTop: 1,
  },
  tokenEmpty:    { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.55)' },
  tokenAssigned: { backgroundColor: PULSE_COLORS.brand.green, borderColor: '#fff' },
  tokenSelected: {
    borderColor: '#FBBF24', borderWidth: 2.5,
    shadowColor: '#FBBF24', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8,
  },
  tokenTarget: {
    borderColor: '#60A5FA', borderWidth: 2.5,
    shadowColor: '#60A5FA', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8,
    transform: [{ scale: 1.12 }],
  },
  tokenDimmed: { opacity: 0.25 },
  tokenLabel:         { fontSize: 11, fontWeight: '800', lineHeight: 13, letterSpacing: -0.3 },
  tokenLabelEmpty:    { color: 'rgba(255,255,255,0.9)' },
  tokenLabelAssigned: { color: '#000' },
  tokenName: { fontSize: 7, color: 'rgba(0,0,0,0.75)', fontWeight: '700', lineHeight: 9, maxWidth: TOKEN - 4 },

  // Hint strip
  hintStrip: {
    height: HINT_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, gap: 8,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  hintStripActive: { backgroundColor: 'rgba(251,191,36,0.06)' },
  hintDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FBBF24' },
  hintText:    { flex: 1, fontSize: 13, color: PULSE_COLORS.ui.textSecondary },
  hintLabel:   { color: '#FBBF24', fontWeight: '700' },
  hintIdleText:{ fontSize: 12, color: PULSE_COLORS.ui.muted },

  // Bottom panel
  bottomPanel: {
    height: BOTTOM_H, backgroundColor: PULSE_COLORS.ui.background,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, gap: 6,
  },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: PULSE_COLORS.brand.green, marginBottom: -1 },
  tabText:       { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  tabTextActive: { color: PULSE_COLORS.brand.green },

  // Players list
  playersList: { paddingVertical: 4 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  playerRowDone:   { opacity: 0.55 },
  playerRowTarget: { backgroundColor: 'rgba(34,197,94,0.05)' },

  jersey: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  jerseyDone:    { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: PULSE_COLORS.brand.green },
  jerseyNum:     { fontSize: 12, fontWeight: '800', color: PULSE_COLORS.ui.text },
  jerseyNumDone: { color: PULSE_COLORS.brand.green },

  playerInfo:     { flex: 1 },
  playerName:     { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  playerNameDone: { color: PULSE_COLORS.ui.textSecondary },
  playerPos:      { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 1 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText:  { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.brand.green },
  assignBadge: {
    backgroundColor: PULSE_COLORS.brand.green, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  assignText: { fontSize: 12, fontWeight: '700', color: '#000' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 28, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  emptyBody:  { fontSize: 12, color: PULSE_COLORS.ui.muted, textAlign: 'center', paddingHorizontal: 32 },

  // Ghost overlay
  ghostLayer: { zIndex: 999 },
  ghost: {
    position: 'absolute',
    backgroundColor: PULSE_COLORS.brand.green,
    borderWidth: 2.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', paddingTop: 1,
    opacity: 0.92,
    shadowColor: PULSE_COLORS.brand.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7, shadowRadius: 12, elevation: 12,
  },
  ghostLabel: { fontSize: 12, fontWeight: '800', color: '#000', lineHeight: 14 },
  ghostName:  { fontSize: 7.5, color: 'rgba(0,0,0,0.7)', fontWeight: '700', lineHeight: 9, maxWidth: DRAG_TOKEN - 6 },

  guestBadge: { backgroundColor: 'rgba(249,115,22,0.18)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  guestBadgeText: { fontSize: 10, fontWeight: '900', color: '#f97316', letterSpacing: 0.3 },
  playerRowInjured: { opacity: 0.55 },
  injuredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  injuredBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
});
