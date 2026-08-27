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
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
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

  const isEdit = !!tournamentId;
  const canSave = name.trim().length > 0 && !saving;

  useEffect(() => {
    if (!tournamentId) return;
    (async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('name, location, start_date, end_date, entry_rsvp_lock_at')
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
      setLoading(false);
    })();
  }, [tournamentId]);

  // Only extracts the tournament's own name/venue/dates — never games. A
  // tournament announcement and the actual bracket/schedule are often two
  // different documents released at different times (especially for a
  // knockout, where there's no game schedule at all yet at creation time),
  // so importing games stays the existing separate step on the detail
  // screen once the tournament exists.
  async function scanDocument(file_base64: string, file_type: string) {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-tournament-info', { body: { file_base64, file_type } });
      if (error || !data) {
        Alert.alert("Couldn't read that file", 'Check your connection and try again, or enter the details manually.');
        return;
      }
      if (data.name) setName(data.name);
      if (data.location) setLocationName(data.location);
      if (data.address) setAddress(data.address);
      if (data.start_date) setStartDate(new Date(data.start_date + 'T00:00:00'));
      if (data.end_date) setEndDate(new Date(data.end_date + 'T00:00:00'));
    } catch (err) {
      console.warn('[create-tournament] scanDocument failed', err);
      Alert.alert("Couldn't read that file", 'Check your connection and try again, or enter the details manually.');
    } finally {
      setScanning(false);
    }
  }

  async function scanFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    if ((file.size ?? 0) > 20 * 1024 * 1024) { Alert.alert('File too large', 'Maximum 20 MB.'); return; }
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    await scanDocument(base64, file.mimeType ?? 'image/jpeg');
  }

  async function scanImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', "Couldn't read that photo — try picking it again or use a different one."); return; }
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    await scanDocument(asset.base64, ext === 'png' ? 'image/png' : 'image/jpeg');
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
      const { error } = await supabase
        .from('tournaments')
        .update({ name: name.trim(), location, ...dateFields })
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
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ team_id: team.id, name: name.trim(), location, created_by: profile.id, ...dateFields })
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
                'Pick a photo or a PDF/image file — Claude will read the name, venue, and dates.',
                [
                  { text: 'Choose Photo', onPress: scanImage },
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
