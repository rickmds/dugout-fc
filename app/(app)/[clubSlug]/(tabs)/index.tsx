import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { PULSE_COLORS } from '../../../../constants/colors';
import { positionColor } from '../../../../constants/positions';
import ClubBadge from '../../../../components/ui/ClubBadge';
import GameDayWidget from '../../../../components/home/GameDayWidget';
import { fetchEventWeather, isWeatherForecastable, type WeatherData } from '../../../../lib/weather';
import { fetchDriveTime } from '../../../../lib/drivetime';

type NextEvent = {
  id: string;
  title: string;
  type: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  uniform: string | null;
  home_away: 'home' | 'away' | null;
  field_type: string | null;
  rsvp_lock_at: string | null;
};

type Headcount = { going: number; notGoing: number; tbd: number };

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

const DEV_ACCOUNTS = __DEV__ ? [
  { label: 'Coach', email: 'coach@test.com', password: 'test123456' },
  { label: 'Parent', email: 'parent@test.com', password: 'test123456' },
  { label: 'Admin', email: 'admin@test.com', password: 'test123456' },
] : [];

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
  const SKEL = PULSE_COLORS.ui.surface;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: PULSE_COLORS.ui.background }} contentContainerStyle={{ padding: 20, paddingTop: 120, paddingBottom: 48 }} scrollEnabled={false}>
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
  const insets = useSafeAreaInsets();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club, refreshProfile, signOut } = useAuth();
  const { team, allTeams, loading: teamLoading, selectTeam } = useTeam();
  const { primaryColor, rgba, clubName, logoUrl, secondaryColor, secondaryRgba, headerPattern, homeKitColor, awayKitColor, trainingKitColor } = useClub();

  const [playerCount, setPlayerCount]       = useState(0);
  const [upcomingCount, setUpcomingCount]   = useState(0);
  const [nextGame, setNextGame]             = useState<NextEvent | null>(null);
  const [nextTraining, setNextTraining]     = useState<NextEvent | null>(null);
  const [nextGameWeather, setNextGameWeather]           = useState<WeatherData | null>(null);
  const [nextTrainingWeather, setNextTrainingWeather]   = useState<WeatherData | null>(null);
  const [nextGameDriveTime, setNextGameDriveTime]       = useState<string | null>(null);
  const [nextTrainingDriveTime, setNextTrainingDriveTime] = useState<string | null>(null);
  const [myPlayer, setMyPlayer]             = useState<MyPlayer | null>(null);
  const [myGameRsvpStatus, setMyGameRsvpStatus]         = useState<string | null>(null);
  const [myTrainingRsvpStatus, setMyTrainingRsvpStatus] = useState<string | null>(null);
  const [myRsvpCount, setMyRsvpCount]       = useState(0);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [gameRsvpLoading, setGameRsvpLoading]       = useState(false);
  const [trainingRsvpLoading, setTrainingRsvpLoading] = useState(false);
  const [gameHeadcount, setGameHeadcount]             = useState<Headcount | null>(null);
  const [trainingHeadcount, setTrainingHeadcount]     = useState<Headcount | null>(null);
  const [pulseGamePct, setPulseGamePct]               = useState<number | null>(null);
  const [pulseTrainingPct, setPulseTrainingPct]       = useState<number | null>(null);
  const [pulseGameEvents, setPulseGameEvents]         = useState(0);
  const [pulseTrainingEvents, setPulseTrainingEvents] = useState(0);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [outstandingFees, setOutstandingFees] = useState<OutstandingFee[]>([]);
  const [showFeeModal, setShowFeeModal]     = useState(false);
  const [trainingStreak, setTrainingStreak]         = useState(0);
  const [trainingAtRisk, setTrainingAtRisk]         = useState(false);
  const [gameStreak, setGameStreak]                 = useState(0);
  const [gameAtRisk, setGameAtRisk]                 = useState(false);
  const [gamesAttended, setGamesAttended]           = useState(0);
  const [gamesTotal, setGamesTotal]                 = useState(0);
  const [seasonTotalMarked, setSeasonTotalMarked]   = useState(0);
  const [attendanceHistory, setAttendanceHistory]   = useState<{ id: string; type: string; date: string; status: string | null }[]>([]);
  const [showAttendanceSheet, setShowAttendanceSheet] = useState(false);

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
      { data: gameEvents },
      { data: trainingEvents },
      playerRes,
      announcementRes,
      { count: unreadNotifs },
      { data: upcomingEventsData },
    ] = await Promise.all([
      supabase.from('players').select('*', { count: 'exact', head: true }).eq('team_id', team.id),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null),
      supabase.from('events').select('id, title, type, event_date, event_time, location, address, lat, lng, uniform, home_away, field_type, rsvp_lock_at').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null).eq('type', 'game').order('event_date').order('event_time').limit(1),
      supabase.from('events').select('id, title, type, event_date, event_time, location, address, lat, lng, uniform, home_away, field_type, rsvp_lock_at').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null).in('type', ['training', 'other']).order('event_date').order('event_time').limit(1),
      supabase.from('players').select('id, full_name, jersey_number, position, photo_url').eq('team_id', team.id).eq('profile_id', profile.id).maybeSingle(),
      supabase.from('announcements').select('id, title, body, created_at').eq('team_id', team.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('read', false),
      supabase.from('events').select('id').eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null),
    ]);

    const upcomingEventIds = (upcomingEventsData ?? []).map((e: { id: string }) => e.id);

    setPlayerCount(pc ?? 0);
    setUpcomingCount(ec ?? 0);
    setUnreadNotifCount(unreadNotifs ?? 0);

    const nextG = (gameEvents as NextEvent[])?.[0] ?? null;
    const nextT = (trainingEvents as NextEvent[])?.[0] ?? null;
    setNextGame(nextG);
    setNextTraining(nextT);
    setNextGameWeather(null);
    setNextTrainingWeather(null);
    setNextGameDriveTime(null);
    setNextTrainingDriveTime(null);

    function fetchWeatherAndDrive(event: NextEvent | null, setWeather: (w: WeatherData) => void, setDrive: (t: string) => void) {
      if (!event) return;
      const loc = (event.lat != null && event.lng != null)
        ? `${event.lat},${event.lng}`
        : (event.address ?? event.location ?? '');
      if (!loc) return;
      fetchDriveTime(loc).then(t => { if (t) setDrive(t); });
      if (isWeatherForecastable(event.event_date)) {
        fetchEventWeather(loc, event.event_date, event.event_time ?? null).then(w => { if (w) setWeather(w); });
      }
    }
    fetchWeatherAndDrive(nextG, setNextGameWeather, setNextGameDriveTime);
    fetchWeatherAndDrive(nextT, setNextTrainingWeather, setNextTrainingDriveTime);

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

    if (player) {
      const rsvpFetches: PromiseLike<void>[] = [];
      if (nextG) {
        rsvpFetches.push(
          supabase.from('event_rsvps').select('status').eq('event_id', nextG.id).eq('player_id', player.id).maybeSingle()
            .then(({ data }) => { setMyGameRsvpStatus((data as any)?.status ?? null); })
        );
      } else {
        setMyGameRsvpStatus(null);
      }
      if (nextT) {
        rsvpFetches.push(
          supabase.from('event_rsvps').select('status').eq('event_id', nextT.id).eq('player_id', player.id).maybeSingle()
            .then(({ data }) => { setMyTrainingRsvpStatus((data as any)?.status ?? null); })
        );
      } else {
        setMyTrainingRsvpStatus(null);
      }
      if (upcomingEventIds.length > 0) {
        rsvpFetches.push(
          supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('player_id', player.id).eq('status', 'attending').in('event_id', upcomingEventIds)
            .then(({ count: rc }) => { setMyRsvpCount(rc ?? 0); })
        );
      } else {
        setMyRsvpCount(0);
      }
      await Promise.all(rsvpFetches);

      // Attendance streak + season stats — players only
      if (!isCoach) {
        const { data: pastEvtsData } = await supabase
          .from('events')
          .select('id, type, event_date')
          .eq('team_id', team.id)
          .lt('event_date', today)
          .is('cancelled_at', null)
          .order('event_date', { ascending: false })
          .limit(40);
        const pastEvts = (pastEvtsData ?? []) as { id: string; type: string; event_date: string }[];
        const pastIds = pastEvts.map((e) => e.id);
        if (pastIds.length > 0) {
          const { data: attRows } = await supabase
            .from('event_attendance')
            .select('event_id, status')
            .eq('player_id', player.id)
            .in('event_id', pastIds);
          const attMap = new Map((attRows ?? []).map((r: any) => [r.event_id as string, r.status as string]));
          // Only coach-marked sessions, most-recent-first
          const history = pastEvts
            .filter((e) => attMap.has(e.id))
            .map((e) => ({ id: e.id, type: e.type, date: e.event_date, status: attMap.get(e.id) ?? null }));
          setAttendanceHistory(history);
          setSeasonTotalMarked(history.length);
          // WHOOP-style streak: one missed session is a grace period, two in a row breaks it
          function whoopStreak(evts: typeof history) {
            let streak = 0; let atRisk = false;
            for (const ev of evts) {
              if (ev.status === 'present') { streak++; atRisk = false; }
              else if (!atRisk) { atRisk = true; }
              else break;
            }
            return { streak, atRisk };
          }
          const trainingHistory = history.filter((e) => e.type !== 'game');
          const gameHistory     = history.filter((e) => e.type === 'game');
          const tResult = whoopStreak(trainingHistory);
          const gResult = whoopStreak(gameHistory);
          setTrainingStreak(tResult.streak);
          setTrainingAtRisk(tResult.atRisk);
          setGameStreak(gResult.streak);
          setGameAtRisk(gResult.atRisk);
          setGamesTotal(gameHistory.length);
          setGamesAttended(gameHistory.filter((e) => e.status === 'present').length);
        }
      }
    } else {
      setMyGameRsvpStatus(null);
      setMyTrainingRsvpStatus(null);
      setMyRsvpCount(0);
    }

    if (isCoach) {
      const [gameRsvps, trainingRsvps] = await Promise.all([
        nextG ? supabase.from('event_rsvps').select('status').eq('event_id', nextG.id) : Promise.resolve({ data: null as null }),
        nextT ? supabase.from('event_rsvps').select('status').eq('event_id', nextT.id) : Promise.resolve({ data: null as null }),
      ]);
      if (nextG && gameRsvps.data) {
        const going = gameRsvps.data.filter((r: any) => r.status === 'attending').length;
        const notGoing = gameRsvps.data.filter((r: any) => r.status === 'not_attending').length;
        setGameHeadcount({ going, notGoing, tbd: Math.max(0, (pc ?? 0) - going - notGoing) });
      } else {
        setGameHeadcount(null);
      }
      if (nextT && trainingRsvps.data) {
        const going = trainingRsvps.data.filter((r: any) => r.status === 'attending').length;
        const notGoing = trainingRsvps.data.filter((r: any) => r.status === 'not_attending').length;
        setTrainingHeadcount({ going, notGoing, tbd: Math.max(0, (pc ?? 0) - going - notGoing) });
      } else {
        setTrainingHeadcount(null);
      }
    } else {
      setGameHeadcount(null);
      setTrainingHeadcount(null);
    }

    // Team Pulse — game vs training attendance this month (coaches only)
    if (isCoach && (pc ?? 0) > 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startStr = startOfMonth.toISOString().split('T')[0];
      const [{ data: gameEvts }, { data: trainingEvts }] = await Promise.all([
        supabase.from('events').select('id').eq('team_id', team.id)
          .eq('type', 'game').gte('event_date', startStr).lte('event_date', today).is('cancelled_at', null),
        supabase.from('events').select('id').eq('team_id', team.id)
          .in('type', ['training', 'other']).gte('event_date', startStr).lte('event_date', today).is('cancelled_at', null),
      ]);
      const gameIds = (gameEvts ?? []).map((e: { id: string }) => e.id);
      const trainingIds = (trainingEvts ?? []).map((e: { id: string }) => e.id);
      const [gameAtt, trainingAtt] = await Promise.all([
        gameIds.length > 0
          ? supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).in('event_id', gameIds).eq('status', 'attending')
          : Promise.resolve({ count: null }),
        trainingIds.length > 0
          ? supabase.from('event_rsvps').select('*', { count: 'exact', head: true }).in('event_id', trainingIds).eq('status', 'attending')
          : Promise.resolve({ count: null }),
      ]);
      const playerN = pc ?? 0;
      setPulseGameEvents(gameIds.length);
      setPulseGamePct(gameIds.length > 0 && playerN > 0 ? Math.round(((gameAtt.count ?? 0) / (gameIds.length * playerN)) * 100) : null);
      setPulseTrainingEvents(trainingIds.length);
      setPulseTrainingPct(trainingIds.length > 0 && playerN > 0 ? Math.round(((trainingAtt.count ?? 0) / (trainingIds.length * playerN)) * 100) : null);
    }

    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  async function handleRsvp(
    event: NextEvent,
    status: 'attending' | 'not_attending',
    currentStatus: string | null,
    setStatus: (s: string | null) => void,
    setLoading: (b: boolean) => void,
  ) {
    if (!myPlayer) return;
    if (event.rsvp_lock_at && new Date(event.rsvp_lock_at) <= new Date()) {
      Alert.alert('RSVP closed', 'The RSVP window for this event has closed. Contact your coach if you need to make a change.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    if (currentStatus === status) {
      await supabase.from('event_rsvps').delete().eq('event_id', event.id).eq('player_id', myPlayer.id);
      setStatus(null);
      if (status === 'attending') setMyRsvpCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from('event_rsvps').upsert(
        { event_id: event.id, player_id: myPlayer.id, responded_by: profile?.id, status },
        { onConflict: 'event_id,player_id' }
      );
      if (status === 'attending') setMyRsvpCount((c) => c + 1);
      else if (currentStatus === 'attending') setMyRsvpCount((c) => Math.max(0, c - 1));
      setStatus(status);
    }
    setLoading(false);
  }

  if (teamLoading || loading) {
    return <HomeSkeleton />;
  }

  const teamName = team?.name ?? club?.name ?? 'Your Team';
  const playerColor = positionColor(myPlayer?.position ?? null);
  const playerInitials = myPlayer?.full_name
    ? myPlayer.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  const playerAvatarUrl = myPlayer?.photo_url ?? null;

  function renderNextCard(
    label: string,
    event: NextEvent | null,
    weather: WeatherData | null,
    driveTime: string | null,
    headcount: Headcount | null,
    rsvpStatus: string | null,
    rsvpLoading: boolean,
    onRsvp: (s: 'attending' | 'not_attending') => void,
    topMargin = 0,
  ) {
    const cfg = event ? (TYPE_CONFIG[event.type] ?? TYPE_CONFIG.other) : null;
    const accentColor = cfg?.color ?? primaryColor;
    const kitColor = event?.uniform === 'home' ? homeKitColor
      : event?.uniform === 'away' ? awayKitColor
      : event?.uniform === 'training' ? trainingKitColor
      : null;
    const uniformLabel = event?.type === 'game'
      ? (event?.home_away === 'away' ? 'AWAY' : 'HOME')
      : null;

    return (
      <View key={label}>
        <View style={[styles.sectionTitleRow, { marginTop: topMargin }]}>
          <View style={[styles.sectionTitleDot, { backgroundColor: accentColor }]} />
          <Text style={styles.sectionTitle}>{label}</Text>
        </View>
        {event && cfg ? (
          <TouchableOpacity
            style={[styles.nextEventCard, { marginBottom: 28, borderLeftWidth: 3, borderLeftColor: accentColor }]}
            onPress={() => router.push(`/(app)/${slug}/event/${event.id}` as never)}
            activeOpacity={0.85}
          >
            {/* Title block left · solid badge + drive time right */}
            <View style={styles.nextCardHeader}>
              <View style={styles.nextCardTitleBlock}>
                {uniformLabel ? (
                  <View style={[styles.nextCardUniformBadge,
                    event.home_away === 'home'
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }
                      : { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.3)' },
                  ]}>
                    <Text style={[styles.nextCardUniformBadgeText,
                      { color: event.home_away === 'home' ? '#22C55E' : '#60A5FA' },
                    ]}>{uniformLabel}</Text>
                  </View>
                ) : null}
                <Text style={styles.nextCardTitle} numberOfLines={1}>{event.title}</Text>
              </View>
              <View style={styles.nextCardTopRight}>
                <View style={[styles.nextCardBadge, { backgroundColor: accentColor }]}>
                  <Text style={styles.nextCardBadgeText}>
                    {formatDate(event.event_date).toUpperCase()}
                  </Text>
                </View>
                {driveTime ? (
                  <View style={styles.nextCardDrivePill}>
                    <Ionicons name="car-outline" size={11} color={PULSE_COLORS.ui.muted} />
                    <Text style={styles.nextCardDrivePillText}>{driveTime}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Date/time + location */}
            <View style={styles.nextCardMeta}>
              <View style={styles.nextCardMetaRow}>
                <Ionicons name="time-outline" size={12} color={PULSE_COLORS.ui.muted} />
                <Text style={styles.nextCardMetaText}>
                  {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {event.event_time ? `  ·  ${formatTime(event.event_time)}` : ''}
                </Text>
              </View>
              {event.location ? (
                <View style={styles.nextCardMetaRow}>
                  <Ionicons name="location-outline" size={12} color={PULSE_COLORS.ui.muted} />
                  <Text style={styles.nextCardMetaText} numberOfLines={1}>{event.location}</Text>
                </View>
              ) : null}
            </View>

            {/* Context chips: weather + surface + kit — unified row */}
            {(weather || event.field_type || kitColor) ? (
              <View style={styles.nextCardChipRow}>
                {weather ? (
                  <View style={[styles.nextCardChip, styles.nextCardChipWeather]}>
                    <Text style={styles.nextCardChipEmoji}>{weather.icon}</Text>
                    <Text style={[styles.nextCardChipText, { color: PULSE_COLORS.ui.textSecondary }]}>
                      {weather.temp_f}°F{weather.precip_chance >= 20 ? `  💧${weather.precip_chance}%` : ''}
                    </Text>
                  </View>
                ) : null}
                {event.field_type === 'grass' ? (
                  <View style={[styles.nextCardChip, { borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.08)' }]}>
                    <Text style={[styles.nextCardChipText, { color: '#22C55E' }]}>Grass</Text>
                  </View>
                ) : event.field_type === 'turf' ? (
                  <View style={[styles.nextCardChip, { borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.08)' }]}>
                    <Text style={[styles.nextCardChipText, { color: '#3B82F6' }]}>Turf</Text>
                  </View>
                ) : event.field_type === 'indoor' ? (
                  <View style={[styles.nextCardChip, { borderColor: 'rgba(156,163,175,0.25)', backgroundColor: 'rgba(156,163,175,0.08)' }]}>
                    <Ionicons name="business-outline" size={11} color="#9CA3AF" />
                    <Text style={[styles.nextCardChipText, { color: '#9CA3AF' }]}>Indoor</Text>
                  </View>
                ) : null}
                {kitColor ? (
                  <View style={[styles.nextCardChip, { borderColor: `${kitColor}35`, backgroundColor: `${kitColor}12` }]}>
                    <Ionicons name="shirt" size={11} color={kitColor} />
                    <Text style={[styles.nextCardChipText, { color: kitColor, fontWeight: '700' }]}>
                      {event.uniform === 'home' ? 'Home' : event.uniform === 'away' ? 'Away' : 'Training'} Kit
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Headcount — coaches only, taps through to attendance tab */}
            {isCoach && headcount ? (
              <TouchableOpacity
                style={styles.headcountRow}
                onPress={() => router.push({ pathname: `/(app)/${slug}/event/${event.id}`, params: { section: 'attendance' } } as never)}
                activeOpacity={0.7}
              >
                {[
                  { count: headcount.going,    color: '#22C55E', label: 'Going' },
                  { count: headcount.tbd,      color: '#F59E0B', label: 'TBD'   },
                  { count: headcount.notGoing, color: '#EF4444', label: 'Out'   },
                ].map(({ count, color, label: lbl }) => (
                  <View key={lbl} style={styles.headcountItem}>
                    <View style={[styles.headcountCircle, { backgroundColor: color }]}>
                      <Text style={styles.headcountCircleNum}>{count}</Text>
                    </View>
                    <Text style={styles.headcountLabel}>{lbl}</Text>
                  </View>
                ))}
                <View style={styles.headcountChevron}>
                  <Text style={styles.headcountChevronText}>View breakdown</Text>
                  <Ionicons name="chevron-forward" size={12} color={PULSE_COLORS.ui.muted} />
                </View>
              </TouchableOpacity>
            ) : null}

            {/* RSVP — parents with a linked player */}
            {!isCoach && myPlayer ? (
              <View style={styles.nextEventRsvpRow}>
                <TouchableOpacity
                  style={[styles.rsvpBtn,
                    rsvpStatus === 'attending'
                      ? { backgroundColor: rgba(0.14), borderColor: rgba(0.35) }
                      : { backgroundColor: 'transparent', borderColor: PULSE_COLORS.ui.border },
                  ]}
                  onPress={() => onRsvp('attending')}
                  disabled={rsvpLoading}
                  activeOpacity={rsvpStatus === 'attending' ? 1 : 0.75}
                >
                  <Ionicons
                    name={rsvpStatus === 'attending' ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={15}
                    color={rsvpStatus === 'attending' ? primaryColor : PULSE_COLORS.ui.muted}
                  />
                  <Text style={[styles.rsvpBtnText,
                    { color: rsvpStatus === 'attending' ? primaryColor : PULSE_COLORS.ui.muted },
                  ]}>Going</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rsvpBtn,
                    rsvpStatus === 'not_attending'
                      ? { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }
                      : { backgroundColor: 'transparent', borderColor: PULSE_COLORS.ui.border },
                  ]}
                  onPress={() => onRsvp('not_attending')}
                  disabled={rsvpLoading}
                  activeOpacity={rsvpStatus === 'not_attending' ? 1 : 0.75}
                >
                  <Ionicons
                    name={rsvpStatus === 'not_attending' ? 'close-circle' : 'close-circle-outline'}
                    size={15}
                    color={rsvpStatus === 'not_attending' ? PULSE_COLORS.rsvp.not_attending : PULSE_COLORS.ui.muted}
                  />
                  <Text style={[styles.rsvpBtnText,
                    { color: rsvpStatus === 'not_attending' ? PULSE_COLORS.rsvp.not_attending : PULSE_COLORS.ui.muted },
                  ]}>Can't go</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.noEvent, { marginBottom: 28 }]}
            onPress={isCoach ? () => router.push(`/(app)/${slug}/create-event` as never) : undefined}
            activeOpacity={isCoach ? 0.75 : 1}
          >
            <Text style={styles.noEventText}>
              {label === 'NEXT GAME' ? 'No upcoming games' : 'No upcoming training'}
            </Text>
            {isCoach ? (
              <Text style={[styles.noEventText, { color: primaryColor, fontSize: 12, marginTop: 4 }]}>
                Tap to create one →
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: 0 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
      >

        {/* ── Club Hero Banner ── */}
        <View style={[styles.heroBanner, { paddingTop: insets.top + 12, backgroundColor: primaryColor }]}>
          <HeroBannerOverlay pattern={headerPattern} patternColor={secondaryRgba} />
          {/* Dark tint so white text is always readable over any pattern */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} pointerEvents="none" />
          {/* Icon buttons top-right */}
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push(`/(app)/${slug}/notifications` as never)}>
              <View>
                <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.9)" />
                {unreadNotifCount > 0 && <View style={styles.notifBadge} />}
              </View>
            </TouchableOpacity>
            {isCoach && (
              <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push(`/(app)/${slug}/admin` as never)}>
                <Ionicons name="grid-outline" size={20} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.heroIconBtn} onPress={() => router.push(`/(app)/${slug}/settings` as never)}>
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>

          {/* Logo + club name centred */}
          <TouchableOpacity
            style={styles.heroBrand}
            onPress={() => hasMultipleTeams && setTeamPickerOpen(true)}
            activeOpacity={hasMultipleTeams ? 0.75 : 1}
            onLongPress={handleGreetingTap}
          >
            {/* Badge */}
            <View style={styles.heroBadgeGlow}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={{ width: 88, height: 88 }} resizeMode="contain" />
              ) : (
                <View style={[styles.heroBadgeRing, { borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Text style={[styles.heroBadgeLetters, { color: secondaryColor || '#fff' }]}>
                    {clubName.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || 'FC'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.heroClubName}>{clubName}</Text>
            <View style={styles.heroTeamRow}>
              <Text style={styles.heroTeamName}>{teamName}</Text>
              {hasMultipleTeams && (
                <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.6)" style={{ marginTop: 1 }} />
              )}
            </View>
          </TouchableOpacity>

          {/* Greeting */}
          <Text style={styles.heroGreeting}>{greeting(profile?.full_name)}</Text>
        </View>


        {/* Game Day Outlook — coaches only */}
        {isCoach && (
          <GameDayWidget onPress={() => router.push(`/(app)/${slug}/game-day` as any)} />
        )}

        {/* Team Pulse — coaches only */}
        {isCoach && (
          <>
            <View style={[styles.sectionTitleRow, { marginTop: 20 }]}>
              <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.sectionTitle}>TEAM PULSE</Text>
            </View>
            <View style={[styles.pulseCard, { borderLeftWidth: 3, borderLeftColor: primaryColor }]}>
              <Text style={styles.pulseCardHeader}>RSVP ATTENDANCE · THIS MONTH</Text>
              <View style={styles.pulseMetricRow}>
                {/* Game attendance % this month */}
                {(() => {
                  const pct = pulseGamePct;
                  const color = pct == null ? PULSE_COLORS.ui.muted
                    : pct >= 75 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
                  return (
                    <View style={styles.pulseMetric}>
                      <Text style={[styles.pulseMetricNum, { color }]}>
                        {pct != null ? `${pct}%` : '—'}
                      </Text>
                      <Text style={styles.pulseMetricLabel}>
                        {`Games\n${pulseGameEvents > 0 ? `${pulseGameEvents} played` : 'none yet'}`}
                      </Text>
                      {pct != null && (
                        <View style={styles.pulseBar}>
                          <View style={[styles.pulseBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                      )}
                    </View>
                  );
                })()}

                <View style={styles.pulseDivider} />

                {/* Training attendance % this month */}
                {(() => {
                  const pct = pulseTrainingPct;
                  const color = pct == null ? PULSE_COLORS.ui.muted
                    : pct >= 75 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
                  return (
                    <View style={styles.pulseMetric}>
                      <Text style={[styles.pulseMetricNum, { color }]}>
                        {pct != null ? `${pct}%` : '—'}
                      </Text>
                      <Text style={styles.pulseMetricLabel}>
                        {`Training\n${pulseTrainingEvents > 0 ? `${pulseTrainingEvents} session${pulseTrainingEvents !== 1 ? 's' : ''} held` : 'none yet'}`}
                      </Text>
                      {pct != null && (
                        <View style={styles.pulseBar}>
                          <View style={[styles.pulseBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            </View>
          </>
        )}

        {/* MY SEASON — players with coach-marked attendance */}
        {!isCoach && myPlayer && seasonTotalMarked > 0 && (() => {
          const superStreak = trainingStreak >= 5 && (gamesTotal === 0 || gamesAttended === gamesTotal);
          const tColor = trainingAtRisk ? '#60A5FA' : trainingStreak >= 3 ? '#F59E0B' : primaryColor;
          const gPerfect = gamesTotal > 0 && gamesAttended === gamesTotal;
          const gColor = gPerfect ? '#22C55E' : gameAtRisk ? '#F59E0B' : PULSE_COLORS.ui.muted;
          return (
            <>
              <View style={[styles.sectionTitleRow, { marginTop: 24 }]}>
                <View style={[styles.sectionTitleDot, { backgroundColor: superStreak ? '#F59E0B' : primaryColor }]} />
                <Text style={styles.sectionTitle}>MY SEASON</Text>
                {superStreak && <Text style={styles.superStreakChip}>⭐ SUPER STREAK</Text>}
              </View>
              <TouchableOpacity
                style={[styles.seasonCard, { borderLeftWidth: 3, borderLeftColor: superStreak ? '#F59E0B' : primaryColor }]}
                onPress={() => setShowAttendanceSheet(true)}
                activeOpacity={0.85}
              >
                {/* Training streak — centered, WHOOP-style */}
                <View style={styles.seasonStat}>
                  <View style={[
                    styles.seasonFlameWrap,
                    trainingAtRisk
                      ? { backgroundColor: 'rgba(96,165,250,0.15)', shadowColor: '#60A5FA', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 12 }
                      : trainingStreak >= 3
                        ? { backgroundColor: 'rgba(245,158,11,0.15)', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10 }
                        : { backgroundColor: rgba(0.08) },
                  ]}>
                    <Text style={styles.seasonFlameEmoji}>🔥</Text>
                    {/* Blue tint overlay when at risk */}
                    {trainingAtRisk && (
                      <View style={[StyleSheet.absoluteFill, { borderRadius: 18, backgroundColor: 'rgba(96,165,250,0.35)' }]} pointerEvents="none" />
                    )}
                  </View>
                  <Text style={[styles.seasonStatNum, { color: tColor }]}>{trainingStreak}</Text>
                  <Text style={styles.seasonStatLabel}>
                    {trainingAtRisk ? 'At risk' : trainingStreak >= 5 ? 'On fire!' : 'Training'}
                  </Text>
                </View>

                <View style={styles.seasonDivider} />

                {/* Game attendance */}
                <View style={styles.seasonStat}>
                  <View style={[
                    styles.seasonFlameWrap,
                    gPerfect
                      ? { backgroundColor: 'rgba(34,197,94,0.15)', shadowColor: '#22C55E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10 }
                      : { backgroundColor: rgba(0.08) },
                  ]}>
                    <Text style={styles.seasonFlameEmoji}>
                      {gamesTotal === 0 ? '⚽' : gPerfect ? '🥇' : gameAtRisk ? '⚡' : '⚽'}
                    </Text>
                  </View>
                  <Text style={[styles.seasonStatNum, { color: gColor }]}>
                    {gamesTotal > 0 ? `${gamesAttended}/${gamesTotal}` : '—'}
                  </Text>
                  <Text style={styles.seasonStatLabel}>
                    {gPerfect ? '✅ Perfect!' : gameAtRisk ? '⚡ At risk' : 'Games'}
                  </Text>
                </View>

                {/* Chevron tap hint */}
                <View style={styles.seasonTapHint}>
                  <Ionicons name="chevron-forward" size={13} color={PULSE_COLORS.ui.muted} />
                </View>
              </TouchableOpacity>
            </>
          );
        })()}

        {/* Next Game + Next Training */}
        {renderNextCard(
          'NEXT GAME',
          nextGame,
          nextGameWeather,
          nextGameDriveTime,
          gameHeadcount,
          myGameRsvpStatus,
          gameRsvpLoading,
          (s) => nextGame && handleRsvp(nextGame, s, myGameRsvpStatus, setMyGameRsvpStatus, setGameRsvpLoading),
          isCoach ? 20 : (myPlayer && seasonTotalMarked > 0 ? 20 : 28),
        )}
        {renderNextCard(
          'NEXT TRAINING',
          nextTraining,
          nextTrainingWeather,
          nextTrainingDriveTime,
          trainingHeadcount,
          myTrainingRsvpStatus,
          trainingRsvpLoading,
          (s) => nextTraining && handleRsvp(nextTraining, s, myTrainingRsvpStatus, setMyTrainingRsvpStatus, setTrainingRsvpLoading),
        )}

        {/* Outstanding fees — parents only */}
        {!isCoach && outstandingFees.length > 0 && (() => {
          const hasOverdue = outstandingFees.some(f => f.status === 'overdue' || (f.due_date && new Date(f.due_date) < new Date()));
          const accentColor = hasOverdue ? PULSE_COLORS.status.error : PULSE_COLORS.status.warning;
          const totalOwed = outstandingFees.reduce((s, f) => s + Math.max(0, f.amount_due - (f.discount ?? 0)), 0);
          const single = outstandingFees.length === 1 ? outstandingFees[0] : null;
          const fmtDue = (due: string | null) => {
            if (!due) return null;
            const d = new Date(due + 'T00:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          };
          return (
            <>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
                <Text style={styles.sectionTitle}>OUTSTANDING FEES</Text>
              </View>
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
                    <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
                  </View>
                  {hasOverdue && (
                    <View style={styles.feeOverdueBadge}>
                      <Ionicons name="alert-circle-outline" size={12} color={PULSE_COLORS.status.error} />
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
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.sectionTitle}>MY PLAYER</Text>
            </View>
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

              <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Latest announcement */}
        {latestAnnouncement && (
          <>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.sectionTitle}>FROM THE COACH</Text>
            </View>
            <TouchableOpacity
              style={[styles.announcementCard, { borderLeftWidth: 3, borderLeftColor: rgba(0.4) }]}
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
              <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Weekend Outlook entry — coaches only */}
        {isCoach && (
          <TouchableOpacity
            style={[styles.weekendOutlookBtn, { borderColor: rgba(0.3), backgroundColor: rgba(0.06) }]}
            onPress={() => router.push(`/(app)/${slug}/weekend-outlook` as never)}
            activeOpacity={0.8}
          >
            <View style={[styles.weekendOutlookIcon, { backgroundColor: rgba(0.15) }]}>
              <Ionicons name="calendar-outline" size={20} color={primaryColor} />
            </View>
            <View style={styles.weekendOutlookText}>
              <Text style={[styles.weekendOutlookTitle, { color: primaryColor }]}>Weekend Outlook</Text>
              <Text style={styles.weekendOutlookSub}>All your weekend games, travel times & lineup status</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={rgba(0.6)} />
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />

      </ScrollView>

      {/* Team picker */}
      <Modal visible={teamPickerOpen} transparent animationType="slide" onRequestClose={() => setTeamPickerOpen(false)}>
        <TouchableOpacity style={styles.devOverlay} activeOpacity={1} onPress={() => setTeamPickerOpen(false)} />
        <View style={styles.devSheet}>
          <View style={styles.devHandle} />
          <Text style={styles.devTitle}>Switch Team</Text>
          <Text style={styles.devSub}>Select which team to view</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} bounces={false}>
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
          </ScrollView>
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
            const statusColor = isOverdue ? PULSE_COLORS.status.error : fee.status === 'partial' ? PULSE_COLORS.status.info : PULSE_COLORS.status.warning;
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
                : <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
              }
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.devSignOut} onPress={async () => { setDevOpen(false); await signOut(); router.replace('/(auth)/login'); }}>
            <Text style={styles.devSignOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Attendance detail sheet */}
      <Modal visible={showAttendanceSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAttendanceSheet(false)}>
        <View style={styles.attSheet}>
          {/* Header */}
          <View style={styles.attSheetHeader}>
            <Text style={styles.attSheetTitle}>My Attendance</Text>
            <TouchableOpacity onPress={() => setShowAttendanceSheet(false)} style={styles.attSheetClose}>
              <Ionicons name="close" size={20} color={PULSE_COLORS.ui.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Streak summary cards */}
            {(() => {
              const superStreak = trainingStreak >= 5 && (gamesTotal === 0 || gamesAttended === gamesTotal);
              return (
                <>
                  <View style={styles.attSheetStatRow}>
                    {/* Training streak */}
                    <View style={[styles.attSheetStat, { borderLeftColor: trainingAtRisk ? '#F59E0B' : primaryColor }]}>
                      <Text style={styles.attSheetStatEmoji}>
                        {trainingAtRisk ? '⚡' : trainingStreak >= 5 ? '🔥' : trainingStreak >= 3 ? '⚡' : '📅'}
                      </Text>
                      <Text style={[styles.attSheetStatNum, { color: trainingAtRisk ? '#F59E0B' : trainingStreak >= 3 ? '#F59E0B' : primaryColor }]}>
                        {trainingStreak}
                      </Text>
                      <Text style={styles.attSheetStatLabel}>Training streak</Text>
                      {trainingAtRisk && (
                        <Text style={styles.attSheetAtRisk}>⚠️ At risk — attend next session to save it</Text>
                      )}
                    </View>
                    {/* Game attendance */}
                    <View style={[styles.attSheetStat, { borderLeftColor: gamesTotal > 0 && gamesAttended === gamesTotal ? '#22C55E' : gameAtRisk ? '#F59E0B' : PULSE_COLORS.ui.border }]}>
                      <Text style={styles.attSheetStatEmoji}>
                        {gamesTotal === 0 ? '⚽' : gamesAttended === gamesTotal ? '🥇' : gameAtRisk ? '⚡' : '⚽'}
                      </Text>
                      <Text style={[styles.attSheetStatNum, {
                        color: gamesTotal > 0 && gamesAttended === gamesTotal ? '#22C55E'
                          : gameAtRisk ? '#F59E0B' : PULSE_COLORS.ui.muted,
                      }]}>
                        {gamesTotal > 0 ? `${gamesAttended}/${gamesTotal}` : '—'}
                      </Text>
                      <Text style={styles.attSheetStatLabel}>Games this season</Text>
                      {gameAtRisk && (
                        <Text style={styles.attSheetAtRisk}>⚠️ At risk — don't miss the next one</Text>
                      )}
                    </View>
                  </View>

                  {/* Super streak banner */}
                  {superStreak && (
                    <View style={styles.attSheetSuperBanner}>
                      <Text style={{ fontSize: 24 }}>⭐</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attSheetSuperLabel}>SUPER STREAK ACTIVE</Text>
                        <Text style={styles.attSheetSuperSub}>Training on fire · perfect game attendance</Text>
                      </View>
                    </View>
                  )}

                  {/* WHOOP mechanic explainer */}
                  <View style={styles.attSheetInfoRow}>
                    <Ionicons name="information-circle-outline" size={14} color={PULSE_COLORS.ui.muted} />
                    <Text style={styles.attSheetInfoText}>
                      Miss one session and your streak goes at risk. Attend the next and you save it. Miss two in a row and it resets.
                    </Text>
                  </View>
                </>
              );
            })()}

            {/* Session history */}
            {attendanceHistory.length > 0 && (
              <>
                <View style={[styles.sectionTitleRow, { marginTop: 24, marginHorizontal: 20 }]}>
                  <View style={[styles.sectionTitleDot, { backgroundColor: primaryColor }]} />
                  <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
                </View>
                <View style={styles.attSheetList}>
                  {attendanceHistory.map((entry) => {
                    const isGame = entry.type === 'game';
                    const present = entry.status === 'present';
                    const d = new Date(entry.date + 'T00:00:00');
                    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <View key={entry.id} style={styles.attSheetRow}>
                        <View style={[styles.attSheetTypeBadge,
                          isGame
                            ? { backgroundColor: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.25)' }
                            : { backgroundColor: rgba(0.08), borderColor: rgba(0.2) },
                        ]}>
                          <Text style={[styles.attSheetTypeBadgeText,
                            { color: isGame ? '#F97316' : primaryColor },
                          ]}>{isGame ? 'GAME' : 'TRAINING'}</Text>
                        </View>
                        <Text style={styles.attSheetRowDate}>{dateStr}</Text>
                        <View style={[styles.attSheetStatusDot, {
                          backgroundColor: present ? '#22C55E' : '#EF4444',
                        }]}>
                          <Ionicons name={present ? 'checkmark' : 'close'} size={11} color="#fff" />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function HeroBannerOverlay({ pattern, patternColor }: { pattern: string; patternColor: (a: number) => string }) {
  if (pattern === 'solid') return null;

  // Diagonal stripes — classic jersey
  if (pattern === 'stripes') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 20 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute',
          top: -60 + i * 26, left: -100, right: -100, height: 13,
          transform: [{ rotate: '-20deg' }],
          backgroundColor: patternColor(0.6),
        }} />
      ))}
    </View>
  );

  // Pinstripes
  if (pattern === 'pinstripes') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 40 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute',
          top: -30 + i * 11, left: -100, right: -100, height: 5,
          transform: [{ rotate: '-20deg' }],
          backgroundColor: patternColor(0.55),
        }} />
      ))}
    </View>
  );

  // Dots — retro print
  if (pattern === 'dots') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 18 }).flatMap((_, row) =>
        Array.from({ length: 22 }).map((_, col) => (
          <View key={`${row}-${col}`} style={{
            position: 'absolute',
            width: 5, height: 5, borderRadius: 2.5,
            backgroundColor: patternColor(0.55),
            left: col * 22 - 4,
            top: row * 22 - 4 + (col % 2 === 0 ? 0 : 11),
          }} />
        ))
      )}
    </View>
  );

  // Grid — carbon feel
  if (pattern === 'grid') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 18 }).map((_, i) => (
        <View key={`h${i}`} style={{
          position: 'absolute', left: 0, right: 0,
          top: i * 22, height: 1,
          backgroundColor: patternColor(0.55),
        }} />
      ))}
      {Array.from({ length: 24 }).map((_, i) => (
        <View key={`v${i}`} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: i * 20, width: 1,
          backgroundColor: patternColor(0.55),
        }} />
      ))}
    </View>
  );

  // Hoops — Celtic · QPR · Stoke
  if (pattern === 'hoops') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', left: 0, right: 0,
          top: i * 28, height: 12,
          backgroundColor: patternColor(0.6),
        }} />
      ))}
    </View>
  );

  // Vertical stripes — Inter Milan · Newcastle · West Brom
  if (pattern === 'vstripes') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 16 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: -17 + i * 34, width: 16,
          backgroundColor: patternColor(0.6),
        }} />
      ))}
    </View>
  );

  // Sash — River Plate · Paraguay
  if (pattern === 'sash') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{
        position: 'absolute',
        top: '20%', left: -80, right: -80, height: 60,
        transform: [{ rotate: '-22deg' }],
        backgroundColor: patternColor(0.65),
      }} />
    </View>
  );

  // Halves — Juventus
  if (pattern === 'halves') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%',
        backgroundColor: patternColor(0.55),
      }} />
      <View style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2,
        backgroundColor: patternColor(0.9),
      }} />
    </View>
  );

  // Diamond lattice — Argyle · retro Adidas
  if (pattern === 'diamond') return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 26 }).map((_, i) => (
        <View key={`a${i}`} style={{
          position: 'absolute',
          top: -200, left: i * 26 - 13,
          width: 1, height: 700,
          transform: [{ rotate: '45deg' }],
          backgroundColor: patternColor(0.55),
        }} />
      ))}
      {Array.from({ length: 26 }).map((_, i) => (
        <View key={`b${i}`} style={{
          position: 'absolute',
          top: -200, left: i * 26 - 13,
          width: 1, height: 700,
          transform: [{ rotate: '-45deg' }],
          backgroundColor: patternColor(0.55),
        }} />
      ))}
    </View>
  );

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  content: { padding: 20, paddingTop: 0, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },

  // Hero banner
  heroBanner: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingBottom: 44,
    marginBottom: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 16,
  },
  heroIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBrand: { alignItems: 'center', gap: 8, paddingBottom: 4 },
  heroBadgeGlow: {
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 12,
    borderRadius: 20,
  },
  heroBadgeRing: {
    width: 80, height: 80, borderRadius: 20, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  heroBadgeLetters: { fontSize: 28, fontWeight: '900' },
  heroClubName: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  heroTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroTeamName: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  heroGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textAlign: 'center', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  notifBadge: {
    position: 'absolute', top: -1, right: -1,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.background,
  },

  // Section title with dot accent
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitleDot: { width: 6, height: 6, borderRadius: 3 },

  // Stats (parents only)
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 4,
  },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statNumber: { fontSize: 36, fontWeight: '900', lineHeight: 40, letterSpacing: -1 },
  statLabel: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', letterSpacing: 0.3 },

  // Weekend Outlook button
  weekendOutlookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 8, marginTop: 8,
  },
  weekendOutlookIcon: {
    width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  weekendOutlookText: { flex: 1, gap: 2 },
  weekendOutlookTitle: { fontSize: 15, fontWeight: '700' },
  weekendOutlookSub: { fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 16 },

  // Team Pulse
  pulseCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 20, marginBottom: 28,
  },
  pulseCardHeader: {
    fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14,
  },
  pulseMetricRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pulseMetric: { flex: 1, alignItems: 'center', gap: 4 },
  pulseMetricNum: { fontSize: 32, fontWeight: '900', lineHeight: 36, letterSpacing: -1 },
  pulseMetricLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  pulseBar: {
    height: 4, width: '80%', borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.border, marginTop: 6, overflow: 'hidden',
  },
  pulseBarFill: { height: '100%', borderRadius: 2 },
  pulseDivider: { width: 1, backgroundColor: PULSE_COLORS.ui.border, alignSelf: 'stretch', marginHorizontal: 4 },
  pulseChase: { marginTop: 6 },
  pulseChaseText: { fontSize: 11, fontWeight: '700' },

  // Section title
  sectionTitle: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.textSecondary, letterSpacing: 1.5 },

  // Next Event card
  nextEventCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 18,
  },

  // Header: title block left, badge+drive right
  nextCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  nextCardTitleBlock: { flex: 1, gap: 4 },
  nextCardUniformPrefix: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  nextCardUniformBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, marginBottom: 5,
  },
  nextCardUniformBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  nextCardTitle: { fontSize: 20, fontWeight: '900', color: PULSE_COLORS.ui.text, letterSpacing: -0.5, lineHeight: 24 },
  nextCardTopRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  nextCardBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  nextCardBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#fff' },
  nextCardDrivePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  nextCardDrivePillText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // Meta rows (time + location)
  nextCardMeta: { gap: 5, marginBottom: 12 },
  nextCardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextCardMetaText: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, fontWeight: '500', flex: 1 },

  // Unified context chip row (weather + surface + kit)
  nextCardChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  nextCardChipWeather: { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  nextCardChipEmoji: { fontSize: 12 },
  nextCardChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  nextCardChipText: { fontSize: 11, fontWeight: '700' },

  // Coach headcount circles
  headcountRow: {
    flexDirection: 'row', gap: 12, marginTop: 6,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border, paddingTop: 14,
  },
  headcountItem: { alignItems: 'center', gap: 5 },
  headcountCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headcountCircleNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  headcountLabel: { fontSize: 10, color: PULSE_COLORS.ui.muted, fontWeight: '600', letterSpacing: 0.5 },
  headcountChevron: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'center' },
  headcountChevronText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  // Inline RSVP
  nextEventRsvpRow: {
    flexDirection: 'row', gap: 10,
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
    paddingTop: 12, marginTop: 10,
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
  rsvpTapToChange: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },

  noEvent: {
    alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, paddingVertical: 24,
  },
  noEventText: { color: PULSE_COLORS.ui.muted, fontSize: 14, fontWeight: '600' },

  // My Player card
  myPlayerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
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
  myPlayerName: { fontSize: 16, fontWeight: '800', color: PULSE_COLORS.ui.text },
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
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, padding: 16, marginBottom: 28,
  },
  announcementIcon: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  announcementBody: { flex: 1, gap: 3 },
  announcementTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  announcementPreview: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, lineHeight: 17 },
  announcementTime: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500', marginTop: 2 },


  // Team picker
  teamPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.background, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  teamPickerRowActive: { backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  teamPickerIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  teamPickerBody: { flex: 1 },
  teamPickerName: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  teamPickerMeta: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },

  // Fee card
  feeCard: {
    flexDirection: 'row',
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 28,
  },
  feeAccent: { width: 4, flexShrink: 0 },
  feeBody: { flex: 1, padding: 16, gap: 10 },
  feeTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  feeIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feeTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  feeAmount: { fontSize: 13, fontWeight: '600' },
  feeOverdueBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  feeOverdueText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.status.error },

  // Fee modal rows
  feeModalRow: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: PULSE_COLORS.ui.background, borderRadius: 14,
    overflow: 'hidden', marginBottom: 10, padding: 0,
  },
  feeModalAccent: { width: 3, flexShrink: 0 },
  feeModalTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  feeModalAmount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  feeModalDue: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  feeStatusChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  feeStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Dev switcher / shared sheet styles
  devOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  devSheet: {
    backgroundColor: PULSE_COLORS.ui.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48,
  },
  devHandle: { width: 40, height: 4, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  devTitle: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  devSub: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary, marginBottom: 20 },
  devRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.background, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  devRowLoading: { opacity: 0.6 },
  devAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  devAvatarText: { fontSize: 16, fontWeight: '800' },
  devRowBody: { flex: 1 },
  devRowLabel: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  devRowEmail: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  devSignOut: { marginTop: 8, padding: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  devSignOutText: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.status.error },

  // MY SEASON card
  seasonCard: {
    backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 20, marginBottom: 28,
  },
  seasonStat: { flex: 1, alignItems: 'center', gap: 6 },
  seasonFlameWrap: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  seasonFlameEmoji: { fontSize: 28 },
  seasonStatNum: { fontSize: 38, fontWeight: '900', letterSpacing: -2, lineHeight: 42 },
  seasonStatLabel: { fontSize: 11, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', textAlign: 'center' },
  seasonDivider: { width: 1, height: 72, backgroundColor: PULSE_COLORS.ui.border, marginHorizontal: 8 },
  seasonTapHint: { width: 24, alignItems: 'center' },
  superStreakChip: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1,
    color: '#F59E0B', marginLeft: 6,
  },

  // Attendance detail sheet
  attSheet: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.background,
  },
  attSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  attSheetTitle: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text },
  attSheetClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  attSheetStatRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 20 },
  attSheetStat: {
    flex: 1, backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderLeftWidth: 3, borderRadius: 14, padding: 14, gap: 2,
  },
  attSheetStatEmoji: { fontSize: 22, marginBottom: 4 },
  attSheetStatNum: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  attSheetStatLabel: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '600', marginTop: 2 },
  attSheetAtRisk: { fontSize: 11, color: '#F59E0B', fontWeight: '600', marginTop: 6, lineHeight: 15 },
  attSheetSuperBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 14,
    backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 14, padding: 14,
  },
  attSheetSuperLabel: { fontSize: 12, fontWeight: '900', color: '#F59E0B', letterSpacing: 1 },
  attSheetSuperSub: { fontSize: 11, color: PULSE_COLORS.ui.textSecondary, marginTop: 2 },
  attSheetInfoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 20, marginTop: 14,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 12, padding: 12,
  },
  attSheetInfoText: { flex: 1, fontSize: 11, color: PULSE_COLORS.ui.muted, lineHeight: 16 },
  attSheetList: { marginHorizontal: 20, marginTop: 8, gap: 2 },
  attSheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  attSheetTypeBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  attSheetTypeBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  attSheetRowDate: { flex: 1, fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
  attSheetStatusDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
});
