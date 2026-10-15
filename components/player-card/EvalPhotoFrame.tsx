import { useState } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EVAL_PHOTO_ASPECT, EVAL_PHOTO_WIDTH_PCT } from './EvalPhotoEditor';

// The evaluation report's hero photo, shared by the coach's live preview
// (evaluation-form.tsx) and the player/parent view (evaluations/[evalId].tsx)
// so both stay pixel-identical. Most of these photos are transparent
// cutouts (the "Copy Subject" trick) and the coach may have zoomed out
// past "fully covers" in EvalPhotoEditor to add breathing room — neither
// is baked into the saved file, so this same backdrop + edge-fade
// treatment has to be reapplied live wherever the photo is shown. The
// web dashboard (EvaluationReport.tsx) and the PDF export reproduce this
// with CSS gradients instead, since they're not React Native.
type Props = {
  uri: string;
  /** Shown instead if `uri` fails to load — pass this ONLY in read-only
   * viewing contexts (player view, web dashboard, PDF), where a broken
   * saved photo degrading to the card photo is better than showing
   * nothing. Deliberately omitted from the coach's own editing preview —
   * masking a just-uploaded photo's load failure there would make a real
   * upload problem look like "nothing happened," instead of showing the
   * visible error below so the coach knows to retry. */
  fallbackUri?: string | null;
  primaryColor: string;
  style?: ViewStyle;
};

export default function EvalPhotoFrame({ uri, fallbackUri, primaryColor, style }: Props) {
  const [failed, setFailed] = useState(false);
  const [trackedUri, setTrackedUri] = useState(uri);
  if (uri !== trackedUri) {
    setTrackedUri(uri);
    setFailed(false);
  }
  const usingFallback = failed && !!fallbackUri && fallbackUri !== uri;
  const effectiveUri  = usingFallback ? (fallbackUri as string) : uri;
  const showError     = failed && !usingFallback;

  return (
    <View style={[{ width: EVAL_PHOTO_WIDTH_PCT, aspectRatio: EVAL_PHOTO_ASPECT, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[`${primaryColor}1a`, '#ffffff']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={{ uri: effectiveUri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        onError={() => setFailed(true)}
      />
      {showError && (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 8 }]}>
          <Ionicons name="image-outline" size={18} color="#94a3b8" />
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
            Couldn't load photo
          </Text>
        </View>
      )}
      <LinearGradient
        colors={['#ffffff', '#ffffff00']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%' }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['#ffffff00', '#ffffff']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%' }}
        pointerEvents="none"
      />
    </View>
  );
}
