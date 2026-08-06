import { useEffect, useRef } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PULSE_COLORS } from '../../constants/colors';

export default function ScheduleSkeleton() {
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
  const top = insets.top + 64; // safe area + ClubHeader height

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: PULSE_COLORS.ui.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: top, paddingBottom: 40 }}
      scrollEnabled={false}
    >
      <Animated.View style={{ opacity: pulse }}>
        {/* Tab pills */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
          {[90, 56, 80].map((w, i) => (
            <View key={i} style={{ width: w, height: 34, borderRadius: 20, backgroundColor: S }} />
          ))}
        </View>

        {/* Month header */}
        <View style={{ width: 72, height: 9, borderRadius: 5, backgroundColor: S, marginBottom: 14 }} />

        {/* Event rows */}
        {[0, 1, 2].map(i => (
          <View key={i} style={{ height: 88, borderRadius: 14, backgroundColor: S, marginBottom: 10 }} />
        ))}

        {/* Second month */}
        <View style={{ width: 60, height: 9, borderRadius: 5, backgroundColor: S, marginBottom: 14, marginTop: 16 }} />
        {[0, 1].map(i => (
          <View key={i} style={{ height: 88, borderRadius: 14, backgroundColor: S, marginBottom: 10 }} />
        ))}
      </Animated.View>
    </ScrollView>
  );
}
