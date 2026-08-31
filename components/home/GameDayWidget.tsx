import { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';
import {
  useGameDayFeed, localDateStr, detectClashes, upcomingDates, detectCoachClashes, getCoverageFlag,
  type FeedEvent, type TeamCoach, type GuestCoachStatus,
} from '../../hooks/useGameDayFeed';
import { computeArriveBy } from '../../lib/eventTime';
import { useTeam } from '../../hooks/useTeam';

// Matches TYPE_CONFIG.game in the Home screen's "Next Game" card — this
// widget is game-only, so it uses the same fixed amber accent rather than
// the club's arbitrary primaryColor, keeping the two "game" surfaces visually consistent.
const GAME_COLOR = PULSE_COLORS.status.warning;
function gameRgba(alpha: number): string {
  return `rgba(245, 158, 11, ${alpha})`;
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDateLabel(iso: string): string {
  const today = localDateStr(0);
  const tomorrow = localDateStr(1);
  if (iso === today) return 'Today';
  if (iso === tomorrow) return 'Tomorrow';
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const GameDayWidget = memo(function GameDayWidget({ onPress }: { onPress: () => void }) {
  const { allTeams } = useTeam();
  const teamIds = useMemo(() => allTeams.map((t) => t.id), [allTeams]);
  const { events: allEvents, teamCoaches, guestCoachStatuses, loading } = useGameDayFeed(14, teamIds);
  if (loading || !allEvents.length) return null;

  const dates = upcomingDates(allEvents);
  const today = localDateStr(0);
  const displayDate = dates.includes(today) ? today : dates[0];
  const dayEvents = allEvents.filter((e) => e.event_date === displayDate);
  if (!dayEvents.length) return null;

  // Same split as the full Game Day Outlook screen: a club-wide admin's
  // unconditional visibility into every team's games ('org_admin'-tagged)
  // is never "my day" — otherwise every Saturday looks like one giant clash.
  const events: FeedEvent[] = dayEvents.filter((e) => e.my_role !== 'org_admin');
  const coverageEvents: FeedEvent[] = dayEvents.filter((e) => e.my_role === 'org_admin');

  if (!events.length) {
    if (!coverageEvents.length) return null;
    return <AdminCoverageWidget events={coverageEvents} teamCoaches={teamCoaches} guestCoachStatuses={guestCoachStatuses} dateLabel={fmtDateLabel(displayDate)} onPress={onPress} />;
  }

  const preview = events.slice(0, 3);
  const extra = events.length - 3;
  const clash = detectClashes(events).size > 0;
  const dateLabel = fmtDateLabel(displayDate);

  return (
    <>
      {/* Section label */}
      <Text style={styles.sectionLabel}>GAME DAY OUTLOOK</Text>

      <TouchableOpacity
        style={[styles.card, { borderColor: gameRgba(0.25), backgroundColor: gameRgba(0.05) }]}
        onPress={onPress}
        activeOpacity={0.78}
      >
        {/* Header */}
        <View style={[styles.cardTop, { borderBottomColor: gameRgba(0.15) }]}>
          <View style={styles.cardTopLeft}>
            <View style={[styles.footballWrap, { backgroundColor: gameRgba(0.16) }]}>
              <Ionicons name="football" size={17} color={GAME_COLOR} />
            </View>
            <View>
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, { color: GAME_COLOR }]}>
                  {events.length} game{events.length !== 1 ? 's' : ''}
                </Text>
                <View style={[styles.dateBadge, { backgroundColor: gameRgba(0.14) }]}>
                  <Text style={[styles.dateBadgeText, { color: GAME_COLOR }]}>{dateLabel}</Text>
                </View>
                {clash && (
                  <View style={styles.clashBadge}>
                    <Ionicons name="warning" size={10} color="#EF4444" />
                    <Text style={styles.clashBadgeText}>Clash</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardSub}>
                {[...new Set(events.map((e) => e.team_name))].slice(0, 2).join(', ')}
                {events.length > 2 ? ` +${events.length - 2} more` : ''}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={15} color={PULSE_COLORS.ui.muted} />
        </View>

        {/* Event list */}
        <View style={styles.eventList}>
          {preview.map((ev, i) => {
            const color = ev.club?.primary_color ?? GAME_COLOR;
            return (
              <View key={ev.id}>
                {i > 0 && (
                  <View style={styles.connector}>
                    <View style={[styles.connectorDash, { backgroundColor: PULSE_COLORS.ui.border }]} />
                    <Ionicons name="car-outline" size={12} color={PULSE_COLORS.ui.muted} />
                    <View style={[styles.connectorDash, { backgroundColor: PULSE_COLORS.ui.border }]} />
                  </View>
                )}
                <View style={styles.eventRow}>
                  <View style={[styles.teamBar, { backgroundColor: color }]} />
                  <View style={styles.eventContent}>
                    {!ev.my_role && (
                      <View style={styles.parentTag}>
                        <Ionicons name="person-outline" size={9} color="#60A5FA" />
                        <Text style={styles.parentTagText}>Parent</Text>
                      </View>
                    )}
                    <Text style={styles.eventTime}>
                      {ev.event_time ? fmt12(ev.event_time) : 'TBD'}
                      {ev.event_time && ev.arrival_buffer_minutes != null && (
                        <Text style={styles.eventArrive}>  ·  Arrive {computeArriveBy(ev.event_time, ev.arrival_buffer_minutes)}</Text>
                      )}
                    </Text>
                    <View style={styles.eventBottom}>
                      <View style={[styles.teamBadge, { backgroundColor: `${color}20` }]}>
                        <Text style={[styles.teamBadgeText, { color }]} numberOfLines={1}>
                          {ev.team_name}
                        </Text>
                      </View>
                      <Text style={styles.eventGameTitle} numberOfLines={1}>{ev.title}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
          {extra > 0 && (
            <Text style={[styles.extraText, { color: GAME_COLOR }]}>+{extra} more game{extra !== 1 ? 's' : ''}</Text>
          )}
        </View>

        {/* CTA strip */}
        <View style={[styles.cta, { backgroundColor: gameRgba(0.09), borderTopColor: gameRgba(0.15) }]}>
          <Ionicons name="navigate-outline" size={13} color={GAME_COLOR} />
          <Text style={[styles.ctaText, { color: GAME_COLOR }]}>View drive times & travel plan</Text>
          <Ionicons name="arrow-forward" size={13} color={GAME_COLOR} />
        </View>
      </TouchableOpacity>
    </>
  );
});
export default GameDayWidget;

// Compact club-wide variant for an org_admin with no personally-coached
// games today — the full per-game breakdown lives on the Game Day Outlook
// screen's "Club Coverage" section; this is just a teaser into it.
function AdminCoverageWidget({ events, teamCoaches, guestCoachStatuses, dateLabel, onPress }: {
  events: FeedEvent[];
  teamCoaches: TeamCoach[];
  guestCoachStatuses: GuestCoachStatus[];
  dateLabel: string;
  onPress: () => void;
}) {
  const guestCoachEventIds = new Set(guestCoachStatuses.map((g) => g.event_id));
  const coachClashes = detectCoachClashes(events, teamCoaches, guestCoachEventIds);
  const flaggedEvents = events.filter((e) => getCoverageFlag(e, coachClashes.get(e.id)));
  const flaggedCount = flaggedEvents.length;

  // Lead with whichever teams are actually flagged — more useful at a
  // glance from Home than an arbitrary first-two-alphabetically list.
  const flaggedTeamNames = [...new Set(flaggedEvents.map((e) => e.team_name))];
  const otherTeamNames = [...new Set(events.map((e) => e.team_name))].filter((n) => !flaggedTeamNames.includes(n));
  const teamNames = [...flaggedTeamNames, ...otherTeamNames];

  return (
    <>
      <Text style={styles.sectionLabel}>GAME DAY OUTLOOK</Text>
      <TouchableOpacity
        style={[styles.card, { borderColor: gameRgba(0.25), backgroundColor: gameRgba(0.05) }]}
        onPress={onPress}
        activeOpacity={0.78}
      >
        <View style={[styles.cardTop, { borderBottomColor: gameRgba(0.15) }]}>
          <View style={styles.cardTopLeft}>
            <View style={[styles.footballWrap, { backgroundColor: gameRgba(0.16) }]}>
              <Ionicons name="football" size={17} color={GAME_COLOR} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, { color: GAME_COLOR }]}>
                  {events.length} game{events.length !== 1 ? 's' : ''} club-wide
                </Text>
                <View style={[styles.dateBadge, { backgroundColor: gameRgba(0.14) }]}>
                  <Text style={[styles.dateBadgeText, { color: GAME_COLOR }]}>{dateLabel}</Text>
                </View>
              </View>
              {flaggedCount > 0 && (
                <View style={[styles.clashBadge, styles.clashBadgeStandalone]}>
                  <Ionicons name="warning" size={10} color="#EF4444" />
                  <Text style={styles.clashBadgeText}>{flaggedCount} need{flaggedCount === 1 ? 's' : ''} attention</Text>
                </View>
              )}
              <Text style={styles.cardSub} numberOfLines={1}>
                {teamNames.slice(0, 2).join(', ')}{teamNames.length > 2 ? ` +${teamNames.length - 2} more` : ''}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={15} color={PULSE_COLORS.ui.muted} />
        </View>

        <View style={[styles.cta, { backgroundColor: gameRgba(0.09), borderTopColor: gameRgba(0.15) }]}>
          <Ionicons name="shield-checkmark-outline" size={13} color={GAME_COLOR} />
          <Text style={[styles.ctaText, { color: GAME_COLOR }]}>
            {flaggedCount > 0 ? 'View club coverage' : 'All teams covered — view details'}
          </Text>
          <Ionicons name="arrow-forward" size={13} color={GAME_COLOR} />
        </View>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 0.8, marginBottom: 10,
  },

  card: {
    borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', marginBottom: 24,
  },

  cardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  footballWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  dateBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  dateBadgeText: { fontSize: 11, fontWeight: '700' },
  clashBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
  },
  clashBadgeStandalone: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 4 },
  clashBadgeText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  cardSub: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2 },

  eventList: { paddingVertical: 4 },

  connector: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  connectorDash: { flex: 1, height: 1 },

  eventRow: { flexDirection: 'row', alignItems: 'stretch' },
  teamBar: { width: 3, marginVertical: 4, marginLeft: 14, borderRadius: 2 },
  eventContent: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, position: 'relative' },
  eventTime: { fontSize: 14, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  eventArrive: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  eventBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  teamBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  teamBadgeText: { fontSize: 11, fontWeight: '700' },
  parentTag: {
    position: 'absolute', top: 8, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
    backgroundColor: 'rgba(96,165,250,0.16)',
    borderWidth: 1, borderColor: 'rgba(96,165,250,0.35)',
  },
  parentTagText: { fontSize: 10, fontWeight: '800', color: '#60A5FA', letterSpacing: 0.2 },
  eventGameTitle: { fontSize: 12, color: PULSE_COLORS.ui.muted, flex: 1 },

  extraText: { fontSize: 12, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 8 },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1,
  },
  ctaText: { flex: 1, fontSize: 13, fontWeight: '700' },
});
