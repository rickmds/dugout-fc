import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        isOutline ? styles.outline : styles.solid,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? DUGOUT_COLORS.brand.green : DUGOUT_COLORS.brand.black} />
      ) : (
        <Text style={[styles.text, isOutline ? styles.outlineText : styles.solidText]}>{title}</Text>
      )}
    </TouchableOpacity>
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
