import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import { DUGOUT_COLORS } from '../../../../constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'review' | 'importing' | 'done';

type ParsedPlayer = {
  _id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  parent_email: string | null;
  uncertain: boolean;
  uncertainty_reason: string | null;
  duplicate: boolean;
  selected: boolean;
};

type DoneStats = {
  added: number;
  invitesSent: number;
  noEmail: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const PROCESSING_MESSAGES = [
  'Reading your roster…',
  'Mapping columns to player fields…',
  'Normalising positions…',
  'Checking for duplicates…',
  'Almost done…',
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RosterImportScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile } = useAuth();
  const { team } = useTeam();
  const { primaryColor, rgba, clubName, logoUrl } = useClub();

  const [phase, setPhase]               = useState<Phase>('idle');
  const [players, setPlayers]           = useState<ParsedPlayer[]>([]);
  const [warnings, setWarnings]         = useState<string[]>([]);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [msgIdx, setMsgIdx]             = useState(0);
  const [doneStats, setDoneStats]       = useState<DoneStats | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase === 'processing') {
      timerRef.current = setInterval(() => setMsgIdx((i) => (i + 1) % PROCESSING_MESSAGES.length), 1800);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── File pick ─────────────────────────────────────────────────────────────

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/plain', 'application/pdf', 'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];

    if ((file.size ?? 0) > 10 * 1024 * 1024) { Alert.alert('File too large', 'Maximum 10 MB.'); return; }
    const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    await parseRoster(base64, file.mimeType ?? 'text/plain');
  }

  // ── Parse via AI ──────────────────────────────────────────────────────────

  async function parseRoster(file_base64: string, file_type: string) {
    setPhase('processing');

    const [parseRes, existingRes] = await Promise.all([
      supabase.functions.invoke('import-roster', { body: { file_base64, file_type } }),
      team ? supabase.from('players').select('full_name').eq('team_id', team.id) : Promise.resolve({ data: [] }),
    ]);

    if (parseRes.error || !parseRes.data) {
      setPhase('idle');
      const detail = parseRes.data?.error ?? parseRes.error?.message ?? 'Could not read file. Try a different format.';
      Alert.alert('Failed to parse', detail);
      return;
    }

    const existingNames = new Set(
      ((existingRes as any).data ?? []).map((r: { full_name: string }) => r.full_name.toLowerCase().trim())
    );

    const parsed: ParsedPlayer[] = (parseRes.data.players ?? []).map((p: any, i: number) => {
      const isDuplicate = existingNames.has((p.full_name ?? '').toLowerCase().trim());
      return {
        _id: `p-${i}`,
        full_name: p.full_name ?? 'Unknown',
        jersey_number: typeof p.jersey_number === 'number' ? p.jersey_number : null,
        position: p.position ?? null,
        parent_email: p.parent_email ?? null,
        uncertain: !!p.uncertain,
        uncertainty_reason: p.uncertainty_reason ?? null,
        duplicate: isDuplicate,
        selected: !p.uncertain && !isDuplicate,
      };
    });

    setPlayers(parsed);
    setWarnings(parseRes.data.warnings ?? []);
    setPhase('review');
  }

  // ── Import + send invites ─────────────────────────────────────────────────

  async function handleImport() {
    if (!team || !profile) return;
    const toImport = players.filter((p) => p.selected);
    if (toImport.length === 0) return;
    setPhase('importing');

    const stats: DoneStats = { added: 0, invitesSent: 0, noEmail: 0 };

    for (const p of toImport) {
      const { data: playerData } = await supabase
        .from('players')
        .insert({
          team_id: team.id,
          full_name: p.full_name,
          jersey_number: p.jersey_number,
          position: p.position,
        })
        .select('id')
        .single();

      if (!playerData) continue;
      stats.added++;

      if (p.parent_email?.trim()) {
        const token = uuid();
        await supabase.from('invites').insert({
          team_id: team.id,
          player_id: playerData.id,
          email: p.parent_email.trim(),
          token,
          role: 'parent',
          created_by: profile.id,
        });
        await sendInviteEmail(p.parent_email.trim(), token, p.full_name);
        stats.invitesSent++;
      } else {
        stats.noEmail++;
      }
    }

    setDoneStats(stats);
    setPhase('done');
  }

  async function sendInviteEmail(email: string, token: string, playerName: string) {
    if (!profile?.full_name || !team) return;
    const deepLink = `https://dugoutfc.app/join?token=${token}`;
    await supabase.functions.invoke('send-team-email', {
      body: {
        to: [{ email, name: '' }],
        cc: [],
        subject: `Your child has been added to ${team.name} on Dugout FC`,
        body: `Hi,\n\n${playerName} has been added to ${team.name} on Dugout FC — the app the team uses for schedules, lineups, and team chat.\n\nAccept your invite and download the app:\n${deepLink}\n\nOr enter your invite code: ${token}\n\n— ${profile.full_name}`,
        reply_to: null,
        from_name: profile.full_name,
        team_name: team.name,
        attachments: [],
        club_logo_url: logoUrl,
        club_name: clubName,
        primary_color: primaryColor,
      },
    });
  }

  // ── Review helpers ────────────────────────────────────────────────────────

  function togglePlayer(id: string) {
    setPlayers((prev) => prev.map((p) => p._id === id ? { ...p, selected: !p.selected } : p));
  }

  function selectAll() {
    setPlayers((prev) => prev.map((p) => ({ ...p, selected: true })));
  }

  function deselectAll() {
    setPlayers((prev) => prev.map((p) => ({ ...p, selected: false })));
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selected      = players.filter((p) => p.selected);
  const selectedCount = selected.length;
  const inviteCount   = selected.filter((p) => p.parent_email).length;
  const dupCount      = players.filter((p) => p.duplicate).length;
  const allSelected   = selectedCount === players.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="chevron-back" size={24} color={DUGOUT_COLORS.ui.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>AI Roster Import</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* ── Idle ── */}
        {phase === 'idle' && (
          <View style={st.centerWrap}>
            <View style={[st.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
              <Ionicons name="person-add-outline" size={32} color={primaryColor} />
            </View>
            <Text style={st.title}>Upload your roster</Text>
            <Text style={st.sub}>
              Upload any CSV or spreadsheet. AI maps the columns, adds players to {team?.name ?? 'your team'}, and sends invite emails to parents automatically.
            </Text>
            <TouchableOpacity style={[st.primaryBtn, { backgroundColor: primaryColor }]} onPress={pickFile} activeOpacity={0.85}>
              <Ionicons name="document-attach-outline" size={20} color="#000" />
              <Text style={st.primaryBtnText}>Choose File</Text>
            </TouchableOpacity>
            <Text style={st.hint}>CSV, Excel, Google Sheets export · Max 10 MB</Text>
          </View>
        )}

        {/* ── Processing ── */}
        {phase === 'processing' && (
          <View style={st.centerWrap}>
            <View style={[st.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
              <ActivityIndicator color={primaryColor} size="large" />
            </View>
            <Text style={st.title}>Analysing your roster…</Text>
            <Text style={st.sub}>{PROCESSING_MESSAGES[msgIdx]}</Text>
          </View>
        )}

        {/* ── Review ── */}
        {phase === 'review' && (
          <>
            {/* Review header */}
            <View style={st.reviewHeader}>
              <View>
                <Text style={st.title}>{players.length} players found</Text>
                <Text style={st.reviewSub}>
                  {selectedCount} selected · {inviteCount} invite{inviteCount !== 1 ? 's' : ''} will be sent
                </Text>
              </View>
              <TouchableOpacity onPress={allSelected ? deselectAll : selectAll} activeOpacity={0.7}>
                <Text style={[st.toggleAllBtn, { color: primaryColor }]}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Warnings */}
            {warnings.length > 0 && (
              <TouchableOpacity
                style={st.warningBanner}
                onPress={() => setWarningsOpen((o) => !o)}
                activeOpacity={0.8}
              >
                <View style={st.warningRow}>
                  <Ionicons name="warning-outline" size={14} color="#F59E0B" />
                  <Text style={[st.warningText, { flex: 1 }]}>
                    {warningsOpen
                      ? 'AI notes — tap to collapse'
                      : `${warnings.length} AI note${warnings.length !== 1 ? 's' : ''} — tap to review`}
                  </Text>
                  <Ionicons name={warningsOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F59E0B" />
                </View>
                {warningsOpen && (
                  <View style={st.warningList}>
                    {warnings.map((w, i) => (
                      <View key={i} style={st.warningItem}>
                        <Text style={st.warningDot}>·</Text>
                        <Text style={st.warningItemText}>{w}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Duplicate notice */}
            {dupCount > 0 && (
              <View style={st.infoBanner}>
                <Ionicons name="copy-outline" size={14} color="#60A5FA" />
                <Text style={st.infoText}>
                  {dupCount} player{dupCount !== 1 ? 's' : ''} already on this roster — deselected by default.
                </Text>
              </View>
            )}

            {/* Player rows */}
            {players.map((p) => (
              <TouchableOpacity
                key={p._id}
                style={[
                  st.playerRow,
                  p.selected && { backgroundColor: rgba(0.05), borderColor: rgba(0.3) },
                  p.duplicate && !p.selected && st.playerRowDim,
                ]}
                onPress={() => togglePlayer(p._id)}
                activeOpacity={0.7}
              >
                {/* Checkbox */}
                <View style={[
                  st.checkBox,
                  p.selected && { backgroundColor: primaryColor, borderColor: primaryColor },
                ]}>
                  {p.selected && <Ionicons name="checkmark" size={13} color="#000" />}
                </View>

                {/* Info */}
                <View style={st.playerInfo}>
                  <View style={st.nameRow}>
                    <Text style={[st.playerName, !p.selected && st.dimText]}>{p.full_name}</Text>
                    {p.duplicate && (
                      <View style={st.dupBadge}>
                        <Text style={st.dupBadgeText}>Already on roster</Text>
                      </View>
                    )}
                    {p.uncertain && !p.duplicate && (
                      <View style={st.uncertainBadge}>
                        <Text style={st.uncertainBadgeText}>?</Text>
                      </View>
                    )}
                  </View>

                  {/* Jersey / position */}
                  {(p.jersey_number != null || p.position) && (
                    <Text style={[st.playerMeta, !p.selected && st.dimText]}>
                      {[p.jersey_number != null ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join('  ·  ')}
                    </Text>
                  )}

                  {/* Parent email — prominent */}
                  {p.parent_email ? (
                    <View style={st.emailRow}>
                      <Ionicons name="mail-outline" size={11} color="#60A5FA" />
                      <Text style={[st.emailText, !p.selected && st.dimText]}>
                        Parent: {p.parent_email}
                      </Text>
                    </View>
                  ) : (
                    <Text style={st.noEmailText}>No parent email — won't receive invite</Text>
                  )}

                  {/* Uncertainty reason */}
                  {p.uncertain && p.uncertainty_reason && (
                    <Text style={st.uncertainReason}>{p.uncertainty_reason}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* Import button */}
            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: primaryColor, marginTop: 24 }, selectedCount === 0 && { opacity: 0.4 }]}
              onPress={handleImport}
              disabled={selectedCount === 0}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#000" />
              <Text style={st.primaryBtnText}>
                {inviteCount > 0
                  ? `Import ${selectedCount} & Send ${inviteCount} invite${inviteCount !== 1 ? 's' : ''}`
                  : `Import ${selectedCount} player${selectedCount !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.ghostBtn} onPress={() => setPhase('idle')} activeOpacity={0.7}>
              <Text style={st.ghostBtnText}>Upload a different file</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Importing ── */}
        {phase === 'importing' && (
          <View style={st.centerWrap}>
            <View style={[st.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
              <ActivityIndicator color={primaryColor} size="large" />
            </View>
            <Text style={st.title}>Importing & sending invites…</Text>
            <Text style={st.sub}>Adding players and emailing parents — this takes a moment.</Text>
          </View>
        )}

        {/* ── Done ── */}
        {phase === 'done' && doneStats && (
          <View style={st.centerWrap}>
            <View style={[st.heroIcon, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }]}>
              <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
            </View>
            <Text style={st.title}>Done!</Text>

            <View style={st.statsList}>
              <View style={st.statRow}>
                <View style={[st.statDot, { backgroundColor: '#22C55E' }]} />
                <Text style={st.statText}>
                  <Text style={st.statBold}>{doneStats.added}</Text> player{doneStats.added !== 1 ? 's' : ''} added to {team?.name}
                </Text>
              </View>

              {doneStats.invitesSent > 0 && (
                <View style={st.statRow}>
                  <View style={[st.statDot, { backgroundColor: '#60A5FA' }]} />
                  <Text style={st.statText}>
                    <Text style={st.statBold}>{doneStats.invitesSent}</Text> parent invite email{doneStats.invitesSent !== 1 ? 's' : ''} sent
                  </Text>
                </View>
              )}

              {doneStats.noEmail > 0 && (
                <View style={st.statRow}>
                  <View style={[st.statDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={st.statText}>
                    <Text style={st.statBold}>{doneStats.noEmail}</Text> player{doneStats.noEmail !== 1 ? 's' : ''} have no parent email — invite from the roster when ready
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: primaryColor, marginTop: 28 }]}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text style={st.primaryBtnText}>Back to Admin</Text>
            </TouchableOpacity>

            {doneStats.noEmail > 0 && (
              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: DUGOUT_COLORS.ui.surface, borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border, marginTop: 10 }]}
                onPress={() => router.push(`/(app)/${clubSlug ?? ''}/(tabs)/roster` as never)}
                activeOpacity={0.85}
              >
                <Text style={[st.primaryBtnText, { color: DUGOUT_COLORS.ui.text }]}>Go to Roster</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: DUGOUT_COLORS.ui.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: DUGOUT_COLORS.ui.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  content: { padding: 20, paddingBottom: 60 },

  centerWrap: { alignItems: 'center', paddingTop: 40 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 24, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: DUGOUT_COLORS.ui.text, marginBottom: 8, textAlign: 'center', letterSpacing: -0.3 },
  sub: { fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 28, paddingHorizontal: 16 },
  hint: { fontSize: 12, color: DUGOUT_COLORS.ui.muted, textAlign: 'center', marginTop: 4 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14, width: '100%',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },
  ghostBtn: { alignItems: 'center', padding: 14, marginTop: 4 },
  ghostBtnText: { fontSize: 14, color: DUGOUT_COLORS.ui.muted, fontWeight: '500' },

  reviewHeader: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16,
  },
  reviewSub: { fontSize: 13, color: DUGOUT_COLORS.ui.textSecondary, marginTop: 3 },
  toggleAllBtn: { fontSize: 14, fontWeight: '600', paddingBottom: 2 },

  warningBanner: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    padding: 12, marginBottom: 12,
  },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningText: { fontSize: 13, color: '#F59E0B', fontWeight: '500' },
  warningList: { marginTop: 10, gap: 6 },
  warningItem: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  warningDot: { fontSize: 13, color: '#F59E0B', lineHeight: 18, flexShrink: 0 },
  warningItemText: { flex: 1, fontSize: 12, color: '#F59E0B', lineHeight: 18 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(96,165,250,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(96,165,250,0.2)',
    padding: 12, marginBottom: 12,
  },
  infoText: { flex: 1, fontSize: 13, color: '#60A5FA' },

  playerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, marginBottom: 6,
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1, borderColor: DUGOUT_COLORS.ui.border,
  },
  playerRowDim: { opacity: 0.5 },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 2,
    borderWidth: 1.5, borderColor: DUGOUT_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  playerInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  playerName: { fontSize: 15, fontWeight: '700', color: DUGOUT_COLORS.ui.text },
  dimText: { color: DUGOUT_COLORS.ui.muted },
  playerMeta: { fontSize: 12, color: DUGOUT_COLORS.ui.textSecondary },

  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emailText: { fontSize: 12, color: '#60A5FA', fontWeight: '500' },
  noEmailText: { fontSize: 11, color: DUGOUT_COLORS.ui.muted, fontStyle: 'italic' },

  dupBadge: {
    backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  dupBadgeText: { fontSize: 10, fontWeight: '700', color: '#60A5FA' },
  uncertainBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  uncertainBadgeText: { fontSize: 10, fontWeight: '800', color: '#F59E0B' },
  uncertainReason: { fontSize: 11, color: '#F59E0B', fontStyle: 'italic' },

  statsList: { width: '100%', gap: 12, marginTop: 8 },
  statRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  statText: { flex: 1, fontSize: 14, color: DUGOUT_COLORS.ui.textSecondary, lineHeight: 20 },
  statBold: { fontWeight: '800', color: DUGOUT_COLORS.ui.text },
});
