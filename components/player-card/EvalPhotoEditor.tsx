import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  StyleSheet,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/colors';

// Pinch/pan/zoom-to-crop, adapted from components/ui/ImageEditor.tsx (same
// PanResponder approach, no gesture library). Two real differences from
// that generic square-avatar cropper:
//
// 1. The crop frame is the evaluation report's actual tall/narrow hero
//    photo box (EVAL_PHOTO_ASPECT), not a square — and it's drawn at the
//    SAME proportions the hero will actually render it at (scaled to fit
//    the screen), with the player's real name/pills next to it, so the
//    coach is positioning the photo in the report's real context ("see the
//    template behind the image") rather than an isolated square.
// 2. minScale is clamped to the box's own "cover" scale (never lower) —
//    unlike ImageEditor, which allows zooming out past cover and can leave
//    visible gaps around a square avatar. A gap here would show up as a
//    blank seam right next to the player's name, so it's disallowed by
//    construction instead of being left as a thing the coach has to avoid.
export const EVAL_PHOTO_ASPECT = 0.48; // width / height — must match the hero's real photo box everywhere it renders
export const EVAL_PHOTO_WIDTH_PCT = '36%';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const ZOOM_FACTOR = 3; // slider/pinch goes from "fully covers" (0%) to 3x that (100%)
const MOCKUP_SIDE_PAD = 24;
// Vertical budget left for the box after the header, name/pills column's
// own minimum, the zoom slider, and safe-area insets — tuned so the whole
// editor fits without scrolling on a compact phone.
const VERTICAL_BUDGET = SCREEN_H - 300;

const MAX_PHOTO_COL_W = SCREEN_W - MOCKUP_SIDE_PAD * 2;
const MAX_PHOTO_COL_W_FROM_HEIGHT = VERTICAL_BUDGET * EVAL_PHOTO_ASPECT;
const PHOTO_COL_W = Math.max(110, Math.min(MAX_PHOTO_COL_W, MAX_PHOTO_COL_W_FROM_HEIGHT));
const PHOTO_COL_H = PHOTO_COL_W / EVAL_PHOTO_ASPECT;
const MOCKUP_W = PHOTO_COL_W / 0.36; // the hero's photo column is 36% of the card's width

const TRACK_W = Math.min(SCREEN_W - 80, MOCKUP_W);

type Props = {
  visible: boolean;
  uri: string;
  playerName: string;
  position?: string | null;
  jerseyNumber?: number | null;
  primaryColor: string;
  colors: ThemeColors;
  onSave: (croppedUri: string) => void;
  onCancel: () => void;
};

