import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
  primaryColor: string;
  style?: ViewStyle;
};

export default function EvalPhotoFrame({ uri, primaryColor, style }: Props) {
  return (
    <View style={[{ width: EVAL_PHOTO_WIDTH_PCT, aspectRatio: EVAL_PHOTO_ASPECT, overflow: 'hidden' }, style]}>
      <LinearGradient
        colors={[`${primaryColor}1a`, '#ffffff']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
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
