import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../lib/supabase';
import { useTeam } from '../../../hooks/useTeam';
import { useAuth } from '../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../constants/colors';
import { useClub } from '../../../hooks/useClub';
import ClubHeader, { headerBtnStyle } from '../../../components/ui/ClubHeader';
import SmartLocationInput from '../../../components/ui/SmartLocationInput';
import { DateTimeSheet } from '../../../components/ui/DateTimeSheet';
import { zonedTimeToUtc } from '../../../lib/timezone';

function toDbDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

// A tournament is deliberately minimal — a name, an optional location, and
// OPTIONAL dates. Leaving dates blank is what makes a State Cup knockout
// work: its range is derived from whichever games end up linked to it (see
// lib/tournaments.ts) since rounds are only known one at a time, weeks
// apart. A weekend tournament, though, usually has known dates up front —
// and a coach needs to gauge headcount for entry/commitment purposes
// *before* the bracket is even published, which is what the optional entry
// RSVP (only offered once a start date is set) is for.
export default function CreateTournamentScreen() {
  const { primaryColor, secondaryColor, onSecondary, timezone } = useClub();
  const router = useRouter();
  const { clubSlug, tournamentId } = useLocalSearchParams<{ clubSlug: string; tournamentId?: string }>();
  const { team } = useTeam();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [rsvpDeadline, setRsvpDeadline] = useState<Date | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!tournamentId);
  const [scanning, setScanning] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const isEdit = !!tournamentId;
  const canSave = name.trim().length > 0 && !saving;

  useEffect(() => {
    if (!tournamentId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('tournaments')
        .select('name, location, start_date, end_date, entry_rsvp_lock_at, logo_url')
        .eq('id', tournamentId)
        .single();
      if (error || !data) {
        setLoading(false);
        Alert.alert("Couldn't load tournament", 'Check your connection and try again.');
        router.back();
        return;
      }
      setName(data.name);
      setLocationName(data.location ?? '');
      if (data.start_date) setStartDate(new Date(data.start_date + 'T00:00:00'));
      if (data.end_date) setEndDate(new Date(data.end_date + 'T00:00:00'));
      if (data.entry_rsvp_lock_at) setRsvpDeadline(new Date(data.entry_rsvp_lock_at));
      setLogoUrl(data.logo_url ?? null);
      setLoading(false);
    })();
  }, [tournamentId]);

  // Crops the AI-located logo out of the original picked photo (full
  // resolution, not the compressed base64 sent for parsing) and uploads it
  // — best-effort, never blocks or errors out the rest of the scan if it
  // fails, since the coach can always add/change a logo manually below.
  async function cropAndUploadLogo(asset: ImagePicker.ImagePickerAsset, bbox: { x: number; y: number; width: number; height: number }) {
    try {
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      if (!w || !h) return;
      // AI-estimated boxes run imprecise — pad generously beyond what the
      // model already returns rather than crop tight, since a bit of extra
      // background around the logo looks far better than clipping it.
      const PAD = 0.15;
      const padX = bbox.width * PAD;
      const padY = bbox.height * PAD;
      const x0 = Math.max(0, bbox.x - padX);
      const y0 = Math.max(0, bbox.y - padY);
      const x1 = Math.min(1, bbox.x + bbox.width + padX);
      const y1 = Math.min(1, bbox.y + bbox.height + padY);

      const originX = Math.max(0, Math.min(w - 1, Math.round(x0 * w)));
      const originY = Math.max(0, Math.min(h - 1, Math.round(y0 * h)));
      const cropWidth = Math.max(1, Math.min(w - originX, Math.round((x1 - x0) * w)));
      const cropHeight = Math.max(1, Math.min(h - originY, Math.round((y1 - y0) * h)));

      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setUploadingLogo(true);
      const response = await fetch(manipulated.uri);
      const arrayBuffer = await response.arrayBuffer();
      const path = `${team?.id ?? 'unknown'}/${Date.now()}-ai.jpg`;
      const { error } = await supabase.storage
        .from('tournament-logos')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      if (error) return;
      const { data: { publicUrl } } = supabase.storage.from('tournament-logos').getPublicUrl(path);
      setLogoUrl(publicUrl);
    } catch (err) {
      console.warn('[create-tournament] cropAndUploadLogo failed', err);
    } finally {
      setUploadingLogo(false);
    }
  }

  // Only extracts the tournament's own name/venue/dates — never games. A
  // tournament announcement and the actual bracket/schedule are often two
  // different documents released at different times (especially for a
  // knockout, where there's no game schedule at all yet at creation time),
  // so importing games stays the existing separate step on the detail
  // screen once the tournament exists. `imageAssets` (same order as the
  // image-type entries in `files`) is only needed so a detected logo can be
  // cropped from the real picked photo — empty for a single PDF/file scan.
  async function scanDocument(files: { file_base64: string; file_type: string }[], imageAssets: ImagePicker.ImagePickerAsset[] = []) {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-tournament-info', { body: { files } });
      if (error || !data) {
        let detail = error?.message ?? 'Unknown error';
        // FunctionsHttpError carries the actual Response on .context — its
        // body has the real failure reason (e.g. payload too large), which
        // .message alone doesn't include.
        const ctx = (error as any)?.context;
        if (ctx?.text) {
          try { detail = await ctx.text(); } catch { /* keep .message */ }
        }
        console.error('[create-tournament] scan error:', detail);
        Alert.alert("Couldn't read that file", detail.length < 150 ? detail : 'Check your connection and try again, or enter the details manually.');
        return;
      }
      if (data.name) setName(data.name);
      if (data.location) setLocationName(data.location);
      if (data.address) setAddress(data.address);
      if (data.start_date) setStartDate(new Date(data.start_date + 'T00:00:00'));
      if (data.end_date) setEndDate(new Date(data.end_date + 'T00:00:00'));

      if (typeof data.logo_image_index === 'number' && data.logo_bbox && imageAssets[data.logo_image_index]) {
        cropAndUploadLogo(imageAssets[data.logo_image_index], data.logo_bbox);
      }
    } catch (err) {
      console.warn('[create-tournament] scanDocument failed', err);
      Alert.alert("Couldn't read that file", 'Check your connection and try again, or enter the details manually.');
    } finally {
      setScanning(false);
    }
  }

  // Claude's API hard-rejects any single image whose base64 form exceeds
  // 10 MB — a real phone photo at quality 0.9 clears that easily (a 12MP+
  // shot can be 8-12 MB just as a JPEG, before the ~33% base64 overhead).
  // Downscale to a long-edge cap well under that ceiling before sending —
  // 1600px is still plenty sharp for reading flyer text. The ORIGINAL
  // full-resolution asset is kept separately for the logo crop step, so
  // this compression never limits the final logo's quality.
  const MAX_SCAN_DIM = 1600;
  async function toSafeScanBase64(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
    try {
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      const longEdge = Math.max(w, h);
      const actions = longEdge > MAX_SCAN_DIM
        ? [{ resize: w >= h ? { width: MAX_SCAN_DIM } : { height: MAX_SCAN_DIM } }]
        : [];
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri, actions, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return manipulated.base64 ?? null;
    } catch (err) {
      console.warn('[create-tournament] toSafeScanBase64 failed', err);
      return null;
    }
  }

  async function scanFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    if ((file.size ?? 0) > 20 * 1024 * 1024) { Alert.alert('File too large', 'Maximum 20 MB.'); return; }
    const isImage = (file.mimeType ?? '').startsWith('image/');
    if (isImage) {
      // Same 10 MB-per-image ceiling applies here — resize down first
      // rather than sending the raw file straight through.
      const manipulated = await ImageManipulator.manipulateAsync(
        file.uri, [{ resize: { width: MAX_SCAN_DIM } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) { Alert.alert('Error', "Couldn't read that file — try picking it again."); return; }
      await scanDocument([{ file_base64: manipulated.base64, file_type: 'image/jpeg' }]);
      return;
    }
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    await scanDocument([{ file_base64: base64, file_type: file.mimeType ?? 'application/pdf' }]);
  }

  async function scanImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.9, base64: true, allowsMultipleSelection: true, selectionLimit: 6,
    });
    if (result.canceled || !result.assets?.length) return;
    const validAssets = result.assets.filter((a) => !!a.base64);
    if (!validAssets.length) { Alert.alert('Error', "Couldn't read those photos — try picking them again or use different ones."); return; }

    const safeBase64s = await Promise.all(validAssets.map(toSafeScanBase64));
    const files: { file_base64: string; file_type: string }[] = [];
    const cropAssets: ImagePicker.ImagePickerAsset[] = [];
    for (let i = 0; i < validAssets.length; i++) {
      const b64 = safeBase64s[i];
      if (!b64) continue; // skip any single image that failed to downscale rather than failing the whole batch
      files.push({ file_base64: b64, file_type: 'image/jpeg' });
      cropAssets.push(validAssets[i]);
    }
    if (!files.length) { Alert.alert('Error', "Couldn't read those photos — try picking them again or use different ones."); return; }
    await scanDocument(files, cropAssets);
  }

  async function pickLogo() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingLogo(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const arrayBuffer = await response.arrayBuffer();
      const path = `${team?.id ?? 'unknown'}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from('tournament-logos')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      if (error) { Alert.alert('Upload failed', error.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('tournament-logos').getPublicUrl(path);
      setLogoUrl(publicUrl);
    } catch (e) {
      Alert.alert('Upload failed', String(e));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);

    const location = address || locationName || null;

    let entryRsvpLockAt: string | null = null;
    if (rsvpDeadline) {
      try {
        entryRsvpLockAt = zonedTimeToUtc(toDbDate(rsvpDeadline), '23:59:59', timezone).toISOString();
      } catch (err) {
        console.warn('[create-tournament] could not compute entry_rsvp_lock_at', err);
      }
    }
    const dateFields = {
      start_date: startDate ? toDbDate(startDate) : null,
      end_date: startDate ? toDbDate(endDate ?? startDate) : null,
      entry_rsvp_lock_at: entryRsvpLockAt,
    };

    if (isEdit) {
      const { error } = await (supabase as any)
        .from('tournaments')
        .update({ name: name.trim(), location, logo_url: logoUrl, ...dateFields })
        .eq('id', tournamentId);
      setSaving(false);
      if (error) {
        Alert.alert('Failed to save', "Couldn't update this tournament — try again.");
        return;
      }
      router.back();
      return;
    }

    if (!team || !profile) { setSaving(false); return; }
    const { data, error } = await (supabase as any)
      .from('tournaments')
      .insert({ team_id: team.id, name: name.trim(), location, logo_url: logoUrl, created_by: profile.id, ...dateFields })
      .select('id')
      .single();
    setSaving(false);
    if (error || !data) {
      Alert.alert('Failed to create', "Couldn't create this tournament — try again.");
      return;
    }
    // Land straight on the detail screen, ready to add the first game.
    router.replace(`/(app)/${clubSlug}/tournament/${data.id}` as any);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClubHeader
        title={isEdit ? 'Edit Tournament' : 'New Tournament'}
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            style={[headerBtnStyle as object, { backgroundColor: secondaryColor, opacity: canSave ? 1 : 0.4 }]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {saving
              ? <ActivityIndicator size="small" color={onSecondary} />
              : <Text style={{ color: onSecondary, fontWeight: '800', fontSize: 12 }}>Save</Text>
            }
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {!isEdit && (
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => Alert.alert(
                'Scan a flyer or schedule',
                "Pick one or more photos, or a PDF/image file — Claude will read the name, venue, and dates, and grab the tournament's logo if it spots one.",
                [
                  { text: 'Choose Photos', onPress: scanImages },
                  { text: 'Choose File', onPress: scanFile },
                  { text: 'Cancel', style: 'cancel' },
                ]
              )}
              disabled={scanning}
              activeOpacity={0.8}
            >
              {scanning
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="sparkles" size={15} color="#fff" />}
              <Text style={styles.scanBtnText}>{scanning ? 'Reading document…' : 'Scan a flyer or schedule'}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionHeader}>LOGO <Text style={styles.hint}>optional</Text></Text>
          <View style={styles.logoRow}>
            <TouchableOpacity style={styles.logoTap} onPress={pickLogo} disabled={uploadingLogo} activeOpacity={0.8}>
              {uploadingLogo ? (
                <ActivityIndicator color={primaryColor} />
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
              ) : (
                <Ionicons name="image-outline" size={24} color={PULSE_COLORS.ui.muted} />
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={pickLogo} disabled={uploadingLogo}>
                <Text style={[styles.logoActionText, { color: primaryColor }]}>{logoUrl ? 'Change logo' : 'Add a logo'}</Text>
              </TouchableOpacity>
              {logoUrl && (
                <TouchableOpacity onPress={() => setLogoUrl(null)}>
                  <Text style={styles.logoRemoveText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.sectionHeader}>NAME</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.titleInput}
              value={name}
              onChangeText={setName}
              placeholder="Jefferson Cup, State Cup 2026…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              autoFocus={!isEdit}
              returnKeyType="done"
            />
          </View>

          <Text style={styles.sectionHeader}>LOCATION <Text style={styles.hint}>optional</Text></Text>
          <View style={[styles.card, { padding: 12 }]}>
            <View style={styles.locationNameRow}>
              <Ionicons name="business-outline" size={17} color={PULSE_COLORS.ui.muted} style={{ width: 22 }} />
              <TextInput
                style={styles.inlineInput}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Venue name (e.g. Richmond Sportsplex)"
                placeholderTextColor={PULSE_COLORS.ui.muted}
                returnKeyType="next"
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <SmartLocationInput
                initialValue={address}
                onResult={(r) => {
                  if (!locationName) setLocationName(r.name);
                  setAddress(r.address ?? '');
                }}
              />
            </View>
            <Text style={styles.locationSub}>
              Leave blank for a knockout tournament where the venue changes each round.
            </Text>
          </View>

          <Text style={styles.sectionHeader}>DATES <Text style={styles.hint}>optional</Text></Text>
          <View style={[styles.card, { padding: 12 }]}>
            <TouchableOpacity style={styles.dateRow} onPress={() => setShowStartDatePicker(true)}>
              <Ionicons name="calendar-outline" size={17} color={PULSE_COLORS.ui.muted} style={{ width: 22 }} />
              <Text style={startDate ? [styles.dateValue, { color: primaryColor }] : styles.dateValueMuted}>
                {startDate ? fmtDate(startDate) : 'Not set'}
              </Text>
              {startDate && (
                <TouchableOpacity onPress={() => setStartDate(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {startDate && (
              <>
                <View style={styles.chipRow}>
                  {([0, 1, 2] as const).map((n) => {
                    const chipDate = addDays(startDate, n);
                    const active = toDbDate(endDate ?? startDate) === toDbDate(chipDate);
                    return (
                      <TouchableOpacity
                        key={n}
                        style={[styles.chip, active && [styles.chipActive, { borderColor: primaryColor }]]}
                        onPress={() => setEndDate(n === 0 ? null : chipDate)}
                      >
                        <Text style={[styles.chipText, active && { color: primaryColor }]}>
                          {n === 0 ? 'Same day' : `+${n} day${n > 1 ? 's' : ''}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Directly editable for anything longer than the quick
                    shortcuts above — a multi-day showcase, for instance. */}
                <TouchableOpacity style={[styles.dateRow, { marginTop: 12 }]} onPress={() => setShowEndDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={17} color={PULSE_COLORS.ui.muted} style={{ width: 22 }} />
                  <Text style={[styles.dateValue, { color: primaryColor, flex: 1 }]}>
                    Ends {fmtDate(endDate ?? startDate)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.dateRow, { marginTop: 12 }]} onPress={() => setShowDeadlinePicker(true)}>
                  <Ionicons name="timer-outline" size={17} color={PULSE_COLORS.ui.muted} style={{ width: 22 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={rsvpDeadline ? [styles.dateValue, { color: primaryColor }] : styles.dateValueMuted}>
                      {rsvpDeadline ? `RSVP by ${fmtDate(rsvpDeadline)}` : 'RSVP deadline — not set'}
                    </Text>
                  </View>
                  {rsvpDeadline && (
                    <TouchableOpacity onPress={() => setRsvpDeadline(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                <Text style={styles.locationSub}>
                  Parents can RSVP whether they're in for the weekend before the game schedule is even out.
                </Text>
              </>
            )}
          </View>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DateTimeSheet
        visible={showStartDatePicker}
        mode="date"
        value={startDate ?? new Date()}
        title="Start date"
        onConfirm={(d) => {
          setStartDate(d);
          // A stale end date from before this change could now predate the
          // new start — clear it rather than save an inverted range.
          if (endDate && endDate.getTime() < d.getTime()) setEndDate(null);
        }}
        onClose={() => setShowStartDatePicker(false)}
      />
      <DateTimeSheet
        visible={showEndDatePicker}
        mode="date"
        value={endDate ?? startDate ?? new Date()}
        minimumDate={startDate ?? new Date()}
        title="End date"
        onConfirm={setEndDate}
        onClose={() => setShowEndDatePicker(false)}
      />
      <DateTimeSheet
        visible={showDeadlinePicker}
        mode="date"
        value={rsvpDeadline ?? startDate ?? new Date()}
        title="RSVP deadline"
        onConfirm={setRsvpDeadline}
        onClose={() => setShowDeadlinePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PULSE_COLORS.ui.background },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  hint: { fontWeight: '400', letterSpacing: 0, textTransform: 'none' },
  card: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 16, marginBottom: 20, overflow: 'hidden',
  },
  titleInput: { fontSize: 16, fontWeight: '600', color: PULSE_COLORS.ui.text, paddingHorizontal: 16, paddingVertical: 14 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  logoTap: {
    width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, overflow: 'hidden',
  },
  logoImage: { width: 56, height: 56 },
  logoActionText: { fontSize: 14, fontWeight: '700' },
  logoRemoveText: { fontSize: 12.5, fontWeight: '600', color: PULSE_COLORS.status.error, marginTop: 4 },
  locationNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineInput: { flex: 1, color: PULSE_COLORS.ui.text, fontSize: 14 },
  locationSub: { fontSize: 11.5, color: PULSE_COLORS.ui.muted, marginTop: 10, lineHeight: 16 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateValue: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  dateValueMuted: { flex: 1, fontSize: 14.5, fontWeight: '400', color: PULSE_COLORS.ui.muted },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surfaceAlt,
  },
  chipActive: { backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  chipText: { fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 13, marginBottom: 20,
  },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
