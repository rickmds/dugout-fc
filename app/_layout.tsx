import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Dimensions, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { TeamProvider, useActiveTeam } from '../hooks/TeamContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { resolveNotificationTeamId } from '../lib/resolveNotificationTeamId';
import { supabase } from '../lib/supabase';
import { uniqueChannelName } from '../lib/realtime';
import WebPushPrompt from '../components/ui/WebPushPrompt';
import UpdateRequiredModal from '../components/ui/UpdateRequiredModal';
import ClubSuspendedModal from '../components/ui/ClubSuspendedModal';
import ViewAsBanner from '../components/ui/ViewAsBanner';
import { checkVersionGate } from '../lib/versionGate';

SplashScreen.preventAutoHideAsync();

async function syncBadge(profileId: string) {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('read', false);
  await Notifications.setBadgeCountAsync(count ?? 0);
}

function AppShell() {
  usePushNotifications();
  const router = useRouter();
  const { club, profile } = useAuth();
  const { team, allTeams, selectTeam } = useActiveTeam();
  const [updateRequired, setUpdateRequired] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Checked on launch and again whenever the app returns to the foreground,
  // so someone who updates and reopens (or who had it open when the floor
  // was raised) sees it clear without needing a fresh cold start.
  useEffect(() => {
    checkVersionGate().then(setUpdateRequired);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkVersionGate().then(setUpdateRequired);
        if (profile?.id) syncBadge(profile.id);
      }
    });
    return () => sub.remove();
  }, [profile?.id]);

  // iOS home-screen app-icon badge — mirrors the same global unread count the
  // Home tab already computes (notifications where read=false, no type
  // filter; notifications has no club_id so this is correctly cross-club).
  // Covers the app staying open; the AppState listener above covers coming
  // back to the foreground; send-push's own badge field covers backgrounded/
  // killed-app pushes where no client JS runs to update this.
  useEffect(() => {
    if (!profile?.id) return;
    syncBadge(profile.id);

    const sub = supabase
      .channel(uniqueChannelName(`app-badge-${profile.id}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profile.id}`,
      }, () => syncBadge(profile.id))
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [profile?.id]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const slug = data?.club_slug as string | undefined;
      if (!slug) return;

      // Switch the active team to match the notification before navigating
      // — otherwise the destination screen renders with whatever team was
      // active beforehand, which on a multi-team account can silently show
      // the wrong roster/chat/schedule even though the URL is correct.
      const targetTeamId = await resolveNotificationTeamId(data);
      if (targetTeamId && targetTeamId !== team?.id && allTeams.some((t) => t.id === targetTeamId)) {
        await selectTeam(targetTeamId);
      }

      switch (data?.type) {
        // ── Event notifications ──────────────────────────────────────────────
        case 'new_event':
        case 'event_updated':
        case 'schedule_change':
        case 'rsvp_reminder':
        case 'event_day_reminder':
        case 'game_day':
          if (data.event_id) router.push(`/(app)/${slug}/event/${data.event_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/schedule` as any);
          break;
        case 'event_cancelled':
        case 'field_closure':
          router.push(`/(app)/${slug}/(tabs)/schedule` as any);
          break;
        case 'reflection_prompt':
          if (data.event_id) router.push(`/(app)/${slug}/event/${data.event_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/schedule` as any);
          break;
        case 'player_shoutout':
          if (data.player_id) router.push({ pathname: `/(app)/${slug}/player/shoutouts` as any, params: { playerId: data.player_id as string } });
          else router.push(`/(app)/${slug}/(tabs)` as any);
          break;
        // ── Chat notifications ───────────────────────────────────────────────
        case 'new_announcement':
          router.push({ pathname: `/(app)/${slug}/(tabs)/chat` as any, params: { tab: 'announcements' } });
          break;
        case 'new_dm':
          if (data.conversation_id) router.push(`/(app)/${slug}/conversation/${data.conversation_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/chat` as any);
          break;
        // ── Guest notifications ──────────────────────────────────────────────
        case 'guest_request':
          if (data.request_id) router.push(`/(app)/${slug}/guest-request/${data.request_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/schedule` as any);
          break;
        case 'guest_invite':
        case 'guest_coach_invite':
        case 'guest_accepted':
        case 'guest_response':
          if (data.event_id) router.push(`/(app)/${slug}/event/${data.event_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/schedule` as any);
          break;
        // ── Admin notifications ──────────────────────────────────────────────
        case 'invite_accepted':
        case 'guest_reminder':
        case 'evaluation_published':
        case 'waiver_reminder':
          router.push(`/(app)/${slug}/admin` as any);
          break;
        // ── Fee notifications (no dedicated mobile screen — show notification centre) ──
        case 'fee_assigned':
        case 'fee_reminder':
        case 'payment_confirmed':
        case 'fee_payment_claimed':
          router.push(`/(app)/${slug}/notifications` as any);
          break;
        // ── Fallback ─────────────────────────────────────────────────────────
        default:
          router.push(`/(app)/${slug}/notifications` as any);
      }
    });
    return () => sub.remove();
  }, [team?.id, allTeams, selectTeam]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <WebPushPrompt />
      <ViewAsBanner />
      {updateRequired && <UpdateRequiredModal />}
      {!updateRequired && club?.suspended_at && <ClubSuspendedModal />}
    </>
  );
}

