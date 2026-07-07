import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DUGOUT_COLORS } from '../../constants/colors';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function PrimaryButton({
  title,
  onPress,
  variant = 'solid',
  loading = false,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const isOutline = variant === 'outline';
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 4 }).start();
  }

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
    >
      <Animated.View
        style={[
          styles.button,
          isOutline ? styles.outline : styles.solid,
          isDisabled && styles.disabled,
          { transform: [{ scale }] },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isOutline ? DUGOUT_COLORS.brand.green : DUGOUT_COLORS.brand.black} />
        ) : (
          <Text style={[styles.text, isOutline ? styles.outlineText : styles.solidText]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solid: {
    backgroundColor: DUGOUT_COLORS.brand.green,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: DUGOUT_COLORS.brand.green,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
  solidText: {
    color: DUGOUT_COLORS.brand.black,
  },
  outlineText: {
    color: DUGOUT_COLORS.brand.green,
  },
});
