import { useEffect, useRef } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PULSE_COLORS } from '../../constants/colors';

export default function ChatSkeleton() {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const S = PULSE_COLORS.ui.surface;
  const top = insets.top + 64;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: PULSE_COLORS.ui.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: top, paddingBottom: 40 }}
      scrollEnabled={false}
    >
      <Animated.View style={{ opacity: pulse }}>
        {/* Tab pills */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {[80, 110, 64].map((w, i) => (
            <View key={i} style={{ width: w, height: 34, borderRadius: 20, backgroundColor: S }} />
          ))}
        </View>

        {/* Pinned team chat row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: S, marginBottom: 6 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: PULSE_COLORS.ui.surfaceAlt }} />
          <View style={{ flex: 1, gap: 7 }}>
            <View style={{ width: '60%', height: 12, borderRadius: 6, backgroundColor: PULSE_COLORS.ui.surfaceAlt }} />
            <View style={{ width: '85%', height: 10, borderRadius: 5, backgroundColor: PULSE_COLORS.ui.surfaceAlt }} />
          </View>
        </View>

        {/* Conversation rows */}
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: S }} />
            <View style={{ flex: 1, gap: 7 }}>
              <View style={{ width: `${55 + i * 7}%` as any, height: 11, borderRadius: 5, backgroundColor: S }} />
              <View style={{ width: `${70 + i * 5}%` as any, height: 9, borderRadius: 5, backgroundColor: S }} />
            </View>
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}
