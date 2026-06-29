import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DUGOUT_COLORS } from '../../constants/colors';

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
      style={[styles.button, isApple ? styles.appleButton : styles.googleButton, isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={isApple ? '#000000' : '#3c4043'} size="small" />
      ) : (
        <>
          <View style={styles.iconWrap}>
            <FontAwesome
              name={isApple ? 'apple' : 'google'}
              size={20}
              color={isApple ? '#000000' : '#4285F4'}
            />
          </View>
          <Text style={[styles.label, isApple ? styles.appleLabel : styles.googleLabel]}>
            {isApple ? 'Continue with Apple' : 'Continue with Google'}
          </Text>
          {/* Spacer to keep label visually centred */}
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
  },
  appleButton: {
    backgroundColor: '#FFFFFF',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  disabled: { opacity: 0.55 },
  iconWrap: { width: 28, alignItems: 'center' },
  label:       { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  appleLabel:  { color: '#000000' },
  googleLabel: { color: '#3c4043' },
});
