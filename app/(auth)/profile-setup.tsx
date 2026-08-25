import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { addGuardianInvite } from '../../lib/inviteApi';
import { posthog } from '../../lib/posthog';
import { PULSE_COLORS } from '../../constants/colors';
import { resolveAccent, contrastText } from '../../lib/brandColor';
import AuthInput from '../../components/ui/AuthInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorBanner from '../../components/ui/ErrorBanner';
import ImageEditor from '../../components/ui/ImageEditor';

type GuardedPlayer = {
  id: string;
  full_name: string;
  team_id: string;
};

type ChildFields = { name: string; phone: string; rel: string; notes: string };

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, profile, club, refreshProfile, signOut } = useAuth();
  const isCoachOrAdmin = profile?.role === 'coach' || profile?.role === 'org_admin';
  const accent = resolveAccent(club?.primary_color);

  const [fullName, setFullName]         = useState(profile?.full_name ?? '');
  const [phone, setPhone]               = useState(profile?.phone ?? '');
  const [shareContact, setShareContact] = useState(profile?.share_contact_with_team ?? true);
  const [avatarUrl, setAvatarUrl]       = useState<string | null>(profile?.avatar_url ?? null);

  const [avatarEditorUri, setAvatarEditorUri]     = useState('');
  const [avatarEditorVisible, setAvatarEditorVisible] = useState(false);
  const [avatarUploading, setAvatarUploading]     = useState(false);

  // Parent — per-child emergency info
  const [players, setPlayers]           = useState<GuardedPlayer[]>([]);
  const [childFields, setChildFields]   = useState<Record<string, ChildFields>>({});
  // First existing emergency-contact row per child, if any — this screen
  // only ever captures one contact; more can be added later from the
  // player's Guardians tab.
  const [existingContactId, setExistingContactId] = useState<Record<string, string>>({});

  // Add another guardian (parent only, first linked child)
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianSaving, setGuardianSaving] = useState(false);
  const [guardianSent, setGuardianSent]   = useState(false);
  const [guardianSentTo, setGuardianSentTo] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isCoachOrAdmin) return;
    (async () => {
      const { data } = await supabase.rpc('get_my_guarded_players');
      const rows = (data ?? []) as GuardedPlayer[];
      setPlayers(rows);

      const [{ data: contacts }, { data: medicalNotes }] = rows.length
        ? await Promise.all([
            supabase
              .from('player_emergency_contacts')
              .select('id, player_id, name, phone, relationship')
              .in('player_id', rows.map((p) => p.id))
              .order('created_at', { ascending: true }),
            (supabase as any)
              .from('player_medical_notes')
              .select('player_id, notes')
              .in('player_id', rows.map((p) => p.id)) as Promise<{ data: { player_id: string; notes: string | null }[] | null }>,
          ])
        : [{ data: [] }, { data: [] as { player_id: string; notes: string | null }[] }];

      const fields: Record<string, ChildFields> = {};
      const ids: Record<string, string> = {};
      for (const p of rows) {
        const existing = (contacts ?? []).find((c) => c.player_id === p.id);
        const notesRow = (medicalNotes ?? []).find((m) => m.player_id === p.id);
        fields[p.id] = {
          name: existing?.name ?? '',
          phone: existing?.phone ?? '',
          rel: existing?.relationship ?? '',
          notes: notesRow?.notes ?? '',
        };
        if (existing) ids[p.id] = existing.id;
      }
      setChildFields(fields);
      setExistingContactId(ids);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  function setChildField(playerId: string, key: keyof ChildFields, value: string) {
    setChildFields((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [key]: value } }));
  }

  async function finishAndRedirect() {
    await refreshProfile();
    if (club) {
      router.replace(`/(app)/${club.slug}/(tabs)`);
    } else {
      router.replace('/(auth)/find-team');
    }
  }

  function handleAvatarUpload() {
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] }).then((result) => {
      if (result.canceled || !result.assets[0]) return;
      setAvatarEditorUri(result.assets[0].uri);
      setAvatarEditorVisible(true);
    });
  }

  async function handleAvatarEditorSave(uri: string) {
    setAvatarEditorVisible(false);
    if (!user) return;
    setAvatarUploading(true);
    try {
      const response = await fetch(uri);
      const buffer = await response.arrayBuffer();
      // Storage RLS (profile_avatar_upload) requires the uid as an actual
      // folder segment, not just a filename prefix — `${uid}-x` never
      // matches `starts_with(name, uid || '/')`, only `${uid}/x` does.
      const path = `${user.id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, buffer, { contentType: 'image/png', upsert: true });
      if (upErr) { Alert.alert('Upload failed', upErr.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(publicUrl);
    } catch (e) {
      Alert.alert('Upload failed', String(e));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSendGuardian() {
    const target = players[0];
    if (!target || !guardianEmail.trim() || !user) return;
    const email = guardianEmail.trim();
    setGuardianSaving(true);

    // Diagnostic: confirm the session actually attached to this request
    // matches the cached `user` this screen thinks is signed in — the
    // guardian check has verified correct against the DB directly every
    // time this has been debugged, so a live session/context mismatch is
    // the remaining suspect. Temporary until we see it fire (or don't).
    const { data: { user: liveUser } } = await supabase.auth.getUser();
    if (liveUser?.id !== user.id) {
      console.warn('[guardian-invite] session mismatch', { cachedUserId: user.id, liveUserId: liveUser?.id });
      Alert.alert("Couldn't send invite", 'Please sign out and back in, then try again.');
      setGuardianSaving(false);
      return;
    }

    const result = await addGuardianInvite({
      teamId: target.team_id,
      playerId: target.id,
      email,
      createdBy: user.id,
      playerName: target.full_name,
    });
    setGuardianSaving(false);
    if (!result.ok) { Alert.alert("Couldn't send invite", result.error); return; }
    if (!result.emailSent) {
      Alert.alert('Guardian added', "They're linked, but the invite email couldn't be sent — you can resend it from the player's Guardians tab.");
    }
    setGuardianSentTo(email);
    setGuardianSent(true);
    setGuardianEmail('');
  }

  async function handleContinue() {
    if (!user) return;
    setError(null);
    setLoading(true);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        avatar_url: avatarUrl,
        share_contact_with_team: shareContact,
        onboarded_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    if (!isCoachOrAdmin) {
      await Promise.all(players.map((p) => {
        const f = childFields[p.id];
        if (!f) return Promise.resolve();
        const tasks: PromiseLike<unknown>[] = [
          (supabase as any).from('player_medical_notes').upsert(
            { player_id: p.id, notes: f.notes.trim() || null, updated_at: new Date().toISOString() },
            { onConflict: 'player_id' }
          ),
        ];
        const existingId = existingContactId[p.id];
        if (f.name.trim()) {
          tasks.push(
            existingId
              ? supabase.from('player_emergency_contacts').update({
                  name: f.name.trim(),
                  phone: f.phone.trim() || null,
                  relationship: f.rel.trim() || null,
                }).eq('id', existingId)
              : supabase.from('player_emergency_contacts').insert({
                  player_id: p.id,
                  name: f.name.trim(),
                  phone: f.phone.trim() || null,
                  relationship: f.rel.trim() || null,
                })
          );
        } else if (existingId) {
          // Name cleared — remove the contact rather than leaving a nameless row.
          tasks.push(supabase.from('player_emergency_contacts').delete().eq('id', existingId));
        }
        return Promise.all(tasks);
      }));
    }

    setLoading(false);
    posthog.capture('onboarding_profile_completed', { role: profile?.role ?? null });
    await finishAndRedirect();
  }

  async function handleSkip() {
    if (!user) { return; }
    await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', user.id);
    posthog.capture('onboarding_profile_skipped', { role: profile?.role ?? null });
    if (!club) {
      Alert.alert(
        'Join a team first',
        'You need an invite code or club name to continue. Ask your coach.',
        [
          { text: 'Find team', onPress: () => router.replace('/(auth)/find-team') },
          { text: 'Sign out', style: 'destructive', onPress: signOut },
        ],
      );
    } else {
      await finishAndRedirect();
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Almost there!</Text>
        <Text style={styles.subheading}>Set up your profile</Text>

        {error && <ErrorBanner message={error} />}

        {/* Photo */}
        <TouchableOpacity onPress={handleAvatarUpload} style={styles.avatarWrap} disabled={avatarUploading}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera-outline" size={26} color={PULSE_COLORS.ui.muted} />
            </View>
          )}
          <Text style={[styles.avatarLabel, { color: accent }]}>{avatarUploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add a photo'}</Text>
        </TouchableOpacity>

        <AuthInput label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Smith" />
        <AuthInput label="Phone" value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />

        {/* Share with team toggle */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.toggleTitle}>Share my contact with team parents</Text>
            <Text style={styles.toggleSub}>Other parents on your team(s) can see your phone number. Your coach can always see it either way. Emergency/medical info is never shared this way.</Text>
          </View>
          <Switch
            value={shareContact}
            onValueChange={setShareContact}
            trackColor={{ false: PULSE_COLORS.ui.border, true: `${accent}80` }}
            thumbColor={shareContact ? accent : undefined}
          />
        </View>

        {/* Emergency info */}
        {!isCoachOrAdmin && players.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Emergency info</Text>
            <Text style={styles.sectionSub}>Visible to your coach only — the whole point is being able to find it fast if it's ever needed.</Text>
            {players.map((p) => {
              const f = childFields[p.id] ?? { name: '', phone: '', rel: '', notes: '' };
              return (
                <View key={p.id} style={styles.childCard}>
                  <Text style={styles.childName}>{p.full_name}</Text>
                  <AuthInput label="Emergency contact name" value={f.name} onChangeText={(v) => setChildField(p.id, 'name', v)} placeholder="Who should we call?" />
                  <AuthInput label="Emergency contact phone" value={f.phone} onChangeText={(v) => setChildField(p.id, 'phone', v)} placeholder="(555) 123-4567" keyboardType="phone-pad" />
                  <AuthInput label="Relationship" value={f.rel} onChangeText={(v) => setChildField(p.id, 'rel', v)} placeholder="e.g. Mother" />
                  <AuthInput label="Allergies / medical notes" value={f.notes} onChangeText={(v) => setChildField(p.id, 'notes', v)} placeholder="Optional" multiline numberOfLines={2} />
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Add another guardian */}
        {!isCoachOrAdmin && players.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add another guardian <Text style={styles.optional}>(optional)</Text></Text>
            <Text style={styles.sectionSub}>Invite a co-parent or guardian for {players[0].full_name} — they'll get their own account and access.</Text>
            {guardianSent ? (
              <View style={styles.guardianSentBanner}>
                <Ionicons name="checkmark-circle" size={16} color={accent} />
                <Text style={[styles.guardianSentText, { color: accent }]}>Invite sent to {guardianSentTo}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <AuthInput label="" value={guardianEmail} onChangeText={setGuardianEmail} placeholder="guardian@email.com" keyboardType="email-address" />
                </View>
                <TouchableOpacity
                  onPress={handleSendGuardian}
                  disabled={!guardianEmail.trim() || guardianSaving}
                  style={[styles.sendGuardianBtn, { backgroundColor: accent }, (!guardianEmail.trim() || guardianSaving) && { opacity: 0.5 }]}
                >
                  <Text style={[styles.sendGuardianText, { color: contrastText(accent) }]}>{guardianSaving ? '…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <PrimaryButton title="Let's go" onPress={handleContinue} loading={loading} color={accent} textColor={contrastText(accent)} style={styles.continueButton} />

        <TouchableOpacity onPress={handleSkip} style={styles.skipLink}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>

      <ImageEditor
        visible={avatarEditorVisible}
        uri={avatarEditorUri}
        primaryColor={accent}
        onSave={handleAvatarEditorSave}
        onCancel={() => setAvatarEditorVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: PULSE_COLORS.ui.background,
  },
  container: {
    padding: 16,
    paddingTop: 80,
    alignItems: 'stretch',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: PULSE_COLORS.ui.text,
    textAlign: 'center',
  },
  subheading: {
    fontSize: 15,
    color: PULSE_COLORS.ui.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },

  avatarWrap: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 8 },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44, marginBottom: 8,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLabel: { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.brand.green },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14, marginBottom: 20,
  },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  toggleSub: { fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 17 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  sectionSub: { fontSize: 12.5, color: PULSE_COLORS.ui.muted, marginBottom: 14, lineHeight: 17 },
  optional: { fontSize: 13, fontWeight: '500', color: PULSE_COLORS.ui.muted },

  childCard: {
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14, marginBottom: 12,
  },
  childName: { fontSize: 14, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 10 },

  guardianSentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
    borderRadius: 10, padding: 10,
  },
  guardianSentText: { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.brand.green },

  sendGuardianBtn: {
    height: 50, paddingHorizontal: 18, borderRadius: 12,
    backgroundColor: PULSE_COLORS.brand.green, alignItems: 'center', justifyContent: 'center',
  },
  sendGuardianText: { fontSize: 14, fontWeight: '800', color: PULSE_COLORS.brand.black },

  continueButton: {
    marginTop: 12,
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  skipText: {
    color: PULSE_COLORS.ui.muted,
    fontSize: 13,
  },
});