export default function EvalPhotoEditor({
  visible, uri, playerName, position, jerseyNumber, primaryColor, colors, onSave, onCancel,
}: Props) {
  const insets = useSafeAreaInsets();

  const [processing, setProcessing] = useState(false);
  const [ready, setReady]           = useState(false);

  const origW    = useRef(1);
  const origH    = useRef(1);
  const displayW = useRef(PHOTO_COL_W);
  const displayH = useRef(PHOTO_COL_H);
  const minScale = useRef(1);
  const maxScale = useRef(ZOOM_FACTOR);

  const currentScale = useRef(1);
  const currentTX    = useRef(0);
  const currentTY    = useRef(0);
  const lastTX       = useRef(0);
  const lastTY       = useRef(0);
  const initialDist  = useRef(0);
  const initialScale = useRef(1);
  const isPinching   = useRef(false);

  const sliderStartX = useRef(0);
  const sliderCurX   = useRef(0);

  const aScale  = useRef(new Animated.Value(1)).current;
  const aTX     = useRef(new Animated.Value(0)).current;
  const aTY     = useRef(new Animated.Value(0)).current;
  const aSlider = useRef(new Animated.Value(0)).current;

  const mounted     = useRef(false);
  const initialized = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!visible || !uri) return;
    initialized.current = false;
    setReady(false);
    setProcessing(false);

    Image.getSize(
      uri,
      (w, h) => {
        if (!mounted.current || initialized.current) return;
        initialized.current = true;
        origW.current = w;
        origH.current = h;

        const fitScale = Math.min(PHOTO_COL_W / w, PHOTO_COL_H / h);
        displayW.current = w * fitScale;
        displayH.current = h * fitScale;

        const fillS = Math.max(PHOTO_COL_W / displayW.current, PHOTO_COL_H / displayH.current);
        const startS = Math.max(1, fillS);
        // Never allow zooming below "fully covers the box" — a square
        // avatar can get away with gaps around it; a blank seam next to
        // the player's name can't.
        minScale.current = startS;
        maxScale.current = startS * ZOOM_FACTOR;

        currentScale.current = startS;
        currentTX.current    = 0;
        currentTY.current    = 0;
        lastTX.current       = 0;
        lastTY.current       = 0;
        isPinching.current   = false;
        initialDist.current  = 0;

        sliderCurX.current   = 0;
        sliderStartX.current = 0;

        aScale.setValue(startS);
        aTX.setValue(0);
        aTY.setValue(0);
        aSlider.setValue(0);

        setReady(true);
      },
      () => {
        if (!mounted.current) return;
        Alert.alert('Error', 'Could not load image. Please try again.');
        onCancel();
      },
    );
  }, [uri, visible]);

  function applySliderX(x: number) {
    const clamped = Math.max(0, Math.min(TRACK_W, x));
    const pct     = clamped / TRACK_W;
    const logS = Math.log(minScale.current) + pct * (Math.log(maxScale.current) - Math.log(minScale.current));
    const s    = Math.exp(logS);
    currentScale.current = s;
    sliderCurX.current   = clamped;
    aScale.setValue(s);
    aSlider.setValue(clamped);
  }

  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (evt) => {
        const LABEL_OFFSET = 30;
        const tapX = evt.nativeEvent.locationX - LABEL_OFFSET;
        sliderStartX.current = Math.max(0, Math.min(TRACK_W, tapX));
        applySliderX(sliderStartX.current);
      },
      onPanResponderMove: (_, gs) => {
        applySliderX(sliderStartX.current + gs.dx);
      },
      onPanResponderRelease: () => {
        sliderStartX.current = sliderCurX.current;
      },
      onPanResponderTerminate: () => {
        sliderStartX.current = sliderCurX.current;
      },
    })
  ).current;

  const imagePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder:         () => true,
      onPanResponderTerminationRequest:      () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        lastTX.current = currentTX.current;
        lastTY.current = currentTY.current;

        if (touches.length >= 2) {
          const dist = Math.hypot(
            touches[1].pageX - touches[0].pageX,
            touches[1].pageY - touches[0].pageY,
          );
          initialDist.current  = dist;
          initialScale.current = currentScale.current;
          isPinching.current   = true;
        } else {
          initialDist.current = 0;
          isPinching.current  = false;
        }
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          isPinching.current = true;
          const dist = Math.hypot(
            touches[1].pageX - touches[0].pageX,
            touches[1].pageY - touches[0].pageY,
          );
          if (initialDist.current === 0) {
            initialDist.current  = dist;
            initialScale.current = currentScale.current;
          }
          const next = Math.max(minScale.current, Math.min(maxScale.current,
            initialScale.current * (dist / initialDist.current),
          ));
          currentScale.current = next;
          aScale.setValue(next);
          const logRange = Math.log(maxScale.current) - Math.log(minScale.current);
          const pct = (Math.log(next) - Math.log(minScale.current)) / Math.max(0.0001, logRange);
          const sx  = pct * TRACK_W;
          sliderCurX.current = sx;
          aSlider.setValue(sx);
        } else {
          if (isPinching.current) {
            isPinching.current  = false;
            initialDist.current = 0;
            lastTX.current      = currentTX.current;
            lastTY.current      = currentTY.current;
            return;
          }
          // Clamp pan so the (always-covering) image can never reveal a
          // gap at the box's edges.
          const s  = currentScale.current;
          const sw = displayW.current * s;
          const sh = displayH.current * s;
          const maxTX = Math.max(0, (sw - PHOTO_COL_W) / 2);
          const maxTY = Math.max(0, (sh - PHOTO_COL_H) / 2);
          const tx = Math.max(-maxTX, Math.min(maxTX, lastTX.current + gs.dx));
          const ty = Math.max(-maxTY, Math.min(maxTY, lastTY.current + gs.dy));
          currentTX.current = tx;
          currentTY.current = ty;
          aTX.setValue(tx);
          aTY.setValue(ty);
        }
      },

      onPanResponderRelease: () => {
        lastTX.current      = currentTX.current;
        lastTY.current      = currentTY.current;
        initialDist.current = 0;
        isPinching.current  = false;
        sliderStartX.current = sliderCurX.current;
      },

      onPanResponderTerminate: () => {
        lastTX.current      = currentTX.current;
        lastTY.current      = currentTY.current;
        initialDist.current = 0;
        isPinching.current  = false;
      },
    })
  ).current;

  const handleSave = useCallback(async () => {
    const ow = origW.current;
    const oh = origH.current;
    const dw = displayW.current;
    const dh = displayH.current;
    if (!ow || !oh || !dw || !dh) return;

    setProcessing(true);
    try {
      const s  = currentScale.current;
      const tx = currentTX.current;
      const ty = currentTY.current;

      const scaledW = dw * s;
      const scaledH = dh * s;
      const pxRatio = ow / scaledW;

      const imgLeft = (PHOTO_COL_W - scaledW) / 2 + tx;
      const imgTop  = (PHOTO_COL_H - scaledH) / 2 + ty;

      const intLeft   = Math.max(imgLeft, 0);
      const intTop    = Math.max(imgTop, 0);
      const intRight  = Math.min(imgLeft + scaledW, PHOTO_COL_W);
      const intBottom = Math.min(imgTop  + scaledH, PHOTO_COL_H);

      if (intRight <= intLeft || intBottom <= intTop) {
        Alert.alert('No image in frame', 'Move the image into the frame and try again.');
        setProcessing(false);
        return;
      }

      const oX = Math.round(Math.max(0, (intLeft - imgLeft) * pxRatio));
      const oY = Math.round(Math.max(0, (intTop  - imgTop)  * pxRatio));
      const cW = Math.round(Math.max(1, Math.min((intRight  - intLeft)  * pxRatio, ow - oX)));
      const cH = Math.round(Math.max(1, Math.min((intBottom - intTop)   * pxRatio, oh - oY)));

      const { uri: croppedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX: oX, originY: oY, width: cW, height: cH } },
          { resize: { width: 480 } },
        ],
        { format: ImageManipulator.SaveFormat.PNG, compress: 1 },
      );

      onSave(croppedUri);
    } catch {
      if (mounted.current) {
        Alert.alert('Error', 'Could not process image. Please try again.');
        setProcessing(false);
      }
    }
  }, [uri, onSave]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onCancel} style={styles.hBtn} disabled={processing}>
            <Text style={[styles.hBtnText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.hTitle, { color: colors.text }]}>Position Photo</Text>
          {processing ? (
            <ActivityIndicator color={colors.text} style={{ width: 64 }} />
          ) : (
            <TouchableOpacity onPress={handleSave} style={[styles.hBtn, { alignItems: 'flex-end' }]} disabled={!ready}>
              <Text style={[styles.hBtnText, { color: primaryColor, fontWeight: '700', opacity: ready ? 1 : 0.35 }]}>Save</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.body}>
          {/* The real hero band + name/pills, at the report's real
              proportions — so the crop frame to its right is being
              positioned in its actual context, not a blank void. */}
          <View style={{ width: MOCKUP_W }}>
            <View style={[styles.mockBand, { backgroundColor: primaryColor }]}>
              <Text style={styles.mockBandText}>PLAYER DEVELOPMENT REPORT</Text>
            </View>
            <View style={styles.mockHero}>
              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <Text style={[styles.mockName, { color: colors.text }]} numberOfLines={1}>{playerName}</Text>
                <View style={styles.mockPillRow}>
                  {!!position && (
                    <View style={[styles.mockPill, { backgroundColor: `${primaryColor}18`, borderColor: `${primaryColor}30` }]}>
                      <Text style={[styles.mockPillText, { color: primaryColor }]}>{position}</Text>
                    </View>
                  )}
                  {jerseyNumber != null && (
                    <View style={[styles.mockPill, { backgroundColor: colors.border, borderColor: colors.border }]}>
                      <Text style={[styles.mockPillText, { color: colors.textSecondary }]}>#{jerseyNumber}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={[styles.stage, { width: PHOTO_COL_W, height: PHOTO_COL_H, backgroundColor: colors.border }]} {...imagePan.panHandlers}>
                {ready && (
                  <Animated.Image
                    source={{ uri }}
                    style={[
                      { position: 'absolute', width: displayW.current, height: displayH.current, left: PHOTO_COL_W / 2, top: PHOTO_COL_H / 2, marginLeft: -displayW.current / 2, marginTop: -displayH.current / 2 },
                      { transform: [{ scale: aScale }, { translateX: aTX }, { translateY: aTY }] },
                    ]}
                    resizeMode="cover"
                  />
                )}
              </View>
            </View>
          </View>

          <Text style={[styles.hint, { color: colors.muted }]}>
            Drag to reposition · pinch or use the slider to zoom
          </Text>

          <View style={styles.sliderRow} {...sliderPan.panHandlers}>
            <Text style={[styles.sliderLabel, { color: colors.muted }]}>−</Text>
            <View style={[styles.sliderTrack, { width: TRACK_W }]}>
              <View style={[styles.sliderLine, { backgroundColor: colors.border }]} />
              <Animated.View style={[styles.sliderThumb, { backgroundColor: primaryColor, transform: [{ translateX: aSlider }] }]} />
            </View>
            <Text style={[styles.sliderLabel, { color: colors.muted }]}>+</Text>
          </View>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hBtn:     { width: 64 },
  hBtnText: { fontSize: 16 },
  hTitle:   { fontSize: 17, fontWeight: '600' },

  body: { flex: 1, alignItems: 'center', paddingTop: 28, gap: 20 },

  mockBand: { paddingHorizontal: 14, paddingVertical: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  mockBandText: { fontSize: 8, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.5 },
  mockHero: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: 14, gap: 10 },
  mockName: { fontSize: 19, fontWeight: '900', marginBottom: 6 },
  mockPillRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mockPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 14, borderWidth: 1 },
  mockPillText: { fontSize: 10, fontWeight: '700' },

  stage: { overflow: 'hidden' },

  hint: { fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sliderLabel: { fontSize: 20, fontWeight: '300', width: 20, textAlign: 'center' },
  sliderTrack: { height: 22, justifyContent: 'center' },
  sliderLine:  { height: 2, borderRadius: 1, marginHorizontal: 11 },
  sliderThumb: {
    position: 'absolute', left: 0, width: 22, height: 22, borderRadius: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 3,
  },
});
