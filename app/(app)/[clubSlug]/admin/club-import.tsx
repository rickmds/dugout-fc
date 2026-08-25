import { useState, useRef, useCallback, useMemo } from 'react';
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
import { sendCoachInvites, sendParentInviteEmail } from '../../../../lib/inviteApi';
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

// Flat, not nested under a team — assignedTeamName is mutable (the review
// screen lets an admin move a player to a different team than the AI
// guessed), so grouping by team is derived at render time instead of
// being the storage shape.
type ParsedPlayer = {
  uid: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  parent_name: string | null;
  parent_email: string | null;
  secondary_parent_email: string | null;
  date_of_birth: string | null;
  parent_phone: string | null;
  uncertain: boolean;
  uncertainty_reason: string | null;
  assignedTeamName: string;
};

// matchedTeamId is resolved client-side (exact, case-insensitive name match
// against the club's real teams) — non-null means this row group merges
// onto an existing team rather than creating a new one.
type ReviewTeam = {
  name: string;
  age_group: string | null;
  season: string | null;
  coaches: ParsedCoach[];
  matchedTeamId: string | null;
};

type UncertainRow = { raw: string; issue: string };

type ParseResult = {
  teams: ReviewTeam[];
  players: ParsedPlayer[];
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

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `p${uidCounter}-${Date.now()}`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClubImportScreen() {
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const { profile, club } = useAuth();
  const { refetch: refetchTeam } = useTeam();
  const { primaryColor, rgba } = useClub();

  const [phase, setPhase]             = useState<Phase>('idle');
  const [parseMsg, setParseMsg]       = useState(PARSE_MESSAGES[0]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [existingNamesByTeam, setExistingNamesByTeam] = useState<Record<string, Set<string>>>({});
  const [progress, setProgress]       = useState<ImportProgress>({ current: 0, total: 0, label: '' });
  const [doneStats, setDoneStats]     = useState<DoneStats | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [pickerOpenForUid, setPickerOpenForUid] = useState<string | null>(null);
  const [teamPickerOpenFor, setTeamPickerOpenFor] = useState<string | null>(null);
  const [linkPickerOpenFor, setLinkPickerOpenFor] = useState<string | null>(null);
  const [existingTeams, setExistingTeams] = useState<{ id: string; name: string }[]>([]);
  const msgTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const importedTeamNames = useRef<Set<string>>(new Set());

  const toggleTeam = useCallback((name: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
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

      const existingTeamNames = profile?.club_id
        ? (await supabase.from('teams').select('id, name').eq('club_id', profile.club_id)).data ?? []
        : [];

      const invokeRes = await supabase.functions.invoke('import-club', {
        body: {
          file_base64: base64,
          file_type: asset.mimeType ?? 'text/csv',
          existing_teams: existingTeamNames.map((t) => t.name),
        },
      });

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

      const existingByName = new Map(existingTeamNames.map((t) => [normalizeName(t.name), t.id]));

      const rawTeams = invokeRes.data.teams as (ReviewTeam & { players: Omit<ParsedPlayer, 'uid' | 'assignedTeamName'>[] })[];

      const teams: ReviewTeam[] = rawTeams.map((t) => ({
        name: t.name,
        age_group: t.age_group,
        season: t.season,
        coaches: t.coaches,
        matchedTeamId: existingByName.get(normalizeName(t.name)) ?? null,
      }));

      const players: ParsedPlayer[] = rawTeams.flatMap((t) =>
        t.players.map((p) => ({
          ...p,
          uid: nextUid(),
          secondary_parent_email: p.secondary_parent_email ?? null,
          date_of_birth: p.date_of_birth ?? null,
          parent_phone: p.parent_phone ?? null,
          assignedTeamName: t.name,
        }))
      );

      // Existing roster names for any team we matched, so duplicate players
      // can be flagged before import rather than silently double-added.
      const matchedTeamIds = teams.map((t) => t.matchedTeamId).filter((id): id is string => !!id);
      const namesByTeam: Record<string, Set<string>> = {};
      if (matchedTeamIds.length) {
        const { data: existingPlayers } = await supabase
          .from('players')
          .select('team_id, full_name')
          .in('team_id', matchedTeamIds);
        for (const t of teams) {
          if (!t.matchedTeamId) continue;
          namesByTeam[t.name] = new Set(
            (existingPlayers ?? [])
              .filter((p) => p.team_id === t.matchedTeamId)
              .map((p) => normalizeName(p.full_name))
          );
        }
      }

      setExistingNamesByTeam(namesByTeam);
      setExistingTeams(existingTeamNames);
      setParseResult({ ...invokeRes.data, teams, players });
      importedTeamNames.current = new Set();
      setPhase('review');
    } catch (e) {
      if (msgTimer.current) clearInterval(msgTimer.current);
      Alert.alert('Parse failed', e instanceof Error ? e.message : 'Could not read the file.');
      setPhase('idle');
    }
  }

  // ── Review helpers ─────────────────────────────────────────────────────────

  function removeTeam(name: string) {
    setParseResult((prev) => prev ? {
      ...prev,
      teams: prev.teams.filter((t) => t.name !== name),
      players: prev.players.filter((p) => p.assignedTeamName !== name),
    } : prev);
  }

  function removeCoach(teamName: string, coachIdx: number) {
    setParseResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t) =>
          t.name === teamName ? { ...t, coaches: t.coaches.filter((_, ci) => ci !== coachIdx) } : t
        ),
      };
    });
  }

  function removePlayer(uid: string) {
    setParseResult((prev) => prev ? { ...prev, players: prev.players.filter((p) => p.uid !== uid) } : prev);
  }

  function removeUncertain(idx: number) {
    setParseResult((prev) => prev ? { ...prev, uncertain_rows: prev.uncertain_rows.filter((_, i) => i !== idx) } : prev);
  }

  function reassignPlayer(uid: string, toTeamName: string) {
    setParseResult((prev) => prev ? {
      ...prev,
      players: prev.players.map((p) => p.uid === uid ? { ...p, assignedTeamName: toTeamName } : p),
    } : prev);
    setPickerOpenForUid(null);
    setExpandedTeams((prev) => new Set(prev).add(toTeamName));
  }

  function reassignWholeTeam(fromTeamName: string, toTeamName: string) {
    if (fromTeamName === toTeamName) return;
    setParseResult((prev) => prev ? {
      ...prev,
      players: prev.players.map((p) => p.assignedTeamName === fromTeamName ? { ...p, assignedTeamName: toTeamName } : p),
    } : prev);
    setTeamPickerOpenFor(null);
    setExpandedTeams((prev) => new Set(prev).add(toTeamName));
  }

  // Manually point a parsed team group at a real existing team — overrides
  // the auto-match (or sets one where the AI found none), so this group's
  // players/coaches merge onto that team on import instead of creating a
  // new one. Passing null reverts to "create as new team".
  async function linkExistingTeam(teamName: string, existingTeamId: string | null) {
    setParseResult((prev) => prev ? {
      ...prev,
      teams: prev.teams.map((t) => t.name === teamName ? { ...t, matchedTeamId: existingTeamId } : t),
    } : prev);
    setLinkPickerOpenFor(null);

    if (!existingTeamId) {
      setExistingNamesByTeam((prev) => {
        const next = { ...prev };
        delete next[teamName];
        return next;
      });
      return;
    }
    const { data: existingPlayers } = await supabase
      .from('players')
      .select('full_name')
      .eq('team_id', existingTeamId);
    setExistingNamesByTeam((prev) => ({
      ...prev,
      [teamName]: new Set((existingPlayers ?? []).map((p) => normalizeName(p.full_name))),
    }));
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const playersByTeam = useMemo(() => {
    const map: Record<string, ParsedPlayer[]> = {};
    for (const p of parseResult?.players ?? []) {
      (map[p.assignedTeamName] ??= []).push(p);
    }
    return map;
  }, [parseResult?.players]);

  const uncertainCount = (parseResult?.uncertain_rows ?? []).length;
  const teamNames = (parseResult?.teams ?? []).map((t) => t.name);
  const visibleTeams = (parseResult?.teams ?? []).filter((t) =>
    t.coaches.length > 0 || (playersByTeam[t.name]?.length ?? 0) > 0
  );
  const newTeamCount = visibleTeams.filter((t) => !t.matchedTeamId).length;
  const totalPlayers = parseResult?.players.length ?? 0;
  const totalCoaches = visibleTeams.reduce((s, t) => s + t.coaches.length, 0);
  const inviteCount = visibleTeams.reduce((s, t) => {
    const players = playersByTeam[t.name] ?? [];
    const playerInvites = players.reduce((n, p) => n + [p.parent_email, p.secondary_parent_email].filter(Boolean).length, 0);
    return s + t.coaches.filter((c) => c.email).length + playerInvites;
  }, 0);

  // ── Commit import + send invites ───────────────────────────────────────────

  async function handleImport() {
    if (!parseResult || !profile?.club_id) return;
    if (visibleTeams.length === 0) return;

    setPhase('importing');
    const stats: DoneStats = { teams: 0, coaches: 0, players: 0, invitesSent: 0 };
    const total = visibleTeams.length;

    for (let i = 0; i < visibleTeams.length; i++) {
      const pt = visibleTeams[i];
      const players = playersByTeam[pt.name] ?? [];
      let teamId = pt.matchedTeamId;

      if (!teamId) {
        setProgress({ current: i + 1, total, label: `Creating ${pt.name}…` });
        const { data: teamData, error: teamErr } = await supabase
          .from('teams')
          .insert({ club_id: profile.club_id, name: pt.name, age_group: pt.age_group ?? null, season: pt.season ?? null })
          .select('id')
          .single();

        if (teamErr || !teamData) {
          const done = importedTeamNames.current;
          setParseResult((prev) => prev ? {
            ...prev,
            teams: prev.teams.filter((t) => !done.has(t.name)),
            players: prev.players.filter((p) => !done.has(p.assignedTeamName)),
          } : prev);
          Alert.alert(
            'Import interrupted',
            `${stats.teams} of ${total} teams were created before the error on "${pt.name}".\n\nThe completed teams have been removed from the list — tap Import to continue with the remaining ones.`,
          );
          setPhase('review');
          return;
        }

        teamId = teamData.id;
        stats.teams++;
      }
      importedTeamNames.current.add(pt.name);

      // Players + guardian invites (one row per non-empty email, so a
      // second guardian on the same player gets their own invite/account)
      setProgress({ current: i + 1, total, label: `Adding players to ${pt.name}…` });
      for (const p of players) {
        if (!p.full_name.trim()) continue;
        // The "Already on roster" badge shown during review was purely
        // cosmetic — nothing here actually consulted it, so even a name
        // the coach saw flagged as a duplicate (and didn't explicitly
        // remove) still got inserted as a second, separate player row.
        if (existingNamesByTeam[pt.name]?.has(normalizeName(p.full_name))) continue;
        const { data: playerData } = await supabase
          .from('players')
          .insert({
            team_id: teamId, full_name: p.full_name.trim(),
            jersey_number: p.jersey_number ?? null, position: p.position ?? null,
            date_of_birth: p.date_of_birth ?? null,
          })
          .select('id')
          .single();
        stats.players++;
        if (!playerData) continue;

        const guardianEmails = [p.parent_email, p.secondary_parent_email]
          .map((e) => e?.trim())
          .filter((e): e is string => !!e);

        for (const email of guardianEmails) {
          const { data: inviteData } = await supabase
            .from('invites')
            .insert({
              team_id: teamId, club_id: profile.club_id, player_id: playerData.id,
              email, role: 'parent', created_by: profile.id,
              guardian_name: p.parent_name?.trim() || null,
              phone: p.parent_phone?.trim() || null,
            })
            .select('id')
            .single();
          if (inviteData?.id) {
            await sendParentInviteEmail(inviteData.id, p.full_name.trim());
            stats.invitesSent++;
          }
        }
      }

      // Coach invites
      setProgress({ current: i + 1, total, label: `Inviting coaches to ${pt.name}…` });
      const coachInputs = pt.coaches
        .filter((c) => c.email?.trim())
        .map((c) => ({ full_name: c.full_name?.trim() || c.email!.trim(), email: c.email!.trim(), team_ids: [teamId!], role: 'coach' as const }));
      if (coachInputs.length > 0 && profile.club_id) {
        await sendCoachInvites(profile.club_id, coachInputs);
        stats.coaches += coachInputs.length;
        stats.invitesSent += coachInputs.length;
      }
    }

    setDoneStats(stats);
    await refetchTeam();
    setPhase('done');
  }

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
            Upload one spreadsheet — AI reads it, matches players onto your existing teams (or creates new
            ones), and sends invite emails once you've reviewed everything.
          </Text>

          <View style={styles.formatBox}>
            <Text style={styles.formatTitle}>WHAT AI DETECTS</Text>
            {[
              ['people-outline',   'Teams grouped by name, section, or column'],
              ['shield-outline',   'Coaches and their roles per team'],
              ['football-outline', 'Players with jersey number and position'],
              ['mail-outline',     'Parent email(s) — a second guardian email invites them too'],
              ['calendar-outline', 'Date of birth, phone, age group, and season'],
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
              <SummaryChip icon="football-outline" value={visibleTeams.length} label="Teams" color={primaryColor} />
              <SummaryChip icon="shield-outline"   value={totalCoaches} label="Coaches" color="#3B82F6" />
              <SummaryChip icon="people-outline"   value={totalPlayers} label="Players" color="#22C55E" />
            </View>

            {newTeamCount > 0 && (
              <Text style={styles.newTeamsNote}>{newTeamCount} new team{newTeamCount !== 1 ? 's' : ''} will be created; the rest merge onto your existing teams.</Text>
            )}

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

            {/* Teams — matched (existing) and new both shown and reviewable */}
            {visibleTeams.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>TEAMS</Text>
                {visibleTeams.map((team) => {
                  const expanded = expandedTeams.has(team.name);
                  const players = playersByTeam[team.name] ?? [];
                  return (
                    <TeamSection
                      key={team.name}
                      team={team}
                      players={players}
                      teamNames={teamNames}
                      existingTeams={existingTeams}
                      primaryColor={primaryColor}
                      expanded={expanded}
                      existingNames={existingNamesByTeam[team.name]}
                      pickerOpenForUid={pickerOpenForUid}
                      teamPickerOpen={teamPickerOpenFor === team.name}
                      linkPickerOpen={linkPickerOpenFor === team.name}
                      onToggle={() => toggleTeam(team.name)}
                      onRemoveTeam={() => removeTeam(team.name)}
                      onRemoveCoach={(ci) => removeCoach(team.name, ci)}
                      onRemovePlayer={(uid) => removePlayer(uid)}
                      onOpenPicker={(uid) => {
                        setTeamPickerOpenFor(null);
                        setLinkPickerOpenFor(null);
                        setPickerOpenForUid(pickerOpenForUid === uid ? null : uid);
                      }}
                      onReassignPlayer={(uid, toTeam) => reassignPlayer(uid, toTeam)}
                      onOpenTeamPicker={() => {
                        setPickerOpenForUid(null);
                        setLinkPickerOpenFor(null);
                        setTeamPickerOpenFor(teamPickerOpenFor === team.name ? null : team.name);
                      }}
                      onReassignWholeTeam={(toTeam) => reassignWholeTeam(team.name, toTeam)}
                      onOpenLinkPicker={() => {
                        setPickerOpenForUid(null);
                        setTeamPickerOpenFor(null);
                        setLinkPickerOpenFor(linkPickerOpenFor === team.name ? null : team.name);
                      }}
                      onLinkExisting={(id) => linkExistingTeam(team.name, id)}
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
              style={[styles.importBtn, { backgroundColor: primaryColor }, visibleTeams.length === 0 && { opacity: 0.4 }]}
              onPress={handleImport}
              disabled={visibleTeams.length === 0}
              activeOpacity={0.85}
            >
              <Text style={styles.importBtnText}>
                {inviteCount > 0
                  ? `Import & Send ${inviteCount} invite${inviteCount !== 1 ? 's' : ''}`
                  : `Import ${visibleTeams.length} team${visibleTeams.length !== 1 ? 's' : ''}`}
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
            <DoneStat value={doneStats.teams}       label="New teams"      color={primaryColor} />
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

function TeamSection({
  team, players, teamNames, existingTeams, primaryColor, expanded, existingNames,
  pickerOpenForUid, teamPickerOpen, linkPickerOpen,
  onToggle, onRemoveTeam, onRemoveCoach, onRemovePlayer,
  onOpenPicker, onReassignPlayer, onOpenTeamPicker, onReassignWholeTeam,
  onOpenLinkPicker, onLinkExisting,
}: {
  team: { name: string; age_group: string | null; season: string | null; coaches: ParsedCoach[]; matchedTeamId: string | null };
  players: ParsedPlayer[];
  teamNames: string[];
  existingTeams: { id: string; name: string }[];
  primaryColor: string;
  expanded: boolean;
  existingNames?: Set<string>;
  pickerOpenForUid: string | null;
  teamPickerOpen: boolean;
  linkPickerOpen: boolean;
  onToggle: () => void;
  onRemoveTeam: () => void;
  onRemoveCoach: (i: number) => void;
  onRemovePlayer: (uid: string) => void;
  onOpenPicker: (uid: string) => void;
  onReassignPlayer: (uid: string, toTeam: string) => void;
  onOpenTeamPicker: () => void;
  onReassignWholeTeam: (toTeam: string) => void;
  onOpenLinkPicker: () => void;
  onLinkExisting: (existingTeamId: string | null) => void;
}) {
  const meta = [team.age_group, team.season].filter(Boolean).join(' · ');
  const counts = [
    team.coaches.length > 0 ? `${team.coaches.length} coach${team.coaches.length !== 1 ? 'es' : ''}` : null,
    players.length > 0 ? `${players.length} player${players.length !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');
  const otherTeamNames = teamNames.filter((n) => n !== team.name);
  const matchedTeamName = team.matchedTeamId ? existingTeams.find((et) => et.id === team.matchedTeamId)?.name ?? null : null;
  const matchedLabel = matchedTeamName && matchedTeamName !== team.name ? `✓ ${matchedTeamName}` : '✓ Matched';

  return (
    <View style={styles.teamSection}>
      {/* Header — always visible, tappable to expand */}
      <TouchableOpacity style={styles.teamHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={[styles.teamDot, { backgroundColor: primaryColor }]} />
        <View style={styles.teamHeaderBody}>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamMeta}>{[meta, counts].filter(Boolean).join('  ·  ')}</Text>
        </View>
        {team.matchedTeamId
          ? <View style={styles.matchedBadge}><Text style={styles.matchedBadgeText} numberOfLines={1}>{matchedLabel}</Text></View>
          : <View style={styles.newBadge}><Text style={styles.newBadgeText}>New team</Text></View>}
        {existingTeams.length > 0 && (
          <TouchableOpacity onPress={onOpenLinkPicker} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={styles.moveTeamBtn}>
            <Ionicons name="link-outline" size={15} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        )}
        {otherTeamNames.length > 0 && (
          <TouchableOpacity onPress={onOpenTeamPicker} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={styles.moveTeamBtn}>
            <Ionicons name="swap-horizontal-outline" size={15} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRemoveTeam} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={styles.removeTeamBtn}>
          <Ionicons name="trash-outline" size={15} color={PULSE_COLORS.ui.muted} />
        </TouchableOpacity>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 2 }} />
      </TouchableOpacity>

      {linkPickerOpen && existingTeams.length > 0 && (
        <View style={styles.movePicker}>
          <Text style={styles.movePickerLabel}>Link to an existing team in your club:</Text>
          <View style={styles.chipRow}>
            {existingTeams.map((et) => (
              <TouchableOpacity
                key={et.id}
                style={[styles.teamChip, et.id === team.matchedTeamId && styles.teamChipActive]}
                onPress={() => onLinkExisting(et.id)}
              >
                <Text style={[styles.teamChipText, et.id === team.matchedTeamId && styles.teamChipActiveText]}>{et.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {team.matchedTeamId && (
            <TouchableOpacity onPress={() => onLinkExisting(null)} style={styles.unlinkBtn}>
              <Text style={styles.unlinkBtnText}>Create as a new team instead</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {teamPickerOpen && otherTeamNames.length > 0 && (
        <View style={styles.movePicker}>
          <Text style={styles.movePickerLabel}>Move everyone in this group to:</Text>
          <View style={styles.chipRow}>
            {otherTeamNames.map((name) => (
              <TouchableOpacity key={name} style={styles.teamChip} onPress={() => onReassignWholeTeam(name)}>
                <Text style={styles.teamChipText}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {expanded && (
        <>
          {team.coaches.length > 0 && (
            <View style={styles.personGroup}>
              <Text style={styles.groupLabel}>COACHES</Text>
              {team.coaches.map((c, ci) => (
                <ReviewPersonRow key={ci} name={c.full_name} detail={c.role} email={c.email} secondaryEmail={null}
                  iconName="shield-half-outline" iconColor="#3B82F6"
                  uncertain={c.uncertain} reason={c.uncertainty_reason} duplicate={false}
                  onRemove={() => onRemoveCoach(ci)} />
              ))}
            </View>
          )}
          {players.length > 0 && (
            <View style={styles.personGroup}>
              <Text style={styles.groupLabel}>PLAYERS</Text>
              {players.map((p) => (
                <ReviewPersonRow
                  key={p.uid}
                  name={p.full_name}
                  detail={[p.jersey_number != null ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ')}
                  email={p.parent_email}
                  secondaryEmail={p.secondary_parent_email}
                  iconName="person-outline" iconColor="#22C55E"
                  uncertain={p.uncertain} reason={p.uncertainty_reason}
                  duplicate={!!existingNames?.has(normalizeName(p.full_name))}
                  onRemove={() => onRemovePlayer(p.uid)}
                  footer={
                    <>
                      <TouchableOpacity style={styles.playerTeamPill} onPress={() => onOpenPicker(p.uid)} activeOpacity={0.7}>
                        <Text style={styles.playerTeamPillText}>{team.name}</Text>
                        <Ionicons name="chevron-down" size={10} color={PULSE_COLORS.ui.muted} />
                      </TouchableOpacity>
                      {pickerOpenForUid === p.uid && (
                        <View style={styles.nestedMovePicker}>
                          <Text style={styles.movePickerLabel}>Move to:</Text>
                          <View style={styles.chipRow}>
                            {teamNames.filter((n) => n !== team.name).map((name) => (
                              <TouchableOpacity key={name} style={styles.teamChip} onPress={() => onReassignPlayer(p.uid, name)}>
                                <Text style={styles.teamChipText}>{name}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}
                    </>
                  }
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function ReviewPersonRow({ name, detail, email, secondaryEmail, iconName, iconColor, uncertain, reason, duplicate, onRemove, footer }: {
  name: string; detail: string; email: string | null; secondaryEmail: string | null;
  iconName: any; iconColor: string; uncertain: boolean; reason: string | null; duplicate: boolean;
  onRemove: () => void;
  footer?: React.ReactNode;
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
          {secondaryEmail && <View style={rpStyles.guardianBadge}><Text style={rpStyles.guardianBadgeText}>2 guardians</Text></View>}
          {duplicate && <View style={rpStyles.dupBadge}><Text style={rpStyles.dupBadgeText}>Already on roster</Text></View>}
          {uncertain && <View style={rpStyles.badge}><Text style={rpStyles.badgeText}>Review</Text></View>}
        </View>
        {email && (
          <View style={rpStyles.emailRow}>
            <Ionicons name="mail-outline" size={10} color="#60A5FA" />
            <Text style={rpStyles.email}>{email}</Text>
          </View>
        )}
        {secondaryEmail && (
          <View style={rpStyles.emailRow}>
            <Ionicons name="mail-outline" size={10} color="#60A5FA" />
            <Text style={rpStyles.email}>{secondaryEmail}</Text>
          </View>
        )}
        {uncertain && reason ? <Text style={rpStyles.reason}>{reason}</Text> : null}
        {footer}
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={rpStyles.removeBtn}>
        <Ionicons name="close" size={15} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>
    </View>
  );
}

const rpStyles = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: 'transparent', borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  rowUncertain:{ backgroundColor: 'rgba(245,158,11,0.06)', borderLeftColor: '#F59E0B' },
  icon:        { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  body:        { flex: 1, gap: 3 },
  removeBtn:   { marginTop: 2 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name:        { fontSize: 14, fontWeight: '600', color: PULSE_COLORS.ui.text },
  badge:       { backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText:   { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  dupBadge:     { backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  dupBadgeText: { fontSize: 10, fontWeight: '700', color: '#60A5FA' },
  guardianBadge:     { backgroundColor: 'rgba(236,72,153,0.15)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  guardianBadgeText: { fontSize: 10, fontWeight: '700', color: '#EC4899' },
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
  summaryBar:    { flexDirection: 'row', gap: 8, marginBottom: 10 },
  sectionLabel:  { fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1, marginBottom: 8 },
  newTeamsNote:  { fontSize: 12, color: PULSE_COLORS.ui.muted, marginBottom: 14, lineHeight: 17 },

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
  moveTeamBtn:    { padding: 4 },

  matchedBadge:     { backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1, maxWidth: 120 },
  matchedBadgeText: { fontSize: 10, fontWeight: '700', color: '#22C55E' },
  newBadge:         { backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  newBadgeText:     { fontSize: 10, fontWeight: '700', color: '#8B5CF6' },

  personGroup: { paddingHorizontal: 14, paddingBottom: 8, borderTopWidth: 1, borderTopColor: PULSE_COLORS.ui.border },
  groupLabel:  { fontSize: 9, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 0.8, marginTop: 10, marginBottom: 2 },

  playerTeamPill:     { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  playerTeamPillText: { fontSize: 10.5, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },

  movePicker:       { marginHorizontal: 14, marginBottom: 10, padding: 10, backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  nestedMovePicker: { marginTop: 8, padding: 10, backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  movePickerLabel: { fontSize: 11, color: PULSE_COLORS.ui.muted, marginBottom: 6, fontWeight: '600' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  teamChip:        { backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  teamChipText:    { fontSize: 12, fontWeight: '600', color: PULSE_COLORS.ui.text },
  teamChipActive:     { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.4)' },
  teamChipActiveText: { color: '#22C55E' },
  unlinkBtn:     { marginTop: 8, alignSelf: 'flex-start' },
  unlinkBtnText: { fontSize: 11.5, fontWeight: '600', color: PULSE_COLORS.ui.muted, textDecorationLine: 'underline' },

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
