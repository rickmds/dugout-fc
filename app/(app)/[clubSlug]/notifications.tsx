import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
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
import { useTeam } from '../../../hooks/useTeam';
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
  rsvp_reminder:        { icon: 'calendar-outline',          color: PULSE_COLORS.status.info },
  new_announcement:     { icon: 'megaphone-outline',         color: '#8B5CF6' },
  new_dm:               { icon: 'chatbubble-outline',        color: PULSE_COLORS.brand.green },
  new_message:          { icon: 'chatbubbles-outline',       color: PULSE_COLORS.brand.green },
  new_event:            { icon: 'calendar-outline',          color: PULSE_COLORS.brand.green },
  event_updated:        { icon: 'create-outline',            color: PULSE_COLORS.status.warning },
  event_cancelled:      { icon: 'close-circle-outline',      color: PULSE_COLORS.status.error },
  field_closure:        { icon: 'warning-outline',           color: PULSE_COLORS.status.error },
  schedule_change:      { icon: 'alert-circle-outline',      color: PULSE_COLORS.status.warning },
  game_day:             { icon: 'football-outline',          color: PULSE_COLORS.status.warning },
  event_day_reminder:   { icon: 'calendar-outline',          color: PULSE_COLORS.status.info },
  attendance_absent:    { icon: 'close-circle-outline',      color: PULSE_COLORS.status.error },
  invite_accepted:      { icon: 'person-add-outline',        color: PULSE_COLORS.brand.green },
  guest_invite:         { icon: 'person-add-outline',        color: '#F97316' },
  guest_coach_invite:   { icon: 'person-add-outline',        color: '#F97316' },
  guest_accepted:       { icon: 'checkmark-circle-outline',  color: PULSE_COLORS.brand.green },
  guest_response:       { icon: 'checkmark-circle-outline',  color: PULSE_COLORS.brand.green },
  guest_removed:        { icon: 'person-remove-outline',     color: PULSE_COLORS.ui.muted },
  guest_cancelled:      { icon: 'close-circle-outline',      color: PULSE_COLORS.ui.muted },
  guest_reminder:       { icon: 'time-outline',               color: '#F97316' },
  video_added:          { icon: 'videocam-outline',          color: '#8B5CF6' },
  evaluation_published: { icon: 'star-outline',                color: '#8B5CF6' },
  waiver_reminder:      { icon: 'document-text-outline',     color: PULSE_COLORS.status.warning },
  fee_assigned:         { icon: 'card-outline',                color: PULSE_COLORS.status.warning },
  fee_payment_claimed:  { icon: 'checkmark-done-outline',      color: PULSE_COLORS.status.info },
  fee_reminder:         { icon: 'time-outline',               color: PULSE_COLORS.status.warning },
  payment_confirmed:    { icon: 'checkmark-circle-outline',  color: PULSE_COLORS.status.success },
  payment_failed:       { icon: 'close-circle-outline',      color: PULSE_COLORS.status.error },
  payment_received:     { icon: 'cash-outline',                color: PULSE_COLORS.status.success },
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
  const { team } = useTeam();

  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [hasMore, setHasMore]             = useState(false);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [filter, setFilter]               = useState<'all' | 'unread'>('all');
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const PAGE = 50;

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, data, created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);

    const rows = data ?? [];
    setHasMore(rows.length > PAGE);
    setNotifications(rows.slice(0, PAGE) as unknown as Notif[]);
    setLoading(false);
  }, [profile?.id]);

  async function onRefresh() {
    if (!profile) return;
    setRefreshing(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, data, created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);
    const rows = data ?? [];
    setHasMore(rows.length > PAGE);
    setNotifications(rows.slice(0, PAGE) as unknown as Notif[]);
    setRefreshing(false);
  }

  async function loadMore() {
    if (!profile || !notifications.length || loadingMore) return;
    setLoadingMore(true);
    const oldest = notifications[notifications.length - 1].created_at;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, data, created_at')
      .eq('profile_id', profile.id)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(PAGE + 1);
    const rows = data ?? [];
    setHasMore(rows.length > PAGE);
    setNotifications((prev) => [...prev, ...(rows.slice(0, PAGE) as unknown as Notif[])]);
    setLoadingMore(false);
  }

  async function markAll() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
  }

  async function deleteNotif(id: string) {
    setDeletingId(id);
    const snapshot = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) setNotifications(snapshot);
    setDeletingId(null);
  }

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleNotifPress(n: Notif) {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    }
    const d = n.data;
    const slug = (d?.club_slug as string) ?? clubSlug;
    switch (n.type) {
      case 'new_event':
      case 'event_updated':
      case 'schedule_change':
      case 'rsvp_reminder':
      case 'event_day_reminder':
      case 'game_day':
      case 'attendance_absent':
      case 'video_added':
        d?.event_id
          ? router.push(`/(app)/${slug}/event/${d.event_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
        break;
      case 'event_cancelled':
      case 'field_closure':
        router.push(`/(app)/${slug}/(tabs)/schedule` as any);
        break;
      case 'new_announcement':
        router.push(`/(app)/${slug}/(tabs)/chat` as any); break;
      case 'new_dm':
      case 'new_message':
        d?.conversation_id
          ? router.push(`/(app)/${slug}/conversation/${d.conversation_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/chat` as any);
        break;
      case 'guest_request':
        d?.request_id
          ? router.push(`/(app)/${slug}/guest-request/${d.request_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
        break;
      case 'guest_invite':
      case 'guest_coach_invite':
      case 'guest_accepted':
      case 'guest_response':
      case 'guest_removed':
      case 'guest_cancelled':
        d?.event_id
          ? router.push(`/(app)/${slug}/event/${d.event_id}` as any)
          : router.push(`/(app)/${slug}/(tabs)/schedule` as any);
        break;
      case 'invite_accepted':
        (profile?.role === 'org_admin' || team?.myRole === 'coach')
          ? router.push(`/(app)/${slug}/admin` as any)
          : router.push(`/(app)/${slug}/(tabs)/roster` as any);
        break;
      case 'guest_reminder':
      case 'evaluation_published':
      case 'waiver_reminder':
        router.push(`/(app)/${slug}/admin` as any);
        break;
      // Fee/payment types have no dedicated mobile screen — already marked
      // read above, nothing further to navigate to.
      case 'fee_assigned':
      case 'fee_reminder':
      case 'payment_confirmed':
      case 'payment_failed':
      case 'payment_received':
        break;
      case 'fee_payment_claimed':
        if (d?.player_fee_id) handleFeeClaimTap(d.player_fee_id as string);
        break;
      default:
        break;
    }
  }

  async function handleFeeClaimTap(playerFeeId: string) {
    const { data: fee } = await supabase
      .from('player_fees')
      .select('id, description, claim_status, claim_amount, claim_method, claim_note')
      .eq('id', playerFeeId)
      .single();
    if (!fee || fee.claim_status !== 'pending') {
      Alert.alert('Already resolved', 'This payment claim has already been handled.');
      return;
    }
    const amountText = fee.claim_amount ? `$${Number(fee.claim_amount).toFixed(2)}` : 'an unspecified amount';
    const methodText = fee.claim_method ? ` via ${fee.claim_method}` : '';
    const noteText = fee.claim_note ? `\n\n"${fee.claim_note}"` : '';
    Alert.alert(
      'Confirm payment?',
      `${fee.description} — ${amountText}${methodText}${noteText}`,
      [
        { text: 'Decline', style: 'destructive', onPress: () => resolveClaim(playerFeeId, 'decline') },
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => resolveClaim(playerFeeId, 'confirm') },
      ],
    );
  }

  async function resolveClaim(playerFeeId: string, action: 'confirm' | 'decline') {
    const { error } = action === 'confirm'
      ? await supabase.rpc('confirm_fee_payment', { p_fee_id: playerFeeId })
      : await supabase.rpc('decline_fee_claim', { p_fee_id: playerFeeId });
    if (error) {
      Alert.alert('Error', error.message ?? 'Could not process — please try again.');
      return;
    }
    Alert.alert(
      action === 'confirm' ? 'Payment confirmed' : 'Claim declined',
      action === 'confirm' ? 'The fee has been marked paid.' : 'The parent will need to follow up.',
    );
  }

  // Group by day (filtered to unread-only first, if that toggle is active)
  const visible = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
  const sections: { title: string; data: Notif[] }[] = [];
  visible.forEach((n) => {
    const label = dayLabel(n.created_at ?? '');
    const last = sections[sections.length - 1];
    if (last && last.title === label) {
      last.data.push(n);
    } else {
      sections.push({ title: label, data: [n] });
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

      {notifications.length > 0 && (
        <View style={styles.filterRow}>
          {(['all', 'unread'] as const).map((f) => {
            const sel = filter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterChip, sel && { backgroundColor: primaryColor, borderColor: primaryColor }]}
              >
                <Text style={[styles.filterChipText, sel && { color: '#fff' }]}>
                  {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-outline" size={48} color={PULSE_COLORS.ui.muted} />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>No unread notifications.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.dayLabel}>{section.title}</Text>
          )}
          renderItem={({ item: n, index, section }) => {
            const cfg = TYPE_CFG[n.type] ?? { icon: 'notifications-outline' as const, color: PULSE_COLORS.ui.muted };
            const cfgColor = (n.type === 'new_dm' || n.type === 'invite_accepted') ? primaryColor : cfg.color;
            const isFirst = index === 0;
            const isLast = index === section.data.length - 1;
            return (
              <View style={[
                styles.notifRow,
                isFirst && styles.notifRowFirst,
                isLast && styles.notifRowLast,
                !isLast && styles.notifRowBorder,
                !n.read && { backgroundColor: `${primaryColor}0C` },
              ]}>
                <TouchableOpacity
                  style={styles.notifRowTouchable}
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
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteNotif(n.id)}
                  disabled={deletingId === n.id}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.deleteBtn}
                >
                  {deletingId === n.id
                    ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                    : <Ionicons name="trash-outline" size={16} color={PULSE_COLORS.ui.muted} />}
                </TouchableOpacity>
              </View>
            );
          }}
          ListFooterComponent={hasMore ? (
            <TouchableOpacity
              onPress={loadMore}
              disabled={loadingMore}
              style={styles.loadMoreBtn}
              activeOpacity={0.7}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
                : <Text style={styles.loadMoreText}>Load more</Text>}
            </TouchableOpacity>
          ) : <View style={{ height: 40 }} />}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 24 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  loadMoreBtn: {
    alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24,
    marginVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    minWidth: 48, alignItems: 'center',
  },
  loadMoreText: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  dayLabel: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 20, marginBottom: 8,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  notifRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
  },
  notifRowFirst: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  notifRowLast:  { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  notifRowBorder: {
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  notifRowTouchable: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingLeft: 14, paddingRight: 4, gap: 10,
  },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 14 },
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
