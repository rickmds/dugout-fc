import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';

const SUPPORT_EMAIL = 'support@pulse-fc.app';

// Deliberately no dismiss/cancel — no onRequestClose, no tap-outside-to-close.
// This only renders while the signed-in user's club has suspended_at set, so
// the block staying up is the whole point.
//
// Copy is role-aware: the org_admin is the one who'd actually need to sort
// out *why* the club is suspended (billing, policy, etc.), so they're
// pointed at Pulse FC support. A coach or parent has no reason to contact
// Pulse FC directly — they're told to go to their own club instead.
export default function ClubSuspendedModal({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  const { signOut } = useAuth();

  return (
    <Modal visible animationType="fade" transparent>
      <View style={st.dim}>
        <View style={st.modal}>
          <View style={st.iconBadge}>
            <Ionicons name="lock-closed-outline" size={24} color="#EF4444" />
          </View>
          <Text style={st.title}>Club access suspended</Text>
          <Text style={st.body}>
            {isOrgAdmin
              ? `This club's access has been temporarily suspended. Contact ${SUPPORT_EMAIL} to find out why and get it resolved.`
              : "This club's access has been temporarily suspended. Please contact your club administrator for more information."}
          </Text>
          {isOrgAdmin && (
            <TouchableOpacity style={st.cta} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} activeOpacity={0.85}>
              <Text style={st.ctaText}>Email Support</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={st.secondaryCta} onPress={() => signOut()} activeOpacity={0.7}>
            <Text style={st.secondaryCtaText}>Sign Out</Text>
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
    backgroundColor: 'rgba(239,68,68,0.12)',
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
  secondaryCta: {
    marginTop: 14,
    paddingVertical: 6,
  },
  secondaryCtaText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
});
