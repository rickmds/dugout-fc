import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ClubHeader from './ClubHeader';
import { useTheme } from '../../hooks/useTheme';

// Mobile's equivalent of web's full-page <UpgradePrompt /> usage — a
// whole-screen gate for a feature reached by navigating to its own route,
// rather than one triggered by a button tap (which uses showUpgradePrompt's
// native Alert instead, since there's no screen to replace in that case).
export default function UpgradeScreen({
  title, feature, requiredPlan, description, onBack,
}: {
  title: string; feature: string; requiredPlan: string; description: string; onBack: () => void;
}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.root}>
      <ClubHeader title={title} onBack={onBack} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={26} color="#fff" />
        </View>
        <Text style={styles.title}>{feature}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.badge}>
          <Ionicons name="flash" size={12} color="#F59E0B" />
          <Text style={styles.badgeText}>Available on {requiredPlan} and above</Text>
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16, marginBottom: 16,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  description: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 320 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
});
