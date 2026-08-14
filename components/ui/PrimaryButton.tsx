import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PULSE_COLORS } from '../../constants/colors';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the default Pulse green — e.g. a club's brand color. */
  color?: string;
  /** Text color to pair with a custom `color` (solid variant only). Defaults to black. */
  textColor?: string;
}

export default function PrimaryButton({
  title,
  onPress,
  variant = 'solid',
  loading = false,
  disabled = false,
  style,
  color,
  textColor,
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
          isOutline && color ? { borderColor: color } : null,
          !isOutline && color ? { backgroundColor: color } : null,
          isDisabled && styles.disabled,
          { transform: [{ scale }] },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isOutline ? (color ?? PULSE_COLORS.brand.green) : (textColor ?? PULSE_COLORS.brand.black)} />
        ) : (
          <Text
            style={[
              styles.text,
              isOutline ? styles.outlineText : styles.solidText,
              isOutline && color ? { color } : null,
              !isOutline && textColor ? { color: textColor } : null,
            ]}
          >
            {title}
          </Text>
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
    backgroundColor: PULSE_COLORS.brand.green,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: PULSE_COLORS.brand.green,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
  solidText: {
    color: PULSE_COLORS.brand.black,
  },
  outlineText: {
    color: PULSE_COLORS.brand.green,
  },
});
