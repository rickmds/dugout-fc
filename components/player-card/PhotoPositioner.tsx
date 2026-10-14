import { useRef, useState } from 'react';
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
//
// Two distinct modes, not one generic one, because they solve different
// problems: "contain" (the Player Card) never crops — it just lets a
// tall/narrow cutout be dragged partly out of frame on purpose, so the
// drag is a raw pixel translate of the whole (uncropped) image. "cover"
// (the evaluation report's big hero photo) always fills its box and always
// crops — there the drag has to mean "which part of the crop is visible,"
// which is exactly what contentPosition (RN's equivalent of CSS
// object-position) is for. Reusing one offset model for both would mean
// either the card loses its intentional out-of-frame crop, or the report
// photo gets letterboxed instead of filling the space.

const BOX_W = 260;
const CONTAIN_ASPECT = 0.92; // must match PlayerCard's photo-slot aspect ratio
// How far (as a fraction of the box's own size) a drag can push the image
// in "contain" mode — generous enough to let a tall/narrow cutout (e.g. a
// full-body photo) be pushed mostly out of frame on purpose, cropping down
// to just the top half.
const CONTAIN_MAX_OFFSET = 0.6;

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
  /** 'contain' (default) = Player Card behavior, never crops. 'cover' =
   * always fills the box and crops, dragged via contentPosition. */
  mode?: 'contain' | 'cover';
  /** Box aspect ratio (width / height) the frame is drawn at — must match
   * whatever the photo actually renders inside, or the preview lies. */
  aspectRatio?: number;
  title?: string;
  subtitle?: string;
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
  mode = 'contain',
  aspectRatio = CONTAIN_ASPECT,
  title = 'Position the photo',
  subtitle = "Drag to move it within the frame — this is exactly how it'll sit on the card.",
}: Props) {
  const insets = useSafeAreaInsets();
  const BOX_H = BOX_W / aspectRatio;
  const isCover = mode === 'cover';
  const maxOffset = isCover ? 1 : CONTAIN_MAX_OFFSET;
  const offsetX = useRef(initialOffsetX);
  const offsetY = useRef(initialOffsetY);
  const dragStartX = useRef(initialOffsetX);
  const dragStartY = useRef(initialOffsetY);
  // Only used in "contain" mode (raw pixel translate of the Image).
  const pan = useRef(
    new Animated.ValueXY({ x: initialOffsetX * BOX_W, y: initialOffsetY * BOX_H })
  ).current;
  // Only used in "cover" mode (re-rendered as a contentPosition percentage
  // on every move — can't be an Animated transform since it changes which
  // pixels are drawn, not just where the view sits).
  const [coverOffset, setCoverOffset] = useState({ x: initialOffsetX, y: initialOffsetY });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragStartX.current = offsetX.current;
        dragStartY.current = offsetY.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        if (isCover) {
          // Inverted sign vs. "contain": dragging the photo right should
          // reveal more of its own left side, which means moving the
          // object-position anchor LEFT (toward 0%), not right.
          const nx = clamp(dragStartX.current - gesture.dx / BOX_W, -maxOffset, maxOffset);
          const ny = clamp(dragStartY.current - gesture.dy / BOX_H, -maxOffset, maxOffset);
          offsetX.current = nx;
          offsetY.current = ny;
          setCoverOffset({ x: nx, y: ny });
        } else {
          const nx = clamp(dragStartX.current + gesture.dx / BOX_W, -maxOffset, maxOffset);
          const ny = clamp(dragStartY.current + gesture.dy / BOX_H, -maxOffset, maxOffset);
          offsetX.current = nx;
          offsetY.current = ny;
          pan.setValue({ x: nx * BOX_W, y: ny * BOX_H });
        }
      },
    })
  ).current;

  function handleReset() {
    offsetX.current = 0;
    offsetY.current = 0;
    pan.setValue({ x: 0, y: 0 });
    setCoverOffset({ x: 0, y: 0 });
  }

  const contentPosition = { left: `${50 + coverOffset.x * 50}%`, top: `${50 + coverOffset.y * 50}%` } as const;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>{subtitle}</Text>

          <View
            style={[
              styles.box,
              { width: BOX_W, height: BOX_H, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            {isCover ? (
              <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={contentPosition} />
              </View>
            ) : (
              <Animated.View
                style={[StyleSheet.absoluteFill, { transform: pan.getTranslateTransform() }]}
                {...panResponder.panHandlers}
              >
                <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
              </Animated.View>
            )}
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
