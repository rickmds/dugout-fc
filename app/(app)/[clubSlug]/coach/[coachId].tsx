import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { DUGOUT_COLORS } from '../../../../constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

type CoachData = {
  source: 'member' | 'invite';
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  teamId: string | null;
  // member-only
  profileId: string | null;
  joinedAt: string | null;
  // invite-only
  inviteId: string | null;
  inviteToken: string | null;
  acceptedAt: string | null;
  createdAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CoachProfileScreen() {
  const { primaryColor, rgba, clubName, logoUrl } = useClub();
  const { coachId, source } = useLocalSearchParams<{ coachId: string; source: 'member' | 'invite' }>();
  const { profile } = useAuth();
  const { team } = useTeam();
  const router = useRouter();

  const [coach, setCoach] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [resending, setResending] = useState(false);

  const isOrgAdmin = profile?.role === 'org_admin' || profile?.role === 'app_admin';

  useEffect(() => {
    if (!coachId) return;
    fetchCoach();
  }, [coachId, source]);

  async function fetchCoach() {
    setLoading(true);

    if (source === 'invite') {
      const { data, error } = await (supabase as any)
        .from('invites')
        .select('id, email, token, team_id, accepted_at, created_at')
        .eq('id', coachId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setCoach({
        source: 'invite',
        name: data.email,
        email: data.email,
        avatarUrl: null,
        role: 'Coach',
        teamId: data.team_id,
        profileId: null,
        joinedAt: null,
        inviteId: data.id,
        inviteToken: data.token,
        acceptedAt: data.accepted_at,
        createdAt: data.created_at,
      });
    } else {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, role, created_at, profiles!team_members_profile_id_fkey(id, full_name, avatar_url)')
        .eq('id', coachId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      const p = (data.profiles as any) ?? {};
      setCoach({
        source: 'member',
        name: p.full_name ?? 'Coach',
        email: null,
        avatarUrl: p.avatar_url ?? null,
        role: data.role === 'coach' ? 'Coach' : (data.role ?? 'Coach'),
        teamId: null,
        profileId: p.id ?? null,
        joinedAt: data.created_at,
        inviteId: null,
        inviteToken: null,
        acceptedAt: null,
        createdAt: null,
      });
    }

    setLoading(false);
  }

  async function handleResend() {
    if (!coach?.email || !coach.inviteToken || !profile) return;
    setResending(true);
    try {
      const teamName = team?.name ?? 'your team';
      const deepLink = `https://dugoutfc.app/join?token=${coach.inviteToken}`;
      const subject = `Reminder: You've been invited to join ${teamName} as a coach on Dugout FC`;
      const body = `Hi,\n\nJust a reminder — you've been invited to join ${teamName} as coaching staff on Dugout FC.\n\nAccept your invite and download the app:\n${deepLink}\n\nOr enter your invite code: ${coach.inviteToken}\n\n— ${profile.full_name ?? 'Your Club Admin'}`;
      await supabase.functions.invoke('send-team-email', {
        body: {
          to: [{ email: coach.email, name: '' }],
          cc: [], subject, body, reply_to: null,
          from_name: profile.full_name ?? 'Dugout FC',
          team_name: teamName,
          attachments: [],
          club_logo_url: logoUrl,
          club_name: clubName,
          primary_color: primaryColor,
        },
      });
      Alert.alert('Invite resent', `A reminder has been sent to ${coach.email}.`);
    } catch {
      Alert.alert('Failed', 'Could not resend the invite. Please try again.');
    } finally {
      setResending(false);
    }
  }

  function confirmRemove() {
    if (!coach) return;
    Alert.alert(
      'Remove Coach',
      `Remove ${coach.name} from the team? They will lose access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: handleRemove },
      ]
    );
  }

  async function handleRemove() {
    if (!coach) return;
    setRemoving(true);

    if (coach.source === 'invite') {
      await (supabase as any).from('invites').delete().eq('id', coach.inviteId);
    } else {
      await supabase.from('team_members').delete().eq('id', coachId);
    }

    router.back();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  if (!coach) {
    return (
      <View style={st.center}>
        <Text style={st.errorText}>Coach not found.</Text>
      </View>
    );
  }

  const isPending = coach.source === 'invite' && !coach.acceptedAt;

  return (
    <View style={st.root}>

      {/* ── Header ── */}
      <View style={st.header}>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle} numberOfLines={1}>
          {coach.source === 'member' ? coach.name.split(' ')[0] : 'Invited Coach'}
        </Text>
        <View style={st.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={st.hero}>
          <View style={[st.avatar, { borderColor: isPending ? '#EAB308' : primaryColor, shadowColor: isPending ? '#EAB308' : primaryColor }]}>
            <Text style={[st.avatarText, { color: isPending ? '#EAB308' : primaryColor }]}>
              {initials(coach.name)}
            </Text>
          </View>

          <Text style={st.name}>{coach.name}</Text>

          <View style={st.badgeRow}>
            <View style={[st.roleBadge, { backgroundColor: rgba(0.08), borderColor: rgba(0.25) }]}>
              <Ionicons name="shield-checkmark" size={11} color={primaryColor} />
              <Text style={[st.roleBadgeText, { color: primaryColor }]}>{coach.role.toUpperCase()}</Text>
            </View>

            <View style={[st.statusBadge, isPending
              ? { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.3)' }
              : { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }
            ]}>
              <View style={[st.statusDot, { backgroundColor: isPending ? '#EAB308' : primaryColor }]} />
              <Text style={[st.statusText, { color: isPending ? '#EAB308' : primaryColor }]}>
                {isPending ? 'Invite Pending' : 'Active'}
              </Text>
            </View>
          </View>

          {/* Joined / invited date */}
          {coach.joinedAt && (
            <Text style={st.dateLine}>Joined {formatDate(coach.joinedAt)}</Text>
          )}
          {isPending && coach.createdAt && (
            <Text style={st.dateLine}>Invited {formatDate(coach.createdAt)}</Text>
          )}
        </View>

        {/* ── Contact ── */}
        {coach.email && (
          <>
            <Text style={st.sectionLabel}>CONTACT</Text>
            <View style={st.card}>
              <View style={st.contactRow}>
                <View style={[st.contactIcon, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                  <Ionicons name="mail-outline" size={17} color="#3B82F6" />
                </View>
                <View style={st.contactMeta}>
                  <Text style={st.contactLabel}>Email</Text>
                  <Text style={st.contactValue} numberOfLines={1}>{coach.email}</Text>
                </View>
                <TouchableOpacity
                  style={st.contactBtn}
                  onPress={() => Linking.openURL(`mailto:${coach.email}`)}
                >
                  <Text style={[st.contactBtnText, { color: primaryColor }]}>Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── Pending info ── */}
        {isPending && (
          <View style={st.pendingCard}>
            <Ionicons name="information-circle-outline" size={18} color="#EAB308" />
            <Text style={st.pendingText}>
              This coach has been invited but hasn't created their account yet. They'll appear as Active once they sign up.
            </Text>
          </View>
        )}

        {/* ── Resend invite ── */}
        {isPending && isOrgAdmin && (
          <TouchableOpacity style={[st.resendBtn, { borderColor: rgba(0.3), backgroundColor: rgba(0.07) }]} onPress={handleResend} disabled={resending}>
            {resending
              ? <ActivityIndicator size="small" color={primaryColor} />
              : <>
                  <Ionicons name="send-outline" size={16} color={primaryColor} />
                  <Text style={[st.resendBtnText, { color: primaryColor }]}>Resend Invite</Text>
                </>}
          </TouchableOpacity>
        )}

        {/* ── Remove ── */}
        {isOrgAdmin && (
          <TouchableOpacity style={st.removeBtn} onPress={confirmRemove} disabled={removing}>
            {removing
              ? <ActivityIndicator size="small" color={DUGOUT_COLORS.status.error} />
              : <>
                  <Ionicons name="person-remove-outline" size={16} color={DUGOUT_COLORS.status.error} />
                  <Text style={st.removeBtnText}>Remove from Team</Text>
                </>}
          </TouchableOpacity>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DUGOUT_COLORS.ui.background },
  errorText: { color: DUGOUT_COLORS.ui.textSecondary, fontSize: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 58, paddingBottom: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  scroll: { padding: 16 },

  // ── Hero
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 28 },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#0A1810',
    borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
  },
  avatarText: { fontSize: 34, fontWeight: '900' },
  name: {
    fontSize: 26, fontWeight: '800', color: DUGOUT_COLORS.ui.text,
    letterSpacing: -0.5, marginBottom: 12,
  },
  badgeRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  dateLine:   { fontSize: 13, color: DUGOUT_COLORS.ui.muted, marginTop: 4 },

  // ── Section
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: DUGOUT_COLORS.ui.muted,
    letterSpacing: 2, marginBottom: 10, marginTop: 4,
  },

  // ── Contact card
  card: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
    overflow: 'hidden', marginBottom: 24,
  },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  contactIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  contactMeta: { flex: 1 },
  contactLabel: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontWeight: '600', marginBottom: 2 },
  contactValue: { fontSize: 15, color: DUGOUT_COLORS.ui.text, fontWeight: '500' },
  contactBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
  },
  contactBtnText: { fontSize: 13, fontWeight: '700' },

  // ── Pending info
  pendingCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: 'rgba(234,179,8,0.07)',
    borderWidth: 1, borderColor: 'rgba(234,179,8,0.2)',
    borderRadius: 14, padding: 14, marginBottom: 24,
  },
  pendingText: {
    flex: 1, fontSize: 13, color: '#EAB308', lineHeight: 19,
  },

  // ── Remove
  resendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 12,
    borderWidth: 1,
  },
  resendBtnText: { fontWeight: '700', fontSize: 15 },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)',
    backgroundColor: 'rgba(239,68,68,0.07)',
  },
  removeBtnText: { color: DUGOUT_COLORS.status.error, fontWeight: '700', fontSize: 15 },
});
