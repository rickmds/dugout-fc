import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DUGOUT_COLORS } from '../../constants/colors';
import { useGameDay, useUpcomingGameDates, localDateStr } from '../../hooks/useGameDay';
import { useClub } from '../../hooks/useClub';

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

function hasClashes(events: ReturnType<typeof useGameDay>['events']): boolean {
  return events.some((ev, i) => {
    if (i === 0 || !ev.event_time) return false;
    const prev = events[i - 1];
    if (!prev.event_time) return false;
    const [ph, pm] = prev.event_time.split(':').map(Number);
    const [eh, em] = ev.event_time.split(':').map(Number);
    const prevDur = prev.duration_minutes ?? (prev.type === 'game' ? 90 : 60);
    return (ph * 60 + pm + prevDur) > (eh * 60 + em);
  });
}

function WidgetContent({ date, onPress }: { date: string; onPress: () => void }) {
  const { events, loading } = useGameDay(date);
  const { primaryColor, rgba } = useClub();

  if (loading || !events.length) return null;

  const preview = events.slice(0, 3);
  const extra = events.length - 3;
  const clash = hasClashes(events);
  const dateLabel = fmtDateLabel(date);

  return (
    <>
      {/* Section label */}
      <Text style={styles.sectionLabel}>GAME DAY OUTLOOK</Text>

      <TouchableOpacity
        style={[styles.card, { borderColor: rgba(0.2), backgroundColor: rgba(0.04) }]}
        onPress={onPress}
        activeOpacity={0.78}
      >
        {/* Header */}
        <View style={[styles.cardTop, { borderBottomColor: rgba(0.12) }]}>
          <View style={styles.cardTopLeft}>
            <View style={[styles.footballWrap, { backgroundColor: rgba(0.14) }]}>
              <Ionicons name="football" size={17} color={primaryColor} />
            </View>
            <View>
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, { color: primaryColor }]}>
                  {events.length} game{events.length !== 1 ? 's' : ''}
                </Text>
                <View style={[styles.dateBadge, { backgroundColor: rgba(0.12) }]}>
                  <Text style={[styles.dateBadgeText, { color: primaryColor }]}>{dateLabel}</Text>
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
          <Ionicons name="chevron-forward" size={15} color={rgba(0.5)} />
        </View>

        {/* Event list */}
        <View style={styles.eventList}>
          {preview.map((ev, i) => (
            <View key={ev.id}>
              {i > 0 && (
                <View style={styles.connector}>
                  <View style={[styles.connectorDash, { backgroundColor: DUGOUT_COLORS.ui.border }]} />
                  <Ionicons name="car-outline" size={12} color={DUGOUT_COLORS.ui.muted} />
                  <View style={[styles.connectorDash, { backgroundColor: DUGOUT_COLORS.ui.border }]} />
                </View>
              )}
              <View style={styles.eventRow}>
                <View style={[styles.teamBar, { backgroundColor: ev.team_color }]} />
                <View style={styles.eventContent}>
                  <Text style={styles.eventTime}>{ev.event_time ? fmt12(ev.event_time) : 'TBD'}</Text>
                  <View style={styles.eventBottom}>
                    <View style={[styles.teamBadge, { backgroundColor: `${ev.team_color}20` }]}>
                      <Text style={[styles.teamBadgeText, { color: ev.team_color }]} numberOfLines={1}>
                        {ev.team_name}
                      </Text>
                    </View>
                    <Text style={styles.eventGameTitle} numberOfLines={1}>{ev.title}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          {extra > 0 && (
            <Text style={[styles.extraText, { color: primaryColor }]}>+{extra} more game{extra !== 1 ? 's' : ''}</Text>
          )}
        </View>

        {/* CTA strip */}
        <View style={[styles.cta, { backgroundColor: rgba(0.08), borderTopColor: rgba(0.12) }]}>
          <Ionicons name="navigate-outline" size={13} color={primaryColor} />
          <Text style={[styles.ctaText, { color: primaryColor }]}>View drive times & travel plan</Text>
          <Ionicons name="arrow-forward" size={13} color={primaryColor} />
        </View>
      </TouchableOpacity>
    </>
  );
}

export default function GameDayWidget({ onPress }: { onPress: () => void }) {
  const { dates, loading } = useUpcomingGameDates(14);
  if (loading || !dates.length) return null;
  const today = localDateStr(0);
  const displayDate = dates.includes(today) ? today : dates[0];
  return <WidgetContent date={displayDate} onPress={onPress} />;
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: DUGOUT_COLORS.ui.muted,
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
  clashBadgeText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  cardSub: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, marginTop: 2 },

  eventList: { paddingVertical: 4 },

  connector: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  connectorDash: { flex: 1, height: 1 },

  eventRow: { flexDirection: 'row', alignItems: 'stretch' },
  teamBar: { width: 3, marginVertical: 4, marginLeft: 14, borderRadius: 2 },
  eventContent: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  eventTime: { fontSize: 14, fontWeight: '800', color: DUGOUT_COLORS.ui.text, marginBottom: 4 },
  eventBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  teamBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  teamBadgeText: { fontSize: 11, fontWeight: '700' },
  eventGameTitle: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, flex: 1 },

  extraText: { fontSize: 12, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 8 },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1,
  },
  ctaText: { flex: 1, fontSize: 13, fontWeight: '700' },
});
