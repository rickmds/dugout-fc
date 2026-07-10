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
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../constants/colors';
import { useClub } from '../../../hooks/useClub';
import ClubHeader from '../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
};

// ─── Config per notification type ─────────────────────────────────────────────

const TYPE_CFG: Record<string, { icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  rsvp_reminder:    { icon: 'calendar-outline',     color: '#3B82F6' },
  new_announcement: { icon: 'megaphone-outline',    color: '#8B5CF6' },
  new_dm:           { icon: 'chatbubble-outline',   color: PULSE_COLORS.brand.green },
  schedule_change:  { icon: 'alert-circle-outline', color: '#F59E0B' },
  invite_accepted:  { icon: 'person-add-outline',   color: PULSE_COLORS.brand.green },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { primaryColor } = useClub();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, data, created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setNotifications((data ?? []) as unknown as Notif[]);
    setLoading(false);
  }, [profile?.id]);

  async function markAll() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleNotifPress(n: Notif) {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      supabase.from('notifications').update({ read: true }).eq('id', n.id);
    }
    const d = n.data;
    const slug = (d?.club_slug as string) ?? clubSlug;
    switch (n.type) {
      case 'new_event':
      case 'schedule_change':
        d?.event_id
          ? router.push(`/(app)/${slug}/event/${d.event_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
        break;
      case 'rsvp_reminder':
        d?.event_id
          ? router.push(`/(app)/${slug}/event/${d.event_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
        break;
      case 'new_announcement':
        router.push(`/(app)/${slug}/(tabs)/chat` as any); break;
      case 'new_dm':
        d?.conversation_id
          ? router.push(`/(app)/${slug}/conversation/${d.conversation_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/chat` as any);
        break;
      case 'invite_accepted':
        (profile?.role === 'org_admin' || profile?.role === 'coach')
          ? router.push(`/(app)/${slug}/admin` as any)
          : router.push(`/(app)/${slug}/(tabs)/roster` as any);
        break;
      default:
        break;
    }
  }

  // Group by day
  const groups: { label: string; items: Notif[] }[] = [];
  notifications.forEach((n) => {
    const label = dayLabel(n.created_at ?? '');
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(n);
    } else {
      groups.push({ label, items: [n] });
    }
  });

  return (
    <View style={styles.root}>

      <ClubHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        onBack={() => router.back()}
        right={unreadCount > 0 ? (
          <TouchableOpacity onPress={markAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Mark all</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={48} color={PULSE_COLORS.ui.muted} />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyBody}>RSVP reminders, announcements, and messages will appear here.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {groups.map((group) => (
            <View key={group.label}>
              <Text style={styles.dayLabel}>{group.label}</Text>
              <View style={styles.group}>
                {group.items.map((n, idx) => {
                  const cfg = TYPE_CFG[n.type] ?? { icon: 'notifications-outline' as const, color: PULSE_COLORS.ui.muted };
                  const cfgColor = (n.type === 'new_dm' || n.type === 'invite_accepted') ? primaryColor : cfg.color;
                  const isLast = idx === group.items.length - 1;
                  return (
                    <TouchableOpacity
                      key={n.id}
                      style={[styles.notifRow, !isLast && styles.notifRowBorder]}
                      onPress={() => handleNotifPress(n)}
                      activeOpacity={0.7}
                    >
                      {/* Unread dot */}
                      <View style={styles.dotCol}>
                        {!n.read && <View style={[styles.dot, { backgroundColor: primaryColor }]} />}
                      </View>

                      {/* Icon */}
                      <View style={[styles.iconCircle, { backgroundColor: `${cfgColor}18` }]}>
                        <Ionicons name={cfg.icon} size={18} color={cfgColor} />
                      </View>

                      {/* Content */}
                      <View style={styles.notifContent}>
                        <Text style={[styles.notifTitle, !n.read && styles.notifTitleUnread]}>{n.title}</Text>
                        {n.body ? <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text> : null}
                        <Text style={styles.notifTime}>{relativeTime(n.created_at ?? '')}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn:      { width: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },
  headerSub:    { fontSize: 12, color: PULSE_COLORS.brand.green, marginTop: 1, fontWeight: '600' },
  markAllText:  { fontSize: 13, fontWeight: '600', width: 80, textAlign: 'right' },

  dayLabel: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 20, marginBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  notifRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14, gap: 10,
  },
  notifRowBorder: {
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  dotCol: { width: 8, alignItems: 'center' },
  dot:    { width: 7, height: 7, borderRadius: 3.5, backgroundColor: PULSE_COLORS.brand.green },

  iconCircle: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  notifContent:     { flex: 1, gap: 2 },
  notifTitle:       { fontSize: 14, fontWeight: '500', color: PULSE_COLORS.ui.textSecondary },
  notifTitleUnread: { fontWeight: '700', color: PULSE_COLORS.ui.text },
  notifBody:        { fontSize: 13, color: PULSE_COLORS.ui.muted, lineHeight: 18 },
  notifTime:        { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2 },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },
  emptyBody:  { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center', lineHeight: 20 },
});
