import { useCallback, useState } from 'react';
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
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

type GuestRow = {
  id: string;
  full_name: string;
  role: 'player' | 'coach';
  status: 'pending' | 'confirmed' | 'declined';
  event_title: string;
  event_date: string;
  team_name: string;
  added_by_name: string | null;
};

function statusColor(s: GuestRow['status']): string {
  if (s === 'confirmed') return '#22c55e';
  if (s === 'declined') return '#ef4444';
  return '#F59E0B';
}

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function GuestActivityScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile } = useAuth();
  const { primaryColor, rgba } = useClub();

  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'player' | 'coach'>('all');

  const isOrgAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  useFocusEffect(
    useCallback(() => {
      load();
    }, [profile?.club_id])
  );

  async function load() {
    if (!profile?.club_id) return;
    setLoading(true);

    // Get all teams for this club
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .eq('club_id', profile.club_id);

    if (!teams?.length) { setLoading(false); return; }
    const teamIds = teams.map((t) => t.id);
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));

    // Get all event_guests for events belonging to club teams
    const { data: events } = await supabase
      .from('events')
      .select('id, title, event_date, team_id')
      .in('team_id', teamIds)
      .order('event_date', { ascending: false })
      .limit(200);

    if (!events?.length) { setLoading(false); return; }
    const eventIds = events.map((e) => e.id);
    const eventMap = new Map(events.map((e) => [e.id, { title: e.title, date: e.event_date, team_id: e.team_id }]));

    const { data: guestRows } = await supabase
      .from('event_guests')
      .select('id, full_name, role, status, event_id, added_by')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false });

    if (!guestRows?.length) { setGuests([]); setLoading(false); return; }

    // Resolve added_by profile names
    const addedByIds = [...new Set(guestRows.filter((g: any) => g.added_by).map((g: any) => g.added_by as string))];
    const profileMap = new Map<string, string>();
    if (addedByIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', addedByIds);
      (profiles ?? []).forEach((p: any) => { if (p.full_name) profileMap.set(p.id, p.full_name); });
    }

    const rows: GuestRow[] = (guestRows as any[]).map((g) => {
      const ev = eventMap.get(g.event_id);
      return {
        id: g.id,
        full_name: g.full_name,
        role: g.role,
        status: g.status,
        event_title: ev?.title ?? 'Unknown event',
        event_date: ev?.date ?? '',
        team_name: ev ? (teamMap.get(ev.team_id) ?? '') : '',
        added_by_name: g.added_by ? (profileMap.get(g.added_by) ?? null) : null,
      };
    });

    setGuests(rows);
    setLoading(false);
  }

  const filtered = guests.filter((g) => filter === 'all' || g.role === filter);
  const confirmedCount = guests.filter((g) => g.status === 'confirmed').length;
  const pendingCount = guests.filter((g) => g.status === 'pending').length;

  return (
    <View style={st.root}>
      <ClubHeader title="Guest Activity" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>
      ) : (
        <>
          {/* Summary strip */}
          <View style={st.summaryStrip}>
            <View style={st.summaryStat}>
              <Text style={[st.summaryNum, { color: primaryColor }]}>{guests.length}</Text>
              <Text style={st.summaryLabel}>Total guests</Text>
            </View>
            <View style={st.summaryDivider} />
            <View style={st.summaryStat}>
              <Text style={[st.summaryNum, { color: '#22c55e' }]}>{confirmedCount}</Text>
              <Text style={st.summaryLabel}>Confirmed</Text>
            </View>
            <View style={st.summaryDivider} />
            <View style={st.summaryStat}>
              <Text style={[st.summaryNum, { color: '#F59E0B' }]}>{pendingCount}</Text>
              <Text style={st.summaryLabel}>Pending</Text>
            </View>
          </View>

          {/* Filter chips */}
          <View style={st.filterRow}>
            {(['all', 'player', 'coach'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[st.chip, filter === f && [st.chipActive, { backgroundColor: primaryColor }]]}
                onPress={() => setFilter(f)}
              >
                <Text style={[st.chipText, filter === f && st.chipTextActive]}>
                  {f === 'all' ? 'All' : f === 'player' ? 'Guest Players' : 'Guest Coaches'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={st.empty}>
                <Ionicons name="people-outline" size={40} color={PULSE_COLORS.ui.muted} />
                <Text style={st.emptyTitle}>No guest activity yet</Text>
                <Text style={st.emptySub}>Guest players and coaches added to events will appear here.</Text>
              </View>
            ) : (
              <View style={st.list}>
                {filtered.map((g, i) => (
                  <View key={g.id} style={[st.row, i > 0 && st.rowBorder]}>
                    {/* Role icon */}
                    <View style={[st.roleIcon, { backgroundColor: g.role === 'player' ? rgba(0.1) : 'rgba(139,92,246,0.1)' }]}>
                      <Ionicons
                        name={g.role === 'player' ? 'football-outline' : 'whistle-outline' as any}
                        size={16}
                        color={g.role === 'player' ? primaryColor : '#8B5CF6'}
                      />
                    </View>

                    {/* Info */}
                    <View style={st.info}>
                      <View style={st.nameRow}>
                        <Text style={st.name}>{g.full_name}</Text>
                        <View style={[st.statusChip, { backgroundColor: statusColor(g.status) + '18' }]}>
                          <Text style={[st.statusText, { color: statusColor(g.status) }]}>
                            {g.status.charAt(0).toUpperCase() + g.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                      <Text style={st.eventTitle} numberOfLines={1}>{g.event_title}</Text>
                      <View style={st.meta}>
                        <Text style={st.metaText}>{formatDate(g.event_date)}</Text>
                        {g.team_name ? (
                          <>
                            <Text style={st.metaDot}>·</Text>
                            <Text style={st.metaText}>{g.team_name}</Text>
                          </>
                        ) : null}
                        {g.added_by_name ? (
                          <>
                            <Text style={st.metaDot}>·</Text>
                            <Text style={st.metaText}>Added by {g.added_by_name}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
    paddingVertical: 14,
  },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2, fontWeight: '600' },
  summaryDivider: { width: 1, height: 36, backgroundColor: PULSE_COLORS.ui.border },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  chipActive: { borderColor: 'transparent' },
  chipText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.text },
  emptySub: { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 18 },

  list: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  roleIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  name: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, flex: 1 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  eventTitle: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  metaDot: { fontSize: 11, color: PULSE_COLORS.ui.muted },
});
