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
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../constants/colors';

// Pinch/pan/zoom, adapted from components/ui/ImageEditor.tsx (same
// PanResponder approach, no gesture library). Two real differences from
// that generic square-avatar cropper:
//
// 1. The crop frame is the evaluation report's actual tall/narrow hero
//    photo box (EVAL_PHOTO_ASPECT), not a square — and it's drawn at the
//    SAME proportions the hero will actually render it at (scaled to fit
//    the screen), with the player's real name/pills next to it, so the
//    coach is positioning the photo in the report's real context ("see the
//    template behind the image") rather than an isolated square.
// 2. Saving captures the rendered stage (via react-native-view-shot, the
//    same library the Player Card's "Download card" already uses) instead
//    of computing a pixel crop with expo-image-manipulator. That matters
//    because most of these photos are transparent-background cutouts (the
//    "Copy Subject" trick, same convention as the Player Card photo) —
//    zooming OUT past "fully covers" is allowed here (unlike the square
//    avatar case) so the coach can add breathing room around the subject,
//    and a manipulator crop can't pad a canvas beyond the source image's
//    own pixels the way capturing a rendered view can.
export const EVAL_PHOTO_ASPECT = 0.48; // width / height — must match the hero's real photo box everywhere it renders
export const EVAL_PHOTO_WIDTH_PCT = '36%';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const ZOOM_OUT_FACTOR = 0.65; // slider/pinch can go this far below "fully covers" (adds breathing room around the subject)
const ZOOM_IN_FACTOR  = 3;    // ...and this far above it
const MOCKUP_SIDE_PAD = 24;
// Vertical budget left for the box after the header, name/pills column's
// own minimum, the zoom slider, and safe-area insets — tuned so the whole
// editor fits without scrolling on a compact phone.
const VERTICAL_BUDGET = SCREEN_H - 300;

// The photo column is a fixed 36% of the mockup card's own width, so the
// mockup itself — not just the photo column — has to fit on screen. Bound
// PHOTO_COL_W by BOTH: what 36% of a screen-width mockup allows, and what
// the vertical budget allows: the smaller of the two wins.
const MAX_MOCKUP_W = SCREEN_W - MOCKUP_SIDE_PAD * 2;
const MAX_PHOTO_COL_W_FROM_WIDTH  = MAX_MOCKUP_W * 0.36;
const MAX_PHOTO_COL_W_FROM_HEIGHT = VERTICAL_BUDGET * EVAL_PHOTO_ASPECT;
const PHOTO_COL_W = Math.max(90, Math.min(MAX_PHOTO_COL_W_FROM_WIDTH, MAX_PHOTO_COL_W_FROM_HEIGHT));
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
  const shotRef = useRef<ViewShotRef>(null);

  const [processing, setProcessing] = useState(false);
  const [ready, setReady]           = useState(false);

  const displayW = useRef(PHOTO_COL_W);
  const displayH = useRef(PHOTO_COL_H);
  const minScale = useRef(1);
  const maxScale = useRef(ZOOM_IN_FACTOR);

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

        const fitScale = Math.min(PHOTO_COL_W / w, PHOTO_COL_H / h);
        displayW.current = w * fitScale;
        displayH.current = h * fitScale;

        const fillS = Math.max(PHOTO_COL_W / displayW.current, PHOTO_COL_H / displayH.current);
        const startS = Math.max(1, fillS);
        minScale.current = startS * ZOOM_OUT_FACTOR;
        maxScale.current = startS * ZOOM_IN_FACTOR;

        currentScale.current = startS;
        currentTX.current    = 0;
        currentTY.current    = 0;
        lastTX.current       = 0;
        lastTY.current       = 0;
        isPinching.current   = false;
        initialDist.current  = 0;

        // Slider starts wherever startS actually lands in the (now
        // asymmetric) [min, max] range, not at the 0% floor.
        const logMin  = Math.log(minScale.current);
        const logMax  = Math.log(maxScale.current);
        const initPct = (Math.log(startS) - logMin) / (logMax - logMin);
        const initX   = initPct * TRACK_W;
        sliderCurX.current   = initX;
        sliderStartX.current = initX;

        aScale.setValue(startS);
        aTX.setValue(0);
        aTY.setValue(0);
        aSlider.setValue(initX);

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
          // Clamped to half the overflow in each axis — when the (now
          // possibly zoomed-out-past-cover) image is smaller than the box
          // in an axis, that clamp is 0, which keeps it centered there
          // instead of letting it be dragged out of frame.
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
    if (!ready || !shotRef.current) return;
    setProcessing(true);
    try {
      const capturedUri = await shotRef.current.capture();
      onSave(capturedUri);
    } catch {
      if (mounted.current) {
        Alert.alert('Error', 'Could not process image. Please try again.');
        setProcessing(false);
      }
    }
  }, [onSave, ready]);

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

              <View style={[styles.stage, { width: PHOTO_COL_W, height: PHOTO_COL_H }]} {...imagePan.panHandlers}>
                {/* Backdrop — lives behind the captured layer so a
                    transparent cutout (or breathing room from zooming
                    out) sits on a soft tint instead of raw transparency.
                    Not part of the capture — reapplied live at every
                    surface that displays the saved photo. */}
                <LinearGradient
                  colors={[`${primaryColor}1a`, '#ffffff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                <ViewShot ref={shotRef} style={[StyleSheet.absoluteFill, styles.shotClip]} options={{ format: 'png', quality: 1 }}>
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
                </ViewShot>

                {/* Live-only edge fades so the box doesn't read as a hard
                    rectangle pasted next to the name — reapplied live at
                    display time too, not baked into the saved file. */}
                <LinearGradient
                  colors={['#ffffff', '#ffffff00']}
                  start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: PHOTO_COL_W * 0.3 }}
                  pointerEvents="none"
                />
                <LinearGradient
                  colors={['#ffffff00', '#ffffff']}
                  start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: PHOTO_COL_H * 0.3 }}
                  pointerEvents="none"
                />
              </View>
            </View>
          </View>

          <Text style={[styles.hint, { color: colors.muted }]}>
            Drag to reposition · pinch or use the slider to zoom in or out
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
  shotClip: { overflow: 'hidden' },

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
