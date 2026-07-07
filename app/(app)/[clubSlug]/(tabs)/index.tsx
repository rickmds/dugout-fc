import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { positionColor } from '../../../../constants/positions';
import ClubBadge from '../../../../components/ui/ClubBadge';
import GameDayWidget from '../../../../components/home/GameDayWidget';

type NextEvent = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  uniform: string | null;
};

type MyPlayer = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  photo_url: string | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

type OutstandingFee = {
  id: string;
  description: string;
  amount_due: number;
  discount: number;
  due_date: string | null;
  status: string;
};

const DEV_ACCOUNTS = [
  { label: 'Coach', email: 'coach@test.com', password: 'test123456' },
  { label: 'Parent', email: 'parent@test.com', password: 'test123456' },
  { label: 'Admin', email: 'admin@test.com', password: 'test123456' },
];

const TYPE_CONFIG: Record<string, { icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  game:     { icon: 'football-outline', color: '#F59E0B' },
  training: { icon: 'barbell-outline',  color: '#3B82F6' },
  other:    { icon: 'pin-outline',      color: '#9CA3AF' },
};


function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${time}, ${name.split(' ')[0]}` : time;
}

function formatDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCountdown(dateStr: string, timeStr: string | null): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff !== 0) return formatDate(dateStr);
  if (!timeStr) return 'Today';
  const [h, m] = timeStr.split(':').map(Number);
  const eventTime = new Date();
  eventTime.setHours(h, m, 0, 0);
  const mins = Math.round((eventTime.getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'In progress';
  if (mins < 60) return `Starts in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `Starts in ${hrs}h ${rem}m` : `Starts in ${hrs}h`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}


function QuickAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { primaryColor, rgba } = useClub();
  return (
    <TouchableOpacity style={styles.actionTile} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.actionIconWrap, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
        <Ionicons name={icon} size={22} color={primaryColor} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function HomeSkeleton() {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const SKEL = DUGOUT_COLORS.ui.surface;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: DUGOUT_COLORS.ui.background }} contentContainerStyle={{ padding: 20, paddingTop: 68, paddingBottom: 48 }} scrollEnabled={false}>
      <Animated.View style={{ opacity: pulse }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <View style={{ flex: 1 }}>
            <View style={{ width: 80, height: 10, borderRadius: 6, backgroundColor: SKEL, marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: SKEL }} />
              <View style={{ gap: 6 }}>
                <View style={{ width: 140, height: 14, borderRadius: 6, backgroundColor: SKEL }} />
                <View style={{ width: 90, height: 10, borderRadius: 6, backgroundColor: SKEL }} />
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {[0, 1].map(i => <View key={i} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SKEL }} />)}
          </View>
        </View>
        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 28 }}>
          {[0, 1].map(i => (
            <View key={i} style={{ flex: 1, height: 100, borderRadius: 16, backgroundColor: SKEL }} />
          ))}
        </View>
        {/* Section label */}
        <View style={{ width: 80, height: 9, borderRadius: 5, backgroundColor: SKEL, marginBottom: 10 }} />
        {/* Next event card */}
        <View style={{ height: 120, borderRadius: 16, backgroundColor: SKEL, marginBottom: 28 }} />
        {/* Announcement label */}
        <View style={{ width: 100, height: 9, borderRadius: 5, backgroundColor: SKEL, marginBottom: 10 }} />
        {/* Announcement card */}
        <View style={{ height: 76, borderRadius: 16, backgroundColor: SKEL }} />
      </Animated.View>
    </ScrollView>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club, refreshProfile, signOut } = useAuth();
  const { team, allTeams, loading: teamLoading, selectTeam } = useTeam();
  const { primaryColor, rgba, clubName } = useClub();

  const [playerCount, setPlayerCount]       = useState(0);
  const [upcomingCount, setUpcomingCount]   = useState(0);
  const [nextEvent, setNextEvent]           = useState<NextEvent | null>(null);
  const [myPlayer, setMyPlayer]             = useState<MyPlayer | null>(null);
  const [myRsvpStatus, setMyRsvpStatus]     = useState<string | null>(null);
  const [myRsvpCount, setMyRsvpCount]       = useState(0);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [rsvpLoading, setRsvpLoading]       = useState(false);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [outstandingFees, setOutstandingFees] = useState<OutstandingFee[]>([]);
  const [showFeeModal, setShowFeeModal]     = useState(false);

  const isCoach = profile?.role === 'org_admin' || profile?.role === 'coach';
  const slug = clubSlug ?? club?.slug ?? '';

  // Team picker
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const hasMultipleTeams = allTeams.length > 1;

  async function handleSelectTeam(teamId: string) {
    setTeamPickerOpen(false);
    await selectTeam(teamId);
  }

  // Dev switcher
  const [devOpen, setDevOpen]         = useState(false);
  const [devLoading, setDevLoading]   = useState<string | null>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleGreetingTap() {
    if (process.env.EXPO_PUBLIC_APP_ENV !== 'development') return;
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 800);
    if (tapCount.current >= 5) { tapCount.current = 0; setDevOpen(true); }
  }

  async function switchTo(account: typeof DEV_ACCOUNTS[number]) {
    setDevLoading(account.email);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
    if (error) {
      setDevLoading(null);
      setDevOpen(false);
      alert(`No account for ${account.email}. Register it first.`);
      router.replace('/(auth)/login');
      return;
    }
    await refreshProfile();
    setDevLoading(null);
    setDevOpen(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: p } = await supabase.from('profiles').select('role, club_id').eq('id', session.user.id).single();
    if (p?.club_id) {
      const { data: c } = await supabase.from('clubs').select('slug').eq('id', p.club_id).single();
      if (c?.slug) { router.replace(`/(app)/${c.slug}/(tabs)` as never); return; }
    }
    router.replace('/(auth)/role-select');
  }

  useFocusEffect(
    useCallback(() => {
      if (teamLoading) return;
      if (!team) { setLoading(false); return; }
      fetchData();
    }, [team?.id, teamLoading])
  );

  async function fetchData() {
    if (!team || !profile) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [
      { count: pc },
      { count: ec },
      { data: events },
      playerRes,
      announcementRes,
      { count: unreadNotifs },
      { data: upcomingEventsData },
    ] = await Promise.all([
      supabase.from('players').select('*', { count: 'exact', head: true }).eq('team_id', team.id),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null),
      supabase.from('events').select('id, title, type, event_date, event_time, location, uniform').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null).order('event_date').order('event_time').limit(1),
      supabase.from('players').select('id, full_name, jersey_number, position, photo_url').eq('team_id', team.id).eq('profile_id', profile.id).maybeSingle(),
      supabase.from('announcements').select('id, title, body, created_at').eq('team_id', team.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('read', false),
      supabase.from('events').select('id').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null),
    ]);

    const upcomingEventIds = (upcomingEventsData ?? []).map((e: { id: string }) => e.id);

    setPlayerCount(pc ?? 0);
    setUpcomingCount(ec ?? 0);
    setUnreadNotifCount(unreadNotifs ?? 0);
    const next = (events as NextEvent[])?.[0] ?? null;
    setNextEvent(next);

    const player = (playerRes as any).data as MyPlayer | null;
    setMyPlayer(player);
    setLatestAnnouncement((announcementRes as any).data ?? null);

    if (player && !isCoach) {
      const { data: feesData } = await (supabase as any)
        .from('player_fees')
        .select('id, description, amount_due, discount, due_date, status')
        .eq('player_id', player.id)
        .in('status', ['outstanding', 'overdue', 'partial'])
        .order('due_date', { ascending: true, nullsFirst: false });
      setOutstandingFees((feesData ?? []) as OutstandingFee[]);
    } else {
      setOutstandingFees([]);
    }

    if (player && next) {
      if (upcomingEventIds.length === 0) {
        const { data: rsvpData } = await supabase.from('event_rsvps').select('status').eq('event_id', next.id).eq('player_id', player.id).maybeSingle();
        setMyRsvpStatus((rsvpData as any)?.status ?? null);
        setMyRsvpCount(0);
      } else {
        const [rsvpRes, { count: rc }] = await Promise.all([
          supabase.from('event_rsvps').select('status').eq('event_id', next.id).eq('player_id', player.id).maybeSingle(),
          supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('player_id', player.id).eq('status', 'attending').in('event_id', upcomingEventIds),
        ]);
        setMyRsvpStatus((rsvpRes as any).data?.status ?? null);
        setMyRsvpCount(rc ?? 0);
      }
    } else {
      setMyRsvpStatus(null);
      setMyRsvpCount(0);
    }

    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  async function handleInlineRsvp(status: 'attending' | 'not_attending') {
    if (!nextEvent || !myPlayer || rsvpLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRsvpLoading(true);
    const isSame = myRsvpStatus === status;
    if (isSame) {
      await supabase.from('event_rsvps').delete().eq('event_id', nextEvent.id).eq('player_id', myPlayer.id);
      setMyRsvpStatus(null);
      if (status === 'attending') setMyRsvpCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from('event_rsvps').upsert(
        { event_id: nextEvent.id, player_id: myPlayer.id, responded_by: profile?.id, status },
        { onConflict: 'event_id,player_id' }
      );
      if (status === 'attending') setMyRsvpCount((c) => c + 1);
      else if (myRsvpStatus === 'attending') setMyRsvpCount((c) => Math.max(0, c - 1));
      setMyRsvpStatus(status);
    }
    setRsvpLoading(false);
  }

  if (teamLoading || loading) {
    return <HomeSkeleton />;
  }

  const teamName = team?.name ?? club?.name ?? 'Your Team';
  const eventCfg = nextEvent ? (TYPE_CONFIG[nextEvent.type] ?? TYPE_CONFIG.other) : null;
  const playerColor = positionColor(myPlayer?.position ?? null);
  const playerInitials = myPlayer?.full_name
    ? myPlayer.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const playerAvatarUrl = myPlayer?.photo_url ?? null;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
      >

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting} onPress={handleGreetingTap}>{greeting(profile?.full_name)}</Text>
            <TouchableOpacity
              style={styles.teamRow}
              onPress={() => hasMultipleTeams && setTeamPickerOpen(true)}
              activeOpacity={hasMultipleTeams ? 0.7 : 1}
            >
              <ClubBadge size={60} />
              <View style={{ flex: 1 }}>
                <Text style={styles.clubName}>{clubName}</Text>
                <View style={styles.teamNameRow}>
                  <Text style={styles.teamName}>{teamName}</Text>
                  {hasMultipleTeams && (
                    <Ionicons name="chevron-down" size={14} color={DUGOUT_COLORS.ui.muted} style={{ marginTop: 2 }} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push(`/(app)/${slug}/notifications` as never)}>
              <View>
                <Ionicons name="notifications-outline" size={20} color={unreadNotifCount > 0 ? DUGOUT_COLORS.ui.text : DUGOUT_COLORS.ui.muted} />
                {unreadNotifCount > 0 && <View style={styles.notifBadge} />}
              </View>
            </TouchableOpacity>
            {isCoach && (
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push(`/(app)/${slug}/admin` as never)}>
                <Ionicons name="grid-outline" size={20} color={DUGOUT_COLORS.ui.muted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push(`/(app)/${slug}/settings` as never)}>
              <Ionicons name="settings-outline" size={20} color={DUGOUT_COLORS.ui.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push(`/(app)/${slug}/(tabs)/roster` as never)} activeOpacity={0.8}>
            <View style={[styles.statIcon, { backgroundColor: rgba(0.1) }]}>
              <Ionicons name={isCoach ? 'people-outline' : 'checkmark-circle-outline'} size={18} color={primaryColor} />
            </View>
            <Text style={[styles.statNumber, { color: primaryColor }]}>{isCoach ? playerCount : myRsvpCount}</Text>
            <Text style={styles.statLabel}>{isCoach ? 'Players' : 'Going'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push(`/(app)/${slug}/(tabs)/schedule` as never)} activeOpacity={0.8}>
            <View style={[styles.statIcon, { backgroundColor: rgba(0.1) }]}>
              <Ionicons name="calendar-outline" size={18} color={primaryColor} />
            </View>
            <Text style={[styles.statNumber, { color: primaryColor }]}>{upcomingCount}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </TouchableOpacity>
        </View>

        {/* Game Day Outlook — coaches only */}
        {isCoach && (
          <GameDayWidget onPress={() => router.push(`/(app)/${slug}/game-day` as any)} />
        )}

        {/* Next Event */}
        <Text style={styles.sectionTitle}>NEXT EVENT</Text>
        {nextEvent && eventCfg ? (
          <TouchableOpacity
            style={styles.nextEventCard}
            onPress={() => router.push(`/(app)/${slug}/event/${nextEvent.id}` as never)}
            activeOpacity={0.85}
          >
            {/* Top row: icon + details + chevron */}
            <View style={styles.nextEventTop}>
              <View style={[styles.eventTypeIcon, { backgroundColor: `${eventCfg.color}18` }]}>
                <Ionicons name={eventCfg.icon} size={26} color={eventCfg.color} />
              </View>
              <View style={styles.nextEventBody}>
                <Text style={styles.nextEventTitle}>{nextEvent.title}</Text>
                <Text style={[styles.nextEventDate, { color: primaryColor }]}>
                  {formatCountdown(nextEvent.event_date, nextEvent.event_time)}
                  {nextEvent.event_time ? `  ·  ${formatTime(nextEvent.event_time)}` : ''}
                </Text>
                {nextEvent.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={12} color={DUGOUT_COLORS.ui.muted} />
                    <Text style={styles.nextEventLocation}>{nextEvent.location}</Text>
                  </View>
                ) : null}
                {nextEvent.uniform && (
                  <View style={[styles.uniformChip, { backgroundColor: rgba(0.1), borderColor: rgba(0.25) }]}>
                    <Text style={[styles.uniformChipText, { color: primaryColor }]}>
                      {nextEvent.uniform.charAt(0).toUpperCase() + nextEvent.uniform.slice(1)} kit
                    </Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.muted} style={{ marginTop: 2 }} />
            </View>

            {/* RSVP row — parents only */}
            {!isCoach && myPlayer && (
              <View style={styles.nextEventRsvpRow}>
                {myRsvpStatus === null ? (
                  <>
                    <TouchableOpacity
                      style={[styles.rsvpBtn, { backgroundColor: rgba(0.12), borderColor: rgba(0.3) }]}
                      onPress={() => handleInlineRsvp('attending')}
                      disabled={rsvpLoading}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="checkmark" size={14} color={primaryColor} />
                      <Text style={[styles.rsvpBtnText, { color: primaryColor }]}>Going</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rsvpBtn, styles.rsvpBtnNo]}
                      onPress={() => handleInlineRsvp('not_attending')}
                      disabled={rsvpLoading}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="close" size={14} color={DUGOUT_COLORS.rsvp.not_attending} />
                      <Text style={[styles.rsvpBtnText, { color: DUGOUT_COLORS.rsvp.not_attending }]}>Can't go</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={[
                    styles.rsvpConfirmed,
                    myRsvpStatus === 'attending'
                      ? { backgroundColor: rgba(0.1), borderColor: rgba(0.25) }
                      : { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' },
                  ]}>
                    <Ionicons
                      name={myRsvpStatus === 'attending' ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={myRsvpStatus === 'attending' ? primaryColor : DUGOUT_COLORS.rsvp.not_attending}
                    />
                    <Text style={[
                      styles.rsvpConfirmedText,
                      { color: myRsvpStatus === 'attending' ? primaryColor : DUGOUT_COLORS.rsvp.not_attending },
                    ]}>
                      {myRsvpStatus === 'attending' ? 'Going' : "Can't go"}
                    </Text>
                    <Text style={styles.rsvpTapToChange}>  ·  tap card to change</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.noEvent}>
            <View style={[styles.noEventIconWrap, { backgroundColor: rgba(0.1) }]}>
              <Ionicons name="calendar-outline" size={28} color={primaryColor} />
            </View>
            <Text style={styles.noEventText}>No upcoming events</Text>
            {isCoach && (
              <Text style={styles.noEventSub}>Create your first event in the Admin Panel</Text>
            )}
          </View>
        )}

        {/* Outstanding fees — parents only */}
        {!isCoach && outstandingFees.length > 0 && (() => {
          const hasOverdue = outstandingFees.some(f => f.status === 'overdue' || (f.due_date && new Date(f.due_date) < new Date()));
          const accentColor = hasOverdue ? DUGOUT_COLORS.status.error : DUGOUT_COLORS.status.warning;
          const totalOwed = outstandingFees.reduce((s, f) => s + Math.max(0, f.amount_due - (f.discount ?? 0)), 0);
          const single = outstandingFees.length === 1 ? outstandingFees[0] : null;
          const fmtDue = (due: string | null) => {
            if (!due) return null;
            const d = new Date(due + 'T00:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          };
          return (
            <>
              <Text style={styles.sectionTitle}>OUTSTANDING FEES</Text>
              <TouchableOpacity
                style={[styles.feeCard, { borderColor: `${accentColor}40` }]}
                onPress={() => setShowFeeModal(true)}
                activeOpacity={0.85}
              >
                <View style={[styles.feeAccent, { backgroundColor: accentColor }]} />
                <View style={styles.feeBody}>
                  <View style={styles.feeTop}>
                    <View style={[styles.feeIconWrap, { backgroundColor: `${accentColor}18` }]}>
                      <Ionicons name="card-outline" size={20} color={accentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {single ? (
                        <>
                          <Text style={styles.feeTitle}>{single.description}</Text>
                          <Text style={[styles.feeAmount, { color: accentColor }]}>
                            ${Math.max(0, single.amount_due - (single.discount ?? 0)).toFixed(2)}
                            {fmtDue(single.due_date) ? `  ·  Due ${fmtDue(single.due_date)}` : ''}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.feeTitle}>{outstandingFees.length} fees outstanding</Text>
                          <Text style={[styles.feeAmount, { color: accentColor }]}>${totalOwed.toFixed(2)} total</Text>
                        </>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.muted} />
                  </View>
                  {hasOverdue && (
                    <View style={styles.feeOverdueBadge}>
                      <Ionicons name="alert-circle-outline" size={12} color={DUGOUT_COLORS.status.error} />
                      <Text style={styles.feeOverdueText}>Payment overdue — contact your coach</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* My Player — parents only */}
        {!isCoach && myPlayer && (
          <>
            <Text style={styles.sectionTitle}>MY PLAYER</Text>
            <TouchableOpacity
              style={styles.myPlayerCard}
              onPress={() => router.push(`/(app)/${slug}/player/${myPlayer.id}` as never)}
              activeOpacity={0.8}
            >
              {/* Avatar */}
              <View style={[styles.playerAvatarRing, { borderColor: playerColor }]}>
                {playerAvatarUrl ? (
                  <Image source={{ uri: playerAvatarUrl }} style={styles.playerAvatarPhoto} />
                ) : (
                  <View style={[styles.playerAvatarFill, { backgroundColor: `${playerColor}20` }]}>
                    <Text style={[styles.playerAvatarText, { color: playerColor }]}>{playerInitials}</Text>
                  </View>
                )}
              </View>

              {/* Info */}
              <View style={styles.myPlayerBody}>
                <Text style={styles.myPlayerName}>{myPlayer.full_name}</Text>
                <View style={styles.myPlayerBadges}>
                  {myPlayer.jersey_number != null && (
                    <View style={[styles.jerseyBadge, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
                      <Text style={[styles.jerseyBadgeText, { color: primaryColor }]}>#{myPlayer.jersey_number}</Text>
                    </View>
                  )}
                  {myPlayer.position && (
                    <View style={[styles.posBadge, { backgroundColor: `${playerColor}18`, borderColor: `${playerColor}35` }]}>
                      <Text style={[styles.posBadgeText, { color: playerColor }]}>{myPlayer.position.toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              </View>

              <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Latest announcement */}
        {latestAnnouncement && (
          <>
            <Text style={styles.sectionTitle}>FROM THE COACH</Text>
            <TouchableOpacity
              style={styles.announcementCard}
              onPress={() => router.push(`/(app)/${slug}/(tabs)/chat` as never)}
              activeOpacity={0.8}
            >
              <View style={[styles.announcementIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
                <Ionicons name="megaphone-outline" size={18} color={primaryColor} />
              </View>
              <View style={styles.announcementBody}>
                <Text style={styles.announcementTitle} numberOfLines={1}>{latestAnnouncement.title}</Text>
                <Text style={styles.announcementPreview} numberOfLines={2}>{latestAnnouncement.body}</Text>
                <Text style={styles.announcementTime}>{timeAgo(latestAnnouncement.created_at)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          {isCoach ? (
            <>
              <QuickAction icon="person-add-outline" label="Add Player" onPress={() => router.push(`/(app)/${slug}/(tabs)/roster` as never)} />
              <QuickAction icon="calendar-outline" label="Add Event" onPress={() => router.push(`/(app)/${slug}/(tabs)/schedule` as never)} />
              <QuickAction icon="link-outline" label="Invite" onPress={() => router.push(`/(app)/${slug}/(tabs)/roster` as never)} />
              <QuickAction icon="chatbubble-outline" label="Team Chat" onPress={() => router.push(`/(app)/${slug}/(tabs)/chat` as never)} />
            </>
          ) : (
            <>
              <QuickAction icon="calendar-outline" label="Schedule" onPress={() => router.push(`/(app)/${slug}/(tabs)/schedule` as never)} />
              <QuickAction icon="people-outline" label="Roster" onPress={() => router.push(`/(app)/${slug}/(tabs)/roster` as never)} />
              <QuickAction icon="chatbubble-outline" label="Team Chat" onPress={() => router.push(`/(app)/${slug}/(tabs)/chat` as never)} />
              <QuickAction icon="settings-outline" label="Settings" onPress={() => router.push(`/(app)/${slug}/settings` as never)} />
            </>
          )}
        </View>
        <View style={{ height: 32 }} />

      </ScrollView>

      {/* Team picker */}
      <Modal visible={teamPickerOpen} transparent animationType="slide" onRequestClose={() => setTeamPickerOpen(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setTeamPickerOpen(false)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Switch Team</Text>
          <Text style={styles.devSub}>Select which team to view</Text>
          {allTeams.map((t) => {
            const isActive = t.id === team?.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.teamPickerRow, isActive && styles.teamPickerRowActive]}
                onPress={() => handleSelectTeam(t.id)}
                activeOpacity={0.75}
              >
                <View style={[styles.teamPickerIcon, { backgroundColor: rgba(isActive ? 0.18 : 0.08), borderColor: rgba(isActive ? 0.35 : 0.15) }]}>
                  <Ionicons name="football-outline" size={18} color={primaryColor} />
                </View>
                <View style={styles.teamPickerBody}>
                  <Text style={[styles.teamPickerName, isActive && { color: primaryColor }]}>{t.name}</Text>
                  {(t.age_group || t.season) ? (
                    <Text style={styles.teamPickerMeta}>{[t.age_group, t.season].filter(Boolean).join('  ·  ')}</Text>
                  ) : null}
                </View>
                {isActive && <Ionicons name="checkmark-circle" size={20} color={primaryColor} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* Fee detail modal */}
      <Modal visible={showFeeModal} transparent animationType="slide" onRequestClose={() => setShowFeeModal(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setShowFeeModal(false)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Outstanding Fees</Text>
          <Text style={styles.devSub}>Contact your coach or club admin to arrange payment</Text>
          {outstandingFees.map((fee) => {
            const net = Math.max(0, fee.amount_due - (fee.discount ?? 0));
            const isOverdue = fee.status === 'overdue' || (fee.due_date ? new Date(fee.due_date) < new Date() : false);
            const statusColor = isOverdue ? DUGOUT_COLORS.status.error : fee.status === 'partial' ? DUGOUT_COLORS.status.info : DUGOUT_COLORS.status.warning;
            const statusLabel = isOverdue ? 'Overdue' : fee.status === 'partial' ? 'Partial' : 'Outstanding';
            const fmtDue = fee.due_date
              ? new Date(fee.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : null;
            return (
              <View key={fee.id} style={styles.feeModalRow}>
                <View style={[styles.feeModalAccent, { backgroundColor: statusColor }]} />
                <View style={{ flex: 1, gap: 4, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.feeModalTitle}>{fee.description}</Text>
                    <Text style={[styles.feeModalAmount, { color: statusColor }]}>${net.toFixed(2)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.feeStatusChip, { backgroundColor: `${statusColor}20`, borderColor: `${statusColor}40` }]}>
                      <Text style={[styles.feeStatusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                    {fmtDue && <Text style={styles.feeModalDue}>Due {fmtDue}</Text>}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Modal>

      {/* Dev switcher */}
      <Modal visible={devOpen} transparent animationType="slide" onRequestClose={() => setDevOpen(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setDevOpen(false)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Dev Switcher</Text>
          <Text style={styles.devSub}>Switch accounts without signing out manually</Text>
          {DEV_ACCOUNTS.map((a) => (
            <TouchableOpacity
              key={a.email}
              style={[styles.devRow, devLoading === a.email && styles.devRowLoading]}
              onPress={() => switchTo(a)}
              disabled={!!devLoading}
            >
              <View style={[styles.devAvatar, { backgroundColor: rgba(0.15) }]}>
                <Text style={[styles.devAvatarText, { color: primaryColor }]}>{a.label[0]}</Text>
              </View>
              <View style={styles.devRowBody}>
                <Text style={styles.devRowLabel}>{a.label}</Text>
                <Text style={styles.devRowEmail}>{a.email}</Text>
              </View>
              {devLoading === a.email
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Ionicons name="chevron-forward" size={16} color={DUGOUT_COLORS.ui.muted} />
              }
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.devSignOut} onPress={async () => { setDevOpen(false); await signOut(); router.replace('/(auth)/login'); }}>
            <Text style={styles.devSignOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  content: { padding: 20, paddingTop: 68, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DUGOUT_COLORS.ui.background },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 13, color: DUGOUT_COLORS.ui.muted, fontWeight: '500', marginBottom: 12 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  clubName: { fontSize: 20, fontWeight: '800', color: DUGOUT_COLORS.ui.text, letterSpacing: -0.5, marginBottom: 2 },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  teamName: { fontSize: 13, color: DUGOUT_COLORS.ui.muted, fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -1, right: -1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5, borderColor: DUGOUT_COLORS.ui.background,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: {
    flex: 1, backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 4,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statNumber: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  statLabel: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, fontWeight: '600' },

  // Section title
  sectionTitle: { fontSize: 12, fontWeight: '700', color: DUGOUT_COLORS.ui.muted, letterSpacing: 1, marginBottom: 10 },

  // Next Event
  nextEventCard: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 28,
    gap: 14,
  },
  nextEventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  eventTypeIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nextEventBody: { flex: 1, gap: 4 },
  nextEventTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  nextEventDate: { fontSize: 13, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextEventLocation: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary },
  uniformChip: {
    alignSelf: 'flex-start', marginTop: 2,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
  },
  uniformChipText: { fontSize: 11, fontWeight: '700' },

  // Inline RSVP
  nextEventRsvpRow: {
    flexDirection: 'row', gap: 10,
    borderTopWidth: 1, borderTopColor: DUGOUT_COLORS.ui.border,
    paddingTop: 12,
  },
  rsvpBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  rsvpBtnNo: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.2)',
  },
  rsvpBtnText: { fontSize: 13, fontWeight: '700' },
  rsvpConfirmed: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  rsvpConfirmedText: { fontSize: 13, fontWeight: '700' },
  rsvpTapToChange: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontWeight: '500' },

  noEvent: {
    flexDirection: 'column', alignItems: 'center', gap: 10,
    backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, padding: 28, marginBottom: 28,
  },
  noEventIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  noEventText: { color: DUGOUT_COLORS.ui.muted, fontSize: 14, fontWeight: '600' },
  noEventSub: { color: DUGOUT_COLORS.ui.muted, fontSize: 12, fontWeight: '400', opacity: 0.7, textAlign: 'center' },

  // My Player card
  myPlayerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 28,
  },
  playerAvatarRing: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2.5,
    overflow: 'hidden', flexShrink: 0,
  },
  playerAvatarPhoto: { width: '100%', height: '100%' },
  playerAvatarFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  playerAvatarText: { fontSize: 18, fontWeight: '800' },
  myPlayerBody: { flex: 1, gap: 6 },
  myPlayerName: { fontSize: 16, fontWeight: '800', color: DUGOUT_COLORS.ui.text },
  myPlayerBadges: { flexDirection: 'row', gap: 8 },
  jerseyBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  jerseyBadgeText: { fontSize: 11, fontWeight: '800' },
  posBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  posBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // Announcement card
  announcementCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 28,
  },
  announcementIcon: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  announcementBody: { flex: 1, gap: 3 },
  announcementTitle: { fontSize: 14, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  announcementPreview: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, lineHeight: 17 },
  announcementTime: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontWeight: '500', marginTop: 2 },

  // Quick Actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionTile: {
    width: '47.5%', backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 16, padding: 16, gap: 10,
  },
  actionIconWrap: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '700', color: DUGOUT_COLORS.ui.text },

  // Team picker
  teamPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DUGOUT_COLORS.ui.background, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  teamPickerRowActive: { backgroundColor: DUGOUT_COLORS.ui.surfaceAlt },
  teamPickerIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  teamPickerBody: { flex: 1 },
  teamPickerName: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  teamPickerMeta: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 2 },

  // Fee card
  feeCard: {
    flexDirection: 'row',
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 28,
  },
  feeAccent: { width: 4, flexShrink: 0 },
  feeBody: { flex: 1, padding: 16, gap: 10 },
  feeTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  feeIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feeTitle: { fontSize: 14, fontWeight: '700', color: DUGOUT_COLORS.ui.text, marginBottom: 2 },
  feeAmount: { fontSize: 13, fontWeight: '600' },
  feeOverdueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  feeOverdueText: { fontSize: 11, fontWeight: '600', color: DUGOUT_COLORS.status.error },

  // Fee modal rows
  feeModalRow: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: DUGOUT_COLORS.ui.background, borderRadius: 14,
    overflow: 'hidden', marginBottom: 10, padding: 0,
  },
  feeModalAccent: { width: 3, flexShrink: 0 },
  feeModalTitle: { fontSize: 14, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  feeModalAmount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  feeModalDue: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontWeight: '500' },
  feeStatusChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  feeStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Dev switcher / shared sheet styles
  devOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  devSheet: {
    backgroundColor: DUGOUT_COLORS.ui.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48,
  },
  devHandle: { width: 40, height: 4, backgroundColor: DUGOUT_COLORS.ui.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  devTitle: { fontSize: 18, fontWeight: '800', color: DUGOUT_COLORS.ui.text, marginBottom: 4 },
  devSub: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary, marginBottom: 20 },
  devRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DUGOUT_COLORS.ui.background, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  devRowLoading: { opacity: 0.6 },
  devAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  devAvatarText: { fontSize: 16, fontWeight: '800' },
  devRowBody: { flex: 1 },
  devRowLabel: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  devRowEmail: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 2 },
  devSignOut: { marginTop: 8, padding: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border },
  devSignOutText: { fontSize: 14, fontWeight: '600', color: DUGOUT_COLORS.status.error },
});
