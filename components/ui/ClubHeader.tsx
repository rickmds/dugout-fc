import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useClub } from '../../hooks/useClub';
import ClubBadge from './ClubBadge';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Pass router.back to show a back chevron instead of the ClubBadge */
  onBack?: () => void;
  /** Makes the title+subtitle area tappable */
  onPressTitle?: () => void;
};

export default function ClubHeader({ title, subtitle, right, onBack, onPressTitle }: Props) {
  const insets = useSafeAreaInsets();
  const { primaryColor } = useClub();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10, backgroundColor: primaryColor }]}>
      <View style={styles.inner}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        ) : (
          <ClubBadge size={40} />
        )}

        {onPressTitle ? (
          <TouchableOpacity style={styles.textBlock} onPress={onPressTitle} activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
            </View>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </TouchableOpacity>
        ) : (
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
        )}

        {right ? <View style={styles.right}>{right}</View> : <View style={styles.rightPlaceholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  rightPlaceholder: { width: 40 },
});

/** Reusable style for action buttons placed in the ClubHeader `right` slot */
export const headerBtnStyle: object = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 5,
  paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: 10,
  backgroundColor: 'rgba(0,0,0,0.22)',
};

export const headerBtnTextStyle: object = {
  fontSize: 12,
  fontWeight: '700' as const,
  color: '#fff',
};
