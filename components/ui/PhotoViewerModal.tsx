import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
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
  /** Emoji set for the in-place quick-react row (e.g. the same
   * REACTION_EMOJIS used elsewhere in chat) — reacting happens right over
   * the photo, no need to leave it. Omit to hide reactions entirely. */
  reactionEmojis?: string[];
  onReact?: (emoji: string) => void;
};

// Full-screen photo viewer with pinch-to-zoom, drag-to-pan-while-zoomed,
// double-tap to toggle zoom, and a Save action — none of which the plain
// contain-fit <Image> in a Modal (the previous viewer) supported.
export default function PhotoViewerModal({ visible, uri, onClose, reactionEmojis, onReact }: Props) {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const areaSize     = useRef({ width: 0, height: 0 });

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
    setMenuOpen(false);
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
              // Zoom toward wherever was actually double-tapped, not just the
              // image's own center — invert the current transform to find
              // which point of the (unscaled) image is under the tap, then
              // solve for the pan that puts that same point back at center
              // once at the new scale.
              const newScale = 2;
              const { width, height } = areaSize.current;
              const tapX = evt.nativeEvent.locationX;
              const tapY = evt.nativeEvent.locationY;
              const ox = (tapX - width / 2 - currentTX.current) / currentScale.current;
              const oy = (tapY - height / 2 - currentTY.current) / currentScale.current;
              const newTx = -ox * newScale;
              const newTy = -oy * newScale;

              currentScale.current = newScale;
              currentTX.current = newTx;
              currentTY.current = newTy;
              lastTX.current = newTx;
              lastTY.current = newTy;

              Animated.parallel([
                Animated.spring(scale, { toValue: newScale, useNativeDriver: true }),
                Animated.spring(tx, { toValue: newTx, useNativeDriver: true }),
                Animated.spring(ty, { toValue: newTy, useNativeDriver: true }),
              ]).start();
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
      <View style={[StyleSheet.absoluteFill, st.overlay]}>
        <View style={[st.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={st.headerBtn} onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!!reactionEmojis?.length && (
              <TouchableOpacity style={[st.headerBtn, st.saveBtn]} onPress={() => setMenuOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="happy-outline" size={20} color="#fff" />
                <Text style={st.saveBtnText}>React</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[st.headerBtn, st.saveBtn]} onPress={handleSave} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <>
                    <Ionicons name={Platform.OS === 'ios' ? 'share-outline' : 'download-outline'} size={18} color="#fff" />
                    <Text style={st.saveBtnText}>Save</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={st.imageArea}
          onLayout={(e) => { areaSize.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}
          {...pan.panHandlers}
        >
          {uri && (
            <Animated.View style={[st.imageWrap, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}>
              <Image source={{ uri }} style={st.image} contentFit="contain" />
            </Animated.View>
          )}
        </View>

        {menuOpen && (
          <>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setMenuOpen(false)}
            />
            <View style={[st.menuPanel, { paddingBottom: insets.bottom + 16 }]}>
              {!!reactionEmojis?.length && (
                <View style={st.menuEmojiRow}>
                  {reactionEmojis.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={st.menuEmojiBtn}
                      onPress={() => {
                        setMenuOpen(false);
                        onReact?.(emoji);
                      }}
                    >
                      <Text style={st.menuEmojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity style={st.menuCancelBtn} onPress={() => setMenuOpen(false)}>
                <Text style={st.menuCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  // Combined with StyleSheet.absoluteFill on the same View (not just
  // flex:1) so this reliably fills the whole screen regardless of how the
  // transparent Modal's own root sizes itself.
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  saveBtn: { width: 'auto', flexDirection: 'row', gap: 6, paddingHorizontal: 14 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  imageArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The pinch/pan Animated.View needs its OWN explicit size — it used to
  // just wrap a percentage-sized Image with no size of its own, which left
  // both stuck at 0×0 (an image can't resolve a percentage against a
  // parent that has no resolved size of its own), so nothing ever rendered.
  imageWrap: { width: '100%', height: '80%' },
  image: { width: '100%', height: '100%' },
  menuPanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#1c1c1e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, paddingHorizontal: 16,
  },
  menuEmojiRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingBottom: 16, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  menuEmojiBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuEmojiText: { fontSize: 28 },
  menuCancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  menuCancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '700' },
});
