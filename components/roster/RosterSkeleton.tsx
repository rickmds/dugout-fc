import { useEffect, useRef } from 'react';
import { Animated, Dimensions, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PULSE_COLORS } from '../../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD   = 14;
const GAP     = 10;
const CARD_W  = (SCREEN_W - H_PAD * 2 - GAP) / 2;
const CARD_H  = Math.round(CARD_W * 1.1) + 59; // photo + strip

export default function RosterSkeleton() {
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
      contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: top, paddingBottom: 40 }}
      scrollEnabled={false}
    >
      <Animated.View style={{ opacity: pulse }}>
        {/* Count + search bar */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <View style={{ flex: 1, height: 38, borderRadius: 12, backgroundColor: S }} />
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: S }} />
        </View>

        {/* Coach strip */}
        <View style={{ height: 60, borderRadius: 12, backgroundColor: S, marginBottom: 20 }} />

        {/* Player grid — 3 rows × 2 cols */}
        {[0, 1, 2].map(row => (
          <View key={row} style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP }}>
            <View style={{ width: CARD_W, height: CARD_H, borderRadius: 14, backgroundColor: S }} />
            <View style={{ width: CARD_W, height: CARD_H, borderRadius: 14, backgroundColor: S }} />
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}
