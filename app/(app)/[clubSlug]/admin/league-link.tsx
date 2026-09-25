import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS, ThemeColors } from '../../../../constants/colors';
import { useTheme } from '../../../../hooks/useTheme';
import ClubHeader from '../../../../components/ui/ClubHeader';

// The front door for every partner-league integration — currently just
// NCSA, but the point of this screen existing separately from ncsa-link.tsx
// is that adding a second league later means adding one more card here and
// its own linking screen, never touching this list's shape or the ones
// that already work. Each league keeps its own data model and edge
// functions rather than forcing a shared abstraction before a second real
// implementation exists to check it against.
type LeagueOption = {
  key: 'ncsa';
  name: string;
  region: string;
  description: string;
  route: string;
};

const LEAGUES: LeagueOption[] = [
  {
    key: 'ncsa',
    name: 'NCSA',
    region: 'Northern NJ',
    description: 'Auto-import games, reschedules, scores, and standings from your NCSA schedule.',
    route: 'ncsa-link',
  },
];

export default function LeagueLinkScreen() {
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { team } = useTeam();
  const { primaryColor, rgba } = useClub();
  const { colors } = useTheme();
  const st = useMemo(() => getSt(colors), [colors]);

  const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team?.id) return;
    supabase
      .from('team_ncsa_links')
      .select('id')
      .eq('team_id', team.id)
      .then(({ data }) => {
        setLinkedCounts({ ncsa: data?.length ?? 0 });
        setLoading(false);
      });
  }, [team?.id]);

  if (!team) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ClubHeader title="Link to League" subtitle={team.name} onBack={() => router.back()} />
      <View style={st.body}>
        <Text style={st.hint}>
          Choose a partner league to pull this team's games in automatically instead of entering
          them by hand. More leagues get added here as they're supported.
        </Text>

        {loading ? (
          <ActivityIndicator color={primaryColor} style={{ marginTop: 24 }} />
        ) : (
          LEAGUES.map((league) => {
            const count = linkedCounts[league.key] ?? 0;
            return (
              <TouchableOpacity
                key={league.key}
                style={st.card}
                onPress={() => router.push(`/(app)/${clubSlug}/admin/${league.route}` as any)}
                activeOpacity={0.8}
              >
                <View style={[st.iconWrap, { backgroundColor: rgba(0.12) }]}>
                  <Ionicons name="trophy-outline" size={20} color={primaryColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={st.cardName}>{league.name}</Text>
                    <Text style={st.cardRegion}>{league.region}</Text>
                  </View>
                  <Text style={st.cardDesc}>{league.description}</Text>
                  {count > 0 && (
                    <View style={st.linkedPill}>
                      <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                      <Text style={st.linkedPillText}>{count} team {count === 1 ? 'entry' : 'entries'} linked</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            );
          })
        )}

        <Text style={st.footnote}>
          Don't see your league? It's not supported yet — add games manually for now the same way you always have.
        </Text>
      </View>
    </View>
  );
}

function getSt(colors: ThemeColors) {
  return StyleSheet.create({
  body: { padding: 16 },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 18 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 14, fontWeight: '800', color: colors.text },
  cardRegion: { fontSize: 11, fontWeight: '600', color: colors.muted },
  cardDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginTop: 3 },
  linkedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  linkedPillText: { fontSize: 11, fontWeight: '700', color: '#22c55e' },
  footnote: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 8, paddingHorizontal: 4 },
  });
}
