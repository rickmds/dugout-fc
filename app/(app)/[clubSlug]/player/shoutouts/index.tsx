import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../../lib/supabase';
import { PULSE_COLORS, ThemeColors } from '../../../../../constants/colors';
import { useTheme } from '../../../../../hooks/useTheme';
import ClubHeader from '../../../../../components/ui/ClubHeader';
import { SHOUTOUT_TAGS } from '../../../../../components/shoutout/ShoutoutSheet';
import { useAuth } from '../../../../../hooks/useAuth';

type ShoutoutRow = {
  id: string;
  tag: string;
  note: string | null;
  created_at: string;
  events: { title: string | null; event_date: string } | null;
  profiles: { full_name: string | null } | null;
};

export default function PlayerShoutoutsScreen() {
  const { playerId } = useLocalSearchParams<{ clubSlug: string; playerId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const st = useMemo(() => getSt(colors), [colors]);

  const [rows, setRows] = useState<ShoutoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // A direct embedded profiles join 403s for a parent reading the
      // shouting coach's row (RLS) — get_team_coaches resolves it instead,
      // the same fix already applied to the roster screen's coach lookup.
      const [{ data: playerRow }, { data }] = await Promise.all([
        supabase.from('players').select('team_id').eq('id', playerId).single(),
        supabase
          .from('player_shoutouts')
          .select('id,tag,note,created_at,coach_id,events(title,event_date)')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false }),
      ]);
      const { data: coachRows } = playerRow?.team_id
        ? await supabase.rpc('get_team_coaches', { p_team_id: playerRow.team_id })
        : { data: null };
      const nameByCoachId = new Map((coachRows ?? []).map((c) => [c.profile_id, c.full_name as string | null]));
      const rows: ShoutoutRow[] = ((data ?? []) as any[]).map((r) => ({
        ...r,
        profiles: r.coach_id ? { full_name: nameByCoachId.get(r.coach_id) ?? null } : null,
      }));
      setRows(rows);
      setLoading(false);
    }
    // Same stuck-badge bug as messages/announcements/events — this screen
    // is the real destination for a player_shoutout push, but nothing
    // cleared that notification row unless the user separately opened the
    // Notification Centre and tapped it there.
    async function markShoutoutNotificationsRead() {
      if (!profile || !playerId) return;
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('profile_id', profile.id)
        .eq('read', false)
        .eq('type', 'player_shoutout')
        .filter('data->>player_id', 'eq', playerId);
    }
    if (playerId) { load(); markShoutoutNotificationsRead(); }
  }, [playerId, profile?.id]);

  return (
    <View style={st.screen}>
      <ClubHeader title="Shoutouts" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}><ActivityIndicator color={PULSE_COLORS.brand.green} /></View>
      ) : rows.length === 0 ? (
        <View style={st.center}>
          <View style={st.emptyIcon}><Ionicons name="star-outline" size={28} color={colors.muted} /></View>
          <Text style={st.emptyTitle}>No shoutouts yet</Text>
          <Text style={st.emptySub}>When a coach recognizes something great, it'll show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {rows.map(r => {
            const meta = SHOUTOUT_TAGS.find(t => t.tag === r.tag);
            return (
              <View key={r.id} style={st.card}>
                <View style={st.cardTop}>
                  <Text style={st.cardEmoji}>{meta?.emoji ?? '🌟'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={st.cardTag}>{meta?.label ?? 'Shoutout'}</Text>
                    <Text style={st.cardMeta}>
                      {r.profiles?.full_name ? `${r.profiles.full_name} · ` : ''}
                      {r.events?.event_date
                        ? new Date(r.events.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </View>
                {r.note && <Text style={st.cardNote}>{r.note}</Text>}
              </View>
            );
          })}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

function getSt(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    scroll: { padding: 16, gap: 12 },

    emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
    emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

    card: {
      backgroundColor: colors.surface, borderRadius: 16,
      borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', padding: 15, gap: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    cardEmoji: { fontSize: 26 },
    cardTag: { fontSize: 14.5, fontWeight: '800', color: colors.text },
    cardMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
    cardNote: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, fontStyle: 'italic' },
  });
}
