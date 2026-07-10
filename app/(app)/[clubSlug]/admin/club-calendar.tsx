import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = {
  id: string;
  title: string;
  type: 'game' | 'training' | 'other';
  event_date: string;
  event_time: string | null;
  location: string | null;
  home_away: 'home' | 'away' | null;
  score_home: number | null;
  score_away: number | null;
  team_id: string;
  teamName: string;
  teamColor: string;
  rsvp_going: number;
  rsvp_out: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAM_PALETTE = [
  '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
  '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
];

const TYPE_CFG = {
  game:     { label: 'GAME',     color: '#F59E0B', icon: 'football-outline'  as const },
  training: { label: 'TRAINING', color: '#3B82F6', icon: 'barbell-outline'   as const },
  other:    { label: 'OTHER',    color: '#9CA3AF', icon: 'pin-outline'        as const },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekBounds(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getDay();
  const daysToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + daysToMon + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const label = offset === 0 ? 'This Week'
    : offset === 1 ? 'Next Week'
    : offset === -1 ? 'Last Week'
    : `${fmtShort(mon)} – ${fmtShort(sun)}`;

  return { start: mon, end: sun, label };
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isToday = d.getTime() === today.getTime();
  return `${day} · ${date}${isToday ? ' · TODAY' : ''}`;
}

function fmtTime(t: string | null): string {
  if (!t) return 'TBC';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ClubCalendarScreen() {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club } = useAuth();
  const { primaryColor, rgba } = useClub();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const slug = clubSlug ?? club?.slug ?? '';
  const { start, end, label } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  // Team colour index map (stable per load)
  const [teamColorMap, setTeamColorMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setEvents([]);
    try {
      const clubId = profile?.club_id;
      if (!clubId) { setLoading(false); return; }

      const { data: teams } = await supabase
        .from('teams')
        .select('id, name')
        .eq('club_id', clubId)
        .order('name');

      const teamList = (teams ?? []) as { id: string; name: string }[];
      if (!teamList.length) { setLoading(false); return; }

      const colorMap: Record<string, string> = {};
      teamList.forEach((t, i) => { colorMap[t.id] = TEAM_PALETTE[i % TEAM_PALETTE.length]; });
      setTeamColorMap(colorMap);

      const teamIds = teamList.map(t => t.id);
      const startStr = toDateStr(start);
      const endStr = toDateStr(end);

      const [eventsRes, rsvpRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, type, event_date, event_time, location, home_away, score_home, score_away, team_id')
          .in('team_id', teamIds)
          .gte('event_date', startStr)
          .lte('event_date', endStr)
          .is('cancelled_at', null)
          .order('event_date')
          .order('event_time'),
        supabase
          .from('event_rsvps')
          .select('event_id, status'),
      ]);

      const evList = (eventsRes.data ?? []) as any[];
      const eventIds = evList.map(e => e.id);

      // Filter RSVP to relevant events
      const allRsvps = (rsvpRes.data ?? []) as any[];
      const rsvpMap: Record<string, { going: number; out: number }> = {};
      for (const r of allRsvps) {
        if (!eventIds.includes(r.event_id)) continue;
        if (!rsvpMap[r.event_id]) rsvpMap[r.event_id] = { going: 0, out: 0 };
        if (r.status === 'attending') rsvpMap[r.event_id].going++;
        else if (r.status === 'not_attending') rsvpMap[r.event_id].out++;
      }

      const teamNameMap: Record<string, string> = {};
      for (const t of teamList) teamNameMap[t.id] = t.name;

      const built: CalEvent[] = evList.map(e => ({
        id: e.id,
        title: e.title,
        type: (e.type ?? 'other') as CalEvent['type'],
        event_date: e.event_date,
        event_time: e.event_time,
        location: e.location,
        home_away: e.home_away ?? null,
        score_home: e.score_home ?? null,
        score_away: e.score_away ?? null,
        team_id: e.team_id,
        teamName: teamNameMap[e.team_id] ?? 'Unknown',
        teamColor: colorMap[e.team_id] ?? primaryColor,
        rsvp_going: rsvpMap[e.id]?.going ?? 0,
        rsvp_out: rsvpMap[e.id]?.out ?? 0,
      }));

      setEvents(built);
    } finally {
      setLoading(false);
    }
  }, [weekOffset, profile?.club_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Derived
  const teams = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string; color: string }[] = [];
    for (const e of events) {
      if (!seen.has(e.team_id)) {
        seen.add(e.team_id);
        list.push({ id: e.team_id, name: e.teamName, color: e.teamColor });
      }
    }
    return list;
  }, [events]);

  const filtered = teamFilter ? events.filter(e => e.team_id === teamFilter) : events;

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      if (!map.has(e.event_date)) map.set(e.event_date, []);
      map.get(e.event_date)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const totalGames = events.filter(e => e.type === 'game').length;
  const totalTraining = events.filter(e => e.type === 'training').length;

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <ClubHeader title="Club Calendar" onBack={() => router.back()} />

      {/* Week navigation */}
      <View style={st.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset(o => o - 1)} style={st.weekNavBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
        <Text style={st.weekLabel}>{label}</Text>
        <TouchableOpacity onPress={() => setWeekOffset(o => o + 1)} style={st.weekNavBtn} hitSlop={12}>
          <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
      </View>

      {/* Summary chips */}
      {!loading && events.length > 0 && (
        <View style={st.summaryRow}>
          <View style={[st.summaryChip, { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.25)' }]}>
            <Ionicons name="football-outline" size={12} color="#F59E0B" />
            <Text style={[st.summaryChipText, { color: '#F59E0B' }]}>{totalGames} game{totalGames !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[st.summaryChip, { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)' }]}>
            <Ionicons name="barbell-outline" size={12} color="#3B82F6" />
            <Text style={[st.summaryChipText, { color: '#3B82F6' }]}>{totalTraining} training</Text>
          </View>
          <View style={[st.summaryChip, { backgroundColor: rgba(0.08), borderColor: rgba(0.2) }]}>
            <Ionicons name="people-outline" size={12} color={primaryColor} />
            <Text style={[st.summaryChipText, { color: primaryColor }]}>{teams.length} team{teams.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>
      )}

      {/* Team filter pills */}
      {!loading && teams.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.filterRow}
        >
          <TouchableOpacity
            style={[st.filterPill, !teamFilter && { backgroundColor: rgba(0.15), borderColor: rgba(0.4) }]}
            onPress={() => setTeamFilter(null)}
          >
            <Text style={[st.filterPillText, !teamFilter && { color: primaryColor, fontWeight: '700' }]}>All Teams</Text>
          </TouchableOpacity>
          {teams.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[st.filterPill, teamFilter === t.id && { backgroundColor: t.color + '22', borderColor: t.color + '66' }]}
              onPress={() => setTeamFilter(teamFilter === t.id ? null : t.id)}
            >
              <View style={[st.filterDot, { backgroundColor: t.color }]} />
              <Text style={[st.filterPillText, teamFilter === t.id && { color: t.color, fontWeight: '700' }]}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={primaryColor} />
          <Text style={st.loadingText}>Loading calendar…</Text>
        </View>
      ) : byDay.length === 0 ? (
        <View style={st.emptyWrap}>
          <Ionicons name="calendar-outline" size={48} color={PULSE_COLORS.ui.muted} />
          <Text style={st.emptyTitle}>Nothing scheduled</Text>
          <Text style={st.emptyBody}>No events across all teams {label.toLowerCase()}.</Text>
        </View>
      ) : (
        <ScrollView
          style={st.scroll}
          contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {byDay.map(([dateStr, dayEvents]) => (
            <View key={dateStr} style={st.daySection}>
              <Text style={st.dayHeader}>{fmtDayHeader(dateStr)}</Text>
              {dayEvents.map(ev => (
                <TouchableOpacity
                  key={ev.id}
                  style={st.eventCard}
                  onPress={() => router.push(`/(app)/${slug}/event/${ev.id}` as never)}
                  activeOpacity={0.75}
                >
                  {/* Left colour bar */}
                  <View style={[st.cardBar, { backgroundColor: ev.teamColor }]} />

                  <View style={st.cardBody}>
                    {/* Top row: team name + type chip */}
                    <View style={st.cardTopRow}>
                      <View style={[st.teamDot, { backgroundColor: ev.teamColor }]} />
                      <Text style={[st.teamName, { color: ev.teamColor }]} numberOfLines={1}>{ev.teamName}</Text>
                      <View style={[st.typeChip, { backgroundColor: TYPE_CFG[ev.type].color + '22', borderColor: TYPE_CFG[ev.type].color + '55' }]}>
                        <Ionicons name={TYPE_CFG[ev.type].icon} size={10} color={TYPE_CFG[ev.type].color} />
                        <Text style={[st.typeChipText, { color: TYPE_CFG[ev.type].color }]}>{TYPE_CFG[ev.type].label}</Text>
                      </View>
                      {ev.home_away && ev.type === 'game' && (
                        <View style={[st.haChip, ev.home_away === 'home'
                          ? { backgroundColor: rgba(0.1), borderColor: rgba(0.3) }
                          : { backgroundColor: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.3)' }
                        ]}>
                          <Text style={[st.haChipText, { color: ev.home_away === 'home' ? primaryColor : '#8B5CF6' }]}>
                            {ev.home_away === 'home' ? 'HOME' : 'AWAY'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Title */}
                    <Text style={st.cardTitle} numberOfLines={1}>{ev.title}</Text>

                    {/* Time + location */}
                    <View style={st.cardMetaRow}>
                      <Ionicons name="time-outline" size={12} color={PULSE_COLORS.ui.muted} />
                      <Text style={st.cardMeta}>{fmtTime(ev.event_time)}</Text>
                      {ev.location && (
                        <>
                          <Text style={st.cardMetaDot}>·</Text>
                          <Text style={st.cardMeta} numberOfLines={1}>{ev.location}</Text>
                        </>
                      )}
                    </View>

                    {/* Score (if recorded) + RSVP */}
                    <View style={st.cardBottomRow}>
                      {ev.score_home != null && ev.score_away != null ? (
                        <View style={st.scoreChip}>
                          <Text style={st.scoreChipText}>{ev.score_home} — {ev.score_away}</Text>
                        </View>
                      ) : ev.type === 'game' ? (
                        <View style={st.rsvpRow}>
                          <View style={[st.rsvpDot, { backgroundColor: '#22C55E' }]} />
                          <Text style={st.rsvpText}>{ev.rsvp_going} going</Text>
                          {ev.rsvp_out > 0 && (
                            <>
                              <View style={[st.rsvpDot, { backgroundColor: '#EF4444' }]} />
                              <Text style={st.rsvpText}>{ev.rsvp_out} out</Text>
                            </>
                          )}
                        </View>
                      ) : null}
                      <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.border} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },

  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 16,
  },
  weekNavBtn: { padding: 4 },
  weekLabel: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  summaryChipText: { fontSize: 12, fontWeight: '600' },

  filterRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: PULSE_COLORS.ui.surface,
  },
  filterDot: { width: 7, height: 7, borderRadius: 3.5 },
  filterPillText: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: PULSE_COLORS.ui.muted },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyBody: { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center' },

  daySection: { marginBottom: 20 },
  dayHeader: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.3, marginBottom: 8,
  },

  eventCard: {
    flexDirection: 'row', backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    marginBottom: 8, overflow: 'hidden',
  },
  cardBar: { width: 4 },
  cardBody: { flex: 1, padding: 12, gap: 5 },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  teamDot: { width: 7, height: 7, borderRadius: 3.5 },
  teamName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, flex: 1 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2,
  },
  typeChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  haChip: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2,
  },
  haChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  cardTitle: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },

  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMeta: { fontSize: 12, color: PULSE_COLORS.ui.muted, flex: 1 },
  cardMetaDot: { fontSize: 12, color: PULSE_COLORS.ui.border },

  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  rsvpRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rsvpDot: { width: 6, height: 6, borderRadius: 3 },
  rsvpText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  scoreChip: {
    backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  scoreChipText: { fontSize: 12, fontWeight: '800', color: '#22C55E' },
});
