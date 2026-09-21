import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Dimensions, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { TeamProvider, useActiveTeam } from '../hooks/TeamContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { routeNotificationTap } from '../lib/notificationRouting';
import { formatCurrency } from '../lib/formatCurrency';
import { supabase } from '../lib/supabase';
import { uniqueChannelName } from '../lib/realtime';
import WebPushPrompt from '../components/ui/WebPushPrompt';
import UpdateRequiredModal from '../components/ui/UpdateRequiredModal';
import ClubSuspendedModal from '../components/ui/ClubSuspendedModal';
import ViewAsBanner from '../components/ui/ViewAsBanner';
import { checkVersionGate } from '../lib/versionGate';

const APP_BASE = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app';

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
  // The suspended-club gate must track whichever club is actually active
  // (a team at a second club via club_admins/team_members), not always the
  // home club — otherwise a suspended home club would block the whole app
  // even while a different, non-suspended club is genuinely available.
  const activeClub = team?.club ?? club;
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

  // Opens the same pay flow Home's payNow() uses — a parent who taps a
  // "payment failed" push from the lock screen should land in the actual
  // pay flow, not just a generic notification list. Mirrors
  // notifications.tsx's identical handler (that screen still needs its own
  // copy for its local list/read-state); this is the shared routing logic's
  // only case that needs more than a router.push, which is why it's a
  // caller-supplied callback rather than something routeNotificationTap
  // does itself.
  async function handleFeePaymentTap(playerFeeId: string) {
    const { data: fee, error } = await supabase.from('player_fees').select('payment_token').eq('id', playerFeeId).single();
    if (error || !fee?.payment_token) {
      Alert.alert("Couldn't open payment", 'Check the Home tab for your outstanding fees.');
      return;
    }
    await WebBrowser.openBrowserAsync(`${APP_BASE}/pay/${fee.payment_token}`, {
      controlsColor: activeClub?.primary_color ?? undefined,
      dismissButtonStyle: 'close',
    });
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
    const amountText = fee.claim_amount ? formatCurrency(Number(fee.claim_amount), (activeClub as any)?.currency ?? 'USD') : 'an unspecified amount';
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

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, unknown>;
    routeNotificationTap({
      type: data?.type as string | undefined,
      data,
      router,
      team,
      allTeams,
      selectTeam,
      fallbackSlug: activeClub?.slug ?? '',
      onFeePaymentTap: handleFeePaymentTap,
      onFeeClaimTap: handleFeeClaimTap,
    });
  }

  const handleNotificationResponseRef = useRef(handleNotificationResponse);
  useEffect(() => { handleNotificationResponseRef.current = handleNotificationResponse; });

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => handleNotificationResponseRef.current(response)
    );
    return () => sub.remove();
  }, []);

  // Cold start: the app was fully closed and got launched BY tapping a
  // notification. addNotificationResponseReceivedListener firing for that
  // same launch is implicit, undocumented behavior on Expo/RN's part, not
  // something guaranteed across every OS version/device — this is the
  // explicit, documented way to ask "did a notification response launch
  // this session," so a cold-start tap can't silently land on Home instead
  // of the intended destination.
  const coldStartHandledRef = useRef(false);
  useEffect(() => {
    if (coldStartHandledRef.current) return;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (coldStartHandledRef.current || !response) return;
      coldStartHandledRef.current = true;
      handleNotificationResponseRef.current(response);
    });
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <WebPushPrompt />
      <ViewAsBanner />
      {updateRequired && <UpdateRequiredModal />}
      {!updateRequired && activeClub?.suspended_at && (
        <ClubSuspendedModal isOrgAdmin={team ? team.myRole === 'org_admin' : profile?.role === 'org_admin'} />
      )}
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

function RootLayoutInner() {
  // Reading loading here (inside AuthProvider) rather than in RootLayout
  // itself, which sits above the provider and can't call useAuth() at all.
  const { loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // RootLayoutInner only mounts once per cold start — backgrounding and
  // foregrounding the app keeps the JS engine (and this component) alive,
  // so playing the video unconditionally on every mount means every hard
  // launch, not a one-time first-install treatment.
  return (
    <>
      <AppShell />
      {!splashDone && (
        <SplashVideo ready={!loading} onFinished={() => setSplashDone(true)} />
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
