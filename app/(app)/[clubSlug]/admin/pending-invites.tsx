import { useCallback, useState } from 'react';
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
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { DUGOUT_COLORS } from '../../../../constants/colors';

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
  const { primaryColor, rgba, clubName, logoUrl } = useClub();
  const { profile } = useAuth();
  const { team } = useTeam();
  const router = useRouter();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingAll, setResendingAll] = useState(false);

  useFocusEffect(useCallback(() => { fetchInvites(); }, [team?.id]));

  async function fetchInvites() {
    if (!team) return;
    setLoading(true);

    const { data } = await (supabase as any)
      .from('invites')
      .select('id, email, token, role, created_at, players!invites_player_id_fkey(full_name)')
      .eq('team_id', team.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

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
    const deepLink = `https://dugoutfc.app/join?token=${invite.token}`;
    const isCoach = invite.role === 'coach';
    const subject = isCoach
      ? `Reminder: You've been invited to join ${team.name} as a coach on Dugout FC`
      : `Reminder: ${invite.playerName ?? 'Your child'} has been added to ${team.name} on Dugout FC`;
    const body = isCoach
      ? `Hi,\n\nJust a reminder — you've been invited to join ${team.name} as coaching staff on Dugout FC.\n\nAccept your invite:\n${deepLink}\n\nInvite code: ${invite.token}\n\n— ${profile.full_name ?? 'Your Club Admin'}`
      : `Hi,\n\nJust a reminder — ${invite.playerName ?? 'your child'} has been added to ${team.name} on Dugout FC.\n\nAccept your invite:\n${deepLink}\n\nInvite code: ${invite.token}\n\n— ${profile.full_name ?? 'Your Coach'}`;

    await supabase.functions.invoke('send-team-email', {
      body: {
        to: [{ email: invite.email, name: '' }],
        cc: [], subject, body, reply_to: null,
        from_name: profile.full_name ?? 'Dugout FC',
        team_name: team.name,
        attachments: [],
        club_logo_url: logoUrl,
        club_name: clubName,
        primary_color: primaryColor,
      },
    });
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

      {/* ── Header ── */}
      <View style={st.header}>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Pending Invites</Text>
        <View style={st.iconBtn} />
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>
      ) : invites.length === 0 ? (
        <View style={st.empty}>
          <Ionicons name="checkmark-circle-outline" size={52} color={DUGOUT_COLORS.brand.green} />
          <Text style={st.emptyTitle}>All caught up</Text>
          <Text style={st.emptyBody}>Everyone has accepted their invite.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Resend All ── */}
          <TouchableOpacity
            style={[st.resendAllBtn, { borderColor: rgba(0.3), backgroundColor: rgba(0.07) }]}
            onPress={handleResendAll}
            disabled={resendingAll}
            activeOpacity={0.8}
          >
            {resendingAll ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <>
                <Ionicons name="send" size={16} color={primaryColor} />
                <Text style={[st.resendAllText, { color: primaryColor }]}>
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

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 58, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  scroll: { padding: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  emptyBody:  { fontSize: 14, color: DUGOUT_COLORS.ui.muted, textAlign: 'center' },

  resendAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, marginBottom: 28,
  },
  resendAllText: { fontSize: 16, fontWeight: '700' },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: DUGOUT_COLORS.ui.muted,
    letterSpacing: 2, marginBottom: 10,
  },

  card: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    overflow: 'hidden',
  },

  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border },

  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0A1810',
    borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.2)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 16, fontWeight: '900' },

  rowMeta:  { flex: 1 },
  rowEmail: { fontSize: 14, fontWeight: '600', color: DUGOUT_COLORS.ui.text, marginBottom: 2 },
  rowSub:   { fontSize: 12, color: DUGOUT_COLORS.ui.muted },

  resendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
});
