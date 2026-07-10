import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import ImageEditor from '../../../../components/ui/ImageEditor';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerDetail = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  secondary_position: string | null;
  preferred_foot: 'left' | 'right' | 'both' | null;
  date_of_birth: string | null;
  notes: string | null;
  photo_url: string | null;
  is_private: boolean;
  is_injured: boolean;
  profile_id: string | null;
  profile_avatar_url: string | null; // from joined profiles row
};

type EventRsvp = {
  event_id: string;
  event_title: string;
  event_date: string;
  event_type: string;
  status: 'attending' | 'not_attending' | null;
};

type MatchTime = {
  event_id: string;
  event_title: string;
  event_date: string;
  event_type: string;
  minutes: number;
  availableMins: number; // from game_sessions — 0 if unknown
  started: boolean;
};

type GuardianProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Invite = {
  id: string;
  email: string;
  token: string;
  guardian_name: string | null;
  phone: string | null;
  relationship: string | null;
  accepted_at: string | null;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

const POS: Record<string, { primary: string; bg: string; border: string }> = {
  GK:  { primary: '#F59E0B', bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.32)' },
  DEF: { primary: '#60A5FA', bg: 'rgba(96,165,250,0.14)',   border: 'rgba(96,165,250,0.32)' },
  MID: { primary: '#22C55E', bg: 'rgba(34,197,94,0.14)',    border: 'rgba(34,197,94,0.32)'  },
  FWD: { primary: '#F87171', bg: 'rgba(248,113,113,0.14)',  border: 'rgba(248,113,113,0.32)'},
};

const TYPE_COLORS: Record<string, string> = {
  game: '#F59E0B',
  training: '#3B82F6',
  other: '#9CA3AF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const FOOT_LABEL: Record<string, string> = { left: 'Left foot', right: 'Right foot', both: 'Both feet' };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlayerProfileScreen() {
  const { primaryColor, rgba, clubName, logoUrl } = useClub();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { team, loading: teamLoading } = useTeam();
  const { profile } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'player' | 'guardians'>('player');

  // Player data
  const [player, setPlayer]           = useState<PlayerDetail | null>(null);
  const [rsvpHistory, setRsvpHistory] = useState<EventRsvp[]>([]);
  const [matchTimes, setMatchTimes]   = useState<MatchTime[]>([]);
  const [loading, setLoading]         = useState(true);

  // Guardian data
  const [guardianProfile, setGuardianProfile]   = useState<GuardianProfile | null>(null);
  const [invites, setInvites]                   = useState<Invite[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);

  // Edit player modal
  const [showEdit, setShowEdit]                       = useState(false);
  const [editName, setEditName]                       = useState('');
  const [editJersey, setEditJersey]                   = useState('');
  const [editDob, setEditDob]                         = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker]           = useState(false);
  const [editPosition, setEditPosition]               = useState('');
  const [editSecondary, setEditSecondary]             = useState('');
  const [editFoot, setEditFoot]                       = useState<'left' | 'right' | 'both' | ''>('');
  const [editNotes, setEditNotes]                     = useState('');
  const [editPhotoUri, setEditPhotoUri]               = useState<string | null>(null);
  const [photoEditorUri, setPhotoEditorUri]           = useState('');
  const [photoEditorVisible, setPhotoEditorVisible]   = useState(false);
  const [editPrivate, setEditPrivate]                 = useState(false);
  const [saving, setSaving]                           = useState(false);
  const [deleting, setDeleting]                       = useState(false);

  // Add / edit guardian modal
  const [showAddGuardian, setShowAddGuardian]   = useState(false);
  const [editingInvite, setEditingInvite]       = useState<Invite | null>(null);
  const [guardianName, setGuardianName]         = useState('');
  const [guardianEmail, setGuardianEmail]       = useState('');
  const [guardianPhone, setGuardianPhone]       = useState('');
  const [guardianRel, setGuardianRel]           = useState('');
  const [savingInvite, setSavingInvite]         = useState(false);

  const isCoach    = profile?.role === 'org_admin' || profile?.role === 'coach';
  const isMyPlayer = !!player?.profile_id && player.profile_id === profile?.id;
  const canEdit    = isCoach || isMyPlayer;
  // Other parents see limited info when player is private
  const canSeeDetails = isCoach || isMyPlayer || !player?.is_private;

  // Player fetch is independent of team — fires as soon as playerId is available
  useEffect(() => {
    if (!playerId) return;
    fetchPlayer();
  }, [playerId]);

  // Stats (events, RSVPs, playing time) need team — fires once both are ready
  useEffect(() => {
    if (!player || !team || teamLoading) return;
    fetchStats();
  }, [player?.id, team?.id, teamLoading]);

  useEffect(() => {
    if (player) {
      loadGuardians();
    }
  }, [player?.id]);

  // ── Data loading ────────────────────────────────────────────────────────────

  async function fetchPlayer() {
    if (!playerId) return;
    setLoading(true);

    // Select only the base columns that are guaranteed to exist, plus new ones
    // that may not be in the live DB yet — handled gracefully via cast
    const { data, error } = await (supabase as any)
      .from('players')
      .select('id, full_name, jersey_number, position, secondary_position, preferred_foot, date_of_birth, notes, photo_url, is_private, is_injured, profile_id, profiles!players_profile_id_fkey(avatar_url)')
      .eq('id', playerId)
      .single();

    if (error || !data) {
      // Fall back to base columns if new columns don't exist in live DB yet
      const { data: fallback } = await supabase
        .from('players')
        .select('id, full_name, jersey_number, position, profile_id, profiles!players_profile_id_fkey(avatar_url)')
        .eq('id', playerId)
        .single();

      if (fallback) {
        setPlayer({
          ...(fallback as any),
          secondary_position: null,
          preferred_foot: null,
          date_of_birth: null,
          notes: null,
          photo_url: null,
          is_private: false,
          is_injured: false,
          profile_avatar_url: (fallback as any).profiles?.avatar_url ?? null,
        } as PlayerDetail);
      }
      setLoading(false);
      return;
    }

    setPlayer({
      ...data,
      is_injured: data.is_injured ?? false,
      profile_avatar_url: data.profiles?.avatar_url ?? null,
    } as PlayerDetail);
    setLoading(false);
  }

  async function fetchStats() {
    if (!team || !playerId) return;

    const eventsRes = await supabase
      .from('events')
      .select('id, title, type, event_date')
      .eq('team_id', team.id)
      .order('event_date', { ascending: false })
      .limit(12);

    const events = (eventsRes.data ?? []) as { id: string; title: string; type: string; event_date: string }[];
    if (events.length > 0) {
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('event_id, status')
        .eq('player_id', playerId)
        .in('event_id', events.map((e) => e.id));

      const rsvpMap = new Map((rsvps ?? []).map((r: any) => [r.event_id, r.status]));
      setRsvpHistory(
        events.map((e) => ({
          event_id: e.id,
          event_title: e.title,
          event_date: e.event_date,
          event_type: e.type,
          status: (rsvpMap.get(e.id) as EventRsvp['status']) ?? null,
        }))
      );
    }

    if (isCoach) {
      const { data: periods } = await (supabase as any)
        .from('player_match_periods')
        .select('event_id, on_at, off_at, half')
        .eq('player_id', playerId)
        .not('off_at', 'is', null)
        .order('on_at', { ascending: false });

      if (periods && periods.length > 0) {
        const eventIds = [...new Set((periods as any[]).map((p) => p.event_id))] as string[];
        const { data: evs } = await supabase
          .from('events')
          .select('id, title, event_date, type')
          .in('id', eventIds)
          .order('event_date', { ascending: false });

        const minuteMap  = new Map<string, number>();
        const startedMap = new Map<string, boolean>();
        for (const p of periods as any[]) {
          const secs = (new Date(p.off_at).getTime() - new Date(p.on_at).getTime()) / 1000;
          minuteMap.set(p.event_id, (minuteMap.get(p.event_id) ?? 0) + secs / 60);
          if (!startedMap.has(p.event_id)) startedMap.set(p.event_id, p.half === 1);
        }

        const { data: sessions } = await (supabase as any)
          .from('game_sessions')
          .select('event_id, half_length_seconds')
          .in('event_id', eventIds);

        const sessionMap = new Map<string, number>(
          (sessions ?? []).map((s: any) => [s.event_id, (s.half_length_seconds * 2) / 60])
        );

        setMatchTimes(
          (evs ?? []).map((e: any) => ({
            event_id: e.id,
            event_title: e.title,
            event_date: e.event_date,
            event_type: e.type,
            minutes: Math.round(minuteMap.get(e.id) ?? 0),
            availableMins: Math.round(sessionMap.get(e.id) ?? 0),
            started: startedMap.get(e.id) ?? false,
          }))
        );
      }
    }
  }

  async function loadGuardians() {
    if (!player || !team) return;
    setGuardiansLoading(true);

    const [profileRes, inviteRes] = await Promise.all([
      player.profile_id
        ? supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', player.profile_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      (supabase as any)
        .from('invites')
        .select('id, email, token, guardian_name, phone, relationship, accepted_at, created_at')
        .eq('player_id', player.id)
        .order('created_at', { ascending: false }),
    ]);

    setGuardianProfile((profileRes.data as GuardianProfile | null) ?? null);
    setInvites(((inviteRes as any).data as Invite[]) ?? []);
    setGuardiansLoading(false);
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openEdit() {
    if (!player) return;
    setEditName(player.full_name);
    setEditJersey(player.jersey_number != null ? String(player.jersey_number) : '');
    setEditDob(player.date_of_birth ? new Date(player.date_of_birth) : null);
    setEditPosition(player.position ?? '');
    setEditSecondary(player.secondary_position ?? '');
    setEditFoot(player.preferred_foot ?? '');
    setEditNotes(player.notes ?? '');
    setEditPrivate(player.is_private ?? false);
    setEditPhotoUri(null);
    setShowEdit(true);
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (!result.canceled && result.assets[0]) {
      setPhotoEditorUri(result.assets[0].uri);
      setPhotoEditorVisible(true);
    }
  }

  async function uploadPhoto(localUri: string): Promise<string | null> {
    try {
      const ext = localUri.split('.').pop()?.toLowerCase()?.split('?')[0] ?? 'jpg';
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      // Always use .jpg path so upsert overwrites the same key each time
      const path = `players/${player!.id}.jpg`;

      // fetch().arrayBuffer() works reliably in Expo/Hermes for local file URIs;
      // Supabase JS v2 handles ArrayBuffer correctly unlike Blob polyfills in RN
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();

      const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
        contentType: mime,
        upsert: true,
      });
      if (error) {
        console.warn('Photo upload error:', error.message);
        Alert.alert('Upload failed', error.message);
        return null;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      return `${data.publicUrl}?t=${Date.now()}`;
    } catch (e) {
      console.warn('uploadPhoto exception:', e);
      Alert.alert('Upload failed', String(e));
      return null;
    }
  }

  async function handleSave() {
    if (!player || !editName.trim()) return;
    setSaving(true);

    // Upload new photo first if one was picked
    let newPhotoUrl = player.photo_url;
    if (editPhotoUri) {
      const uploaded = await uploadPhoto(editPhotoUri);
      if (uploaded) newPhotoUrl = uploaded;
    }

    const dobString = editDob ? editDob.toISOString().split('T')[0] : null;

    // Try full update including extended columns (added in migration 20260619000002+)
    const fullUpdates: Record<string, unknown> = {
      full_name: editName.trim(),
      jersey_number: editJersey ? parseInt(editJersey, 10) : null,
      date_of_birth: dobString,
      position: editPosition || null,
      secondary_position: editSecondary || null,
      preferred_foot: editFoot || null,
      notes: editNotes.trim() || null,
      photo_url: newPhotoUrl,
      is_private: editPrivate,
    };

    let { error } = await (supabase.from('players') as any)
      .update(fullUpdates)
      .eq('id', player.id);

    // Migrations not yet applied — schema cache error means the new columns don't exist.
    // Degrade silently: save what we can with available columns.
    if (error?.message?.includes('schema cache')) {
      error = null;

      // Try saving photo_url on its own first (added in a separate migration)
      if (newPhotoUrl !== player.photo_url) {
        const { error: photoErr } = await (supabase.from('players') as any)
          .update({ photo_url: newPhotoUrl })
          .eq('id', player.id);
        if (photoErr?.message?.includes('schema cache')) {
          newPhotoUrl = player.photo_url; // column doesn't exist yet; don't reflect in state
        }
      }

      // Always save the guaranteed-to-exist base columns
      const { error: baseErr } = await (supabase.from('players') as any)
        .update({
          full_name: editName.trim(),
          jersey_number: editJersey ? parseInt(editJersey, 10) : null,
          position: editPosition || null,
        })
        .eq('id', player.id);
      error = baseErr ?? null;
    }

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message ?? 'Could not save changes. Please try again.');
      return;
    }

    setPlayer((prev) => prev ? {
      ...prev,
      full_name: editName.trim(),
      jersey_number: editJersey ? parseInt(editJersey, 10) : null,
      date_of_birth: dobString,
      position: editPosition || null,
      secondary_position: editSecondary || null,
      preferred_foot: (editFoot || null) as PlayerDetail['preferred_foot'],
      notes: editNotes.trim() || null,
      photo_url: newPhotoUrl,
      is_private: editPrivate,
      profile_avatar_url: prev.profile_avatar_url,
    } : prev);
    setShowEdit(false);
  }

  async function toggleInjured() {
    if (!player) return;
    const newVal = !player.is_injured;
    await supabase.from('players').update({ is_injured: newVal }).eq('id', player.id);
    setPlayer((prev) => prev ? { ...prev, is_injured: newVal } : prev);
  }

  function confirmDelete() {
    Alert.alert(
      'Remove Player',
      `Remove ${player?.full_name} from the roster? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    if (!player) return;
    setDeleting(true);
    await supabase.from('players').delete().eq('id', player.id);
    router.back();
  }

  function openAddGuardian() {
    setEditingInvite(null);
    setGuardianName('');
    setGuardianEmail('');
    setGuardianPhone('');
    setGuardianRel('');
    setShowAddGuardian(true);
  }

  function openEditGuardian(invite: Invite) {
    setEditingInvite(invite);
    setGuardianName(invite.guardian_name ?? '');
    setGuardianEmail(invite.email);
    setGuardianPhone(invite.phone ?? '');
    setGuardianRel(invite.relationship ?? '');
    setShowAddGuardian(true);
  }

  async function handleSaveGuardian() {
    if (!player || !team || !profile) return;
    setSavingInvite(true);

    if (editingInvite) {
      // Update existing invite
      await (supabase as any).from('invites').update({
        guardian_name: guardianName.trim() || null,
        phone: guardianPhone.trim() || null,
        relationship: guardianRel || null,
      }).eq('id', editingInvite.id);
    } else {
      // Create new invite
      if (!guardianEmail.trim()) { setSavingInvite(false); return; }
      const { error } = await (supabase as any).from('invites').insert({
        team_id: team.id,
        player_id: player.id,
        email: guardianEmail.trim().toLowerCase(),
        guardian_name: guardianName.trim() || null,
        phone: guardianPhone.trim() || null,
        relationship: guardianRel || null,
        created_by: profile.id,
      });
      if (error) {
        setSavingInvite(false);
        Alert.alert('Error', 'Could not save guardian. Please try again.');
        return;
      }
    }

    setSavingInvite(false);
    setShowAddGuardian(false);
    loadGuardians();
  }

  function confirmRevokeInvite(invite: Invite) {
    Alert.alert(
      'Remove Guardian',
      `Remove ${invite.guardian_name ?? invite.email} from this player's guardians?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await (supabase as any).from('invites').delete().eq('id', invite.id);
            loadGuardians();
          },
        },
      ]
    );
  }

  async function handleResendInvite(invite: Invite) {
    if (!profile || !team || !player) return;
    const teamName = team.name;
    const deepLink = `https://pulse-fc.app/join?token=${invite.token}`;
    const displayName = invite.guardian_name ?? 'there';
    const subject = `Reminder: Your child has been added to ${teamName} on Pulse FC`;
    const body = `Hi ${displayName},\n\nJust a reminder — ${player.full_name} has been added to ${teamName} on Pulse FC.\n\nAccept your invite and download the app:\n${deepLink}\n\nOr enter your invite code: ${invite.token}\n\n— ${profile.full_name ?? 'Your Coach'}`;
    try {
      await supabase.functions.invoke('send-team-email', {
        body: {
          to: [{ email: invite.email, name: invite.guardian_name ?? '' }],
          cc: [], subject, body, reply_to: null,
          from_name: profile.full_name ?? 'Pulse FC',
          team_name: teamName,
          attachments: [],
          club_logo_url: logoUrl,
          club_name: clubName,
          primary_color: primaryColor,
        },
      });
      Alert.alert('Invite resent', `Reminder sent to ${invite.email}.`);
    } catch {
      Alert.alert('Failed', 'Could not resend the invite. Please try again.');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  if (!player) {
    return (
      <View style={st.center}>
        <Text style={st.errorText}>Player not found.</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>

      <ClubHeader
        title={player.full_name.split(' ')[0]}
        onBack={() => router.back()}
        right={canEdit ? (
          <TouchableOpacity
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' }}
            onPress={openEdit}
          >
            <Ionicons name="pencil-outline" size={18} color="#fff" />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* ── Hero ── */}
      <View style={st.hero}>
        {(() => {
          const pc = player.position ? (POS[player.position] ?? null) : null;
          const ringColor = pc ? pc.primary : primaryColor;
          return (
            <View style={[st.avatar, { borderColor: ringColor, shadowColor: ringColor }]}>
              {player.photo_url ? (
                <Image source={{ uri: player.photo_url }} style={st.avatarPhoto} />
              ) : (
                <Text style={[st.avatarText, { color: ringColor }]}>{initials(player.full_name)}</Text>
              )}
            </View>
          );
        })()}
        <Text style={st.playerName}>{player.full_name}</Text>
        <View style={st.badgeRow}>
          {player.position && (() => {
            const pc = POS[player.position];
            return pc ? (
              <View style={[st.badge, { backgroundColor: pc.bg, borderColor: pc.border }]}>
                <Text style={[st.badgeText, { color: pc.primary }]}>{player.position}</Text>
              </View>
            ) : (
              <View style={st.badge}><Text style={st.badgeText}>{player.position}</Text></View>
            );
          })()}
          {player.secondary_position && (() => {
            const pc = POS[player.secondary_position];
            return pc ? (
              <View style={[st.badge, { backgroundColor: pc.bg, borderColor: pc.border, opacity: 0.65 }]}>
                <Text style={[st.badgeText, { color: pc.primary }]}>{player.secondary_position}</Text>
              </View>
            ) : (
              <View style={[st.badge, { borderStyle: 'dashed' }]}><Text style={st.badgeText}>{player.secondary_position}</Text></View>
            );
          })()}
          {player.jersey_number != null && (
            <View style={[st.badge, st.badgeJersey, { borderColor: rgba(0.3), backgroundColor: rgba(0.08) }]}>
              <Text style={[st.badgeText, { color: primaryColor }]}>
                #{player.jersey_number}
              </Text>
            </View>
          )}
        </View>

        {/* Injury flag — coaches can toggle, everyone can see if set */}
        {(player.is_injured || isCoach) && (
          <TouchableOpacity
            onPress={isCoach ? toggleInjured : undefined}
            activeOpacity={isCoach ? 0.7 : 1}
            style={[
              st.injuredBadge,
              player.is_injured
                ? { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)' }
                : { backgroundColor: 'rgba(156,163,175,0.1)', borderColor: 'rgba(156,163,175,0.2)' },
            ]}
          >
            <Ionicons
              name="bandage-outline"
              size={13}
              color={player.is_injured ? '#ef4444' : PULSE_COLORS.ui.muted}
            />
            <Text style={[st.injuredBadgeText, { color: player.is_injured ? '#ef4444' : PULSE_COLORS.ui.muted }]}>
              {player.is_injured ? 'Injured' : isCoach ? 'Mark injured' : ''}
            </Text>
            {isCoach && player.is_injured && (
              <Ionicons name="close-circle" size={13} color="rgba(239,68,68,0.5)" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        )}

        {/* Private badge for non-privileged parents */}
        {player.is_private && !isCoach && !isMyPlayer && (
          <View style={st.privateBadge}>
            <Ionicons name="lock-closed" size={11} color={PULSE_COLORS.ui.muted} />
            <Text style={st.privateBadgeText}>Private profile</Text>
          </View>
        )}

        {/* Age + preferred foot — visible to all team members */}
        {(player.date_of_birth || player.preferred_foot) && (
          <View style={st.heroMeta}>
            {player.date_of_birth && (
              <View style={st.heroMetaItem}>
                <Ionicons name="calendar-outline" size={12} color={PULSE_COLORS.ui.muted} />
                <Text style={st.heroMetaText}>Age {ageFromDob(player.date_of_birth)}</Text>
              </View>
            )}
            {player.date_of_birth && player.preferred_foot && (
              <Text style={st.heroMetaDot}>·</Text>
            )}
            {player.preferred_foot && (
              <View style={st.heroMetaItem}>
                <Ionicons name="footsteps-outline" size={12} color={PULSE_COLORS.ui.muted} />
                <Text style={st.heroMetaText}>{FOOT_LABEL[player.preferred_foot]}</Text>
              </View>
            )}
          </View>
        )}

        {/* Notes — coaches and linked parent only */}
        {player.notes && (isCoach || isMyPlayer) && (
          <View style={st.heroNotes}>
            <Text style={st.heroNotesText} numberOfLines={2}>{player.notes}</Text>
          </View>
        )}
      </View>

      {/* ── Tab bar ── */}
      <View style={st.tabBar}>
        <TouchableOpacity
          style={[st.tab, activeTab === 'player' && [st.tabActive, { borderBottomColor: primaryColor }]]}
          onPress={() => setActiveTab('player')}
        >
          <Text style={[st.tabText, activeTab === 'player' && st.tabTextActive]}>Player</Text>
        </TouchableOpacity>
        {(isCoach || isMyPlayer) && (
          <TouchableOpacity
            style={[st.tab, activeTab === 'guardians' && [st.tabActive, { borderBottomColor: primaryColor }]]}
            onPress={() => setActiveTab('guardians')}
          >
            <Text style={[st.tabText, activeTab === 'guardians' && st.tabTextActive]}>Guardians</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tab content ── */}
      {activeTab === 'player' ? (
        <PlayerTab
          player={player}
          rsvpHistory={rsvpHistory}
          matchTimes={matchTimes}
          isCoach={isCoach}
          isMyPlayer={isMyPlayer}
          canSeeDetails={canSeeDetails}
          invites={invites}
          guardianProfile={guardianProfile}
          onDelete={confirmDelete}
          deleting={deleting}
        />
      ) : (
        <GuardiansTab
          isCoach={isCoach}
          isMyPlayer={isMyPlayer}
          loading={guardiansLoading}
          guardianProfile={guardianProfile}
          invites={invites}
          playerName={player.full_name}
          teamName={team?.name ?? ''}
          onAddGuardian={openAddGuardian}
          onEditInvite={openEditGuardian}
          onRevokeInvite={confirmRevokeInvite}
          onResendInvite={handleResendInvite}
        />
      )}

      {/* ── Edit player modal ── */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={st.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={st.editSheet}>
            {/* Header */}
            <View style={st.editSheetHeader}>
              <View style={st.sheetHandle} />
              <View style={st.editSheetTitleRow}>
                <Text style={st.sheetTitle}>Edit Player</Text>
                <TouchableOpacity onPress={() => setShowEdit(false)}>
                  <Ionicons name="close" size={22} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable body */}
            <ScrollView
              style={st.editSheetScroll}
              contentContainerStyle={st.editSheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >

              {/* ─ PHOTO ─ */}
              <TouchableOpacity style={st.photoPickerRow} onPress={pickPhoto} activeOpacity={0.75}>
                <View style={st.photoPickerThumb}>
                  {(editPhotoUri ?? player?.photo_url) ? (
                    <Image
                      source={{ uri: editPhotoUri ?? player!.photo_url! }}
                      style={st.photoPickerImg}
                    />
                  ) : (
                    <Ionicons name="person" size={28} color={PULSE_COLORS.ui.muted} />
                  )}
                  <View style={[st.photoPickerBadge, { backgroundColor: primaryColor }]}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                </View>
                <View style={st.photoPickerMeta}>
                  <Text style={st.photoPickerLabel}>Player photo</Text>
                  <Text style={st.photoPickerSub}>
                    {(editPhotoUri ?? player?.photo_url) ? 'Tap to change photo' : 'Tap to add photo'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>

              {/* ─ IDENTITY ─ */}
              <Text style={[st.editSection, { marginTop: 24 }]}>IDENTITY</Text>

              <Text style={st.inputLabel}>Full name *</Text>
              <TextInput
                style={st.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Jake Thompson"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                autoFocus
              />

              <Text style={st.inputLabel}>Date of birth</Text>
              <TouchableOpacity
                style={st.datePickerBtn}
                onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}
              >
                <Ionicons name="calendar-outline" size={16} color={PULSE_COLORS.ui.muted} />
                <Text style={[st.datePickerBtnText, !editDob && { color: PULSE_COLORS.ui.muted }]}>
                  {editDob
                    ? editDob.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Select date of birth'}
                </Text>
                {editDob && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setEditDob(null); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <Text style={st.inputLabel}>Jersey number</Text>
              <TextInput
                style={st.input}
                value={editJersey}
                onChangeText={setEditJersey}
                placeholder="10"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                keyboardType="number-pad"
              />

              {/* ─ ON THE PITCH ─ */}
              <Text style={[st.editSection, { marginTop: 24 }]}>ON THE PITCH</Text>

              <Text style={st.inputLabel}>Primary position</Text>
              <View style={st.chipRow}>
                {POSITIONS.map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[st.posChip, editPosition === pos && [st.posChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                    onPress={() => setEditPosition(editPosition === pos ? '' : pos)}
                  >
                    <Text style={[st.posChipText, editPosition === pos && [st.posChipTextActive, { color: primaryColor }]]}>
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.inputLabel}>Secondary position</Text>
              <View style={st.chipRow}>
                {POSITIONS.map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      st.posChip,
                      editSecondary === pos && [st.posChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }],
                      editPosition === pos && { opacity: 0.3 },
                    ]}
                    disabled={editPosition === pos}
                    onPress={() => setEditSecondary(editSecondary === pos ? '' : pos)}
                  >
                    <Text style={[st.posChipText, editSecondary === pos && [st.posChipTextActive, { color: primaryColor }]]}>
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.inputLabel}>Preferred foot</Text>
              <View style={st.chipRow}>
                {(['left', 'right', 'both'] as const).map((foot) => (
                  <TouchableOpacity
                    key={foot}
                    style={[st.posChip, editFoot === foot && [st.posChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                    onPress={() => setEditFoot(editFoot === foot ? '' : foot)}
                  >
                    <Text style={[st.posChipText, editFoot === foot && [st.posChipTextActive, { color: primaryColor }]]}>
                      {foot.charAt(0).toUpperCase() + foot.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ─ NOTES — coaches only ─ */}
              {isCoach && (
                <>
                  <Text style={[st.editSection, { marginTop: 24 }]}>NOTES</Text>
                  <Text style={st.inputLabel}>Coach notes</Text>
                  <TextInput
                    style={[st.input, st.notesInput]}
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Strengths, areas to develop, physical attributes…"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </>
              )}

              {/* ─ PRIVACY ─ */}
              <Text style={[st.editSection, { marginTop: 24 }]}>PRIVACY</Text>
              <TouchableOpacity
                style={st.privacyRow}
                onPress={() => setEditPrivate(!editPrivate)}
                activeOpacity={0.7}
              >
                <View style={st.privacyMeta}>
                  <Ionicons
                    name={editPrivate ? 'lock-closed-outline' : 'people-outline'}
                    size={18}
                    color={editPrivate ? primaryColor : PULSE_COLORS.ui.muted}
                  />
                  <View style={st.privacyText}>
                    <Text style={st.privacyLabel}>
                      {editPrivate ? 'Contact details private' : 'Contact details visible'}
                    </Text>
                    <Text style={st.privacySub}>
                      {editPrivate
                        ? 'Your contact info is only visible to coaches'
                        : 'Other parents on the team can contact you directly'}
                    </Text>
                  </View>
                </View>
                <View style={[st.toggle, editPrivate && [st.toggleOn, { backgroundColor: primaryColor }]]}>
                  <View style={[st.toggleThumb, editPrivate && st.toggleThumbOn]} />
                </View>
              </TouchableOpacity>

              {/* Actions */}
              <View style={[st.modalBtns, { marginTop: 28 }]}>
                <TouchableOpacity style={st.cancelBtn} onPress={() => setShowEdit(false)}>
                  <Text style={st.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.saveBtn, { backgroundColor: primaryColor }, !editName.trim() && { opacity: 0.4 }]}
                  onPress={handleSave}
                  disabled={!editName.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={st.saveBtnText}>Save Changes</Text>}
                </TouchableOpacity>
              </View>

              <View style={{ height: 32 }} />
            </ScrollView>
          </View>

          {/* ── DOB picker — inside the edit modal so it stacks on top on iOS ── */}
          {showDatePicker && (
            <View style={st.dobOverlay}>
              <TouchableOpacity style={st.dobDismiss} onPress={() => setShowDatePicker(false)} />
              <View style={st.dobSheet}>
                <View style={st.sheetHandle} />
                <View style={st.dobSheetHeader}>
                  <Text style={st.dobSheetTitle}>Date of Birth</Text>
                  <View style={st.dobHeaderBtns}>
                    {editDob && (
                      <TouchableOpacity
                        style={st.dobClearBtn}
                        onPress={() => { setEditDob(null); setShowDatePicker(false); }}
                      >
                        <Text style={st.dobClearText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={st.dobDoneBtn} onPress={() => setShowDatePicker(false)}>
                      <Text style={[st.dobDoneText, { color: primaryColor }]}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <DateTimePicker
                  value={editDob ?? new Date(2012, 0, 1)}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  minimumDate={new Date(1990, 0, 1)}
                  onChange={(_e, date) => { if (date) setEditDob(date); }}
                  textColor={PULSE_COLORS.ui.text}
                  style={st.dobPicker}
                />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add / edit guardian modal ── */}
      <Modal visible={showAddGuardian} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={st.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={st.editSheet}>
            <View style={st.editSheetHeader}>
              <View style={st.sheetHandle} />
              <View style={st.editSheetTitleRow}>
                <Text style={st.sheetTitle}>
                  {editingInvite ? 'Edit Guardian' : 'Add Guardian'}
                </Text>
                <TouchableOpacity onPress={() => setShowAddGuardian(false)}>
                  <Ionicons name="close" size={22} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={st.editSheetScroll}
              contentContainerStyle={st.editSheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* ─ CONTACT ─ */}
              <Text style={st.editSection}>CONTACT</Text>

              <Text style={st.inputLabel}>Full name</Text>
              <TextInput
                style={st.input}
                value={guardianName}
                onChangeText={setGuardianName}
                placeholder="Sarah Thompson"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                autoFocus
              />

              <Text style={st.inputLabel}>
                Email address{!editingInvite ? ' *' : ''}
              </Text>
              <TextInput
                style={[st.input, !!editingInvite && { opacity: 0.5 }]}
                value={guardianEmail}
                onChangeText={setGuardianEmail}
                placeholder="parent@example.com"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!editingInvite}
              />

              <Text style={st.inputLabel}>Phone number</Text>
              <TextInput
                style={st.input}
                value={guardianPhone}
                onChangeText={setGuardianPhone}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                keyboardType="phone-pad"
              />

              {/* ─ RELATIONSHIP ─ */}
              <Text style={[st.editSection, { marginTop: 24 }]}>RELATIONSHIP</Text>
              <Text style={st.inputLabel}>Role</Text>
              <View style={st.chipRow}>
                {['Mother', 'Father', 'Guardian', 'Other'].map((rel) => (
                  <TouchableOpacity
                    key={rel}
                    style={[st.posChip, guardianRel === rel && [st.posChipActive, { borderColor: primaryColor, backgroundColor: rgba(0.12) }]]}
                    onPress={() => setGuardianRel(guardianRel === rel ? '' : rel)}
                  >
                    <Text style={[st.posChipText, guardianRel === rel && [st.posChipTextActive, { color: primaryColor }]]}>
                      {rel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!editingInvite && (
                <Text style={st.inviteNote}>
                  An invite link will be sent to this email so they can download the app.
                </Text>
              )}

              <View style={[st.modalBtns, { marginTop: 28 }]}>
                <TouchableOpacity style={st.cancelBtn} onPress={() => setShowAddGuardian(false)}>
                  <Text style={st.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    st.saveBtn,
                    { backgroundColor: primaryColor },
                    !editingInvite && !guardianEmail.trim() && { opacity: 0.4 },
                  ]}
                  onPress={handleSaveGuardian}
                  disabled={(!editingInvite && !guardianEmail.trim()) || savingInvite}
                >
                  {savingInvite
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={st.saveBtnText}>
                        {editingInvite ? 'Save Changes' : 'Add Guardian'}
                      </Text>}
                </TouchableOpacity>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ImageEditor
        visible={photoEditorVisible}
        uri={photoEditorUri}
        primaryColor={primaryColor}
        onSave={(uri) => { setPhotoEditorVisible(false); setEditPhotoUri(uri); }}
        onCancel={() => setPhotoEditorVisible(false)}
      />

    </View>
  );
}

// ─── Player tab ───────────────────────────────────────────────────────────────

function PlayerTab({
  player,
  rsvpHistory,
  matchTimes,
  isCoach,
  isMyPlayer,
  canSeeDetails,
  invites,
  guardianProfile,
  onDelete,
  deleting,
}: {
  player: PlayerDetail;
  rsvpHistory: EventRsvp[];
  matchTimes: MatchTime[];
  isCoach: boolean;
  isMyPlayer: boolean;
  canSeeDetails: boolean;
  invites: Invite[];
  guardianProfile: GuardianProfile | null;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { primaryColor, rgba } = useClub();
  const primaryInvite = invites[0] ?? null;
  const guardianName = primaryInvite?.guardian_name ?? guardianProfile?.full_name ?? null;
  const gameTimes     = matchTimes.filter((m) => m.event_type === 'game');
  const gamesPlayed   = gameTimes.length;
  const totalMins     = gameTimes.reduce((s, m) => s + m.minutes, 0);
  const totalAvail    = gameTimes.reduce((s, m) => s + m.availableMins, 0);
  const gamesStarted  = gameTimes.filter((m) => m.started).length;
  const timePct       = totalAvail > 0 ? Math.round((totalMins / totalAvail) * 100) : null;

  const gameRsvps     = rsvpHistory.filter((r) => r.event_type === 'game');
  const trainingRsvps = rsvpHistory.filter((r) => r.event_type === 'training');
  const gameAttendRate = gameRsvps.length > 0
    ? Math.round((gameRsvps.filter((r) => r.status === 'attending').length / gameRsvps.length) * 100)
    : null;
  const trainingAttendRate = trainingRsvps.length > 0
    ? Math.round((trainingRsvps.filter((r) => r.status === 'attending').length / trainingRsvps.length) * 100)
    : null;
  const hasAttendData = gameAttendRate !== null || trainingAttendRate !== null;

  const hasPlayingData = isCoach && gamesPlayed > 0;
  const hasAnyStats    = canSeeDetails && (hasPlayingData || (isCoach && hasAttendData));

  return (
    <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>

      {/* ── Season overview ── */}
      {hasAnyStats && (
        <>
          <Text style={st.sectionLabel}>SEASON OVERVIEW</Text>

          {/* Playing time hero card */}
          {hasPlayingData && (
            <View style={st.ptHeroCard}>
              <View style={st.ptHeroTop}>
                <View>
                  <Text style={st.ptHeroLabel}>Playing Time</Text>
                  <View style={st.ptHeroRow}>
                    <Text style={st.ptHeroPct}>
                      {timePct !== null ? `${timePct}%` : '—'}
                    </Text>
                    <Text style={st.ptHeroMins}>{totalMins} mins</Text>
                  </View>
                </View>
                <View style={st.ptHeroRight}>
                  <Text style={st.ptHeroStatNum}>{gamesPlayed}</Text>
                  <Text style={st.ptHeroStatLabel}>Games</Text>
                </View>
                <View style={[st.ptHeroRight, { borderLeftWidth: 1, borderLeftColor: PULSE_COLORS.ui.border }]}>
                  <Text style={st.ptHeroStatNum}>{gamesStarted}</Text>
                  <Text style={st.ptHeroStatLabel}>Started</Text>
                </View>
              </View>

              {/* Progress bar */}
              {timePct !== null && (
                <View style={st.progressTrack}>
                  <View
                    style={[
                      st.progressFill,
                      { width: `${Math.min(timePct, 100)}%` as any, backgroundColor: primaryColor },
                    ]}
                  />
                </View>
              )}
            </View>
          )}

          {/* Attendance card — split by type */}
          {isCoach && hasAttendData && (
            <View style={[st.attendCard, hasPlayingData && { marginTop: 10 }]}>
              {[
                { label: 'Games', rsvps: gameRsvps, rate: gameAttendRate },
                { label: 'Training', rsvps: trainingRsvps, rate: trainingAttendRate },
              ].filter((row) => row.rate !== null).map((row, i, arr) => {
                const attended = row.rsvps.filter((r) => r.status === 'attending').length;
                const pct = row.rate!;
                const color = pct >= 80 ? primaryColor : pct >= 60 ? '#F59E0B' : '#F87171';
                return (
                  <View
                    key={row.label}
                    style={[st.attendRow, i < arr.length - 1 && st.attendRowBorder]}
                  >
                    <View style={st.attendLeft}>
                      <Text style={st.attendLabel}>{row.label}</Text>
                      <Text style={st.attendSub}>{attended} of {row.rsvps.length}</Text>
                    </View>
                    <View style={st.attendRight}>
                      <Text style={[st.attendPct, { color }]}>{pct}%</Text>
                      <View style={st.attendTrack}>
                        <View style={[st.attendFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* ── Playing time per game ── */}
      {isCoach && matchTimes.length > 0 && (
        <>
          <Text style={[st.sectionLabel, hasAnyStats && { marginTop: 24 }]}>PLAYING TIME</Text>
          <View style={st.card}>
            {matchTimes.map((m, i) => {
              const gamePct = m.availableMins > 0
                ? Math.round((m.minutes / m.availableMins) * 100)
                : null;
              const typeColor = TYPE_COLORS[m.event_type] ?? TYPE_COLORS.other;

              return (
                <View key={m.event_id} style={[st.ptRow, i < matchTimes.length - 1 && st.tableRowBorder]}>
                  <View style={st.ptRowTop}>
                    <View style={[st.typeDot, { backgroundColor: typeColor }]} />
                    <Text style={st.tableTitle} numberOfLines={1}>{m.event_title}</Text>
                    <Text style={st.tableDate}>{formatShortDate(m.event_date)}</Text>
                    <View style={st.ptRowRight}>
                      <Text style={[st.tableMins, { color: primaryColor }]}>{m.minutes}'</Text>
                      {gamePct !== null && (
                        <Text style={st.ptRowPct}>{gamePct}%</Text>
                      )}
                    </View>
                    {m.started
                      ? <View style={[st.startedPill, { backgroundColor: rgba(0.14), borderColor: rgba(0.35) }]}><Text style={[st.startedText, { color: primaryColor }]}>S</Text></View>
                      : <View style={st.subPill}><Text style={st.subText}>SUB</Text></View>}
                  </View>

                  {/* Per-game mini bar */}
                  {m.availableMins > 0 && (
                    <View style={st.miniTrack}>
                      <View style={[
                        st.miniFill,
                        { width: `${Math.min(Math.round((m.minutes / m.availableMins) * 100), 100)}%` as any, backgroundColor: primaryColor },
                      ]} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── RSVP history — coaches and own parent only ── */}
      {(isCoach || isMyPlayer) && (
      <><Text style={[st.sectionLabel, (hasAnyStats || (isCoach && matchTimes.length > 0)) && { marginTop: 24 }]}>
        RECENT EVENTS
      </Text>
      {rsvpHistory.length === 0 ? (
        <View style={st.emptyEvents}>
          <Ionicons name="calendar-outline" size={22} color={PULSE_COLORS.ui.muted} />
          <Text style={st.emptyText}>No events recorded yet.</Text>
        </View>
      ) : (
        <View style={st.card}>
          {rsvpHistory.map((e, i) => {
            const isAttending    = e.status === 'attending';
            const isNotAttending = e.status === 'not_attending';
            const statusColor =
              isAttending    ? PULSE_COLORS.rsvp.attending
              : isNotAttending ? PULSE_COLORS.rsvp.not_attending
              : PULSE_COLORS.ui.muted;
            const statusIcon =
              isAttending    ? 'checkmark-circle'
              : isNotAttending ? 'close-circle'
              : 'remove-circle-outline';

            return (
              <View key={e.event_id} style={[st.tableRow, i < rsvpHistory.length - 1 && st.tableRowBorder]}>
                <View style={[st.typeDot, { backgroundColor: TYPE_COLORS[e.event_type] ?? TYPE_COLORS.other }]} />
                <Text style={st.tableTitle} numberOfLines={1}>{e.event_title}</Text>
                <Text style={st.tableDate}>{formatShortDate(e.event_date)}</Text>
                <Ionicons name={statusIcon as any} size={18} color={statusColor} />
              </View>
            );
          })}
        </View>
      )}
      </>)}

      {/* ── Guardian contact — for other parents when player is not private ── */}
      {!isCoach && !isMyPlayer && (
        <>
          <Text style={[st.sectionLabel, { marginTop: 24 }]}>GUARDIAN CONTACT</Text>
          {player.is_private ? (
            <View style={st.card}>
              <View style={[st.tableRow, { gap: 10 }]}>
                <Ionicons name="lock-closed-outline" size={16} color={PULSE_COLORS.ui.muted} />
                <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 14 }}>Contact details are private</Text>
              </View>
            </View>
          ) : primaryInvite ? (
            <View style={st.card}>
              {guardianName && (
                <View style={[st.tableRow, st.tableRowBorder]}>
                  <View style={[st.typeDot, { backgroundColor: 'transparent' }]} />
                  <Ionicons name="person-outline" size={15} color={PULSE_COLORS.ui.muted} style={{ marginRight: 8 }} />
                  <Text style={[st.tableTitle, { flex: 1 }]}>{guardianName}</Text>
                </View>
              )}
              <TouchableOpacity
                style={st.tableRow}
                onPress={() => Linking.openURL(`mailto:${primaryInvite.email}`)}
                activeOpacity={0.65}
              >
                <View style={[st.typeDot, { backgroundColor: 'transparent' }]} />
                <Ionicons name="mail-outline" size={15} color={primaryColor} style={{ marginRight: 8 }} />
                <Text style={[st.tableTitle, { flex: 1, color: primaryColor }]}>{primaryInvite.email}</Text>
                <Ionicons name="chevron-forward" size={13} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
              {primaryInvite.phone && (
                <>
                  <View style={st.tableRowBorder} />
                  <TouchableOpacity
                    style={st.tableRow}
                    onPress={() => Linking.openURL(`tel:${primaryInvite.phone}`)}
                    activeOpacity={0.65}
                  >
                    <View style={[st.typeDot, { backgroundColor: 'transparent' }]} />
                    <Ionicons name="call-outline" size={15} color={primaryColor} style={{ marginRight: 8 }} />
                    <Text style={[st.tableTitle, { flex: 1, color: primaryColor }]}>{primaryInvite.phone}</Text>
                    <Ionicons name="chevron-forward" size={13} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            <View style={st.card}>
              <View style={[st.tableRow, { gap: 10, justifyContent: 'center' }]}>
                <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 14 }}>No contact details added yet</Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* ── Remove player ── */}
      {isCoach && (
        <TouchableOpacity style={st.deleteBtn} onPress={onDelete} disabled={deleting}>
          {deleting
            ? <ActivityIndicator size="small" color={PULSE_COLORS.status.error} />
            : <>
                <Ionicons name="trash-outline" size={16} color={PULSE_COLORS.status.error} />
                <Text style={st.deleteBtnText}>Remove from Roster</Text>
              </>}
        </TouchableOpacity>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

// ─── Guardians tab ────────────────────────────────────────────────────────────

function GuardiansTab({
  isCoach,
  isMyPlayer,
  loading,
  guardianProfile,
  invites,
  playerName,
  teamName,
  onAddGuardian,
  onEditInvite,
  onRevokeInvite,
  onResendInvite,
}: {
  isCoach: boolean;
  isMyPlayer: boolean;
  loading: boolean;
  guardianProfile: GuardianProfile | null;
  invites: Invite[];
  playerName: string;
  teamName: string;
  onAddGuardian: () => void;
  onEditInvite: (invite: Invite) => void;
  onRevokeInvite: (invite: Invite) => void;
  onResendInvite: (invite: Invite) => void;
}) {
  const { primaryColor, rgba } = useClub();
  const canManage = isCoach || isMyPlayer;
  const hasAny = guardianProfile || invites.length > 0;

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={primaryColor} size="small" />
      </View>
    );
  }

  // All invites sorted: accepted first, then pending
  const sorted = [...invites].sort((a, b) =>
    (b.accepted_at ? 1 : 0) - (a.accepted_at ? 1 : 0)
  );

  return (
    <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>

      {/* ── Linked app profile ── */}
      {guardianProfile && (
        <>
          <Text style={st.sectionLabel}>APP ACCOUNT</Text>
          <View style={st.card}>
            <View style={st.guardianRow}>
              <View style={[st.guardianAvatar, { borderColor: rgba(0.25) }]}>
                <Text style={[st.guardianAvatarText, { color: primaryColor }]}>
                  {initials(guardianProfile.full_name ?? 'G')}
                </Text>
              </View>
              <View style={st.guardianMeta}>
                <Text style={st.guardianName}>{guardianProfile.full_name ?? 'Guardian'}</Text>
                <Text style={st.guardianSub}>Active on Pulse FC</Text>
              </View>
              <View style={[st.linkedBadge, { backgroundColor: rgba(0.10), borderColor: rgba(0.22) }]}>
                <View style={[st.linkedDot, { backgroundColor: primaryColor }]} />
                <Text style={[st.linkedBadgeText, { color: primaryColor }]}>Linked</Text>
              </View>
            </View>
          </View>
        </>
      )}

      {/* ── Guardian contact cards ── */}
      {sorted.length > 0 && (
        <>
          <Text style={[st.sectionLabel, guardianProfile && { marginTop: 24 }]}>GUARDIANS</Text>
          {sorted.map((invite, i) => {
            const displayName = invite.guardian_name || invite.email;
            const isAccepted  = !!invite.accepted_at;

            return (
              <View key={invite.id} style={[st.guardianCard, i > 0 && { marginTop: 10 }]}>

                {/* Top row: avatar + name + status + actions */}
                <View style={st.guardianCardTop}>
                  <View style={[st.guardianAvatar, isAccepted && { borderColor: rgba(0.3) }, { borderColor: rgba(0.25) }]}>
                    <Text style={[st.guardianAvatarText, { color: primaryColor }]}>
                      {initials(invite.guardian_name || invite.email)}
                    </Text>
                  </View>
                  <View style={st.guardianMeta}>
                    <View style={st.guardianNameRow}>
                      <Text style={st.guardianName} numberOfLines={1}>{displayName}</Text>
                      {invite.relationship && (
                        <View style={st.relBadge}>
                          <Text style={st.relBadgeText}>{invite.relationship}</Text>
                        </View>
                      )}
                    </View>
                    {isAccepted ? (
                      <Text style={[st.guardianSub, { color: primaryColor }]}>
                        Joined {formatShortDate(invite.accepted_at!)}
                      </Text>
                    ) : (
                      <Text style={st.guardianSub}>
                        Invite pending · {formatShortDate(invite.created_at)}
                      </Text>
                    )}
                  </View>
                  {canManage && (
                    <View style={st.guardianCardActions}>
                      {!isAccepted && (
                        <TouchableOpacity style={st.resendBtn} onPress={() => onResendInvite(invite)}>
                          <Ionicons name="send-outline" size={13} color={primaryColor} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={st.editGuardianBtn} onPress={() => onEditInvite(invite)}>
                        <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={st.revokeBtn} onPress={() => onRevokeInvite(invite)}>
                        <Ionicons name="close" size={13} color={PULSE_COLORS.ui.muted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Contact details */}
                {canManage && (
                  <View style={st.contactRows}>
                    {/* Email */}
                    <View style={st.contactRow}>
                      <Ionicons name="mail-outline" size={15} color={PULSE_COLORS.ui.muted} />
                      <Text style={st.contactText} numberOfLines={1}>{invite.email}</Text>
                      <TouchableOpacity
                        style={st.contactBtn}
                        onPress={() => Linking.openURL(`mailto:${invite.email}`)}
                      >
                        <Text style={st.contactBtnText}>Email</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Phone */}
                    {invite.phone ? (
                      <View style={[st.contactRow, st.contactRowTop]}>
                        <Ionicons name="call-outline" size={15} color={PULSE_COLORS.ui.muted} />
                        <Text style={st.contactText}>{invite.phone}</Text>
                        <View style={st.contactBtns}>
                          <TouchableOpacity
                            style={st.contactBtn}
                            onPress={() => Linking.openURL(`tel:${invite.phone}`)}
                          >
                            <Text style={st.contactBtnText}>Call</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[st.contactBtn, { marginLeft: 6 }]}
                            onPress={() => Linking.openURL(`sms:${invite.phone}`)}
                          >
                            <Text style={st.contactBtnText}>Text</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : canManage ? (
                      <TouchableOpacity
                        style={[st.contactRow, st.contactRowTop]}
                        onPress={() => onEditInvite(invite)}
                      >
                        <Ionicons name="call-outline" size={15} color={PULSE_COLORS.ui.border} />
                        <Text style={[st.contactText, { color: PULSE_COLORS.ui.border }]}>
                          Add phone number
                        </Text>
                        <Ionicons name="add-circle-outline" size={16} color={PULSE_COLORS.ui.border} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {/* ── Empty state ── */}
      {!hasAny && (
        <View style={st.emptyGuardians}>
          <View style={st.emptyIcon}>
            <Ionicons name="people-outline" size={28} color={PULSE_COLORS.ui.muted} />
          </View>
          <Text style={st.emptyTitle}>No guardians yet</Text>
          <Text style={st.emptySub}>
            Add a guardian's contact info so you can reach them in an emergency.
          </Text>
        </View>
      )}

      {/* ── Add guardian ── */}
      {canManage && (
        <TouchableOpacity
          style={[st.addGuardianBtn, { borderColor: rgba(0.35), backgroundColor: rgba(0.08) }, hasAny && { marginTop: 20 }]}
          onPress={onAddGuardian}
        >
          <Ionicons name="person-add-outline" size={16} color={primaryColor} />
          <Text style={[st.addGuardianText, { color: primaryColor }]}>
            {hasAny ? 'Add Another Guardian' : 'Add Guardian'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },
  errorText: { color: PULSE_COLORS.ui.textSecondary, fontSize: 16 },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 58, paddingBottom: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  iconBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // ── Hero
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 20 },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#0A1810',
    borderWidth: 2.5, borderColor: PULSE_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: PULSE_COLORS.brand.green,
    shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
  },
  avatarText: { fontSize: 34, fontWeight: '900', color: PULSE_COLORS.brand.green },
  avatarPhoto: { width: 100, height: 100, borderRadius: 50 },

  // ── Photo picker in edit modal
  photoPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  photoPickerThumb: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#1A1A1A',
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  photoPickerImg: { width: 60, height: 60, borderRadius: 30 },
  photoPickerBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: PULSE_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.background,
  },
  photoPickerMeta: { flex: 1 },
  photoPickerLabel: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  photoPickerSub: { fontSize: 12, color: PULSE_COLORS.ui.muted },

  playerName: {
    fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text,
    letterSpacing: -0.5, marginBottom: 10,
  },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  badgeJersey: { borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.08)' },
  badgeText:   { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  // Hero sub-info
  heroMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
  },
  heroMetaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText:  { fontSize: 12, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  heroMetaDot:   { fontSize: 12, color: PULSE_COLORS.ui.border },
  heroNotes: {
    marginTop: 12, marginHorizontal: 20,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 12, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  heroNotesText: { fontSize: 13, color: PULSE_COLORS.ui.muted, lineHeight: 18, fontStyle: 'italic' },

  // ── Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  tab:           { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: PULSE_COLORS.brand.green },
  tabText:       { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.muted },
  tabTextActive: { color: PULSE_COLORS.ui.text, fontWeight: '700' },

  // ── Scroll
  scrollContent: { padding: 16 },

  // ── Section labels
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.muted,
    letterSpacing: 2, marginBottom: 10,
  },

  // ── Card container
  card: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },

  // ── Playing time hero card
  ptHeroCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    padding: 16,
  },
  ptHeroTop: {
    flexDirection: 'row', alignItems: 'flex-start',
  },
  ptHeroLabel: {
    fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600', marginBottom: 4,
  },
  ptHeroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  ptHeroPct: {
    fontSize: 36, fontWeight: '900', color: PULSE_COLORS.ui.text, letterSpacing: -1,
  },
  ptHeroMins: {
    fontSize: 14, color: PULSE_COLORS.ui.muted, fontWeight: '500',
  },
  ptHeroRight: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4,
  },
  ptHeroStatNum:   { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.5 },
  ptHeroStatLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2 },

  // Progress bar — playing time
  progressTrack: {
    height: 5, borderRadius: 3, backgroundColor: '#222',
    overflow: 'hidden', marginTop: 16,
  },
  progressFill: {
    height: 5, borderRadius: 3, backgroundColor: PULSE_COLORS.brand.green,
  },

  // ── Attendance card
  attendCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  attendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  attendRowBorder: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  attendLeft:  { flex: 1 },
  attendLabel: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  attendSub:   { fontSize: 11, color: PULSE_COLORS.ui.muted },
  attendRight: { alignItems: 'flex-end', minWidth: 56 },
  attendPct:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 5 },
  attendTrack: {
    width: 72, height: 4, borderRadius: 2, backgroundColor: '#222', overflow: 'hidden',
  },
  attendFill: { height: 4, borderRadius: 2 },

  // ── Playing time rows (with per-game bar)
  ptRow: {
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
  },
  ptRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ptRowRight: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  ptRowPct: {
    fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600',
  },
  miniTrack: {
    height: 3, borderRadius: 1.5, backgroundColor: '#1E1E1E',
    overflow: 'hidden', marginTop: 8,
  },
  miniFill: {
    height: 3, borderRadius: 1.5, backgroundColor: PULSE_COLORS.brand.green, opacity: 0.7,
  },

  // ── Table rows (RSVP history)
  tableRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  typeDot:    { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  tableTitle: { flex: 1, fontSize: 14, color: PULSE_COLORS.ui.text, fontWeight: '500' },
  tableDate:  { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
  tableMins:  { fontSize: 14, fontWeight: '800', color: PULSE_COLORS.brand.green, fontVariant: ['tabular-nums'] },

  startedPill: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(34,197,94,0.14)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  startedText: { fontSize: 9, fontWeight: '900', color: PULSE_COLORS.brand.green },
  subPill: {
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  subText: { fontSize: 9, fontWeight: '700', color: PULSE_COLORS.ui.muted },

  emptyEvents: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  emptyText: { color: PULSE_COLORS.ui.muted, fontSize: 14 },

  // ── Delete
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 28,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)',
    backgroundColor: 'rgba(239,68,68,0.07)',
  },
  deleteBtnText: { color: PULSE_COLORS.status.error, fontWeight: '700', fontSize: 15 },

  // ── Guardian rows
  guardianRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  guardianAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#0F1F14',
    borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  guardianAvatarMail: {
    backgroundColor: '#161616',
    borderColor: PULSE_COLORS.ui.border,
  },
  guardianAvatarText: { fontSize: 16, fontWeight: '900', color: PULSE_COLORS.brand.green },
  guardianMeta: { flex: 1 },
  guardianName: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  guardianSub:  { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },

  linkedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)',
  },
  linkedDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: PULSE_COLORS.brand.green,
  },
  linkedBadgeText: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.brand.green },

  pendingBadge: {
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.muted },

  pendingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  revokeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Guardians empty state
  emptyGuardians: { alignItems: 'center', paddingTop: 32, paddingBottom: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  emptySub: {
    fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 20,
  },

  addGuardianBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  addGuardianText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green },

  // ── Guardian card (full contact)
  guardianCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  guardianCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  guardianNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  guardianCardActions: { flexDirection: 'row', gap: 6 },
  resendBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  editGuardianBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  relBadge: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8, borderWidth: 1, borderColor: '#2A2A2A',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  relBadgeText: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.5 },

  // Contact rows inside guardian card
  contactRows: {
    borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border,
    paddingHorizontal: 14, paddingVertical: 4,
  },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  contactRowTop: { borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  contactText: { flex: 1, fontSize: 13, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
  contactBtns: { flexDirection: 'row' },
  contactBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
    backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#2A2A2A',
  },
  contactBtnText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.text },

  inviteNote: {
    fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 17,
    marginTop: 12,
  },

  // ── Private badge on hero
  injuredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    marginTop: 8,
  },
  injuredBadgeText: { fontSize: 12, fontWeight: '700' },

  privateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    marginBottom: 8,
  },
  privateBadgeText: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // ── Privacy toggle
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  privacyMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  privacyText: { flex: 1 },
  privacyLabel: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  privacySub: { fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 16 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: PULSE_COLORS.ui.border,
    padding: 3, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: PULSE_COLORS.brand.green },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  // ── Date picker button
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 50, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  datePickerBtnText: {
    flex: 1, fontSize: 15, color: PULSE_COLORS.ui.text,
  },

  // ── DOB picker — absolute overlay inside edit modal
  dobOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end', zIndex: 100,
  },
  dobDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  dobSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  dobSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  dobSheetTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },
  dobHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dobClearBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  dobClearText: { fontSize: 15, color: PULSE_COLORS.ui.muted },
  dobDoneBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  dobDoneText: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green },
  dobPicker: { width: '100%', height: 200 },

  // ── Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },

  // Edit sheet — taller, scrollable
  editSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '92%',
    borderWidth: 1, borderColor: '#1E1E1E', borderBottomWidth: 0,
  },
  editSheetHeader: {
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4,
  },
  editSheetTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, marginBottom: 4,
  },
  editSheetScroll: { flexGrow: 0 },
  editSheetContent: { paddingHorizontal: 24, paddingBottom: 20 },

  // Add guardian / simple sheet
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 48,
    borderWidth: 1, borderColor: '#1E1E1E', borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#2A2A2A',
    alignSelf: 'center', marginBottom: 8,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text },
  sheetSub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, marginTop: 6, marginBottom: 4, lineHeight: 18 },

  // Edit section headers
  editSection: {
    fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.muted,
    letterSpacing: 2, marginBottom: 2,
  },

  inputLabel: {
    fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.muted,
    letterSpacing: 0.5, marginBottom: 7, marginTop: 16,
  },
  input: {
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    color: PULSE_COLORS.ui.text, fontSize: 16,
  },
  notesInput: {
    height: 100, paddingTop: 13,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  posRow:  { flexDirection: 'row', gap: 8 },
  posChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#1A1A1A',
  },
  posChipActive:     { borderColor: PULSE_COLORS.brand.green, backgroundColor: 'rgba(34,197,94,0.12)' },
  posChipText:       { color: PULSE_COLORS.ui.muted, fontWeight: '700', fontSize: 13 },
  posChipTextActive: { color: PULSE_COLORS.brand.green },
  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 16,
    borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center',
  },
  cancelBtnText: { color: PULSE_COLORS.ui.muted, fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 2, padding: 15, borderRadius: 16,
    backgroundColor: PULSE_COLORS.brand.green, alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
});
