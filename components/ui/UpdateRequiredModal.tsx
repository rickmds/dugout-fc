import { Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';

const STORE_URL = Platform.OS === 'ios'
  ? 'https://apps.apple.com/us/app/pulse-fc/id6797330659'
  : 'https://play.google.com/store/apps/details?id=app.pulsefc.mobile';

// Deliberately no dismiss/cancel — no onRequestClose, no tap-outside-to-close.
// This only renders at all once app_version_gate has decided the installed
// version is below the floor, so the block staying up is the whole point.
export default function UpdateRequiredModal() {
  return (
    <Modal visible animationType="fade" transparent>
      <View style={st.dim}>
        <View style={st.modal}>
          <View style={st.iconBadge}>
            <Ionicons name="arrow-up-circle-outline" size={26} color={PULSE_COLORS.brand.green} />
          </View>
          <Text style={st.title}>Update required</Text>
          <Text style={st.body}>A new version of Pulse FC is available. Update now to keep using the app.</Text>
          <TouchableOpacity style={st.cta} onPress={() => Linking.openURL(STORE_URL)} activeOpacity={0.85}>
            <Text style={st.ctaText}>Update Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: 'rgba(6,7,9,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    borderRadius: 20,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(34,197,94,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 17, fontWeight: '800',
    color: PULSE_COLORS.ui.text, letterSpacing: -0.2,
    marginBottom: 8, textAlign: 'center',
  },
  body: {
    fontSize: 14, color: PULSE_COLORS.ui.textSecondary,
    lineHeight: 20, textAlign: 'center', marginBottom: 22,
  },
  cta: {
    width: '100%',
    backgroundColor: PULSE_COLORS.brand.green,
    borderRadius: 12, paddingVertical: 13,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#06210F' },
});
