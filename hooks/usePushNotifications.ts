import { useEffect } from 'react';
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
    if (!profile?.id) return;
    registerToken(profile.id);
  }, [profile?.id]);
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
