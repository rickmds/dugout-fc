import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function OfflineBanner({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  const [bannerHeight, setBannerHeight] = useState(120);
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -bannerHeight,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [visible, bannerHeight]);

  return (
    <Animated.View
      onLayout={e => setBannerHeight(e.nativeEvent.layout.height)}
      style={[styles.banner, { paddingTop: insets.top + 6, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#FEF3C7',
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
});
