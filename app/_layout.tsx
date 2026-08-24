import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Dimensions, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { TeamProvider } from '../hooks/TeamContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import WebPushPrompt from '../components/ui/WebPushPrompt';
import UpdateRequiredModal from '../components/ui/UpdateRequiredModal';
import ClubSuspendedModal from '../components/ui/ClubSuspendedModal';
import { checkVersionGate } from '../lib/versionGate';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  usePushNotifications();
  const router = useRouter();
  const { club } = useAuth();
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
      if (state === 'active') checkVersionGate().then(setUpdateRequired);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const slug = data?.club_slug as string | undefined;
      if (!slug) return;

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
          router.push(`/(app)/${slug}/(tabs)/chat` as any);
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
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <WebPushPrompt />
      {updateRequired && <UpdateRequiredModal />}
      {!updateRequired && club?.suspended_at && <ClubSuspendedModal />}
    </>
  );
}

function SplashVideo({ onFinished }: { onFinished: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const finishedRef = useRef(false);
  const player = useVideoPlayer(require('../assets/Splash.mp4'), (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => onFinished());
  };

  useEffect(() => {
    const sub = player.addListener('playToEnd', finish);
    // Safety net: the splash video is ~5s. If playback never completes for any
    // reason (codec/autoplay differences on some devices), don't leave the app
    // stuck behind a permanent full-screen black overlay.
    const fallback = setTimeout(finish, 7000);
    return () => {
      sub.remove();
      clearTimeout(fallback);
    };
  }, [player]);

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
  const [splashDone, setSplashDone] = useState(false);

  return (
    <AuthProvider>
      <TeamProvider>
        <AppShell />
        {!splashDone && <SplashVideo onFinished={() => setSplashDone(true)} />}
      </TeamProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#000000',
    zIndex: 9999,
  },
});
