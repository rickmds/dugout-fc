import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';
import { uniqueChannelName } from '../../../../lib/realtime';
import { useNetworkStatus } from '../../../../hooks/useNetworkStatus';
import OfflineBanner from '../../../../components/ui/OfflineBanner';

const INACTIVE = '#555';

function TabIcon({ focused, primary, children }: { focused: boolean; primary: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 2 }}>
      {focused && (
        <View style={{
          position: 'absolute', top: -6, width: 28, height: 3,
          borderRadius: 2, backgroundColor: primary,
        }} />
      )}
      {children}
    </View>
  );
}

export default function TabsLayout() {
  const { primaryColor } = useClub();
  const { isConnected } = useNetworkStatus();
  const { profile } = useAuth();
  const [chatUnread, setChatUnread] = useState(0);
  const [pendingGuestCount, setPendingGuestCount] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;

    async function fetchUnread() {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profile!.id)
        .eq('read', false)
        .in('type', ['new_message', 'new_announcement', 'new_dm']);
      setChatUnread(count ?? 0);
    }

    fetchUnread();

    const sub = supabase
      .channel(uniqueChannelName(`chat-badge-${profile.id}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profile.id}`,
      }, fetchUnread)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    async function fetchPendingGuests() {
      // get_my_guarded_players() also checks player_guardians — otherwise a
      // second guardian's own kid never counted toward this badge.
      const { data: playerRows } = await (supabase as any)
        .rpc('get_my_guarded_players')
        .select('id');
      const playerIds = (playerRows ?? []).map((p: { id: string }) => p.id);
      if (playerIds.length === 0) { setPendingGuestCount(0); return; }
      const { count } = await supabase
        .from('event_guests')
        .select('*', { count: 'exact', head: true })
        .in('player_id', playerIds)
        .eq('status', 'pending');
      setPendingGuestCount(count ?? 0);
    }

    fetchPendingGuests();

    const sub = supabase
      .channel(uniqueChannelName(`guest-badge-${profile.id}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'event_guests',
      }, fetchPendingGuests)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [profile?.id]);

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: 64,
          paddingTop: 6,
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111111' }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: primaryColor, opacity: 0.08 }]} />
          </View>
        ),
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: INACTIVE,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} primary={primaryColor}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarBadge: pendingGuestCount > 0 ? (pendingGuestCount > 99 ? '99+' : pendingGuestCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#F59E0B', fontSize: 10, minWidth: 18, height: 18 },
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} primary={primaryColor}>
              <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="roster"
        options={{
          title: 'Roster',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} primary={primaryColor}>
              <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10, minWidth: 18, height: 18 },
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} primary={primaryColor}>
              <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
    <OfflineBanner visible={!isConnected} />
    </View>
  );
}
