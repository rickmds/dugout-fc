import { StyleSheet, Text, View } from 'react-native';
import { DUGOUT_COLORS } from '../../constants/colors';

export default function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.status.error,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  text: {
    color: DUGOUT_COLORS.status.error,
    fontSize: 14,
  },
});
