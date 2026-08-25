import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { isViewingAs, exitViewAs } from '../../lib/viewAs';
import { useAuth } from '../../hooks/useAuth';

// Persistent reminder that the app is currently signed in as a real parent
// account via the app_admin "View As" tool (settings.tsx, 5 taps on the
// version footer) — rendered at the root layout so it's visible regardless
// of which screen is open underneath it. Re-checks on every user-id change
// (not just app mount) since starting or exiting View As both swap the
// authenticated user without remounting this component.
export default function ViewAsBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    isViewingAs().then(setActive);
  }, [user?.id]);

  if (!active) return null;

  async function handleExit() {
    setExiting(true);
    const result = await exitViewAs();
    setExiting(false);
    setActive(false);
    if (!result.ok) Alert.alert('Session expired', result.error);
    router.replace('/');
  }

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.text}>Viewing as a parent</Text>
      <TouchableOpacity onPress={handleExit} disabled={exiting} style={styles.exitBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        {exiting ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.exitText}>Exit</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingBottom: 10,
  },
  text: { color: '#000', fontWeight: '700', fontSize: 13 },
  exitBtn: { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  exitText: { color: '#F59E0B', fontWeight: '700', fontSize: 12 },
});
