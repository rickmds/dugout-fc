import { useState, useEffect, useCallback } from 'react';
import Constants from 'expo-constants';
import {
  ActivityIndicator,
  Alert,
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
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useActiveTeam } from '../../../hooks/TeamContext';
import { PULSE_COLORS } from '../../../constants/colors';
import { useClub } from '../../../hooks/useClub';
import GroupedTeamList from '../../../components/ui/GroupedTeamList';
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
  const { primaryColor, rgba, tagline: clubTagline, logoUrl, clubName: clubNameFromHook } = useClub();
  const router = useRouter();
  const { profile, club, user, signOut, refreshProfile } = useAuth();
  const { allTeams, refetch: refetchTeams } = useActiveTeam();
  const mapApp = useMapApp();

  const [editingName, setEditingName] = useState(false);
  const [name, setName]               = useState(profile?.full_name ?? '');
  const [savingName, setSavingName]   = useState(false);

  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone]               = useState((profile as any)?.phone ?? '');
  const [savingPhone, setSavingPhone]   = useState(false);

  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress]               = useState((profile as any)?.address ?? '');
  const [savingAddress, setSavingAddress]   = useState(false);

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

  const [showPwForm, setShowPwForm]   = useState(false);
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [savingPw, setSavingPw]       = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmailVal, setNewEmailVal]       = useState('');
  const [confirmEmailVal, setConfirmEmailVal] = useState('');
  const [emailPw, setEmailPw]               = useState('');
  const [savingEmail, setSavingEmail]       = useState(false);
  const [emailSent, setEmailSent]           = useState(false);

  // Certifications
  type MyCert = {
    id: string;
    cert_type: string;
    license_level: string | null;
    custom_label: string | null;
    expiry_date: string | null;
    doc_url: string | null;
    status: 'pending' | 'verified' | 'rejected' | 'expired';
    rejection_note: string | null;
  };
  const [myCerts, setMyCerts]               = useState<MyCert[]>([]);
  const [certsLoaded, setCertsLoaded]       = useState(false);
  const [showCertModal, setShowCertModal]   = useState(false);
  const [certType, setCertType]             = useState('background_check');
  const [certLevel, setCertLevel]           = useState('');
  const [certCustomLabel, setCertCustomLabel] = useState('');
  const [certExpiry, setCertExpiry]         = useState('');
  const [certDocUri, setCertDocUri]         = useState('');
  const [certDocName, setCertDocName]       = useState('');
  const [uploadingCert, setUploadingCert]   = useState(false);
  const [savingCert, setSavingCert]         = useState(false);
  const [editingCertId, setEditingCertId]   = useState<string | null>(null);

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
    id: string; name: string; age_group: string | null; season: string | null; gender?: string | null;
  } | null>(null);
  const [teamSearch, setTeamSearch] = useState('');

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
      // get_my_guarded_players() checks player_guardians as well as the
      // legacy players.profile_id column — a direct .eq('profile_id', ...)
      // query here only ever found the first (primary) guardian and always
      // showed "No players linked" for a second guardian, even though
      // they have real access.
      (supabase as any)
        .rpc('get_my_guarded_players')
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

  async function handleSavePhone() {
    if (!profile) return;
    setSavingPhone(true);
    await (supabase as any).from('profiles').update({ phone: phone.trim() || null }).eq('id', profile.id);
    await refreshProfile();
    setSavingPhone(false);
    setEditingPhone(false);
  }

  async function handleSaveAddress() {
    if (!profile) return;
    setSavingAddress(true);
    await (supabase as any).from('profiles').update({ address: address.trim() || null }).eq('id', profile.id);
    await refreshProfile();
    setSavingAddress(false);
    setEditingAddress(false);
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

  async function handleLogoReEdit() {
    if (!logoUrl) return;
    try {
      // ImageManipulator needs a local file URI — download remote logo first
      const localPath = FileSystem.cacheDirectory! + 'logo-edit-source.png';
      await FileSystem.downloadAsync(logoUrl, localPath);
      setLogoEditorUri(localPath);
      setLogoEditorVisible(true);
    } catch {
      // Fallback: pass URL directly and let ImageManipulator try
      setLogoEditorUri(logoUrl);
      setLogoEditorVisible(true);
    }
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
      // Storage RLS (profile_avatar_upload) requires the uid as an actual
      // folder segment, not just a filename prefix — `${uid}-x` never
      // matches `starts_with(name, uid || '/')`, only `${uid}/x` does.
      const path = `${profile.id}/${Date.now()}.png`;
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
            const { error: unlinkError } = await supabase
              .from('players').update({ profile_id: null }).eq('id', playerId);
            if (unlinkError) {
              Alert.alert('Error', 'Could not leave the team. Please try again.');
              setLeavingTeamId(null);
              return;
            }
            const { error: memberError } = await supabase
              .from('team_members').delete()
              .eq('team_id', teamId).eq('profile_id', profile!.id);
            if (memberError) {
              // First write succeeded — re-link the player so state is consistent
              await supabase.from('players').update({ profile_id: profile!.id }).eq('id', playerId);
              Alert.alert('Error', 'Could not leave the team. Please try again.');
              setLeavingTeamId(null);
              return;
            }
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

  async function handleChangeEmail() {
    if (!newEmailVal.trim()) return;
    if (newEmailVal !== confirmEmailVal) { Alert.alert('Mismatch', 'Email addresses do not match.'); return; }
    if (!emailPw.trim()) { Alert.alert('Password required', 'Enter your current password to confirm the change.'); return; }
    setSavingEmail(true);
    // Verify current password before changing email — blocks account takeover from unattended sessions
    const currentEmail = user?.email ?? '';
    const { error: authError } = await supabase.auth.signInWithPassword({ email: currentEmail, password: emailPw });
    if (authError) {
      setSavingEmail(false);
      Alert.alert('Incorrect password', 'Please check your password and try again.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: newEmailVal.trim() });
    setSavingEmail(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setEmailSent(true);
    setNewEmailVal(''); setConfirmEmailVal(''); setEmailPw('');
  }

  // ── Load my certs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role === 'player') return;
    (supabase as any)
      .from('staff_certifications')
      .select('id,cert_type,license_level,custom_label,expiry_date,doc_url,status,rejection_note')
      .eq('profile_id', profile.id)
      .order('submitted_at', { ascending: false })
      .then(({ data }: { data: MyCert[] | null }) => {
        setMyCerts(data ?? []);
        setCertsLoaded(true);
      });
  }, [profile?.id]);

  function openAddCert() {
    setEditingCertId(null);
    setCertType('background_check'); setCertLevel(''); setCertCustomLabel('');
    setCertExpiry(''); setCertDocUri(''); setCertDocName('');
    setShowCertModal(true);
  }

  function openEditCert(cert: MyCert) {
    setEditingCertId(cert.id);
    setCertType(cert.cert_type); setCertLevel(cert.license_level ?? '');
    setCertCustomLabel(cert.custom_label ?? ''); setCertExpiry(cert.expiry_date ?? '');
    setCertDocUri(''); setCertDocName('');
    setShowCertModal(true);
  }

  async function pickCertDoc() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setCertDocUri(result.assets[0].uri);
    setCertDocName(result.assets[0].name ?? 'document');
  }

  async function submitCert() {
    if (!profile || !club) return;
    if (certType === 'coaching_license' && !certLevel) {
      Alert.alert('License level required', 'Please select a license level.'); return;
    }
    if (certType === 'custom' && !certCustomLabel.trim()) {
      Alert.alert('Label required', 'Please enter a name for this certification.'); return;
    }
    setSavingCert(true);
    try {
      let docUrl: string | null = null;

      if (certDocUri) {
        setUploadingCert(true);
        const response = await fetch(certDocUri);
        const buffer = await response.arrayBuffer();
        const ext = certDocName.split('.').pop() ?? 'jpg';
        const mime = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
        const path = `${club.id}/${profile.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('cert-docs')
          .upload(path, buffer, { contentType: mime, upsert: true });
        if (upErr) { Alert.alert('Upload failed', upErr.message); setSavingCert(false); setUploadingCert(false); return; }
        const { data: { publicUrl } } = supabase.storage.from('cert-docs').getPublicUrl(path);
        docUrl = publicUrl;
        setUploadingCert(false);
      }

      const payload: any = {
        club_id: club.id,
        profile_id: profile.id,
        cert_type: certType,
        license_level: certType === 'coaching_license' ? certLevel : null,
        custom_label: certType === 'custom' ? certCustomLabel.trim() : null,
        expiry_date: certExpiry || null,
        status: 'pending',
        submitted_at: new Date().toISOString(),
        rejection_note: null,
        verified_by: null,
        verified_at: null,
      };
      if (docUrl) payload.doc_url = docUrl;

      let error: any;
      if (editingCertId) {
        // Re-submit existing (pending or rejected)
        ({ error } = await (supabase as any).from('staff_certifications').update(payload).eq('id', editingCertId));
      } else {
        ({ error } = await (supabase as any).from('staff_certifications').insert(payload));
      }

      if (error) { Alert.alert('Error', error.message); return; }

      // Reload
      const { data } = await (supabase as any)
        .from('staff_certifications')
        .select('id,cert_type,license_level,custom_label,expiry_date,doc_url,status,rejection_note')
        .eq('profile_id', profile.id)
        .order('submitted_at', { ascending: false });
      setMyCerts(data ?? []);
      setShowCertModal(false);
    } finally {
      setSavingCert(false);
    }
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
      {/* profile.role alone can lag team_members (e.g. a coach added via an
          instant-create staff invite before that path elevated their global
          role) — showing the section if ANY team has them as coach is more
          robust than trusting the single global flag. */}
      {(profile?.role === 'coach' || allTeams.some((t) => t.myRole === 'coach')) && (
        <Section label="MY TEAMS">
          {(() => {
            const showClub = new Set(allTeams.map((t) => t.club?.id)).size > 1;
            return allTeams.map((t, i) => {
              const teamColor = t.club?.primary_color ?? primaryColor;
              const metaParts = [showClub ? t.club?.name : null, t.age_group, t.season].filter(Boolean);
              return (
                <View key={t.id}>
                  {i > 0 && <View style={st.divider} />}
                  <View style={st.teamRow}>
                    <View style={[st.teamAccent, { backgroundColor: teamColor }]} />
                    <View style={[st.iconCell, { backgroundColor: `${teamColor}1F` }]}>
                      {t.club?.logo_url ? (
                        <Image source={{ uri: t.club.logo_url }} style={st.teamClubLogo} contentFit="contain" />
                      ) : (
                        <Ionicons name="football-outline" size={16} color={teamColor} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.teamName}>{t.name}</Text>
                      {metaParts.length > 0 && (
                        <Text style={st.teamMeta}>{metaParts.join(' · ')}</Text>
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
              );
            });
          })()}
        </Section>
      )}

      {/* ── Club Branding (org_admins only) ──
          Colors and kits always live on the web dashboard now — editing
          them here meant an admin's own device could look right while the
          new hex hadn't propagated anywhere else yet (a mid-air-collision
          risk with no visibility into it), and multi-team clubs already
          have a real admin using the web dashboard for everything else
          anyway. Logo stays editable in-app only for a single-team setup,
          since that's often a solo coach/admin who may never open the web
          dashboard at all. */}
      {isOrgAdmin && (
        <Section label="CLUB BRANDING">
          {allTeams.length <= 1 && (
            <>
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
                    <Image source={{ uri: logoUrl }} style={st.logoImg} contentFit="contain" />
                  ) : (
                    <Ionicons name="image-outline" size={28} color={PULSE_COLORS.ui.muted} />
                  )}
                </TouchableOpacity>
                {logoUrl ? (
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <TouchableOpacity onPress={handleLogoReEdit} disabled={logoUploading} activeOpacity={0.7}>
                      <Text style={[st.logoHint, { color: primaryColor }]}>Edit crop</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogoUpload} disabled={logoUploading} activeOpacity={0.7}>
                      <Text style={[st.logoHint, { color: PULSE_COLORS.ui.muted }]}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleLogoUpload} disabled={logoUploading} activeOpacity={0.7}>
                    <Text style={[st.logoHint, { color: primaryColor }]}>Upload logo</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={st.divider} />
            </>
          )}

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

          {/* Colors, kits, and (for multi-team clubs) the logo are web-only now */}
          <View style={[st.row, { paddingVertical: 14 }]}>
            <View style={[st.iconCell, { backgroundColor: 'rgba(2,132,199,0.12)' }]}>
              <Ionicons name="color-palette-outline" size={16} color="#0284C7" />
            </View>
            <Text style={[st.rowValue, { flex: 1, color: PULSE_COLORS.ui.textSecondary, textAlign: 'left' }]}>
              {allTeams.length <= 1
                ? 'Manage colors and kits at pulse-fc.app/dashboard/settings'
                : 'Manage your logo, colors, and kits at pulse-fc.app/dashboard/settings'}
            </Text>
          </View>

        </Section>
      )}

      {/* ── Teams (org_admins) ── */}
      {isOrgAdmin && (
        <Section label={`TEAMS (${allTeams.length})`}>
          {allTeams.length === 0 ? (
            <View style={[st.row, { justifyContent: 'center' }]}>
              <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 13 }}>No teams yet</Text>
            </View>
          ) : (
            <>
              {allTeams.length > 6 && (
                <View style={st.teamSearchWrap}>
                  <Ionicons name="search-outline" size={15} color={PULSE_COLORS.ui.muted} />
                  <TextInput
                    style={st.teamSearchInput}
                    placeholder="Search teams…"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                    value={teamSearch}
                    onChangeText={setTeamSearch}
                    autoCorrect={false}
                  />
                  {teamSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTeamSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={15} color={PULSE_COLORS.ui.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {(() => {
                const filtered = allTeams.filter((t) => t.name.toLowerCase().includes(teamSearch.toLowerCase()));
                if (filtered.length === 0) {
                  return (
                    <View style={[st.row, { justifyContent: 'center' }]}>
                      <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 13 }}>No teams match "{teamSearch}"</Text>
                    </View>
                  );
                }
                return (
                  <GroupedTeamList
                    teams={filtered}
                    dividerInset={58}
                    renderRow={(t) => (
                      <TouchableOpacity
                        style={st.row}
                        onPress={() => setEditingTeam(t)}
                        activeOpacity={0.65}
                      >
                        <View style={[st.iconCell, { backgroundColor: rgba(0.12) }]}>
                          <Ionicons name="football-outline" size={16} color={primaryColor} />
                        </View>
                        <Text style={[st.rowLabel, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
                        {(t.age_group || t.season) && (
                          <View style={st.teamMetaPill}>
                            <Text style={st.teamMetaPillText} numberOfLines={1}>
                              {[t.age_group, t.season].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        )}
                        <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} />
                      </TouchableOpacity>
                    )}
                  />
                );
              })()}
            </>
          )}
        </Section>
      )}

      {/* ── Profile ── */}
      <Section label="PROFILE">
        {/* Profile photo row */}
        <TouchableOpacity style={st.row} onPress={handleAvatarUpload} activeOpacity={0.7}>
          <IconCell name="camera-outline" color="#fff" bg="#EC4899" />
          <Text style={st.rowLabel}>Profile Photo</Text>
          <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 6 }}>
            {avatarUploading ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={st.avatarThumb} />
            ) : (
              <View style={[st.avatarThumb, { backgroundColor: primaryColor, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#000' }}>{initials}</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>

        <View style={st.divider} />

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

        {/* Phone row — inline edit */}
        <View style={st.row}>
          <IconCell name="call-outline" color="#fff" bg="#22C55E" />
          <Text style={st.rowLabel}>Phone</Text>
          {editingPhone ? (
            <TextInput
              style={[st.nameInput, { borderBottomColor: primaryColor }]}
              value={phone}
              onChangeText={setPhone}
              autoFocus
              keyboardType="phone-pad"
              returnKeyType="done"
              placeholder="Mobile number"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              onSubmitEditing={handleSavePhone}
            />
          ) : (
            <TouchableOpacity
              onPress={() => { setPhone((profile as any)?.phone ?? ''); setEditingPhone(true); }}
              style={{ flex: 1, alignItems: 'flex-end' }}
            >
              <Text style={[st.rowValue, !((profile as any)?.phone) && { color: PULSE_COLORS.ui.muted }]}>
                {(profile as any)?.phone ?? 'Add number'}
              </Text>
            </TouchableOpacity>
          )}
          {editingPhone ? (
            <TouchableOpacity onPress={handleSavePhone} disabled={savingPhone} style={{ paddingLeft: 10 }}>
              {savingPhone
                ? <ActivityIndicator size="small" color={primaryColor} />
                : <Text style={[st.saveText, { color: primaryColor }]}>Save</Text>}
            </TouchableOpacity>
          ) : (
            <Ionicons name="pencil-outline" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 8 }} />
          )}
        </View>

        <View style={st.divider} />

        {/* Address row — inline edit */}
        <View style={st.row}>
          <IconCell name="home-outline" color="#fff" bg="#6B7280" />
          <Text style={st.rowLabel}>Address</Text>
          {editingAddress ? (
            <TextInput
              style={[st.nameInput, { borderBottomColor: primaryColor }]}
              value={address}
              onChangeText={setAddress}
              autoFocus
              returnKeyType="done"
              placeholder="123 Main St, Anytown"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              autoCapitalize="words"
              onSubmitEditing={handleSaveAddress}
            />
          ) : (
            <TouchableOpacity
              onPress={() => { setAddress((profile as any)?.address ?? ''); setEditingAddress(true); }}
              style={{ flex: 1, alignItems: 'flex-end' }}
            >
              <Text style={[st.rowValue, !((profile as any)?.address) && { color: PULSE_COLORS.ui.muted }]} numberOfLines={1}>
                {(profile as any)?.address ?? 'Add address'}
              </Text>
            </TouchableOpacity>
          )}
          {editingAddress ? (
            <TouchableOpacity onPress={handleSaveAddress} disabled={savingAddress} style={{ paddingLeft: 10 }}>
              {savingAddress
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
          onPress={isOAuthUser ? undefined : () => { setEmailSent(false); setShowEmailModal(true); }}
        />
      </Section>

      {/* ── My Certifications (coaches + admins) ── */}
      {profile?.role !== 'player' && (
        <Section label="MY CERTIFICATIONS">
          {!certsLoaded ? (
            <View style={[st.row, { justifyContent: 'center' }]}>
              <ActivityIndicator size="small" color={PULSE_COLORS.ui.muted} />
            </View>
          ) : (
            <>
              {myCerts.map((cert, i) => {
                const CERT_LABELS: Record<string, string> = {
                  background_check: 'Background Check',
                  safesport:        'SafeSport',
                  coaching_license: 'Coaching License',
                  first_aid_cpr:    'First Aid / CPR',
                  custom:           cert.custom_label ?? 'Other',
                };
                const label = cert.cert_type === 'coaching_license' && cert.license_level
                  ? `${cert.license_level} License`
                  : CERT_LABELS[cert.cert_type] ?? cert.cert_type;

                const STATUS_STYLE: Record<string, { bg: string; color: string; text: string }> = {
                  pending:  { bg: '#FEF3C7', color: '#92400E', text: 'Pending' },
                  verified: { bg: '#F0FDF4', color: '#166534', text: 'Verified' },
                  rejected: { bg: '#FEF2F2', color: '#991B1B', text: 'Rejected' },
                  expired:  { bg: '#F1F5F9', color: '#475569', text: 'Expired' },
                };
                const ss = STATUS_STYLE[cert.status];
                const canResubmit = cert.status === 'rejected' || cert.status === 'expired';

                return (
                  <View key={cert.id}>
                    {i > 0 && <View style={st.divider} />}
                    <TouchableOpacity
                      style={st.row}
                      onPress={canResubmit ? () => openEditCert(cert) : undefined}
                      activeOpacity={canResubmit ? 0.65 : 1}
                    >
                      <IconCell name="shield-checkmark-outline" color="#fff" bg={primaryColor} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.rowLabel}>{label}</Text>
                        {cert.expiry_date && (
                          <Text style={{ fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 1 }}>
                            Expires {new Date(cert.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Text>
                        )}
                        {cert.status === 'rejected' && cert.rejection_note && (
                          <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 2 }} numberOfLines={2}>{cert.rejection_note}</Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={{ backgroundColor: ss.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: ss.color }}>{ss.text}</Text>
                        </View>
                        {canResubmit && (
                          <Text style={{ fontSize: 11, fontWeight: '600', color: primaryColor }}>Re-submit →</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {myCerts.length > 0 && <View style={st.divider} />}
              <TouchableOpacity style={st.row} onPress={openAddCert} activeOpacity={0.65}>
                <IconCell name="add-circle-outline" color="#fff" bg="#22C55E" />
                <Text style={[st.rowLabel, { color: '#22C55E', fontWeight: '600' }]}>Add certification</Text>
                <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
            </>
          )}
        </Section>
      )}

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

      {/* ── Certification upload modal ── */}
      <Modal visible={showCertModal} animationType="slide" transparent onRequestClose={() => setShowCertModal(false)}>
        <View style={cp.overlay}>
          <View style={[cp.sheet, { maxHeight: '90%' }]}>
            <View style={cp.handle} />
            <Text style={cp.title}>{editingCertId ? 'Re-submit Certification' : 'Add Certification'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>

              {/* Cert type */}
              <Text style={st.pwLabel}>CERTIFICATION TYPE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {([
                  { key: 'background_check', label: 'Background Check' },
                  { key: 'safesport',        label: 'SafeSport' },
                  { key: 'coaching_license', label: 'Coaching License' },
                  { key: 'first_aid_cpr',    label: 'First Aid / CPR' },
                  { key: 'custom',           label: 'Other' },
                ] as { key: string; label: string }[]).map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setCertType(key)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: certType === key ? primaryColor : PULSE_COLORS.ui.background,
                      borderWidth: 1.5,
                      borderColor: certType === key ? primaryColor : PULSE_COLORS.ui.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: certType === key ? '#fff' : PULSE_COLORS.ui.text }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* License level (coaching_license only) */}
              {certType === 'coaching_license' && (
                <>
                  <Text style={st.pwLabel}>LICENSE LEVEL</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {['Grassroots', 'D', 'C', 'B', 'A'].map(level => (
                      <TouchableOpacity
                        key={level}
                        onPress={() => setCertLevel(level)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: certLevel === level ? primaryColor : PULSE_COLORS.ui.background,
                          borderWidth: 1.5, borderColor: certLevel === level ? primaryColor : PULSE_COLORS.ui.border,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: certLevel === level ? '#fff' : PULSE_COLORS.ui.text }}>{level}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Custom label */}
              {certType === 'custom' && (
                <>
                  <Text style={st.pwLabel}>CERTIFICATION NAME</Text>
                  <TextInput
                    style={[st.pwInput, { marginBottom: 16 }]}
                    value={certCustomLabel}
                    onChangeText={setCertCustomLabel}
                    placeholder="e.g. State coaching certificate"
                    placeholderTextColor={PULSE_COLORS.ui.muted}
                  />
                </>
              )}

              {/* Expiry date */}
              <Text style={st.pwLabel}>EXPIRY DATE (YYYY-MM-DD)</Text>
              <TextInput
                style={[st.pwInput, { marginBottom: 16 }]}
                value={certExpiry}
                onChangeText={setCertExpiry}
                placeholder="2027-06-30"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />

              {/* Document upload */}
              <Text style={st.pwLabel}>DOCUMENT (PHOTO OR PDF)</Text>
              <TouchableOpacity
                onPress={pickCertDoc}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  padding: 14, borderRadius: 10, marginBottom: 20,
                  backgroundColor: PULSE_COLORS.ui.background,
                  borderWidth: 1.5, borderColor: certDocUri ? primaryColor : PULSE_COLORS.ui.border,
                  borderStyle: certDocUri ? 'solid' : 'dashed',
                }}
              >
                <Ionicons name={certDocUri ? 'document-text' : 'cloud-upload-outline'} size={20} color={certDocUri ? primaryColor : PULSE_COLORS.ui.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: certDocUri ? primaryColor : PULSE_COLORS.ui.muted }}>
                    {certDocUri ? certDocName : 'Upload photo or PDF'}
                  </Text>
                  {!certDocUri && <Text style={{ fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 2 }}>Max 10MB · JPG, PNG, PDF</Text>}
                </View>
                {certDocUri && <Ionicons name="checkmark-circle" size={18} color={primaryColor} />}
              </TouchableOpacity>

              {/* Buttons */}
              <View style={cp.btns}>
                <TouchableOpacity style={cp.cancelBtn} onPress={() => setShowCertModal(false)} disabled={savingCert}>
                  <Text style={cp.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cp.applyBtn, { backgroundColor: primaryColor }, savingCert && { opacity: 0.5 }]}
                  onPress={submitCert}
                  disabled={savingCert}
                >
                  {savingCert
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[cp.applyText, { color: '#fff' }]}>{editingCertId ? 'Re-submit' : 'Submit'}</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: 8 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Email change modal ── */}
      <Modal visible={showEmailModal} animationType="slide" transparent onRequestClose={() => setShowEmailModal(false)}>
        <View style={cp.overlay}>
          <View style={cp.sheet}>
            <View style={cp.handle} />
            <Text style={cp.title}>Change Email</Text>

            {emailSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 16, gap: 12 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text, textAlign: 'center' }}>Confirmation sent</Text>
                <Text style={{ fontSize: 13, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 19 }}>
                  Click the link sent to your new email address to complete the change. Your email stays the same until you confirm.
                </Text>
                <TouchableOpacity
                  style={[cp.applyBtn, { backgroundColor: primaryColor, marginTop: 8 }]}
                  onPress={() => { setShowEmailModal(false); setEmailSent(false); }}
                >
                  <Text style={cp.applyText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#EF4444" style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600', flex: 1, lineHeight: 17 }}>
                    Your current password is required to confirm this change.
                  </Text>
                </View>

                <Text style={st.pwLabel}>Current password</Text>
                <TextInput
                  style={[st.pwInput, { marginBottom: 16 }]}
                  value={emailPw}
                  onChangeText={setEmailPw}
                  secureTextEntry
                  placeholder="Your current password"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  autoCapitalize="none"
                />

                <Text style={st.pwLabel}>New email address</Text>
                <TextInput
                  style={[st.pwInput, { marginBottom: 16 }]}
                  value={newEmailVal}
                  onChangeText={setNewEmailVal}
                  placeholder="new@email.com"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={st.pwLabel}>Confirm new email</Text>
                <TextInput
                  style={[st.pwInput, { marginBottom: 24, borderColor: confirmEmailVal && confirmEmailVal !== newEmailVal ? '#EF4444' : undefined }]}
                  value={confirmEmailVal}
                  onChangeText={setConfirmEmailVal}
                  placeholder="Repeat new email"
                  placeholderTextColor={PULSE_COLORS.ui.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={cp.btns}>
                  <TouchableOpacity style={cp.cancelBtn} onPress={() => { setShowEmailModal(false); setNewEmailVal(''); setConfirmEmailVal(''); setEmailPw(''); }}>
                    <Text style={cp.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[cp.applyBtn, { backgroundColor: primaryColor }, (!newEmailVal || !confirmEmailVal || newEmailVal !== confirmEmailVal || !emailPw || savingEmail) && { opacity: 0.35 }]}
                    onPress={handleChangeEmail}
                    disabled={!newEmailVal || !confirmEmailVal || newEmailVal !== confirmEmailVal || !emailPw || savingEmail}
                  >
                    {savingEmail
                      ? <ActivityIndicator color="#000" size="small" />
                      : <Text style={cp.applyText}>Send confirmation</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

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


// Shared bottom-sheet modal chrome — used by the certification, password,
// and email-change modals below.
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
  avatarThumb: { width: 32, height: 32, borderRadius: 16 },
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

  teamSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, marginBottom: 6,
    backgroundColor: PULSE_COLORS.ui.background, borderRadius: 10,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  teamSearchInput: { flex: 1, fontSize: 14, color: PULSE_COLORS.ui.text },
  teamMetaPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: PULSE_COLORS.ui.background,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    maxWidth: 130,
  },
  teamMetaPillText: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },

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
  teamAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginVertical: 2 },
  teamClubLogo: { width: 22, height: 22 },
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

  // Parent avatar circle
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarCircleImg: { width: 80, height: 80 },
  avatarCircleInitials: { fontSize: 26, fontWeight: '800' },
});
