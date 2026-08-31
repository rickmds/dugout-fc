import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';

// Google Static Maps satellite thumbnail, tap-to-open-in-maps — the same
// pattern event/[eventId].tsx's LocationMap already uses, pulled out so a
// third call site (tournament cards) doesn't copy-paste it again.
export default function SatelliteMapThumb({
  lat, lng, address, onPress, height = 140, zoom = 15,
}: {
  lat: number | null;
  lng: number | null;
  address: string | null;
  onPress: () => void;
  height?: number;
  zoom?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  if (!address && lat == null) return null; // nothing to show or link to

  if (!PLACES_KEY || imgError) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.fallback}>
        <Ionicons name="map-outline" size={16} color={PULSE_COLORS.ui.muted} />
        <Text style={styles.fallbackText} numberOfLines={1}>{address ?? 'View on map'}</Text>
        <Ionicons name="open-outline" size={14} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>
    );
  }

  const center = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(address ?? '');
  const marker = lat != null && lng != null ? `&markers=color:red|${lat},${lng}` : '';
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${zoom}&size=600x300&maptype=satellite${marker}&key=${PLACES_KEY}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={[styles.wrapper, { height }]}>
      {!imgLoaded && (
        <View style={styles.skeleton}>
          <ActivityIndicator color={PULSE_COLORS.ui.muted} />
        </View>
      )}
      <Image
        source={{ uri: mapUrl }}
        style={[styles.image, !imgLoaded && { opacity: 0 }]}
        contentFit="cover"
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
      />
      {imgLoaded && (
        <View style={styles.hint}>
          <Ionicons name="navigate-outline" size={11} color="rgba(255,255,255,0.9)" />
          <Text style={styles.hintText}>Get directions</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  skeleton: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  hint: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  hintText: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600' },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 10,
  },
  fallbackText: { flex: 1, fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
});
