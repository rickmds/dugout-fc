import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { PULSE_COLORS } from '../../constants/colors';

interface SocialButtonProps {
  provider: 'google' | 'apple';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function SocialButton({ provider, onPress, loading = false, disabled = false }: SocialButtonProps) {
  const isApple = provider === 'apple';
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[styles.button, isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color="#F9FAFB" size="small" />
      ) : (
        <>
          <View style={styles.iconWrap}>
            <FontAwesome
              name={isApple ? 'apple' : 'google'}
              size={20}
              color={isApple ? '#F9FAFB' : '#4285F4'}
            />
          </View>
          <Text style={styles.label}>
            {isApple ? 'Continue with Apple' : 'Continue with Google'}
          </Text>
          <View style={styles.iconWrap} />
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  disabled: { opacity: 0.55 },
  iconWrap: { width: 28, alignItems: 'center' },
  label: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#F9FAFB' },
});
