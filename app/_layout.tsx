import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';

SplashScreen.preventAutoHideAsync();

async function storeInviteTokenFromUrl(url: string) {
  const { queryParams } = Linking.parse(url);
  const token = queryParams?.token;
  if (typeof token === 'string') {
    await AsyncStorage.setItem('pendingInviteToken', token);
  }
}

function AppShell() {
  usePushNotifications();
  const router = useRouter();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const slug = data?.club_slug as string | undefined;
      if (!slug) return;

      switch (data?.type) {
        case 'new_event':
        case 'schedule_change':
          if (data.event_id) router.push(`/(app)/${slug}/event/${data.event_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/schedule` as any);
          break;
        case 'new_announcement':
          router.push(`/(app)/${slug}/(tabs)/chat` as any);
          break;
        case 'new_dm':
          if (data.conversation_id) router.push(`/(app)/${slug}/conversation/${data.conversation_id}` as any);
          else router.push(`/(app)/${slug}/(tabs)/chat` as any);
          break;
        case 'invite_accepted':
          router.push(`/(app)/${slug}/admin` as any);
          break;
        default:
          router.push(`/(app)/${slug}/notifications` as any);
      }
    });
    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}

function SplashVideo({ onFinished }: { onFinished: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const player = useVideoPlayer(require('../assets/Splash.mp4'), (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => onFinished());
    });
    return () => sub.remove();
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

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) storeInviteTokenFromUrl(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => storeInviteTokenFromUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <AppShell />
      {!splashDone && <SplashVideo onFinished={() => setSplashDone(true)} />}
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#000000',
    zIndex: 9999,
  },
});
