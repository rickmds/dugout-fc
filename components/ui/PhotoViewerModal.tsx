import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

// Full-screen photo viewer with pinch-to-zoom, drag-to-pan-while-zoomed,
// double-tap to toggle zoom, and a Save action — none of which the plain
// contain-fit <Image> in a Modal (the previous viewer) supported.
export default function PhotoViewerModal({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const tx    = useRef(new Animated.Value(0)).current;
  const ty    = useRef(new Animated.Value(0)).current;

  const currentScale = useRef(1);
  const currentTX    = useRef(0);
  const currentTY    = useRef(0);
  const lastTX       = useRef(0);
  const lastTY       = useRef(0);
  const initialDist  = useRef(0);
  const initialScale = useRef(1);
  const isPinching   = useRef(false);
  const lastTapAt    = useRef(0);

  function reset() {
    currentScale.current = 1;
    currentTX.current = 0;
    currentTY.current = 0;
    lastTX.current = 0;
    lastTY.current = 0;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
      Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
    ]).start();
  }

  function handleClose() {
    reset();
    onClose();
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderTerminationRequest: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        lastTX.current = currentTX.current;
        lastTY.current = currentTY.current;
        if (touches.length >= 2) {
          const dist = Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY);
          initialDist.current = dist;
          initialScale.current = currentScale.current;
          isPinching.current = true;
        } else {
          initialDist.current = 0;
          isPinching.current = false;

          const now = Date.now();
          if (now - lastTapAt.current < DOUBLE_TAP_MS) {
            lastTapAt.current = 0;
            if (currentScale.current > 1) {
              reset();
            } else {
              currentScale.current = 2;
              Animated.spring(scale, { toValue: 2, useNativeDriver: true }).start();
            }
          } else {
            lastTapAt.current = now;
          }
        }
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          isPinching.current = true;
          const dist = Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY);
          if (initialDist.current === 0) {
            initialDist.current = dist;
            initialScale.current = currentScale.current;
          }
          const next = Math.max(1, Math.min(MAX_SCALE, initialScale.current * (dist / initialDist.current)));
          currentScale.current = next;
          scale.setValue(next);
        } else if (currentScale.current > 1) {
          if (isPinching.current) {
            isPinching.current = false;
            lastTX.current = currentTX.current;
            lastTY.current = currentTY.current;
            return;
          }
          currentTX.current = lastTX.current + gs.dx;
          currentTY.current = lastTY.current + gs.dy;
          tx.setValue(currentTX.current);
          ty.setValue(currentTY.current);
        }
      },

      onPanResponderRelease: () => {
        isPinching.current = false;
        initialDist.current = 0;
        if (currentScale.current < 1) {
          reset();
        } else {
          lastTX.current = currentTX.current;
          lastTY.current = currentTY.current;
        }
      },
      onPanResponderTerminate: () => {
        isPinching.current = false;
        initialDist.current = 0;
      },
    })
  ).current;

  async function handleSave() {
    if (!uri) return;
    setSaving(true);
    try {
      const localPath = `${FileSystem.cacheDirectory}chat-photo-${Date.now()}.jpg`;
      await FileSystem.downloadAsync(uri, localPath);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Not available', 'Saving photos is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(localPath, {
        dialogTitle: 'Save photo',
        UTI: 'public.jpeg',
      });
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={st.overlay}>
        <View style={[st.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={st.headerBtn} onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={st.headerBtn} onPress={handleSave} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name={Platform.OS === 'ios' ? 'share-outline' : 'download-outline'} size={22} color="#fff" />}
          </TouchableOpacity>
        </View>

        <View style={st.imageArea} {...pan.panHandlers}>
          {uri && (
            <Animated.View style={{ transform: [{ scale }, { translateX: tx }, { translateY: ty }] }}>
              <Image source={{ uri }} style={st.image} contentFit="contain" />
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  imageArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
});
