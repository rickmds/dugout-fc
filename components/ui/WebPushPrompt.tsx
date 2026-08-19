import { useEffect, useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../hooks/useAuth';
import { useWebPushPrompt } from '../../hooks/usePushNotifications';
import { PULSE_COLORS } from '../../constants/colors';

const DISMISS_KEY = 'web_push_prompt_dismissed';

// Web-only, gesture-triggered notification opt-in. Chrome demotes
// permission requests that aren't tied to a real tap (and a standalone PWA
// has no address bar to show the fallback UI in), so this can't just fire
// automatically like the native flow does — it needs an actual button.
export default function WebPushPrompt() {
  const { profile } = useAuth();
  const { status, request } = useWebPushPrompt();
  const [dismissed, setDismissed] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    AsyncStorage.getItem(DISMISS_KEY).then((v) => setDismissed(v === '1'));
  }, []);

  if (Platform.OS !== 'web') return null;
  if (!profile?.id || !profile?.club_id) return null;
  if (status !== 'default' || dismissed) return null;

  async function handleEnable() {
    setRequesting(true);
    await request();
    setRequesting(false);
  }

  function handleDismiss() {
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, '1');
  }

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications-outline" size={18} color={PULSE_COLORS.brand.green} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>Turn on notifications</Text>
        <Text style={styles.subtitle}>Get schedule changes and announcements as they happen.</Text>
      </View>
      <TouchableOpacity onPress={handleEnable} disabled={requesting} style={styles.enableBtn}>
        <Text style={styles.enableBtnText}>{requesting ? '...' : 'Enable'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDismiss} style={styles.dismissBtn} hitSlop={8}>
        <Ionicons name="close" size={16} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34,197,94,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: PULSE_COLORS.ui.text,
  },
  subtitle: {
    fontSize: 11.5,
    color: PULSE_COLORS.ui.textSecondary,
    marginTop: 1,
  },
  enableBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: PULSE_COLORS.brand.green,
    flexShrink: 0,
  },
  enableBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  dismissBtn: {
    flexShrink: 0,
  },
});
