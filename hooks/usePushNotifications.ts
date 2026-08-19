import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { profile } = useAuth();

  useEffect(() => {
    // Wait until onboarding is actually finished (they've joined or
    // created a team) before hitting them with the OS permission prompt —
    // asking the instant they sign up, before they've seen any value,
    // tanks opt-in rates.
    if (!profile?.id || !profile?.club_id) return;
    // Web is handled separately via useWebPushPrompt — Chrome silently
    // demotes permission requests that aren't tied to a user gesture (and
    // a standalone-display PWA has no address bar to even show the quiet
    // fallback UI in), so it can't be auto-triggered here like native can.
    if (Platform.OS !== 'web') registerToken(profile.id);
  }, [profile?.id, profile?.club_id]);
}

// For a UI element (button/banner) to drive web push opt-in from a real
// tap, so the browser's permission prompt actually has a chance to show.
export function useWebPushPrompt() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('unsupported');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setStatus(Notification.permission);
  }, []);

  const request = useCallback(async () => {
    if (Platform.OS !== 'web' || !profile?.id) return false;
    try {
      const vapidKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return false;

      const permission = await Notification.requestPermission();
      setStatus(permission);
      if (permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

      await supabase.from('web_push_subscriptions').upsert(
        {
          profile_id: profile.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'profile_id,endpoint' }
      );
      return true;
    } catch (err) {
      console.error('[PushNotifications] Web push registration failed:', err);
      return false;
    }
  }, [profile?.id]);

  return { status, request };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registerToken(profileId: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '3b35d5d3-278b-42c4-b66b-1a487815ce31',
    });
    const token = tokenData.data;

    await supabase.from('push_tokens').upsert(
      { profile_id: profileId, token, platform: Platform.OS as 'ios' | 'android' },
      { onConflict: 'profile_id,token', ignoreDuplicates: true }
    );
  } catch (err) {
    console.error('[PushNotifications] Token registration failed:', err);
  }
}
