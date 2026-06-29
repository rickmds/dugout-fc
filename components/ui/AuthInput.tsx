import { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, TouchableOpacity } from 'react-native';
import { DUGOUT_COLORS } from '../../constants/colors';

interface AuthInputProps extends TextInputProps {
  label: string;
  secureToggle?: boolean;
}

export default function AuthInput({ label, secureToggle, secureTextEntry, ...rest }: AuthInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const isSecure = secureToggle ? !visible : secureTextEntry;

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
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
      </View>
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
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 12,
    transition: 'border-color 0.15s',
  } as any,
  inputRowFocused: {
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.04)',
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
