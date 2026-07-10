import { useRef, useState, useEffect } from 'react';
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

const SCREEN_W = Dimensions.get('window').width;
const CROP_PAD = 32;
const CROP_SIZE = SCREEN_W - CROP_PAD * 2;
const CONTAINER_H = SCREEN_W;

type Props = {
  visible: boolean;
  uri: string;
  onSave: (uri: string) => void;
  onCancel: () => void;
  primaryColor?: string;
};

export default function ImageEditor({
  visible,
  uri,
  onSave,
  onCancel,
  primaryColor = '#22C55E',
}: Props) {
  const insets = useSafeAreaInsets();

  const [origW, setOrigW] = useState(1);
  const [origH, setOrigH] = useState(1);
  const [displayW, setDisplayW] = useState(SCREEN_W);
  const [displayH, setDisplayH] = useState(SCREEN_W);
  const [processing, setProcessing] = useState(false);

  const currentScale = useRef(1);
  const currentTX = useRef(0);
  const currentTY = useRef(0);
  const lastTX = useRef(0);
  const lastTY = useRef(0);
  const initialDist = useRef(0);
  const initialScale = useRef(1);

  const aScale = useRef(new Animated.Value(1)).current;
  const aTX = useRef(new Animated.Value(0)).current;
  const aTY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !uri) return;
    setProcessing(false);

    Image.getSize(uri, (w, h) => {
      setOrigW(w);
      setOrigH(h);

      const fitScale = Math.min(SCREEN_W / w, CONTAINER_H / h);
      const dW = w * fitScale;
      const dH = h * fitScale;
      setDisplayW(dW);
      setDisplayH(dH);

      const fillS = Math.max(CROP_SIZE / dW, CROP_SIZE / dH);
      const startS = Math.max(1, fillS);
      currentScale.current = startS;
      currentTX.current = 0;
      currentTY.current = 0;
      lastTX.current = 0;
      lastTY.current = 0;
      aScale.setValue(startS);
      aTX.setValue(0);
      aTY.setValue(0);
    });
  }, [uri, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        lastTX.current = currentTX.current;
        lastTY.current = currentTY.current;
        initialDist.current = 0;
      },
      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = Math.hypot(
            touches[1].pageX - touches[0].pageX,
            touches[1].pageY - touches[0].pageY
          );
          if (initialDist.current === 0) {
            initialDist.current = dist;
            initialScale.current = currentScale.current;
          } else {
            const s = Math.max(0.5, Math.min(8, initialScale.current * (dist / initialDist.current)));
            currentScale.current = s;
            aScale.setValue(s);
          }
        } else {
          if (initialDist.current !== 0) {
            initialDist.current = 0;
            lastTX.current = currentTX.current;
            lastTY.current = currentTY.current;
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
        lastTX.current = currentTX.current;
        lastTY.current = currentTY.current;
        initialDist.current = 0;
      },
      onPanResponderTerminate: () => {
        lastTX.current = currentTX.current;
        lastTY.current = currentTY.current;
        initialDist.current = 0;
      },
    })
  ).current;

  async function handleSave() {
    if (!origW || !origH) return;
    setProcessing(true);
    try {
      const s = currentScale.current;
      const tx = currentTX.current;
      const ty = currentTY.current;

      const scaledW = displayW * s;
      const scaledH = displayH * s;
      const imgLeft = (SCREEN_W - scaledW) / 2 + tx;
      const imgTop = (CONTAINER_H - scaledH) / 2 + ty;
      const cropLeft = (SCREEN_W - CROP_SIZE) / 2;
      const cropTop = (CONTAINER_H - CROP_SIZE) / 2;

      const pxX = origW / scaledW;
      const pxY = origH / scaledH;

      let oX = Math.max(0, (cropLeft - imgLeft) * pxX);
      let oY = Math.max(0, (cropTop - imgTop) * pxY);
      let cW = Math.min(origW - oX, CROP_SIZE * pxX);
      let cH = Math.min(origH - oY, CROP_SIZE * pxY);

      oX = Math.round(Math.max(0, Math.min(origW - 1, oX)));
      oY = Math.round(Math.max(0, Math.min(origH - 1, oY)));
      cW = Math.round(Math.max(1, Math.min(origW - oX, cW)));
      cH = Math.round(Math.max(1, Math.min(origH - oY, cH)));

      const { uri: croppedUri } = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX: oX, originY: oY, width: cW, height: cH } },
          { resize: { width: 500, height: 500 } },
        ],
        { format: ImageManipulator.SaveFormat.PNG, compress: 1 }
      );

      onSave(croppedUri);
    } catch (e) {
      Alert.alert('Error', String(e));
      setProcessing(false);
    }
  }

  const cornerSize = 20;
  const cornerThick = 3;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.hBtn} disabled={processing}>
            <Text style={styles.hBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.hTitle}>Edit Photo</Text>
          {processing ? (
            <ActivityIndicator color="#fff" style={{ width: 64 }} />
          ) : (
            <TouchableOpacity onPress={handleSave} style={[styles.hBtn, { alignItems: 'flex-end' }]}>
              <Text style={[styles.hBtnText, { color: primaryColor, fontWeight: '700' }]}>Save</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.cropArea} {...panResponder.panHandlers}>
          <Animated.Image
            source={{ uri }}
            style={[
              styles.image,
              { width: displayW, height: displayH },
              { transform: [{ scale: aScale }, { translateX: aTX }, { translateY: aTY }] },
            ]}
            resizeMode="contain"
          />

          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.dim, { height: (CONTAINER_H - CROP_SIZE) / 2 }]} />
            <View style={{ flexDirection: 'row', height: CROP_SIZE }}>
              <View style={[styles.dim, { width: CROP_PAD }]} />
              <View style={{ width: CROP_SIZE }} />
              <View style={[styles.dim, { width: CROP_PAD }]} />
            </View>
            <View style={[styles.dim, { flex: 1 }]} />

            {[
              { top: (CONTAINER_H - CROP_SIZE) / 2, left: CROP_PAD },
              { top: (CONTAINER_H - CROP_SIZE) / 2, right: CROP_PAD },
              { bottom: (CONTAINER_H - CROP_SIZE) / 2, left: CROP_PAD },
              { bottom: (CONTAINER_H - CROP_SIZE) / 2, right: CROP_PAD },
            ].map((pos, i) => (
              <View key={i} style={[styles.corner, pos, {
                borderTopWidth:    i < 2 ? cornerThick : 0,
                borderBottomWidth: i >= 2 ? cornerThick : 0,
                borderLeftWidth:   i % 2 === 0 ? cornerThick : 0,
                borderRightWidth:  i % 2 === 1 ? cornerThick : 0,
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

        <View style={styles.controls}>
          <Text style={styles.hint}>Pinch to zoom · Drag to reposition</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  hBtn: { width: 64 },
  hBtnText: { color: '#fff', fontSize: 16 },
  hTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cropArea: {
    width: SCREEN_W,
    height: CONTAINER_H,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { position: 'absolute' },
  dim: { backgroundColor: 'rgba(0,0,0,0.62)' },
  corner: { position: 'absolute', borderColor: '#fff' },
  controls: { flex: 1, paddingHorizontal: 24, paddingTop: 22 },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
  },
});
