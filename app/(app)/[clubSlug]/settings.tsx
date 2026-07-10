import { useState, useEffect, useCallback } from 'react';
import Constants from 'expo-constants';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useActiveTeam } from '../../../hooks/TeamContext';
import { PULSE_COLORS } from '../../../constants/colors';
import { useClub } from '../../../hooks/useClub';
import ClubHeader from '../../../components/ui/ClubHeader';
import TeamEditModal from '../../../components/ui/TeamEditModal';
import ImageEditor from '../../../components/ui/ImageEditor';
import { useMapApp } from '../../../hooks/useMapApp';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifPrefs = {
  rsvp_reminders: boolean;
  announcements: boolean;
  messages: boolean;
  schedule_changes: boolean;
};

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  rsvp_reminders: true,
  announcements: true,
  messages: true,
  schedule_changes: true,
};

const ROLE_LABELS: Record<string, string> = {
  player:    'Parent / Guardian',
  coach:     'Coach',
  org_admin: 'Club Admin',
  app_admin: 'App Admin',
};

type LinkedPlayer = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  photo_url: string | null;
  team_id: string;
};

// ─── Icon cell helper ─────────────────────────────────────────────────────────

function IconCell({ name, color, bg }: { name: string; color: string; bg: string }) {
  return (
    <View style={[st.iconCell, { backgroundColor: bg }]}>
      <Ionicons name={name as any} size={16} color={color} />
    </View>
  );
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

function SettingsRow({
  icon, iconColor, iconBg, label, value, onPress, danger, children,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const content = (
    <View style={st.row}>
      <IconCell name={icon} color={iconColor} bg={iconBg} />
      <Text style={[st.rowLabel, danger && { color: PULSE_COLORS.status.error }]}>{label}</Text>
      {value ? <Text style={st.rowValue} numberOfLines={1}>{value}</Text> : null}
      {children}
      {onPress && !children ? (
        <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
      ) : null}
    </View>
  );
  return onPress
    ? <TouchableOpacity onPress={onPress} activeOpacity={0.65}>{content}</TouchableOpacity>
    : content;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { primaryColor, rgba, tagline: clubTagline, logoUrl, clubName: clubNameFromHook, secondaryColor, homeKitColor, awayKitColor, trainingKitColor, headerPattern } = useClub();
  const router = useRouter();
  const { profile, club, user, signOut, refreshProfile } = useAuth();
  const { allTeams, refetch: refetchTeams } = useActiveTeam();
  const mapApp = useMapApp();

  const [editingName, setEditingName] = useState(false);
  const [name, setName]               = useState(profile?.full_name ?? '');
  const [savingName, setSavingName]   = useState(false);

  const isOrgAdmin = profile?.role === 'org_admin';
  const [tagline, setTagline]                 = useState(clubTagline ?? '');
  const [editingTagline, setEditingTagline]   = useState(false);
  const [savingTagline, setSavingTagline]     = useState(false);

  const [editingClubName, setEditingClubName] = useState(false);
  const [clubNameDraft, setClubNameDraft]     = useState('');
  const [savingClubName, setSavingClubName]   = useState(false);
  const [logoUploading, setLogoUploading]     = useState(false);
  const [logoEditorUri, setLogoEditorUri]     = useState('');
  const [logoEditorVisible, setLogoEditorVisible] = useState(false);
  const [avatarEditorUri, setAvatarEditorUri] = useState('');
  const [avatarEditorVisible, setAvatarEditorVisible] = useState(false);
  const [colorTarget, setColorTarget]         = useState<'primary' | 'secondary' | 'home_kit' | 'away_kit' | 'training_kit' | null>(null);
  const [colorDraft, setColorDraft]           = useState('');
  const [savingColor, setSavingColor]         = useState(false);
  const [patternPickerOpen, setPatternPickerOpen] = useState(false);
  const [savingPattern, setSavingPattern]     = useState(false);

  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [savingPw, setSavingPw]     = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);

  const [leavingTeamId, setLeavingTeamId]     = useState<string | null>(null);
  const [myPlayers, setMyPlayers]             = useState<LinkedPlayer[]>([]);
  const [playersLoaded, setPlayersLoaded]     = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [notifPrefs, setNotifPrefs]   = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);

  const [editingTeam, setEditingTeam] = useState<{
    id: string; name: string; age_group: string | null; season: string | null;
  } | null>(null);

  const isParent = profile?.role === 'player';
  const authProvider  = (user?.app_metadata?.provider as string) ?? 'email';
  const isOAuthUser   = authProvider === 'google' || authProvider === 'apple';
  const providerLabel = authProvider === 'apple' ? 'Apple' : 'Google';

  const initials = (profile?.full_name ?? '?')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) =>
      setPushGranted(status === 'granted'),
    );
  }, []);

  useEffect(() => {
    if (profile) {
      const dbPrefs = (profile as any).notification_prefs;
      if (dbPrefs && typeof dbPrefs === 'object') {
        setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...dbPrefs });
      }
    }
  }, [profile?.id]);

  useEffect(() => {
    if (isParent && profile?.id) {
      (supabase as any)
        .from('players')
        .select('id, full_name, jersey_number, position, photo_url, team_id')
        .eq('profile_id', profile.id)
        .then(({ data }: { data: LinkedPlayer[] | null }) => {
          setMyPlayers(data ?? []);
          setPlayersLoaded(true);
        });
    } else {
      setPlayersLoaded(true);
    }
  }, [profile?.id, isParent]);

  const toggleNotif = useCallback(async (key: keyof NotifPrefs) => {
    if (!profile) return;
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    setSavingNotif(true);
    await (supabase as any)
      .from('profiles')
      .update({ notification_prefs: updated })
      .eq('id', profile.id);
    setSavingNotif(false);
  }, [notifPrefs, profile]);

  async function handleSaveName() {
    if (!name.trim() || !profile) return;
    setSavingName(true);
    await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id);
    await refreshProfile();
    setSavingName(false);
    setEditingName(false);
  }

  async function handleSaveTagline() {
    if (!club) return;
    setSavingTagline(true);
    await (supabase as any).from('clubs').update({ tagline: tagline.trim() || null }).eq('id', club.id);
    await refreshProfile();
    setSavingTagline(false);
    setEditingTagline(false);
  }

  async function handleSaveClubName() {
    if (!club || !clubNameDraft.trim()) return;
    setSavingClubName(true);
    await (supabase as any).from('clubs').update({ name: clubNameDraft.trim() }).eq('id', club.id);
    await refreshProfile();
    setSavingClubName(false);
    setEditingClubName(false);
  }

  async function handleLogoUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets[0]) return;
    setLogoEditorUri(result.assets[0].uri);
    setLogoEditorVisible(true);
  }

  async function handleLogoEditorSave(uri: string) {
    setLogoEditorVisible(false);
    if (!club) return;
    setLogoUploading(true);
    try {
      const response = await fetch(uri);
      const buffer = await response.arrayBuffer();
      const path = `${club.slug}-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from('club-logos')
        .upload(path, buffer, { contentType: 'image/png', upsert: true });
      if (error) { Alert.alert('Upload failed', error.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('club-logos').getPublicUrl(path);
      await (supabase as any).from('clubs').update({ logo_url: publicUrl }).eq('id', club.id);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Upload failed', String(e));
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleAvatarUpload() {
    if (!profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets[0]) return;
    setAvatarEditorUri(result.assets[0].uri);
    setAvatarEditorVisible(true);
  }

  async function handleAvatarEditorSave(uri: string) {
    setAvatarEditorVisible(false);
    if (!profile) return;
    setAvatarUploading(true);
    try {
      const response = await fetch(uri);
      const buffer = await response.arrayBuffer();
      const path = `${profile.id}-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, buffer, { contentType: 'image/png', upsert: true });
      if (error) { Alert.alert('Upload failed', error.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Upload failed', String(e));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSaveColor() {
    if (!club || !colorTarget) return;
    const raw = colorDraft.startsWith('#') ? colorDraft : `#${colorDraft}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) {
      Alert.alert('Invalid colour', 'Enter a valid hex colour, e.g. #22C55E');
      return;
    }
    setSavingColor(true);
    const field = colorTarget === 'primary' ? 'primary_color'
      : colorTarget === 'secondary' ? 'secondary_color'
      : colorTarget === 'home_kit' ? 'home_kit_color'
      : colorTarget === 'away_kit' ? 'away_kit_color'
      : 'training_kit_color';
    await (supabase as any).from('clubs').update({ [field]: raw }).eq('id', club.id);
    await refreshProfile();
    setSavingColor(false);
    setColorTarget(null);
  }

  async function handleSavePattern(pattern: string) {
    if (!club) return;
    setSavingPattern(true);
    await (supabase as any).from('clubs').update({ header_pattern: pattern }).eq('id', club.id);
    await refreshProfile();
    setSavingPattern(false);
    setPatternPickerOpen(false);
  }

  async function handleLeaveTeam(teamId: string, teamName: string) {
    const isLast = allTeams.length === 1;
    Alert.alert(
      `Leave ${teamName}?`,
      isLast
        ? "You'll lose access to this team's roster, schedule, and chat. You won't be on any teams."
        : "You'll lose access to this team's roster, schedule, and chat.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave team', style: 'destructive',
          onPress: async () => {
            setLeavingTeamId(teamId);
            const { error } = await supabase
              .from('team_members')
              .delete()
              .eq('team_id', teamId)
              .eq('profile_id', profile!.id);
            if (error) {
              Alert.alert('Error', error.message);
              setLeavingTeamId(null);
              return;
            }
            await refetchTeams();
            setLeavingTeamId(null);
            if (isLast) router.replace('/(auth)/find-team');
          },
        },
      ]
    );
  }

  async function handleLeaveAsParent(playerId: string, teamId: string, playerName: string, teamName: string) {
    const isLast = allTeams.length === 1;
    Alert.alert(
      `Leave ${teamName}?`,
      `You'll lose access to ${playerName}'s schedule, chat, and announcements.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave team', style: 'destructive',
          onPress: async () => {
            setLeavingTeamId(teamId);
            await supabase.from('players').update({ profile_id: null }).eq('id', playerId);
            await supabase.from('team_members').delete()
              .eq('team_id', teamId).eq('profile_id', profile!.id);
            await refetchTeams();
            setLeavingTeamId(null);
            if (isLast) router.replace('/(auth)/find-team');
            else setMyPlayers((prev) => prev.filter((p) => p.id !== playerId));
          },
        },
      ]
    );
  }

  function handleSyncCalendar(teamId: string, teamName: string) {
    const base = `https://pulse-fc.app/api/calendar/${teamId}`;
    const webcal = base.replace('https://', 'webcal://');
    const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
    Alert.alert(
      `Sync ${teamName}`,
      'Add this team\'s schedule to your calendar. It updates automatically when your coach makes changes.',
      [
        { text: 'Apple Calendar', onPress: () => Linking.openURL(webcal) },
        { text: 'Google Calendar', onPress: () => Linking.openURL(google) },
        { text: 'Copy link', onPress: () => Share.share({ url: base, message: base }) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  async function handleChangePassword() {
    if (newPw.length < 8) { Alert.alert('Too short', 'Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Done', 'Password updated successfully.');
    setNewPw(''); setConfirmPw(''); setShowPwForm(false);
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive',
        onPress: async () => { await signOut(); router.replace('/(auth)/login'); } },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete my account', style: 'destructive', onPress: confirmDelete },
      ],
    );
  }

  async function confirmDelete() {
    Alert.alert(
      'Are you absolutely sure?',
      'Your profile, data, and access will be permanently removed from Pulse FC.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, delete everything', style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const { error } = await supabase.rpc('delete_account' as any);
              if (error) { Alert.alert('Error', error.message); setDeletingAccount(false); return; }
              await signOut();
              router.replace('/(auth)/login');
            } catch (e) {
              Alert.alert('Error', String(e));
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: PULSE_COLORS.ui.background }}>
    <ClubHeader title="Settings" onBack={() => router.back()} />
    <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

      {/* ── Identity block — coaches/admins only ── */}
      {!isParent && (
        <View style={st.identityBlock}>
          <View style={[st.avatarFallback, { backgroundColor: primaryColor }]}>
            <Text style={st.avatarInitials}>{initials}</Text>
          </View>
          <Text style={st.identityName}>{profile?.full_name ?? '—'}</Text>
          <View style={[st.rolePill, { backgroundColor: rgba(0.12), borderColor: rgba(0.25) }]}>
            <Text style={[st.rolePillText, { color: primaryColor }]}>{ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? '—'}</Text>
          </View>
        </View>
      )}

      {/* ── My Players (parents) ── */}
      {isParent && (
        <Section label="MY PLAYERS">
          {!playersLoaded ? (
            <View style={[st.row, { justifyContent: 'center' }]}>
              <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
            </View>
          ) : myPlayers.length === 0 ? (
            <View style={st.emptyPlayers}>
              <View style={st.emptyIcon}>
                <Ionicons name="people-outline" size={22} color={PULSE_COLORS.ui.muted} />
              </View>
              <Text style={st.emptyTitle}>No players linked yet</Text>
              <Text style={st.emptySub}>
                Ask your coach to send you an invite — your player will appear here once linked.
              </Text>
            </View>
          ) : (
            myPlayers.map((p, i) => {
              const pi = p.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
              const teamName = allTeams.find((t) => t.id === p.team_id)?.name ?? 'this team';
              return (
                <View key={p.id}>
                  {i > 0 && <View style={st.divider} />}
                  <TouchableOpacity
                    style={st.playerRow}
                    onPress={() => router.push(`/(app)/${club?.slug}/player/${p.id}` as any)}
                    activeOpacity={0.7}
                  >
                    {p.photo_url
                      ? <Image source={{ uri: p.photo_url }} style={st.playerAvatar} />
                      : <View style={[st.playerAvatarFallback, { backgroundColor: primaryColor }]}><Text style={st.playerAvatarText}>{pi}</Text></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={st.playerName}>{p.full_name}</Text>
                      <Text style={st.playerMeta}>
                        {[p.position, p.jersey_number != null ? `#${p.jersey_number}` : null]
                          .filter(Boolean).join(' · ') || 'Tap to add details'}
                      </Text>
                    </View>
                    <View style={[st.editChip, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
                      <Text style={[st.editChipText, { color: primaryColor }]}>Edit</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={st.divider} />
                  <TouchableOpacity
                    style={st.leaveTeamRow}
                    onPress={() => handleSyncCalendar(p.team_id, teamName)}
                    activeOpacity={0.65}
                  >
                    <Ionicons name="calendar-outline" size={15} color={primaryColor} />
                    <Text style={[st.leaveTeamText, { color: primaryColor }]}>Sync schedule to calendar</Text>
                  </TouchableOpacity>
                  <View style={st.divider} />
                  <TouchableOpacity
                    style={st.leaveTeamRow}
                    onPress={() => handleLeaveAsParent(p.id, p.team_id, p.full_name, teamName)}
                    disabled={leavingTeamId === p.team_id}
                    activeOpacity={0.65}
                  >
                    <Ionicons name="exit-outline" size={15} color={PULSE_COLORS.status.error} />
                    <Text style={st.leaveTeamText}>Leave {teamName}</Text>
                    {leavingTeamId === p.team_id && (
                      <ActivityIndicator size="small" color={PULSE_COLORS.status.error} style={{ marginLeft: 6 }} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </Section>
      )}

      {/* ── My Teams (coaches only) ── */}
      {profile?.role === 'coach' && (
        <Section label="MY TEAMS">
          {allTeams.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={st.divider} />}
              <View style={st.teamRow}>
                <View style={[st.iconCell, { backgroundColor: rgba(0.12) }]}>
                  <Ionicons name="football-outline" size={16} color={primaryColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.teamName}>{t.name}</Text>
                  {(t.age_group || t.season) && (
                    <Text style={st.teamMeta}>{[t.age_group, t.season].filter(Boolean).join(' · ')}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => setEditingTeam(t)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginRight: 14 }}
                >
                  <Ionicons name="pencil-outline" size={16} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSyncCalendar(t.id, t.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginRight: 14 }}
                >
                  <Ionicons name="calendar-outline" size={16} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleLeaveTeam(t.id, t.name)}
                  disabled={leavingTeamId === t.id}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {leavingTeamId === t.id
                    ? <ActivityIndicator size="small" color={PULSE_COLORS.status.error} />
                    : <Text style={st.leaveText}>Leave</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </Section>
      )}

      {/* ── Club Branding (org_admins only) ── */}
      {isOrgAdmin && (
        <Section label="CLUB BRANDING">
          {/* ── Logo upload block ── */}
          <View style={st.logoBlock}>
            <TouchableOpacity
              style={[st.logoCircle, { borderColor: primaryColor, backgroundColor: rgba(0.1) }]}
              onPress={handleLogoUpload}
              disabled={logoUploading}
              activeOpacity={0.8}
            >
              {logoUploading ? (
                <ActivityIndicator color={primaryColor} />
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={st.logoImg} resizeMode="contain" />
              ) : (
                <Ionicons name="image-outline" size={28} color={PULSE_COLORS.ui.muted} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogoUpload} disabled={logoUploading} activeOpacity={0.7}>
              <Text style={[st.logoHint, { color: primaryColor }]}>{logoUrl ? 'Change logo' : 'Upload logo'}</Text>
            </TouchableOpacity>
          </View>

          <View style={st.divider} />

          {/* Club name */}
          <View style={st.row}>
            <View style={[st.iconCell, { backgroundColor: rgba(0.15) }]}>
              <Ionicons name="shield-outline" size={16} color={primaryColor} />
            </View>
            <Text style={st.rowLabel}>Club name</Text>
            {editingClubName ? (
              <TextInput
                style={[st.nameInput, { borderBottomColor: primaryColor }]}
                value={clubNameDraft}
                onChangeText={setClubNameDraft}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveClubName}
              />
            ) : (
              <TouchableOpacity
                onPress={() => { setClubNameDraft(clubNameFromHook); setEditingClubName(true); }}
                style={{ flex: 1, alignItems: 'flex-end' }}
              >
                <Text style={st.rowValue}>{clubNameFromHook || '—'}</Text>
              </TouchableOpacity>
            )}
            {editingClubName ? (
              <TouchableOpacity onPress={handleSaveClubName} disabled={savingClubName} style={{ paddingLeft: 10 }}>
                {savingClubName
                  ? <ActivityIndicator size="small" color={primaryColor} />
                  : <Text style={[st.saveText, { color: primaryColor }]}>Save</Text>}
              </TouchableOpacity>
            ) : (
              <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 8 }} />
            )}
          </View>

          <View style={st.divider} />

          {/* Tagline */}
          <View style={st.row}>
            <View style={[st.iconCell, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
              <Ionicons name="text-outline" size={16} color="#A855F7" />
            </View>
            <Text style={st.rowLabel}>Tagline</Text>
            {editingTagline ? (
              <TextInput
                style={[st.nameInput, { borderBottomColor: primaryColor }]}
                value={tagline}
                onChangeText={setTagline}
                autoFocus
                maxLength={80}
                placeholder="Where great players are made"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                returnKeyType="done"
                onSubmitEditing={handleSaveTagline}
              />
            ) : (
              <TouchableOpacity
                onPress={() => { setTagline(clubTagline ?? ''); setEditingTagline(true); }}
                style={{ flex: 1, alignItems: 'flex-end' }}
              >
                <Text style={[st.rowValue, !clubTagline && { color: PULSE_COLORS.ui.muted, fontStyle: 'italic' }]}>
                  {clubTagline || 'Add tagline'}
                </Text>
              </TouchableOpacity>
            )}
            {editingTagline ? (
              <TouchableOpacity onPress={handleSaveTagline} disabled={savingTagline} style={{ paddingLeft: 10 }}>
                {savingTagline
                  ? <ActivityIndicator size="small" color={primaryColor} />
                  : <Text style={[st.saveText, { color: primaryColor }]}>Save</Text>}
              </TouchableOpacity>
            ) : (
              <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 8 }} />
            )}
          </View>

          <View style={st.divider} />

          {/* Primary colour */}
          <TouchableOpacity
            style={st.row}
            onPress={() => { setColorDraft(primaryColor); setColorTarget('primary'); }}
            activeOpacity={0.65}
          >
            <View style={[st.iconCell, { backgroundColor: rgba(0.15) }]}>
              <Ionicons name="color-palette-outline" size={16} color={primaryColor} />
            </View>
            <Text style={[st.rowLabel, { flex: 1 }]}>Primary colour</Text>
            <View style={[st.colorSwatch, { backgroundColor: primaryColor }]} />
            <Text style={[st.rowValue, { flex: 0, marginLeft: 8 }]}>{primaryColor}</Text>
            <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <View style={st.divider} />

          {/* Secondary colour */}
          <TouchableOpacity
            style={st.row}
            onPress={() => { setColorDraft(secondaryColor); setColorTarget('secondary'); }}
            activeOpacity={0.65}
          >
            <View style={[st.iconCell, { backgroundColor: 'rgba(107,114,128,0.15)' }]}>
              <Ionicons name="color-palette-outline" size={16} color={PULSE_COLORS.ui.textSecondary} />
            </View>
            <Text style={[st.rowLabel, { flex: 1 }]}>Secondary colour</Text>
            <View style={[st.colorSwatch, { backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }]} />
            <Text style={[st.rowValue, { flex: 0, marginLeft: 8 }]}>{secondaryColor}</Text>
            <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <View style={st.divider} />

          {/* Home kit colour */}
          <TouchableOpacity
            style={st.row}
            onPress={() => { setColorDraft(homeKitColor); setColorTarget('home_kit'); }}
            activeOpacity={0.65}
          >
            <View style={[st.iconCell, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
              <Ionicons name="shirt" size={16} color="#22C55E" />
            </View>
            <Text style={[st.rowLabel, { flex: 1 }]}>Home kit colour</Text>
            <View style={[st.colorSwatch, { backgroundColor: homeKitColor }]} />
            <Text style={[st.rowValue, { flex: 0, marginLeft: 8 }]}>{homeKitColor}</Text>
            <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <View style={st.divider} />

          {/* Away kit colour */}
          <TouchableOpacity
            style={st.row}
            onPress={() => { setColorDraft(awayKitColor); setColorTarget('away_kit'); }}
            activeOpacity={0.65}
          >
            <View style={[st.iconCell, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
              <Ionicons name="shirt" size={16} color="#F97316" />
            </View>
            <Text style={[st.rowLabel, { flex: 1 }]}>Away kit colour</Text>
            <View style={[st.colorSwatch, { backgroundColor: awayKitColor, borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1 }]} />
            <Text style={[st.rowValue, { flex: 0, marginLeft: 8 }]}>{awayKitColor}</Text>
            <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <View style={st.divider} />

          {/* Training kit colour */}
          <TouchableOpacity
            style={st.row}
            onPress={() => { setColorDraft(trainingKitColor); setColorTarget('training_kit'); }}
            activeOpacity={0.65}
          >
            <View style={[st.iconCell, { backgroundColor: `${trainingKitColor}18` }]}>
              <Ionicons name="shirt" size={16} color={trainingKitColor} />
            </View>
            <Text style={[st.rowLabel, { flex: 1 }]}>Training kit colour</Text>
            <View style={[st.colorSwatch, { backgroundColor: trainingKitColor }]} />
            <Text style={[st.rowValue, { flex: 0, marginLeft: 8 }]}>{trainingKitColor}</Text>
            <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <View style={st.divider} />

          {/* Header style */}
          <TouchableOpacity
            style={st.row}
            onPress={() => setPatternPickerOpen(true)}
            activeOpacity={0.65}
          >
            <View style={[st.iconCell, { backgroundColor: rgba(0.15) }]}>
              <Ionicons name="layers-outline" size={16} color={primaryColor} />
            </View>
            <Text style={[st.rowLabel, { flex: 1 }]}>Header style</Text>
            <PatternMiniPreview pattern={headerPattern} primaryColor={primaryColor} secondaryColor={secondaryColor} />
            <Text style={[st.rowValue, { flex: 0, marginLeft: 8 }]}>
              {PATTERN_LABELS[headerPattern] ?? headerPattern}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </Section>
      )}

      {/* ── Teams (org_admins) ── */}
      {isOrgAdmin && (
        <Section label="TEAMS">
          {allTeams.length === 0 ? (
            <View style={[st.row, { justifyContent: 'center' }]}>
              <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 13 }}>No teams yet</Text>
            </View>
          ) : (
            allTeams.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={st.divider} />}
                <TouchableOpacity
                  style={st.row}
                  onPress={() => setEditingTeam(t)}
                  activeOpacity={0.65}
                >
                  <View style={[st.iconCell, { backgroundColor: rgba(0.12) }]}>
                    <Ionicons name="football-outline" size={16} color={primaryColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.rowLabel}>{t.name}</Text>
                    {(t.age_group || t.season) && (
                      <Text style={st.rowValue} numberOfLines={1}>
                        {[t.age_group, t.season].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </Section>
      )}

      {/* ── Pattern picker modal ── */}
      <PatternPickerModal
        visible={patternPickerOpen}
        current={headerPattern}
        saving={savingPattern}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        onSelect={handleSavePattern}
        onCancel={() => setPatternPickerOpen(false)}
      />

      {/* ── Color picker modal ── */}
      <ColorPickerModal
        visible={colorTarget !== null}
        title={
          colorTarget === 'primary' ? 'Primary Colour'
          : colorTarget === 'secondary' ? 'Secondary Colour'
          : colorTarget === 'home_kit' ? 'Home Kit Colour'
          : colorTarget === 'away_kit' ? 'Away Kit Colour'
          : 'Training Kit Colour'
        }
        value={colorDraft}
        saving={savingColor}
        primaryColor={primaryColor}
        onChangeValue={setColorDraft}
        onCancel={() => setColorTarget(null)}
        onApply={handleSaveColor}
      />

      {/* ── Profile photo (parents only) ── */}
      {isParent && (
        <Section label="PROFILE PHOTO">
          <View style={st.logoBlock}>
            <TouchableOpacity
              style={[st.avatarCircle, { borderColor: primaryColor, backgroundColor: rgba(0.1) }]}
              onPress={handleAvatarUpload}
              disabled={avatarUploading}
              activeOpacity={0.8}
            >
              {avatarUploading ? (
                <ActivityIndicator color={primaryColor} />
              ) : profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={st.avatarCircleImg} />
              ) : (
                <Text style={[st.avatarCircleInitials, { color: primaryColor }]}>{initials}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleAvatarUpload} disabled={avatarUploading} activeOpacity={0.7}>
              <Text style={[st.logoHint, { color: primaryColor }]}>
                {profile?.avatar_url ? 'Change photo' : 'Add photo'}
              </Text>
            </TouchableOpacity>
          </View>
        </Section>
      )}

      {/* ── Profile ── */}
      <Section label="PROFILE">
        {/* Name row — inline edit */}
        <View style={st.row}>
          <IconCell name="person-outline" color="#fff" bg="#3B82F6" />
          <Text style={st.rowLabel}>Name</Text>
          {editingName ? (
            <TextInput
              style={[st.nameInput, { borderBottomColor: primaryColor }]}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
          ) : (
            <TouchableOpacity
              onPress={() => { setName(profile?.full_name ?? ''); setEditingName(true); }}
              style={{ flex: 1, alignItems: 'flex-end' }}
            >
              <Text style={st.rowValue}>{profile?.full_name ?? '—'}</Text>
            </TouchableOpacity>
          )}
          {editingName ? (
            <TouchableOpacity onPress={handleSaveName} disabled={savingName} style={{ paddingLeft: 10 }}>
              {savingName
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Text style={[st.saveText, { color: primaryColor }]}>Save</Text>}
            </TouchableOpacity>
          ) : (
            <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 8 }} />
          )}
        </View>

        <View style={st.divider} />
        <SettingsRow
          icon="mail-outline" iconColor="#fff" iconBg="#8B5CF6"
          label="Email" value={user?.email ?? '—'}
        />
      </Section>

      {/* ── Security ── */}
      <Section label="SECURITY">
        {isOAuthUser ? (
          <View style={st.row}>
            <IconCell
              name={authProvider === 'apple' ? 'logo-apple' : 'logo-google'}
              color="#fff" bg="#6B7280"
            />
            <Text style={[st.rowLabel, { flex: 1, color: PULSE_COLORS.ui.textSecondary }]}>
              Password managed by {providerLabel}
            </Text>
          </View>
        ) : !showPwForm ? (
          <SettingsRow
            icon="lock-closed-outline" iconColor="#fff" iconBg="#F59E0B"
            label="Change password"
            onPress={() => setShowPwForm(true)}
          />
        ) : (
          <View style={st.pwForm}>
            <Text style={st.pwLabel}>New password</Text>
            <TextInput
              style={st.pwInput} value={newPw} onChangeText={setNewPw}
              secureTextEntry placeholder="At least 8 characters"
              placeholderTextColor={PULSE_COLORS.ui.muted} autoFocus
            />
            <Text style={[st.pwLabel, { marginTop: 12 }]}>Confirm password</Text>
            <TextInput
              style={st.pwInput} value={confirmPw} onChangeText={setConfirmPw}
              secureTextEntry placeholder="Re-enter password"
              placeholderTextColor={PULSE_COLORS.ui.muted}
            />
            <View style={st.pwBtns}>
              <TouchableOpacity
                style={st.pwCancel}
                onPress={() => { setShowPwForm(false); setNewPw(''); setConfirmPw(''); }}
              >
                <Text style={st.pwCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.pwSave, { backgroundColor: primaryColor }, (!newPw || !confirmPw) && { opacity: 0.35 }]}
                onPress={handleChangePassword}
                disabled={!newPw || !confirmPw || savingPw}
              >
                {savingPw
                  ? <ActivityIndicator color="#000" size="small" />
                  : <Text style={st.pwSaveText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Section>

      {/* ── Notifications ── */}
      <Section label="NOTIFICATIONS">
        {/* Dropdown trigger */}
        <TouchableOpacity style={st.row} onPress={() => setNotifOpen((o) => !o)} activeOpacity={0.65}>
          <IconCell name="notifications-outline" color="#fff" bg="#8B5CF6" />
          <Text style={[st.rowLabel, { flex: 1 }]}>Notification preferences</Text>
          <Ionicons
            name={notifOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={PULSE_COLORS.ui.muted}
          />
        </TouchableOpacity>

        {/* Expanded content */}
        {notifOpen && (
          <>
            {pushGranted === false ? (
              <>
                <View style={st.divider} />
                <TouchableOpacity style={st.pushBanner} onPress={() => Linking.openSettings()} activeOpacity={0.75}>
                  <View style={[st.iconCell, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                    <Ionicons name="notifications-off-outline" size={16} color={PULSE_COLORS.status.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.pushTitle}>Notifications are off</Text>
                    <Text style={st.pushSub}>Tap to enable in iPhone Settings</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              </>
            ) : (
              ([
                { key: 'rsvp_reminders',  label: 'RSVP reminders',  icon: 'calendar-outline',   bg: '#22C55E' },
                { key: 'announcements',    label: 'Announcements',    icon: 'megaphone-outline',  bg: '#3B82F6' },
                { key: 'messages',         label: 'New messages',     icon: 'chatbubble-outline', bg: '#8B5CF6' },
                { key: 'schedule_changes', label: 'Schedule changes', icon: 'refresh-outline',    bg: '#F59E0B' },
              ] as { key: keyof NotifPrefs; label: string; icon: string; bg: string }[]).map(({ key, label, icon, bg }) => (
                <View key={key}>
                  <View style={st.divider} />
                  <View style={[st.row, { backgroundColor: PULSE_COLORS.ui.surfaceAlt }]}>
                    <IconCell name={icon} color="#fff" bg={bg} />
                    <Text style={[st.rowLabel, { flex: 1 }]}>{label}</Text>
                    <Switch
                      value={notifPrefs[key]}
                      onValueChange={() => toggleNotif(key)}
                      disabled={savingNotif}
                      trackColor={{ false: PULSE_COLORS.ui.border, true: primaryColor }}
                      thumbColor="#fff"
                      ios_backgroundColor={PULSE_COLORS.ui.border}
                    />
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </Section>

      {/* ── Support & Legal ── */}
      <Section label="SUPPORT & LEGAL">
        <SettingsRow
          icon="map-outline" iconColor="#fff" iconBg="#6B7280"
          label="Maps app"
          value={mapApp.preference ? { apple: 'Apple Maps', google: 'Google Maps', waze: 'Waze' }[mapApp.preference] : 'Always ask'}
          onPress={() => {
            if (mapApp.preference) {
              Alert.alert('Maps app', 'Clear your saved preference? You\'ll be asked each time.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: mapApp.clearPreference },
              ]);
            } else {
              Alert.alert('Maps app', 'No preference saved — you\'ll be asked to choose each time you open an address.');
            }
          }}
        />
        <View style={st.divider} />
        <SettingsRow
          icon="mail-outline" iconColor="#fff" iconBg={primaryColor}
          label="Contact support"
          onPress={() => router.push(`/(app)/${club?.slug}/support` as any)}
        />
        <View style={st.divider} />
        <SettingsRow
          icon="shield-checkmark-outline" iconColor="#fff" iconBg="#3B82F6"
          label="Privacy Policy"
          onPress={() => Linking.openURL('https://pulse-fc.app/privacy')}
        />
        <View style={st.divider} />
        <SettingsRow
          icon="document-text-outline" iconColor="#fff" iconBg="#6B7280"
          label="Terms of Service"
          onPress={() => Linking.openURL('https://pulse-fc.app/terms')}
        />
      </Section>

      {/* ── Account ── */}
      <Section label="ACCOUNT">
        <SettingsRow
          icon="log-out-outline" iconColor="#fff" iconBg="#6B7280"
          label="Sign out"
          onPress={handleSignOut}
        />
        <View style={st.divider} />
        <TouchableOpacity style={st.row} onPress={handleDeleteAccount} disabled={deletingAccount} activeOpacity={0.65}>
          <IconCell name="trash-outline" color="#fff" bg={PULSE_COLORS.status.error} />
          <Text style={[st.rowLabel, { flex: 1, color: PULSE_COLORS.status.error }]}>Delete account</Text>
          {deletingAccount
            ? <ActivityIndicator size="small" color={PULSE_COLORS.status.error} />
            : <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />}
        </TouchableOpacity>
      </Section>

      <Text style={st.version}>{`Pulse FC · v${Constants.expoConfig?.version ?? '1.0'}`}</Text>

      <TeamEditModal
        visible={editingTeam !== null}
        team={editingTeam}
        primaryColor={primaryColor}
        onClose={() => setEditingTeam(null)}
        onSaved={async () => { setEditingTeam(null); await refetchTeams(); }}
      />
    </ScrollView>

    <ImageEditor
      visible={logoEditorVisible}
      uri={logoEditorUri}
      primaryColor={primaryColor}
      onSave={handleLogoEditorSave}
      onCancel={() => setLogoEditorVisible(false)}
    />
    <ImageEditor
      visible={avatarEditorVisible}
      uri={avatarEditorUri}
      primaryColor={primaryColor}
      onSave={handleAvatarEditorSave}
      onCancel={() => setAvatarEditorVisible(false)}
    />
    </View>
  );
}

// ─── Header pattern picker ────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  solid:      'Clean',
  stripes:    'Diagonal',
  pinstripes: 'Pinstripes',
  dots:       'Dots',
  grid:       'Grid',
  hoops:      'Hoops',
  vstripes:   'Vertical',
  sash:       'Sash',
  halves:     'Halves',
  diamond:    'Diamond',
};

const PATTERN_SUBS: Record<string, string> = {
  solid:      'No pattern',
  stripes:    'Classic jersey',
  pinstripes: 'Fine stripes',
  dots:       'Retro print',
  grid:       'Carbon feel',
  hoops:      'Celtic · QPR',
  vstripes:   'Inter · Newcastle',
  sash:       'River Plate',
  halves:     'Juventus',
  diamond:    'Argyle · Retro',
};

const ALL_PATTERNS = [
  'solid', 'vstripes', 'hoops', 'stripes', 'pinstripes',
  'sash', 'halves', 'diamond', 'dots', 'grid',
] as const;

function PatternMiniPreview({ pattern, primaryColor, secondaryColor }: { pattern: string; primaryColor: string; secondaryColor: string }) {
  const c = secondaryColor + 'CC'; // ~80% opacity hex shorthand
  return (
    <View style={{ width: 44, height: 26, borderRadius: 6, backgroundColor: primaryColor, overflow: 'hidden' }}>
      {pattern === 'stripes' && Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', top: -6 + i * 10, left: -6, right: -6, height: 6,
          transform: [{ rotate: '-20deg' }], backgroundColor: c,
          opacity: 0.35,
        }} />
      ))}
      {pattern === 'pinstripes' && Array.from({ length: 10 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', top: -6 + i * 6, left: -6, right: -6, height: 3,
          transform: [{ rotate: '-20deg' }], backgroundColor: secondaryColor,
          opacity: 0.38,
        }} />
      ))}
      {pattern === 'hoops' && Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', left: 0, right: 0, top: i * 9, height: 4,
          backgroundColor: secondaryColor, opacity: 0.38,
        }} />
      ))}
      {pattern === 'vstripes' && Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={{
          position: 'absolute', top: 0, bottom: 0, left: i * 11, width: 5,
          backgroundColor: secondaryColor, opacity: 0.35,
        }} />
      ))}
      {pattern === 'sash' && (
        <View style={{
          position: 'absolute', top: 7, left: -6, right: -6, height: 12,
          transform: [{ rotate: '-22deg' }], backgroundColor: secondaryColor, opacity: 0.42,
        }} />
      )}
      {pattern === 'halves' && (
        <>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%', backgroundColor: secondaryColor, opacity: 0.32 }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1.5, backgroundColor: secondaryColor, opacity: 0.7 }} />
        </>
      )}
      {pattern === 'diamond' && (
        <>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={`a${i}`} style={{
              position: 'absolute', top: -20, left: i * 9 - 4, width: 1, height: 70,
              transform: [{ rotate: '45deg' }], backgroundColor: secondaryColor, opacity: 0.42,
            }} />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={`b${i}`} style={{
              position: 'absolute', top: -20, left: i * 9 - 4, width: 1, height: 70,
              transform: [{ rotate: '-45deg' }], backgroundColor: secondaryColor, opacity: 0.42,
            }} />
          ))}
        </>
      )}
      {pattern === 'dots' && Array.from({ length: 3 }).flatMap((_, row) =>
        Array.from({ length: 5 }).map((_, col) => (
          <View key={`${row}-${col}`} style={{
            position: 'absolute', width: 3, height: 3, borderRadius: 1.5,
            backgroundColor: secondaryColor, opacity: 0.42,
            left: col * 11 - 1, top: row * 11 - 1 + (col % 2 === 0 ? 0 : 5),
          }} />
        ))
      )}
      {pattern === 'grid' && (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={`h${i}`} style={{
              position: 'absolute', left: 0, right: 0, top: i * 13, height: 1,
              backgroundColor: secondaryColor, opacity: 0.42,
            }} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={`v${i}`} style={{
              position: 'absolute', top: 0, bottom: 0, left: i * 11, width: 1,
              backgroundColor: secondaryColor, opacity: 0.42,
            }} />
          ))}
        </>
      )}
    </View>
  );
}

function PatternPickerModal({
  visible, current, saving, primaryColor, secondaryColor, onSelect, onCancel,
}: {
  visible: boolean;
  current: string;
  saving: boolean;
  primaryColor: string;
  secondaryColor: string;
  onSelect: (p: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={cp.overlay}>
        <View style={[cp.sheet, { maxHeight: '82%' }]}>
          <View style={cp.handle} />
          <Text style={cp.title}>Header Style</Text>
          <Text style={{ textAlign: 'center', marginTop: -8, marginBottom: 20, fontSize: 13, color: PULSE_COLORS.ui.muted }}>
            Jersey-inspired backgrounds for your home screen
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingBottom: 8 }}>
              {ALL_PATTERNS.map((p) => {
                const selected = current === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => !saving && onSelect(p)}
                    activeOpacity={0.75}
                    style={{
                      alignItems: 'center', gap: 6, width: 88,
                      opacity: saving && current !== p ? 0.4 : 1,
                    }}
                  >
                    <View style={{
                      width: 88, height: 54, borderRadius: 12,
                      backgroundColor: primaryColor, overflow: 'hidden',
                      borderWidth: selected ? 3 : 1.5,
                      borderColor: selected ? '#fff' : 'rgba(255,255,255,0.2)',
                    }}>
                      {/* Diagonal stripes */}
                      {p === 'stripes' && Array.from({ length: 8 }).map((_, i) => (
                        <View key={i} style={{
                          position: 'absolute', top: -10 + i * 14, left: -10, right: -10, height: 8,
                          transform: [{ rotate: '-20deg' }], backgroundColor: secondaryColor, opacity: 0.38,
                        }} />
                      ))}
                      {/* Pinstripes */}
                      {p === 'pinstripes' && Array.from({ length: 16 }).map((_, i) => (
                        <View key={i} style={{
                          position: 'absolute', top: -10 + i * 8, left: -10, right: -10, height: 4,
                          transform: [{ rotate: '-20deg' }], backgroundColor: secondaryColor, opacity: 0.4,
                        }} />
                      ))}
                      {/* Hoops — Celtic */}
                      {p === 'hoops' && Array.from({ length: 5 }).map((_, i) => (
                        <View key={i} style={{
                          position: 'absolute', left: 0, right: 0, top: i * 14, height: 6,
                          backgroundColor: secondaryColor, opacity: 0.38,
                        }} />
                      ))}
                      {/* Vertical stripes — Newcastle */}
                      {p === 'vstripes' && Array.from({ length: 8 }).map((_, i) => (
                        <View key={i} style={{
                          position: 'absolute', top: 0, bottom: 0, left: i * 13, width: 6,
                          backgroundColor: secondaryColor, opacity: 0.36,
                        }} />
                      ))}
                      {/* Sash — River Plate */}
                      {p === 'sash' && (
                        <View style={{
                          position: 'absolute', top: 14, left: -10, right: -10, height: 22,
                          transform: [{ rotate: '-22deg' }], backgroundColor: secondaryColor, opacity: 0.44,
                        }} />
                      )}
                      {/* Halves — Juventus */}
                      {p === 'halves' && (
                        <>
                          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: '50%', backgroundColor: secondaryColor, opacity: 0.32 }} />
                          <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, backgroundColor: secondaryColor, opacity: 0.7 }} />
                        </>
                      )}
                      {/* Diamond lattice — Argyle */}
                      {p === 'diamond' && (
                        <>
                          {Array.from({ length: 10 }).map((_, i) => (
                            <View key={`a${i}`} style={{
                              position: 'absolute', top: -60, left: i * 10 - 5, width: 1, height: 160,
                              transform: [{ rotate: '45deg' }], backgroundColor: secondaryColor, opacity: 0.44,
                            }} />
                          ))}
                          {Array.from({ length: 10 }).map((_, i) => (
                            <View key={`b${i}`} style={{
                              position: 'absolute', top: -60, left: i * 10 - 5, width: 1, height: 160,
                              transform: [{ rotate: '-45deg' }], backgroundColor: secondaryColor, opacity: 0.44,
                            }} />
                          ))}
                        </>
                      )}
                      {/* Dots */}
                      {p === 'dots' && Array.from({ length: 4 }).flatMap((_, row) =>
                        Array.from({ length: 8 }).map((_, col) => (
                          <View key={`${row}-${col}`} style={{
                            position: 'absolute', width: 4, height: 4, borderRadius: 2,
                            backgroundColor: secondaryColor, opacity: 0.44,
                            left: col * 13 - 2, top: row * 13 - 2 + (col % 2 === 0 ? 0 : 6),
                          }} />
                        ))
                      )}
                      {/* Grid */}
                      {p === 'grid' && (
                        <>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <View key={`h${i}`} style={{
                              position: 'absolute', left: 0, right: 0, top: i * 14, height: 1,
                              backgroundColor: secondaryColor, opacity: 0.44,
                            }} />
                          ))}
                          {Array.from({ length: 8 }).map((_, i) => (
                            <View key={`v${i}`} style={{
                              position: 'absolute', top: 0, bottom: 0, left: i * 13, width: 1,
                              backgroundColor: secondaryColor, opacity: 0.44,
                            }} />
                          ))}
                        </>
                      )}
                      {selected && (
                        <View style={{
                          position: 'absolute', bottom: 5, right: 5,
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: 'rgba(0,0,0,0.55)',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="checkmark" size={11} color="#fff" />}
                        </View>
                      )}
                    </View>
                    <Text style={{
                      fontSize: 11, fontWeight: selected ? '700' : '600',
                      color: selected ? PULSE_COLORS.ui.text : PULSE_COLORS.ui.textSecondary,
                    }}>
                      {PATTERN_LABELS[p]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ height: 16 }} />
          <TouchableOpacity style={cp.cancelBtn} onPress={onCancel} disabled={saving}>
            <Text style={cp.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Color picker modal ───────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#22C55E', '#16A34A', '#15803D', '#166534',
  '#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF',
  '#8B5CF6', '#A855F7', '#7C3AED', '#6D28D9',
  '#EF4444', '#DC2626', '#F87171', '#FB923C',
  '#F59E0B', '#D97706', '#EC4899', '#6B7280',
];

