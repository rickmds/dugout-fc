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
  Image,
  Dimensions,
  StyleSheet,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_W    = Dimensions.get('window').width;
const CROP_PAD    = 32;
const CROP_SIZE   = SCREEN_W - CROP_PAD * 2;
const CONTAINER_H = SCREEN_W;
const TRACK_W     = SCREEN_W - 80;
const ZOOM_FACTOR = 3; // slider goes fillS/3 → fillS → fillS*3, starting at center

type Props = {
  visible: boolean;
  uri: string;
  onSave: (uri: string) => void;
  onCancel: () => void;
  primaryColor?: string;
};

export default function ImageEditor({
  visible, uri, onSave, onCancel, primaryColor = '#22C55E',
}: Props) {
  const insets = useSafeAreaInsets();

  const [processing, setProcessing] = useState(false);
  const [ready, setReady]           = useState(false);

  // Image dimensions as refs — always fresh inside closures
  const origW    = useRef(1);
  const origH    = useRef(1);
  const displayW = useRef(SCREEN_W);
  const displayH = useRef(SCREEN_W);
  const minScale = useRef(0.1);
  const maxScale = useRef(6);

  // Image pan/pinch state
  const currentScale = useRef(1);
  const currentTX    = useRef(0);
  const currentTY    = useRef(0);
  const lastTX       = useRef(0);
  const lastTY       = useRef(0);
  const initialDist  = useRef(0);
  const initialScale = useRef(1);
  const isPinching   = useRef(false);

  // Zoom slider state
  const sliderStartX = useRef(0);
  const sliderCurX   = useRef(0);

  const aScale  = useRef(new Animated.Value(1)).current;
  const aTX     = useRef(new Animated.Value(0)).current;
  const aTY     = useRef(new Animated.Value(0)).current;
  const aSlider = useRef(new Animated.Value(0)).current;

  const mounted     = useRef(false);
  const initialized = useRef(false); // guard against Image.getSize firing twice
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!visible || !uri) return;
    initialized.current = false; // allow re-init for this uri/visible combo
    setReady(false);
    setProcessing(false);

    Image.getSize(
      uri,
      (w, h) => {
        if (!mounted.current || initialized.current) return;
        initialized.current = true;
        origW.current = w;
        origH.current = h;

        const fitScale = Math.min(SCREEN_W / w, CONTAINER_H / h);
        displayW.current = w * fitScale;
        displayH.current = h * fitScale;

        const fillS  = Math.max(CROP_SIZE / displayW.current, CROP_SIZE / displayH.current);
        const startS = Math.max(1, fillS);
        // Symmetric log range: slider at 50% = startS, can zoom out 3× or in 3× from start
        minScale.current = startS / ZOOM_FACTOR;
        maxScale.current = startS * ZOOM_FACTOR;

        currentScale.current = startS;
        currentTX.current    = 0;
        currentTY.current    = 0;
        lastTX.current       = 0;
        lastTY.current       = 0;
        isPinching.current   = false;
        initialDist.current  = 0;

        // startS is exactly the log midpoint of [minScale, maxScale] → slider at 50%
        const sx = TRACK_W / 2;
        sliderCurX.current   = sx;
        sliderStartX.current = sx;

        aScale.setValue(startS);
        aTX.setValue(0);
        aTY.setValue(0);
        aSlider.setValue(sx);

        setReady(true);
      },
      () => {
        if (!mounted.current) return;
        Alert.alert('Error', 'Could not load image. Please try again.');
        onCancel();
      },
    );
  }, [uri, visible]);

  // ── Slider helper ────────────────────────────────────────────────────────
  function applySliderX(x: number) {
    const clamped = Math.max(0, Math.min(TRACK_W, x));
    const pct     = clamped / TRACK_W;
    // Log-linear so the midpoint (50%) always equals startS regardless of zoom range
    const logS = Math.log(minScale.current) + pct * (Math.log(maxScale.current) - Math.log(minScale.current));
    const s    = Math.exp(logS);
    currentScale.current = s;
    sliderCurX.current   = clamped;
    aScale.setValue(s);
    aSlider.setValue(clamped);
  }

  // ── Zoom slider PanResponder ─────────────────────────────────────────────
  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: (evt) => {
        // locationX is relative to sliderRow; subtract the − label width + gap (≈30px)
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

  // ── Image pan + pinch PanResponder ───────────────────────────────────────
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
          // Both fingers down at grant — init pinch immediately
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
          // Keep slider in sync with pinch (log-space inverse)
          const logRange = Math.log(maxScale.current) - Math.log(minScale.current);
          const pct = (Math.log(next) - Math.log(minScale.current)) / Math.max(0.0001, logRange);
          const sx  = pct * TRACK_W;
          sliderCurX.current = sx;
          aSlider.setValue(sx);
        } else {
          if (isPinching.current) {
            // Just switched back to single finger — re-anchor
            isPinching.current  = false;
            initialDist.current = 0;
            lastTX.current      = currentTX.current;
            lastTY.current      = currentTY.current;
            return;
          }
          const tx = lastTX.current + gs.dx;
          const ty = lastTY.current + gs.dy;
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

  // ── Save ─────────────────────────────────────────────────────────────────
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

      // Image and crop frame positions in screen coords
      const imgLeft  = (SCREEN_W    - scaledW) / 2 + tx;
      const imgTop   = (CONTAINER_H - scaledH) / 2 + ty;
      const cropLeft = (SCREEN_W    - CROP_SIZE) / 2;
      const cropTop  = (CONTAINER_H - CROP_SIZE) / 2;

      // Intersection of image with crop frame in screen coords
      const intLeft   = Math.max(imgLeft,           cropLeft);
      const intTop    = Math.max(imgTop,            cropTop);
      const intRight  = Math.min(imgLeft + scaledW, cropLeft + CROP_SIZE);
      const intBottom = Math.min(imgTop  + scaledH, cropTop  + CROP_SIZE);

      if (intRight <= intLeft || intBottom <= intTop) {
        Alert.alert('No image in crop area', 'Move the image into the crop frame and try again.');
        setProcessing(false);
        return;
      }

      // Convert intersection back to original image pixel coords
      const oX  = Math.round(Math.max(0, (intLeft   - imgLeft) * pxRatio));
      const oY  = Math.round(Math.max(0, (intTop    - imgTop)  * pxRatio));
      const cW  = Math.round(Math.max(1, Math.min((intRight  - intLeft)  * pxRatio, ow - oX)));
      const cH  = Math.round(Math.max(1, Math.min((intBottom - intTop)   * pxRatio, oh - oY)));
      const side = Math.max(1, Math.min(cW, cH));  // square — take smaller dimension

      const { uri: croppedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX: oX, originY: oY, width: side, height: side } },
          { resize: { width: 512 } },
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

  const cornerSize  = 20;
  const cornerThick = 3;
  const thumbSize   = 22;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.hBtn} disabled={processing}>
            <Text style={styles.hBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.hTitle}>Edit Photo</Text>
          {processing ? (
            <ActivityIndicator color="#fff" style={{ width: 64 }} />
          ) : (
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.hBtn, { alignItems: 'flex-end' }]}
              disabled={!ready}
            >
              <Text style={[styles.hBtnText, { color: primaryColor, fontWeight: '700', opacity: ready ? 1 : 0.35 }]}>
                Save
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Crop area */}
        <View style={styles.cropArea} {...imagePan.panHandlers}>
          {ready && (
            <Animated.Image
              source={{ uri }}
              style={[
                styles.image,
                { width: displayW.current, height: displayH.current },
                { transform: [{ scale: aScale }, { translateX: aTX }, { translateY: aTY }] },
              ]}
              resizeMode="contain"
            />
          )}

          {/* Dim overlay + corner marks */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.dim, { height: (CONTAINER_H - CROP_SIZE) / 2 }]} />
            <View style={{ flexDirection: 'row', height: CROP_SIZE }}>
              <View style={[styles.dim, { width: CROP_PAD }]} />
              <View style={{ width: CROP_SIZE }} />
              <View style={[styles.dim, { width: CROP_PAD }]} />
            </View>
            <View style={[styles.dim, { flex: 1 }]} />
            {[
              { top:    (CONTAINER_H - CROP_SIZE) / 2, left:  CROP_PAD },
              { top:    (CONTAINER_H - CROP_SIZE) / 2, right: CROP_PAD },
              { bottom: (CONTAINER_H - CROP_SIZE) / 2, left:  CROP_PAD },
              { bottom: (CONTAINER_H - CROP_SIZE) / 2, right: CROP_PAD },
            ].map((pos, i) => (
              <View key={i} style={[styles.corner, pos, {
                borderTopWidth:          i < 2  ? cornerThick : 0,
                borderBottomWidth:       i >= 2 ? cornerThick : 0,
                borderLeftWidth:         i % 2 === 0 ? cornerThick : 0,
                borderRightWidth:        i % 2 === 1 ? cornerThick : 0,
                borderTopLeftRadius:     i === 0 ? 4 : 0,
                borderTopRightRadius:    i === 1 ? 4 : 0,
                borderBottomLeftRadius:  i === 2 ? 4 : 0,
                borderBottomRightRadius: i === 3 ? 4 : 0,
                width: cornerSize,
                height: cornerSize,
              }]} />
            ))}
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Text style={styles.hint}>Drag image to reposition · Pinch or use slider to zoom</Text>

          {/* Zoom slider */}
          <View style={styles.sliderRow} {...sliderPan.panHandlers}>
            <Text style={styles.sliderLabel}>−</Text>
            <View style={styles.sliderTrack}>
              <View style={styles.sliderLine} />
              <Animated.View style={[styles.sliderThumb, { transform: [{ translateX: aSlider }] }]} />
            </View>
            <Text style={styles.sliderLabel}>+</Text>
          </View>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  hBtn:     { width: 64 },
  hBtnText: { color: '#fff', fontSize: 16 },
  hTitle:   { color: '#fff', fontSize: 17, fontWeight: '600' },
  cropArea: {
    width: SCREEN_W, height: CONTAINER_H,
    backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  image:  { position: 'absolute' },
  dim:    { backgroundColor: 'rgba(0,0,0,0.62)' },
  corner: { position: 'absolute', borderColor: '#fff' },
  controls: { flex: 1, paddingHorizontal: 24, paddingTop: 20, alignItems: 'center', gap: 20 },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center' },
  sliderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    width: SCREEN_W - 48, paddingVertical: 12,
  },
  sliderLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 20, fontWeight: '300', width: 20, textAlign: 'center' },
  sliderTrack: { flex: 1, height: 22, justifyContent: 'center' },
  sliderLine:  { height: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1, marginHorizontal: 11 },
  sliderThumb: {
    position: 'absolute', left: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#ffffff', shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 3,
  },
});
