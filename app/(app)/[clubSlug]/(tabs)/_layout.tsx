import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DUGOUT_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';

const INACTIVE = '#555';

export default function TabsLayout() {
  const { primaryColor } = useClub();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
        tabBarStyle: {
          backgroundColor: DUGOUT_COLORS.ui.surface,
          borderTopColor: DUGOUT_COLORS.ui.border,
          height: 64,
          paddingTop: 6,
        },
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
          tabBarIcon: ({ focused }) => (
            <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={focused ? primaryColor : INACTIVE} />
          ),
        }}
      />
    </Tabs>
  );
}