function SplashVideo({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const finishedRef = useRef(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const player = useVideoPlayer(require('../assets/Splash.mp4'), (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setVideoEnded(true));
    // Safety net: the splash video is ~5s. If playback never completes for any
    // reason (codec/autoplay differences on some devices), don't leave the app
    // stuck behind a permanent full-screen black overlay.
    const fallback = setTimeout(() => setVideoEnded(true), 7000);
    return () => {
      sub.remove();
      clearTimeout(fallback);
    };
  }, [player]);

  // Don't start fading until auth (session/profile/club) has actually
  // resolved too — otherwise the video ends, the fade reveals the app
  // underneath mid-navigation, and whoever's watching sees a flash of the
  // loading spinner (or even the login screen) before it settles on Home.
  // useAuth's own retry logic bounds `loading` to flip false within ~10s
  // regardless of network conditions, so this never hangs indefinitely.
  useEffect(() => {
    if (!videoEnded || !ready || finishedRef.current) return;
    finishedRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => onFinished());
  }, [videoEnded, ready]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: fadeAnim }]}>
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]}
        contentFit="fill"
        nativeControls={false}
      />
    </Animated.View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <TeamProvider>
        <RootLayoutInner />
      </TeamProvider>
    </AuthProvider>
  );
}

const SPLASH_SEEN_KEY = 'has_seen_splash_v1';

function RootLayoutInner() {
  // Reading loading here (inside AuthProvider) rather than in RootLayout
  // itself, which sits above the provider and can't call useAuth() at all.
  const { loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  // null = still checking AsyncStorage (rare, near-instant); true = first
  // launch ever, play the full branded video; false = returning user, skip
  // the ~5s video entirely and just wait on auth (near-instant from cache)
  // rather than paying that fixed cost on every single app open.
  const [showVideo, setShowVideo] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SPLASH_SEEN_KEY).then((val) => setShowVideo(!val));
  }, []);

  useEffect(() => {
    if (showVideo === false && !loading) setSplashDone(true);
  }, [showVideo, loading]);

  return (
    <>
      <AppShell />
      {!splashDone && (
        showVideo === true ? (
          <SplashVideo
            ready={!loading}
            onFinished={() => {
              AsyncStorage.setItem(SPLASH_SEEN_KEY, '1');
              setSplashDone(true);
            }}
          />
        ) : (
          // Covers the brief AsyncStorage check (showVideo === null) and the
          // returning-user wait-for-auth window (showVideo === false) with
          // the same flat color the video opens on, so there's no visible
          // seam between this and the video on someone's very first launch.
          <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none" />
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#000000',
    zIndex: 9999,
  },
});
