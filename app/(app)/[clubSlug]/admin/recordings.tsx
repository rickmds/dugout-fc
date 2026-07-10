import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';

type Recording = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  video_url: string;
};

const TYPE_COLOR: Record<string, string> = {
  game:     '#F59E0B',
  training: '#3B82F6',
  other:    '#9CA3AF',
};

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RecordingsScreen() {
  const { primaryColor } = useClub();
  const { team } = useTeam();
  const router = useRouter();
  const { profile } = useAuth();

  useEffect(() => {
    if (profile && !['coach', 'org_admin', 'app_admin'].includes(profile.role ?? '')) {
      router.back();
    }
  }, [profile]);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (team) load();
  }, [team?.id]);

  async function load() {
    if (!team) return;
    const { data } = await supabase
      .from('events')
      .select('id, title, type, event_date, video_url')
      .eq('team_id', team.id)
      .not('video_url', 'is', null)
      .order('event_date', { ascending: false });
    setRecordings((data as Recording[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClubHeader
        title="Recordings"
        subtitle={recordings.length > 0 ? `${recordings.length} recording${recordings.length !== 1 ? 's' : ''}` : 'No recordings yet'}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {recordings.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
              <Ionicons name="videocam-outline" size={28} color="#8B5CF6" />
            </View>
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptySubtitle}>
              Add a video link to any event and it will appear here.
            </Text>
          </View>
        ) : (
          recordings.map((item) => {
            const typeColor = TYPE_COLOR[item.type] ?? TYPE_COLOR.other;
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => Linking.openURL(item.video_url)}
                activeOpacity={0.75}
              >
                <View style={[styles.typeStripe, { backgroundColor: typeColor }]} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeBadge, { backgroundColor: `${typeColor}18` }]}>
                      <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      </Text>
                    </View>
                    <Text style={styles.dateText}>{fmtDate(item.event_date)}</Text>
                  </View>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.url} numberOfLines={1}>{item.video_url}</Text>
                </View>
                <View style={styles.playBtn}>
                  <Ionicons name="play-circle" size={28} color="#8B5CF6" />
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },
  list: { paddingHorizontal: 16, paddingTop: 16 },

  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.text },
  emptySubtitle: { fontSize: 14, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', maxWidth: 260, lineHeight: 20 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, marginBottom: 10, overflow: 'hidden',
  },
  typeStripe: { width: 3, alignSelf: 'stretch' },
  cardBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  url: { fontSize: 12, color: PULSE_COLORS.ui.muted },
  playBtn: { paddingHorizontal: 14 },
});
