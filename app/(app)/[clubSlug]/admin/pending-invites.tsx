import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { sendParentInviteEmail, resendCoachInvite } from '../../../../lib/inviteApi';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { useTheme } from '../../../../hooks/useTheme';
import { PULSE_COLORS, ThemeColors } from '../../../../constants/colors';
import ClubHeader from '../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingInvite = {
  id: string;
  email: string;
  token: string;
  role: 'coach' | 'parent';
  playerName: string | null;
  createdAt: string;
  resending: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return '1 day ago';
  if (d < 7)  return `${d} days ago`;
  const w = Math.floor(d / 7);
  if (w === 1) return '1 week ago';
  if (w < 5)  return `${w} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

function initials(email: string): string {
  return email[0]?.toUpperCase() ?? '?';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PendingInvitesScreen() {
  const { primaryColor, rgba } = useClub();
  const { profile } = useAuth();
  const { team } = useTeam();
  const router = useRouter();
  const { colors, overlay } = useTheme();
  const st = useMemo(() => getSt(colors), [colors]);

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resendingAll, setResendingAll] = useState(false);

  useFocusEffect(useCallback(() => { fetchInvites(); }, [team?.id]));

  async function fetchInvites() {
    if (!team) return;
    setLoading(true);

    const { data, error } = await (supabase as any)
      .from('invites')
      .select('id, email, token, role, created_at, players!invites_player_id_fkey(full_name)')
      .eq('team_id', team.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    setLoadError(false);
    setInvites(
      ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        email: row.email,
        token: row.token,
        role: row.role,
        playerName: row.players?.full_name ?? null,
        createdAt: row.created_at,
        resending: false,
      }))
    );
    setLoading(false);
  }

  async function sendOne(invite: PendingInvite) {
    if (!profile || !team) return;
    const ok = invite.role === 'coach'
      ? await resendCoachInvite(invite.id)
      : await sendParentInviteEmail(invite.id, invite.playerName ?? undefined);
    if (!ok) throw new Error('Failed to send invite');
  }

  function setResending(id: string, value: boolean) {
    setInvites((prev) => prev.map((inv) => inv.id === id ? { ...inv, resending: value } : inv));
  }

  async function handleResendOne(invite: PendingInvite) {
    setResending(invite.id, true);
    try {
      await sendOne(invite);
      Alert.alert('Sent', `Reminder sent to ${invite.email}.`);
    } catch {
      Alert.alert('Failed', 'Could not send the invite. Try again.');
    } finally {
      setResending(invite.id, false);
    }
  }

  async function handleResendAll() {
    if (invites.length === 0) return;
    Alert.alert(
      'Resend all invites?',
      `This will send a reminder to all ${invites.length} pending invitees.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send All', onPress: async () => {
            setResendingAll(true);
            let sent = 0;
            const failed: string[] = [];
            for (const inv of invites) {
              try { await sendOne(inv); sent++; } catch { failed.push(inv.email); }
            }
            setResendingAll(false);
            if (failed.length > 0) {
              Alert.alert('Partially sent', `Sent ${sent} of ${invites.length}.\n\nFailed:\n${failed.join('\n')}`);
            } else {
              Alert.alert('Done', `All ${sent} reminder${sent === 1 ? '' : 's'} sent successfully.`);
            }
          },
        },
      ]
    );
  }

  const coaches  = invites.filter((i) => i.role === 'coach');
  const parents  = invites.filter((i) => i.role === 'parent');

  return (
    <View style={st.root}>

      <ClubHeader title="Pending Invites" onBack={() => router.back()} />

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>
      ) : loadError ? (
        <View style={st.empty}>
          <Ionicons name="cloud-offline-outline" size={52} color={colors.muted} />
          <Text style={st.emptyTitle}>Couldn't load invites</Text>
          <Text style={st.emptyBody}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={[st.resendAllBtn, { marginTop: 16, borderColor: overlay(0.13), backgroundColor: overlay(0.07) }]}
            onPress={fetchInvites}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color={colors.text} />
            <Text style={[st.resendAllText, { color: colors.text }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : invites.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="checkmark-circle-outline" size={52} color={PULSE_COLORS.brand.green} />
          <Text style={st.emptyTitle}>All caught up</Text>
          <Text style={st.emptyBody}>Everyone has accepted their invite.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Resend All ── */}
          <TouchableOpacity
            style={[st.resendAllBtn, { borderColor: overlay(0.13), backgroundColor: overlay(0.07) }]}
            onPress={handleResendAll}
            disabled={resendingAll}
            activeOpacity={0.8}
          >
            {resendingAll ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <>
                <Ionicons name="send" size={16} color={colors.text} />
                <Text style={[st.resendAllText, { color: colors.text }]}>
                  Resend All ({invites.length})
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* ── Coaches ── */}
          {coaches.length > 0 && (
            <>
              <Text style={st.sectionLabel}>COACHES</Text>
              <View style={st.card}>
                {coaches.map((inv, i) => (
                  <InviteRow
                    key={inv.id}
                    invite={inv}
                    isLast={i === coaches.length - 1}
                    onResend={handleResendOne}
                    primaryColor={primaryColor}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── Parents ── */}
          {parents.length > 0 && (
            <>
              <Text style={[st.sectionLabel, coaches.length > 0 && { marginTop: 24 }]}>PARENTS / GUARDIANS</Text>
              <View style={st.card}>
                {parents.map((inv, i) => (
                  <InviteRow
                    key={inv.id}
                    invite={inv}
                    isLast={i === parents.length - 1}
                    onResend={handleResendOne}
                    primaryColor={primaryColor}
                  />
                ))}
              </View>
            </>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function InviteRow({
  invite, isLast, onResend, primaryColor,
}: {
  invite: PendingInvite;
  isLast: boolean;
  onResend: (inv: PendingInvite) => void;
  primaryColor: string;
}) {
  const { colors } = useTheme();
  const st = useMemo(() => getSt(colors), [colors]);
  return (
    <View style={[st.row, !isLast && st.rowBorder]}>
      <View style={st.avatar}>
        <Text style={[st.avatarText, { color: primaryColor }]}>{initials(invite.email)}</Text>
      </View>
      <View style={st.rowMeta}>
        <Text style={st.rowEmail} numberOfLines={1}>{invite.email}</Text>
        <Text style={st.rowSub}>
          {invite.playerName ? `Parent of ${invite.playerName} · ` : ''}{timeAgo(invite.createdAt)}
        </Text>
      </View>
      <TouchableOpacity
        style={[st.resendBtn, { borderColor: `${primaryColor}44`, backgroundColor: `${primaryColor}12` }]}
        onPress={() => onResend(invite)}
        disabled={invite.resending}
        activeOpacity={0.75}
      >
        {invite.resending
          ? <ActivityIndicator size="small" color={primaryColor} />
          : <Ionicons name="send-outline" size={14} color={primaryColor} />}
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function getSt(colors: ThemeColors) {
  return StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 58, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  scroll: { padding: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptyBody:  { fontSize: 14, color: colors.muted, textAlign: 'center' },

  resendAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, marginBottom: 28,
  },
  resendAllText: { fontSize: 16, fontWeight: '700' },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: colors.muted,
    letterSpacing: 2, marginBottom: 10,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },

  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },

  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0A1810',
    borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontWeight: '900' },

  rowMeta:  { flex: 1 },
  rowEmail: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  rowSub:   { fontSize: 12, color: colors.muted },

  resendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  });
}
