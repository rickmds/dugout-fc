import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import { useAuth } from '../../../../hooks/useAuth';
import { supabase } from '../../../../lib/supabase';

const INACTIVE = '#555';

export default function TabsLayout() {
  const { primaryColor } = useClub();
  const { profile } = useAuth();
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;

    async function fetchUnread() {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profile!.id)
        .eq('read', false)
        .in('type', ['new_message', 'message', 'new_announcement', 'direct_message', 'chat']);
      setChatUnread(count ?? 0);
    }

    fetchUnread();

    const sub = supabase
      .channel(`chat-badge-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profile.id}`,
      }, fetchUnread)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [profile?.id]);

  return (
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
          <BlurView tint="dark" intensity={90} style={StyleSheet.absoluteFill} />
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
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
          ),
        }}
      />
      <Tabs.Screen
        name="roster"
        options={{
          title: 'Roster',
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
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
            <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
          ),
        }}
      />
    </Tabs>
  );
}