function ColorPickerModal({
  visible, title, value, saving, primaryColor, onChangeValue, onCancel, onApply,
}: {
  visible: boolean;
  title: string;
  value: string;
  saving: boolean;
  primaryColor: string;
  onChangeValue: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const raw = value.startsWith('#') ? value : `#${value}`;
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(raw);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={cp.overlay}>
        <View style={cp.sheet}>

          {/* Handle + title */}
          <View style={cp.handle} />
          <Text style={cp.title}>{title}</Text>

          {/* Preview */}
          <View style={[cp.preview, { backgroundColor: isValid ? raw : PULSE_COLORS.ui.surface }]}>
            <Text style={[cp.previewLabel, { color: isValid ? '#fff' : PULSE_COLORS.ui.muted }]}>
              {isValid ? raw : 'Enter a hex code'}
            </Text>
          </View>

          {/* Presets */}
          <View style={cp.grid}>
            {PRESET_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[cp.swatch, { backgroundColor: c }, value === c && cp.swatchSelected]}
                onPress={() => onChangeValue(c)}
                activeOpacity={0.8}
              >
                {value === c && <Ionicons name="checkmark" size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Hex input */}
          <View style={cp.hexRow}>
            <View style={[cp.hexSwatch, { backgroundColor: isValid ? raw : PULSE_COLORS.ui.border }]} />
            <TextInput
              style={cp.hexInput}
              value={value}
              onChangeText={onChangeValue}
              placeholder="#22C55E"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              autoCapitalize="characters"
              maxLength={7}
            />
          </View>

          {/* Buttons */}
          <View style={cp.btns}>
            <TouchableOpacity style={cp.cancelBtn} onPress={onCancel}>
              <Text style={cp.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cp.applyBtn, { backgroundColor: primaryColor }, (!isValid || saving) && { opacity: 0.4 }]}
              onPress={onApply}
              disabled={!isValid || saving}
            >
              {saving
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={cp.applyText}>Apply</Text>}
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const cp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 48,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.border,
    alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.4, marginBottom: 16 },
  preview: {
    height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  previewLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  swatch: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  swatchSelected: { borderWidth: 3, borderColor: '#fff' },
  hexRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: PULSE_COLORS.ui.background,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, marginBottom: 24,
  },
  hexSwatch: { width: 24, height: 24, borderRadius: 6 },
  hexInput: {
    flex: 1, fontSize: 16, color: PULSE_COLORS.ui.text,
    fontWeight: '600', letterSpacing: 0.5,
  },
  btns: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  applyBtn: {
    flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  applyText: { fontSize: 15, fontWeight: '800', color: '#000' },
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={st.section}>
      <Text style={st.sectionLabel}>{label}</Text>
      <View style={st.card}>{children}</View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  content: { paddingBottom: 60 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text, letterSpacing: -0.3 },

  // Identity block
  identityBlock: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, gap: 6 },
  avatarFallback: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: PULSE_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 26, fontWeight: '800', color: '#000' },
  identityName: { fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.text, letterSpacing: -0.4 },
  rolePill: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  rolePillText: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.brand.green },
  // Section
  section: { marginBottom: 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 0.8, marginHorizontal: 20, marginBottom: 6, marginTop: 20,
  },
  card: {
    marginHorizontal: 16, borderRadius: 16,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
    minHeight: 52,
  },
  rowLabel: { fontSize: 15, color: PULSE_COLORS.ui.text, fontWeight: '500' },
  rowValue: {
    flex: 1, fontSize: 14, color: PULSE_COLORS.ui.textSecondary,
    textAlign: 'right',
  },
  nameInput: {
    flex: 1, fontSize: 14, color: PULSE_COLORS.ui.text, textAlign: 'right',
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.brand.green,
    paddingBottom: 2,
  },
  saveText: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.brand.green },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: PULSE_COLORS.ui.border, marginLeft: 58 },

  // Icon cell
  iconCell: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // Password form
  pwForm: { padding: 16 },
  pwLabel: { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.muted, marginBottom: 6, letterSpacing: 0.3 },
  pwInput: {
    height: 44, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: PULSE_COLORS.ui.background,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    fontSize: 15, color: PULSE_COLORS.ui.text,
  },
  pwBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pwCancel: {
    flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  pwCancelText: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  pwSave: {
    flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PULSE_COLORS.brand.green,
  },
  pwSaveText: { fontSize: 14, fontWeight: '800', color: '#000' },

  // Push banner
  pushBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  pushTitle: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text, marginBottom: 1 },
  pushSub: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary },

  // My Players
  emptyPlayers: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  emptySub: {
    fontSize: 13, color: PULSE_COLORS.ui.textSecondary,
    textAlign: 'center', lineHeight: 19,
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  playerAvatar: { width: 44, height: 44, borderRadius: 22 },
  playerAvatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: PULSE_COLORS.brand.green,
    alignItems: 'center', justifyContent: 'center',
  },
  playerAvatarText: { fontSize: 15, fontWeight: '800', color: '#000' },
  playerName: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  playerMeta: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary },
  editChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
  },
  editChipText: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.brand.green },

  // Leave team
  teamRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12, minHeight: 52,
  },
  teamName: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text, marginBottom: 1 },
  teamMeta: { fontSize: 12, color: PULSE_COLORS.ui.textSecondary },
  leaveText: { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.status.error },
  leaveTeamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  leaveTeamText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.status.error },

  version: {
    textAlign: 'center', color: PULSE_COLORS.ui.muted,
    fontSize: 12, marginTop: 36, marginBottom: 8,
  },

  // Club branding
  logoBlock: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 22,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoImg: { width: 72, height: 72 },
  logoHint: { fontSize: 13, fontWeight: '700' },
  colorSwatch: { width: 20, height: 20, borderRadius: 10 },

  // Parent avatar circle
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarCircleImg: { width: 80, height: 80 },
  avatarCircleInitials: { fontSize: 26, fontWeight: '800' },
});
