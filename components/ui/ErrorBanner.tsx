import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DUGOUT_COLORS } from '../../constants/colors';

export default function ErrorBanner({ message }: { message: string }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    opacity.setValue(1);
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Ionicons name="alert-circle" size={16} color={DUGOUT_COLORS.status.error} style={styles.icon} />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.status.error,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  icon: { marginTop: 1, flexShrink: 0 },
  text: {
    color: DUGOUT_COLORS.status.error,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
