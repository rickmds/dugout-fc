import { useRef } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/colors';

// Deliberately NOT a reuse of components/ui/ImageEditor.tsx — that produces
// a final baked, square-cropped file via expo-image-manipulator, which is
// exactly wrong for a card photo (see PlayerCard.tsx's own note on why the
// card uses contentFit:"contain"). This never re-encodes the image; it just
// stores where within the frame to show it. Same raw PanResponder/Animated
// approach as ImageEditor though — no new gesture library needed.

const BOX_W = 260;
const PHOTO_ASPECT = 0.92; // must match PlayerCard's photo-slot aspect ratio
const BOX_H = BOX_W / PHOTO_ASPECT;
// How far (as a fraction of the box's own size) a drag can push the image —
// generous enough to let a tall/narrow cutout (e.g. a full-body photo) be
// pushed mostly out of frame on purpose, cropping down to just the top half.
const MAX_OFFSET = 0.6;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Props = {
  visible: boolean;
  uri: string;
  initialOffsetX: number;
  initialOffsetY: number;
  onSave: (offsetX: number, offsetY: number) => void;
  onCancel: () => void;
  colors: ThemeColors;
  primaryColor?: string;
};

export default function PhotoPositioner({
  visible,
  uri,
  initialOffsetX,
  initialOffsetY,
  onSave,
  onCancel,
  colors,
  primaryColor = '#22C55E',
}: Props) {
  const insets = useSafeAreaInsets();
  const offsetX = useRef(initialOffsetX);
  const offsetY = useRef(initialOffsetY);
  const dragStartX = useRef(initialOffsetX);
  const dragStartY = useRef(initialOffsetY);
  const pan = useRef(
    new Animated.ValueXY({ x: initialOffsetX * BOX_W, y: initialOffsetY * BOX_H })
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragStartX.current = offsetX.current;
        dragStartY.current = offsetY.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const nx = clamp(dragStartX.current + gesture.dx / BOX_W, -MAX_OFFSET, MAX_OFFSET);
        const ny = clamp(dragStartY.current + gesture.dy / BOX_H, -MAX_OFFSET, MAX_OFFSET);
        offsetX.current = nx;
        offsetY.current = ny;
        pan.setValue({ x: nx * BOX_W, y: ny * BOX_H });
      },
    })
  ).current;

  function handleReset() {
    offsetX.current = 0;
    offsetY.current = 0;
    pan.setValue({ x: 0, y: 0 });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.title, { color: colors.text }]}>Position the photo</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>
            Drag to move it within the frame — this is exactly how it'll sit on the card.
          </Text>

          <View
            style={[
              styles.box,
              { width: BOX_W, height: BOX_H, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            <Animated.View
              style={[StyleSheet.absoluteFill, { transform: pan.getTranslateTransform() }]}
              {...panResponder.panHandlers}
            >
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Animated.View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={handleReset} style={[styles.sideBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={[styles.sideBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSave(offsetX.current, offsetY.current)}
              style={[styles.saveBtn, { backgroundColor: primaryColor }]}
            >
              <Text style={styles.saveText}>Save position</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 12.5, textAlign: 'center', marginTop: 4, marginBottom: 18, lineHeight: 17 },
  box: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  sideBtn: {
    flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center',
  },
  saveBtn: { flex: 1.4, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveText: { color: '#04150c', fontWeight: '800', fontSize: 13 },
});
