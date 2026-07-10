import { useState, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader from '../../../../components/ui/ClubHeader';
import { PULSE_COLORS } from '../../../../constants/colors';

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedCoach = {
  full_name: string;
  email: string | null;
  role: string;
  uncertain: boolean;
  uncertainty_reason: string | null;
};

type ParsedPlayer = {
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  parent_name: string | null;
  parent_email: string | null;
  uncertain: boolean;
  uncertainty_reason: string | null;
};

// isDuplicate is set client-side after checking existing teams
type ReviewTeam = {
  name: string;
  age_group: string | null;
  season: string | null;
  coaches: ParsedCoach[];
  players: ParsedPlayer[];
  isDuplicate: boolean;
};

type UncertainRow = { raw: string; issue: string };

type ParseResult = {
  teams: ReviewTeam[];
  uncertain_rows: UncertainRow[];
  warnings: string[];
};

type Phase = 'idle' | 'parsing' | 'review' | 'importing' | 'done';

type ImportProgress = { current: number; total: number; label: string };

type DoneStats = { teams: number; coaches: number; players: number; invitesSent: number };

const PARSE_MESSAGES = [
  'Reading spreadsheet…',
  'Identifying teams…',
  'Finding coaches and staff…',
  'Mapping player rosters…',
  'Detecting age groups…',
  'Checking parent contacts…',
  'Flagging uncertain rows…',
  'Almost done…',
];

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClubImportScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club } = useAuth();
  const { refetch: refetchTeam } = useTeam();
  const { primaryColor, rgba, clubName, logoUrl } = useClub();

  const [phase, setPhase]             = useState<Phase>('idle');
  const [parseMsg, setParseMsg]       = useState(PARSE_MESSAGES[0]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [progress, setProgress]       = useState<ImportProgress>({ current: 0, total: 0, label: '' });
  const [doneStats, setDoneStats]     = useState<DoneStats | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set());
  const msgTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const importedRef = useRef<Set<string>>(new Set());

  const toggleTeam = useCallback((idx: number) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const slug = clubSlug ?? club?.slug ?? '';

  // ── File pick & parse ──────────────────────────────────────────────────────

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'application/pdf', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    setPhase('parsing');
    let msgIdx = 0;
    msgTimer.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % PARSE_MESSAGES.length;
      setParseMsg(PARSE_MESSAGES[msgIdx]);
    }, 1800);

    try {
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      // Fetch existing team names in parallel so AI and duplicate check happen together
      const [invokeRes, existingRes] = await Promise.all([
        supabase.functions.invoke('import-club', {
          body: {
            file_base64: base64,
            file_type: asset.mimeType ?? 'text/csv',
            existing_teams: await getExistingTeamNames(),
          },
        }),
        profile?.club_id
          ? supabase.from('teams').select('name').eq('club_id', profile.club_id)
          : Promise.resolve({ data: [] as { name: string }[] }),
      ]);

      if (msgTimer.current) clearInterval(msgTimer.current);
      if (invokeRes.error) {
        const detail = invokeRes.data?.error ?? invokeRes.error.message;
        throw new Error(detail);
      }
      if (!invokeRes.data?.teams?.length) {
        Alert.alert('Nothing found', 'No teams or players were detected in this file. Check the format and try again.');
        setPhase('idle');
        return;
      }

      const existingNames = new Set(
        ((existingRes as any).data ?? []).map((t: { name: string }) => t.name.toLowerCase().trim())
      );

      const teams: ReviewTeam[] = (invokeRes.data.teams as ReviewTeam[]).map((t) => ({
        ...t,
        isDuplicate: existingNames.has(t.name.toLowerCase().trim()),
      }));

      setParseResult({ ...invokeRes.data, teams });
      importedRef.current = new Set();
      setPhase('review');
    } catch (e) {
      if (msgTimer.current) clearInterval(msgTimer.current);
      Alert.alert('Parse failed', e instanceof Error ? e.message : 'Could not read the file.');
      setPhase('idle');
    }
  }

  async function getExistingTeamNames(): Promise<string[]> {
    if (!profile?.club_id) return [];
    const { data } = await supabase.from('teams').select('name').eq('club_id', profile.club_id);
    return (data ?? []).map((t) => t.name);
  }

  // ── Review helpers ─────────────────────────────────────────────────────────

  function removeTeam(idx: number) {
    setParseResult((prev) => prev ? { ...prev, teams: prev.teams.filter((_, i) => i !== idx) } : prev);
  }

  function removeCoach(teamIdx: number, coachIdx: number) {
    setParseResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t, ti) =>
          ti === teamIdx ? { ...t, coaches: t.coaches.filter((_, ci) => ci !== coachIdx) } : t
        ),
      };
    });
  }

  function removePlayer(teamIdx: number, playerIdx: number) {
    setParseResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t, ti) =>
          ti === teamIdx ? { ...t, players: t.players.filter((_, pi) => pi !== playerIdx) } : t
        ),
      };
    });
  }

  function removeUncertain(idx: number) {
    setParseResult((prev) => prev ? { ...prev, uncertain_rows: prev.uncertain_rows.filter((_, i) => i !== idx) } : prev);
  }

  // ── Send a single invite email ─────────────────────────────────────────────

  async function sendInviteEmail(opts: {
    email: string; role: 'coach' | 'parent'; token: string; teamName: string;
  }) {
    if (!profile?.full_name) return;
    const deepLink = `https://pulse-fc.app/join?token=${opts.token}`;
    const isCoach = opts.role === 'coach';
    const subject = isCoach
      ? `You've been invited to join ${opts.teamName} as a coach on Pulse FC`
      : `Your child has been added to ${opts.teamName} on Pulse FC`;
    const body = isCoach
      ? `Hi,\n\nYou've been invited to join ${opts.teamName} as coaching staff on Pulse FC.\n\nAccept your invite and download the app:\n${deepLink}\n\nOr enter your invite code: ${opts.token}\n\n— ${profile.full_name}`
      : `Hi,\n\nYour child has been added to ${opts.teamName} on Pulse FC — the app the team uses for schedules, lineups, and team chat.\n\nAccept your invite and download the app:\n${deepLink}\n\nOr enter your invite code: ${opts.token}\n\n— ${profile.full_name}`;
    await supabase.functions.invoke('send-team-email', {
      body: { to: [{ email: opts.email, name: '' }], cc: [], subject, body, reply_to: null, from_name: profile.full_name, team_name: opts.teamName, attachments: [], club_logo_url: logoUrl, club_name: clubName, primary_color: primaryColor },
    });
  }

  // ── Commit import + send invites ───────────────────────────────────────────

  async function handleImport() {
    if (!parseResult || !profile?.club_id) return;

    const teamsToImport = parseResult.teams.filter((t) => !t.isDuplicate);
    if (teamsToImport.length === 0) return;

    setPhase('importing');
    const stats: DoneStats = { teams: 0, coaches: 0, players: 0, invitesSent: 0 };
    const total = teamsToImport.length;

    for (let i = 0; i < teamsToImport.length; i++) {
      const pt = teamsToImport[i];
      setProgress({ current: i + 1, total, label: `Creating ${pt.name}…` });

      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .insert({ club_id: profile.club_id, name: pt.name, age_group: pt.age_group ?? null, season: pt.season ?? null })
        .select('id')
        .single();

      if (teamErr || !teamData) {
        // Partial recovery: remove successfully imported teams from the review list
        const done = importedRef.current;
        setParseResult((prev) => prev ? {
          ...prev,
          teams: prev.teams.filter((t) => !done.has(t.name)),
        } : prev);
        Alert.alert(
          'Import interrupted',
          `${stats.teams} of ${total} teams were created before the error on "${pt.name}".\n\nThe completed teams have been removed from the list — tap Import to continue with the remaining ones.`,
        );
        setPhase('review');
        return;
      }

      const teamId = teamData.id;
      importedRef.current.add(pt.name);
      stats.teams++;

      // Players + parent invites
      setProgress({ current: i + 1, total, label: `Adding players to ${pt.name}…` });
      for (const p of pt.players) {
        if (!p.full_name.trim()) continue;
        const { data: playerData } = await supabase
          .from('players')
          .insert({ team_id: teamId, full_name: p.full_name.trim(), jersey_number: p.jersey_number ?? null, position: p.position ?? null })
          .select('id')
          .single();
        stats.players++;

        if (playerData && p.parent_email?.trim()) {
          const token = uuid();
          await supabase.from('invites').insert({ team_id: teamId, player_id: playerData.id, email: p.parent_email.trim(), token, role: 'parent', created_by: profile.id });
          await sendInviteEmail({ email: p.parent_email.trim(), role: 'parent', token, teamName: pt.name });
          stats.invitesSent++;
        }
      }

      // Coach invites
      setProgress({ current: i + 1, total, label: `Inviting coaches to ${pt.name}…` });
      for (const c of pt.coaches) {
        if (!c.email?.trim()) continue;
        const token = uuid();
        await supabase.from('invites').insert({ team_id: teamId, email: c.email.trim(), token, role: 'coach', created_by: profile.id });
        await sendInviteEmail({ email: c.email.trim(), role: 'coach', token, teamName: pt.name });
        stats.coaches++;
        stats.invitesSent++;
      }
    }

    setDoneStats(stats);
    await refetchTeam();
    setPhase('done');
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const uncertainCount  = (parseResult?.uncertain_rows ?? []).length;
  const newTeams        = (parseResult?.teams ?? []).filter((t) => !t.isDuplicate);
  const duplicateTeams  = (parseResult?.teams ?? []).filter((t) => t.isDuplicate);
  const inviteCount     = newTeams.reduce((s, t) =>
    s + t.coaches.filter((c) => c.email).length + t.players.filter((p) => p.parent_email).length, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <ClubHeader title="Import Club" onBack={() => router.back()} />

      {/* ── Idle ── */}
      {phase === 'idle' && (
        <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <Ionicons name="sparkles-outline" size={36} color={primaryColor} />
          </View>
          <Text style={styles.heroTitle}>Import your whole club</Text>
          <Text style={styles.heroSub}>
            Upload one spreadsheet — AI reads it, creates all your teams, adds coaches and players to the right squads, and automatically sends invite emails to everyone.
          </Text>

          <View style={styles.formatBox}>
            <Text style={styles.formatTitle}>WHAT AI DETECTS</Text>
            {[
              ['people-outline',   'Teams grouped by name, section, or column'],
              ['shield-outline',   'Coaches and their roles per team'],
              ['football-outline', 'Players with jersey number and position'],
              ['mail-outline',     'Parent email addresses per player'],
              ['calendar-outline', 'Age group and season'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.formatRow}>
                <Ionicons name={icon as any} size={15} color={primaryColor} />
                <Text style={styles.formatLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.formatHint}>
            Supports CSV, Excel (.xlsx), and PDF · Max 10 MB
          </Text>

          <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: primaryColor }]} onPress={handlePickFile} activeOpacity={0.85}>
            <Ionicons name="cloud-upload-outline" size={20} color="#000" />
            <Text style={styles.uploadBtnText}>Choose File</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Parsing ── */}
      {phase === 'parsing' && (
        <View style={styles.centerContent}>
          <View style={[styles.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <ActivityIndicator color={primaryColor} size="large" />
          </View>
          <Text style={styles.heroTitle}>Reading your club…</Text>
          <Text style={[styles.heroSub, { minHeight: 22 }]}>{parseMsg}</Text>
        </View>
      )}

      {/* ── Review ── */}
      {phase === 'review' && parseResult && (
        <>
          <ScrollView contentContainerStyle={styles.reviewContent} showsVerticalScrollIndicator={false}>

            {/* Summary chips */}
            <View style={styles.summaryBar}>
              <SummaryChip icon="football-outline" value={newTeams.length} label="New teams" color={primaryColor} />
              <SummaryChip icon="shield-outline"   value={newTeams.reduce((s, t) => s + t.coaches.length, 0)} label="Coaches" color="#3B82F6" />
              <SummaryChip icon="people-outline"   value={newTeams.reduce((s, t) => s + t.players.length, 0)} label="Players" color="#22C55E" />
            </View>

            {/* Collapsible warnings */}
            {(parseResult.warnings?.length ?? 0) > 0 && (
              <TouchableOpacity style={styles.warningBanner} onPress={() => setWarningsOpen((o) => !o)} activeOpacity={0.8}>
                <View style={styles.warningBannerRow}>
                  <Ionicons name="information-circle-outline" size={15} color="#F59E0B" />
                  <Text style={styles.warningBannerText}>
                    {warningsOpen ? 'AI notes — tap to collapse' : `${parseResult.warnings.length} AI note${parseResult.warnings.length !== 1 ? 's' : ''} — tap to review`}
                  </Text>
                  <Ionicons name={warningsOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#F59E0B" />
                </View>
                {warningsOpen && (
                  <View style={styles.warningList}>
                    {parseResult.warnings.map((w, i) => (
                      <View key={i} style={styles.warningItem}>
                        <Text style={styles.warningDot}>·</Text>
                        <Text style={styles.warningItemText}>{w}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Duplicate notice */}
            {duplicateTeams.length > 0 && (
              <View style={styles.infoBanner}>
                <Ionicons name="copy-outline" size={14} color="#60A5FA" />
                <Text style={styles.infoText}>
                  <Text style={{ fontWeight: '700' }}>{duplicateTeams.map((t) => t.name).join(', ')}</Text>
                  {' '}already exist{duplicateTeams.length === 1 ? 's' : ''} and will be skipped.
                </Text>
              </View>
            )}

            {/* New teams */}
            {newTeams.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>NEW TEAMS</Text>
                {newTeams.map((team, ti) => {
                  const realIdx = parseResult.teams.indexOf(team);
                  const expanded = expandedTeams.has(realIdx);
                  return (
                    <TeamSection
                      key={realIdx}
                      team={team}
                      primaryColor={primaryColor}
                      expanded={expanded}
                      onToggle={() => toggleTeam(realIdx)}
                      onRemoveTeam={() => removeTeam(realIdx)}
                      onRemoveCoach={(ci) => removeCoach(realIdx, ci)}
                      onRemovePlayer={(pi) => removePlayer(realIdx, pi)}
                    />
                  );
                })}
              </>
            )}

            {/* Uncertain rows */}
            {uncertainCount > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 4 }]}>COULDN'T ASSIGN ({uncertainCount})</Text>
                {parseResult.uncertain_rows.map((row, i) => (
                  <View key={i} style={styles.uncertainCard}>
                    <View style={styles.uncertainBody}>
                      <Text style={styles.uncertainRaw} numberOfLines={1}>{row.raw}</Text>
                      <Text style={styles.uncertainIssue}>{row.issue}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeUncertain(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color={PULSE_COLORS.ui.muted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Sticky footer */}
          <View style={styles.reviewFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPhase('idle')} activeOpacity={0.75}>
              <Text style={styles.cancelBtnText}>Start over</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importBtn, { backgroundColor: primaryColor }, newTeams.length === 0 && { opacity: 0.4 }]}
              onPress={handleImport}
              disabled={newTeams.length === 0}
              activeOpacity={0.85}
            >
              <Text style={styles.importBtnText}>
                {inviteCount > 0
                  ? `Import & Send ${inviteCount} invite${inviteCount !== 1 ? 's' : ''}`
                  : `Import ${newTeams.length} team${newTeams.length !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Importing ── */}
      {phase === 'importing' && (
        <View style={styles.centerContent}>
          <View style={[styles.heroIcon, { backgroundColor: rgba(0.1), borderColor: rgba(0.2) }]}>
            <Ionicons name="cloud-upload-outline" size={36} color={primaryColor} />
          </View>
          <Text style={styles.heroTitle}>Importing…</Text>
          <Text style={styles.heroSub}>{progress.label}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { backgroundColor: primaryColor, width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>{progress.current} of {progress.total} teams</Text>
        </View>
      )}

      {/* ── Done ── */}
      {phase === 'done' && doneStats && (
        <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.heroIcon, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.25)' }]}>
            <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
          </View>
          <Text style={styles.heroTitle}>Club imported!</Text>
          <Text style={styles.heroSub}>Everything is set up and ready to go.</Text>

          <View style={styles.doneStats}>
            <DoneStat value={doneStats.teams}       label="Teams created"  color={primaryColor} />
            <DoneStat value={doneStats.players}     label="Players added"  color="#22C55E" />
            <DoneStat value={doneStats.invitesSent} label="Invites sent"   color="#60A5FA" />
          </View>

          {doneStats.invitesSent > 0 && (
            <View style={styles.invitesSentRow}>
              <Ionicons name="mail" size={16} color="#60A5FA" />
              <Text style={styles.invitesSentText}>{doneStats.invitesSent} invite email{doneStats.invitesSent !== 1 ? 's' : ''} sent</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.cancelBtn, { marginTop: 20 }]} onPress={() => router.back()} activeOpacity={0.75}>
            <Text style={styles.cancelBtnText}>Back to Admin</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryChip({ icon, value, label, color }: { icon: any; value: number; label: string; color: string }) {
  return (
    <View style={[chipStyles.root, { backgroundColor: `${color}12`, borderColor: `${color}25` }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}
const chipStyles = StyleSheet.create({
  root:  { flex: 1, alignItems: 'center', gap: 2, padding: 12, borderRadius: 12, borderWidth: 1 },
  value: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
});

function DoneStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={doneStyles.root}>
      <Text style={[doneStyles.value, { color }]}>{value}</Text>
      <Text style={doneStyles.label}>{label}</Text>
    </View>
  );
}
const doneStyles = StyleSheet.create({
  root:  { flex: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: 28, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary, textAlign: 'center' },
});

function TeamSection({ team, primaryColor, expanded, onToggle, onRemoveTeam, onRemoveCoach, onRemovePlayer }: {
  team: { name: string; age_group: string | null; season: string | null; coaches: ParsedCoach[]; players: ParsedPlayer[] };
  primaryColor: string;
  expanded: boolean;
  onToggle: () => void;
  onRemoveTeam: () => void;
  onRemoveCoach: (i: number) => void;
  onRemovePlayer: (i: number) => void;
}) {
  const meta = [team.age_group, team.season].filter(Boolean).join(' · ');
  const counts = [
    team.coaches.length > 0 ? `${team.coaches.length} coach${team.coaches.length !== 1 ? 'es' : ''}` : null,
    team.players.length > 0 ? `${team.players.length} player${team.players.length !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.teamSection}>
      {/* Header — always visible, tappable to expand */}
      <TouchableOpacity style={styles.teamHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={[styles.teamDot, { backgroundColor: primaryColor }]} />
        <View style={styles.teamHeaderBody}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamMeta}>{[meta, counts].filter(Boolean).join('  ·  ')}</Text>
        </View>
        <TouchableOpacity onPress={onRemoveTeam} hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }} style={styles.removeTeamBtn}>
          <Ionicons name="trash-outline" size={15} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      {expanded && (
        <>
          {team.coaches.length > 0 && (
            <View style={styles.personGroup}>
              <Text style={styles.groupLabel}>COACHES</Text>
              {team.coaches.map((c, ci) => (
                <ReviewPersonRow key={ci} name={c.full_name} detail={c.role} email={c.email}
                  iconName="shield-half-outline" iconColor="#3B82F6"
                  uncertain={c.uncertain} reason={c.uncertainty_reason}
                  onRemove={() => onRemoveCoach(ci)} />
              ))}
            </View>
          )}
          {team.players.length > 0 && (
            <View style={styles.personGroup}>
              <Text style={styles.groupLabel}>PLAYERS</Text>
              {team.players.map((p, pi) => (
                <ReviewPersonRow key={pi}
                  name={p.full_name}
                  detail={[p.jersey_number != null ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ')}
                  email={p.parent_email}
                  iconName="person-outline" iconColor="#22C55E"
                  uncertain={p.uncertain} reason={p.uncertainty_reason}
                  onRemove={() => onRemovePlayer(pi)} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function ReviewPersonRow({ name, detail, email, iconName, iconColor, uncertain, reason, onRemove }: {
  name: string; detail: string; email: string | null;
  iconName: any; iconColor: string; uncertain: boolean; reason: string | null;
  onRemove: () => void;
}) {
  return (
    <View style={[rpStyles.row, uncertain && rpStyles.rowUncertain]}>
      <View style={[rpStyles.icon, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={iconName} size={12} color={iconColor} />
      </View>
      <View style={rpStyles.body}>
        <View style={rpStyles.nameRow}>
          <Text style={rpStyles.name}>{name}</Text>
          {detail ? <Text style={rpStyles.detail}>{detail}</Text> : null}
          {uncertain && <View style={rpStyles.badge}><Text style={rpStyles.badgeText}>?</Text></View>}
        </View>
        {email && (
          <View style={rpStyles.emailRow}>
            <Ionicons name="mail-outline" size={10} color="#60A5FA" />
            <Text style={rpStyles.email}>{email}</Text>
          </View>
        )}
        {uncertain && reason ? <Text style={rpStyles.reason}>{reason}</Text> : null}
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={15} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>
    </View>
  );
}

const rpStyles = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  rowUncertain:{ backgroundColor: 'rgba(245,158,11,0.04)' },
  icon:        { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body:        { flex: 1, gap: 1 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name:        { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  badge:       { backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText:   { fontSize: 10, fontWeight: '800', color: '#F59E0B' },
  detail:      { fontSize: 12, color: PULSE_COLORS.ui.muted },
  emailRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  email:       { fontSize: 11, color: '#60A5FA' },
  reason:      { fontSize: 11, color: '#F59E0B', marginTop: 1 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text },

  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, paddingBottom: 48 },
  heroIcon:      { width: 80, height: 80, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroTitle:     { fontSize: 24, fontWeight: '800', color: PULSE_COLORS.ui.text, textAlign: 'center', marginBottom: 10, letterSpacing: -0.4 },
  heroSub:       { fontSize: 15, color: PULSE_COLORS.ui.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  formatBox:   { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 16, padding: 16, width: '100%', gap: 10, marginBottom: 16 },
  formatTitle: { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, marginBottom: 4 },
  formatRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatLabel: { fontSize: 13, color: PULSE_COLORS.ui.textSecondary },
  formatHint:  { fontSize: 12, color: PULSE_COLORS.ui.muted, textAlign: 'center', marginBottom: 24, lineHeight: 18 },

  uploadBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, width: '100%', justifyContent: 'center' },
  uploadBtnText: { fontSize: 16, fontWeight: '800', color: '#000' },

  reviewContent: { padding: 16, paddingBottom: 40 },
  summaryBar:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sectionLabel:  { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, marginBottom: 8 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(96,165,250,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(96,165,250,0.2)',
    padding: 10, marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: '#60A5FA', lineHeight: 17 },

  warningBanner: {
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.22)',
    padding: 10, marginBottom: 14,
  },
  warningBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  warningBannerText:{ flex: 1, fontSize: 12, color: '#F59E0B', fontWeight: '500' },
  warningList:  { marginTop: 8, gap: 5 },
  warningItem:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  warningDot:   { fontSize: 12, color: '#F59E0B', lineHeight: 17, flexShrink: 0 },
  warningItemText: { flex: 1, fontSize: 12, color: '#F59E0B', lineHeight: 17 },

  teamSection:    { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  teamHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  teamDot:        { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  teamHeaderBody: { flex: 1 },
  teamName:       { fontSize: 15, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.2 },
  teamMeta:       { fontSize: 11, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  removeTeamBtn:  { padding: 4 },

  dupBadge:     { backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 8 },
  dupBadgeText: { fontSize: 10, fontWeight: '700', color: '#60A5FA' },

  personGroup: { paddingHorizontal: 14, paddingBottom: 8, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  groupLabel:  { fontSize: 9, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.8, marginTop: 10, marginBottom: 2 },

  uncertainCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 10, padding: 10, marginBottom: 6 },
  uncertainBody:  { flex: 1 },
  uncertainRaw:   { fontSize: 12, color: PULSE_COLORS.ui.text, fontFamily: 'monospace', marginBottom: 3 },
  uncertainIssue: { fontSize: 11, color: '#F59E0B' },
  uncertainSub:   { fontSize: 12, color: PULSE_COLORS.ui.muted, marginBottom: 8, lineHeight: 17 },

  reviewFooter: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 36, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.background },
  cancelBtn:    { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  cancelBtnText:{ fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text },
  importBtn:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  importBtnText:{ fontSize: 15, fontWeight: '800', color: '#000' },

  progressTrack: { width: '100%', height: 6, backgroundColor: PULSE_COLORS.ui.border, borderRadius: 3, overflow: 'hidden', marginTop: 24, marginBottom: 10 },
  progressFill:  { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 13, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  doneStats:      { flexDirection: 'row', gap: 16, marginBottom: 16, width: '100%' },
  invitesSentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  invitesSentText:{ fontSize: 14, color: '#60A5FA', fontWeight: '600' },
});
