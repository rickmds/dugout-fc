import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { DUGOUT_COLORS } from '../../constants/colors';

interface AuthInputProps extends TextInputProps {
  label: string;
  secureToggle?: boolean;
}

export default function AuthInput({ label, secureToggle, secureTextEntry, ...rest }: AuthInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const isSecure = secureToggle ? !visible : secureTextEntry;

  const focusAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [focused]);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [DUGOUT_COLORS.ui.border, 'rgba(34,197,94,0.6)'],
  });

  const backgroundColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [DUGOUT_COLORS.ui.surface, 'rgba(34,197,94,0.04)'],
  });

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Animated.View style={[styles.inputRow, { borderColor, backgroundColor }]}>
        <TextInput
          style={styles.input}
          placeholderTextColor={DUGOUT_COLORS.ui.muted}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {secureToggle && (
          <TouchableOpacity onPress={() => setVisible((v) => !v)} style={styles.toggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.toggleText}>{visible ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    color: DUGOUT_COLORS.ui.textSecondary,
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
  },
  input: {
    flex: 1,
    color: DUGOUT_COLORS.ui.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  toggle: { paddingHorizontal: 14 },
  toggleText: {
    color: DUGOUT_COLORS.brand.green,
    fontSize: 13,
    fontWeight: '600',
  },
});
