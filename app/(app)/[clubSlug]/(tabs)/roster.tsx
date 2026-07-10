import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useTeam } from '../../../../hooks/useTeam';
import { useAuth } from '../../../../hooks/useAuth';
import { PULSE_COLORS } from '../../../../constants/colors';
import { POSITION_COLORS, POSITION_DEFAULT } from '../../../../constants/positions';
import { useClub } from '../../../../hooks/useClub';
import ClubBadge from '../../../../components/ui/ClubBadge';
import ClubHeader, { headerBtnStyle, headerBtnTextStyle } from '../../../../components/ui/ClubHeader';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  photo_url: string | null;
  is_private: boolean;
  profile_id: string | null;
  profiles: { avatar_url: string | null } | null;
};

type Coach = {
  id: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

type PendingCoach = {
  id: string;
  email: string;
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

const POS = POSITION_COLORS;

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD    = 14;
const CARD_GAP = 10;
const CARD_W   = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;
const PHOTO_H  = Math.round(CARD_W * 1.1);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function splitName(full: string): [string, string] {
  const parts = full.trim().split(' ');
  return [parts[0] ?? '', parts.slice(1).join(' ')];
}

// ─── Player card ─────────────────────────────────────────────────────────────

function PlayerCard({
  item, isCoach, myProfileId, onPress,
}: {
  item: Player;
  isCoach: boolean;
  myProfileId: string | null;
  onPress: () => void;
}) {
  const { primaryColor } = useClub();
  const [imgErr, setImgErr] = useState(false);
  const isMyPlayer   = item.profile_id !== null && item.profile_id === myProfileId;
  const canSeeDetail = isCoach || isMyPlayer || !item.is_private;
  // Hide photo from other parents when private
  const url     = canSeeDetail ? (item.photo_url ?? item.profiles?.avatar_url) : null;
  const hasImg  = !!url && !imgErr;
  const pc      = item.position ? (POS[item.position] ?? POSITION_DEFAULT) : POSITION_DEFAULT;
  const [first, last] = splitName(item.full_name);

  return (
    <TouchableOpacity style={[st.card, { borderColor: `${primaryColor}22` }]} onPress={onPress} activeOpacity={0.75}>

      {/* ── Thin top brand stripe ── */}
      <View style={{ height: 3, backgroundColor: primaryColor }} />

      {/* ── Photo zone ── */}
      <View style={[st.photoZone, { backgroundColor: `${primaryColor}14` }]}>

        {hasImg ? (
          /* Real photo ─ fill, cover, fade bottom, position badge */
          <Image
            source={{ uri: url! }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          /* No photo ─ initials as hero */
          <View style={st.placeholder}>
            <View style={[st.bgRing, { width: CARD_W * 0.90, height: CARD_W * 0.90, borderRadius: CARD_W * 0.45, borderColor: `${primaryColor}18`, backgroundColor: `${primaryColor}08` }]} />
            <View style={[st.bgRing, { width: CARD_W * 0.62, height: CARD_W * 0.62, borderRadius: CARD_W * 0.31, opacity: 0.7, borderColor: `${primaryColor}25`, backgroundColor: `${primaryColor}10` }]} />
            <Text
              style={[st.placeholderInitials, { color: pc.primary, opacity: 0.38 }]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {initials(item.full_name)}
            </Text>
          </View>
        )}

        {/* Position badge — hidden from other parents when private */}
        {item.position && canSeeDetail && (
          <View style={[st.posBadge, { backgroundColor: 'rgba(8,8,8,0.82)', borderColor: pc.primary }]}>
            <Text style={[st.posBadgeText, { color: pc.primary }]}>{item.position}</Text>
          </View>
        )}
        {/* Lock icon for private players (other parents only) */}
        {item.is_private && !isCoach && !isMyPlayer && (
          <View style={st.privateLockBadge}>
            <Ionicons name="lock-closed" size={10} color={PULSE_COLORS.ui.muted} />
          </View>
        )}

      </View>

      {/* ── Name strip ── */}
      <View style={[st.strip, { backgroundColor: `${primaryColor}08`, borderTopColor: `${primaryColor}20` }]}>
        {item.jersey_number != null ? (
          <>
            <View style={st.stripNumCol}>
              <Text style={[st.stripNum, { color: primaryColor }]}>{item.jersey_number}</Text>
            </View>
            <View style={[st.stripDivider, { backgroundColor: `${primaryColor}25` }]} />
          </>
        ) : null}

        <View style={[st.stripNames, !item.jersey_number && { paddingLeft: 2 }]}>
          <Text style={st.stripFirst} numberOfLines={1}>{first}</Text>
          {last ? (
            <Text style={st.stripLast} numberOfLines={1}>{last}</Text>
          ) : null}
        </View>
      </View>

    </TouchableOpacity>
  );
}

// ─── Coach avatar ─────────────────────────────────────────────────────────────

function CoachAvatar({ uri, name }: { uri: string | null; name: string }) {
  const { primaryColor, rgba } = useClub();
  const [err, setErr] = useState(false);
  if (uri && !err) {
    return <Image source={{ uri }} style={st.coachImg} onError={() => setErr(true)} />;
  }
  return (
    <View style={[st.coachImgFallback, { borderColor: rgba(0.22) }]}>
      <Text style={[st.coachInitials, { color: primaryColor }]}>{initials(name)}</Text>
    </View>
  );
}

// ─── List header (coaches + squad label) ──────────────────────────────────────

function ListHeader({
  coaches, pendingCoaches, count, clubSlug, onCoachPress, onPendingCoachPress,
}: {
  coaches: Coach[];
  pendingCoaches: PendingCoach[];
  count: number;
  clubSlug: string;
  onCoachPress: (id: string) => void;
  onPendingCoachPress: (id: string) => void;
}) {
  const { primaryColor, rgba } = useClub();
  const hasStaff = coaches.length > 0 || pendingCoaches.length > 0;
  const totalRows = coaches.length + pendingCoaches.length;
  return (
    <View style={st.listHeader}>
      {hasStaff && (
        <>
          <Text style={st.sectionLabel}>COACHING STAFF</Text>
          <View style={st.coachCard}>
            {coaches.map((c, i) => {
              const n = c.profiles?.full_name ?? 'Coach';
              return (
                <TouchableOpacity key={c.id} style={[st.coachRow, (i < totalRows - 1) && st.coachDivider]} onPress={() => onCoachPress(c.id)} activeOpacity={0.75}>
                  <CoachAvatar uri={c.profiles?.avatar_url ?? null} name={n} />
                  <View style={st.coachMeta}>
                    <Text style={st.coachName}>{n}</Text>
                    <Text style={st.coachRole}>Coach</Text>
                  </View>
                  <View style={[st.coachTag, { backgroundColor: rgba(0.08), borderColor: rgba(0.18) }]}>
                    <Ionicons name="shield-checkmark" size={10} color={primaryColor} />
                    <Text style={[st.coachTagText, { color: primaryColor }]}>STAFF</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              );
            })}
            {pendingCoaches.map((c, i) => (
              <TouchableOpacity key={c.id} style={[st.coachRow, (i < pendingCoaches.length - 1) && st.coachDivider]} onPress={() => onPendingCoachPress(c.id)} activeOpacity={0.75}>
                <CoachAvatar uri={null} name={c.email} />
                <View style={st.coachMeta}>
                  <Text style={st.coachName}>{c.email}</Text>
                  <Text style={st.coachRole}>Coach</Text>
                </View>
                <View style={[st.coachTag, { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.3)' }]}>
                  <Ionicons name="mail-outline" size={10} color="#EAB308" />
                  <Text style={[st.coachTagText, { color: '#EAB308' }]}>INVITED</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={PULSE_COLORS.ui.muted} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={[st.squadRow, hasStaff && { marginTop: 28 }]}>
        <Text style={st.sectionLabel}>SQUAD</Text>
        <Text style={st.squadCount}>{count} players</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RosterScreen() {
  const { primaryColor, rgba, clubName, logoUrl, secondaryColor, onSecondary } = useClub();
  const { team, loading: teamLoading } = useTeam();
  const { profile } = useAuth();
  const router = useRouter();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();

  const [search, setSearch]             = useState('');
  const [players, setPlayers]           = useState<Player[]>([]);
  const [coaches, setCoaches]           = useState<Coach[]>([]);
  const [pendingCoaches, setPendingCoaches] = useState<PendingCoach[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [saving, setSaving]     = useState(false);

  const filteredPlayers = search.trim()
    ? players.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()))
    : players;

  // Add modal flow: picker → player | coach → success
  type AddStep = 'picker' | 'player' | 'coach' | 'success' | null;
  const [addStep, setAddStep]       = useState<AddStep>(null);
  const [successInfo, setSuccessInfo] = useState<{ type: 'player' | 'coach' | 'player_no_email'; firstName: string; email: string } | null>(null);

  // Player form
  const [name, setName]               = useState('');
  const [jersey, setJersey]           = useState('');
  const [position, setPosition]       = useState('');
  const [parentName, setParentName]   = useState('');
  const [parentEmail, setParentEmail] = useState('');

  // Coach form
  const [coachName, setCoachName]   = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [coachRole, setCoachRole]   = useState('');
  const [coachPhone, setCoachPhone] = useState('');

  const isCoach   = profile?.role === 'org_admin' || profile?.role === 'coach';
  const myProfileId = profile?.id ?? null;


  useEffect(() => {
    if (!team) {
      if (!teamLoading) setLoading(false);
      return;
    }
    fetchData();
  }, [team?.id, teamLoading]);

  async function fetchData() {
    if (!team) return;
    setLoading(true);

    // Try full select including columns added in later migrations
    let playersRes = await (supabase as any)
      .from('players')
      .select('id, full_name, jersey_number, position, photo_url, is_private, profile_id, profiles!players_profile_id_fkey(avatar_url)')
      .eq('team_id', team.id)
      .order('jersey_number', { ascending: true, nullsFirst: false });

    // Fall back to base columns if new ones don't exist yet in DB
    if (playersRes.error?.message?.includes('schema cache')) {
      playersRes = await supabase
        .from('players')
        .select('id, full_name, jersey_number, position, profile_id, profiles!players_profile_id_fkey(avatar_url)')
        .eq('team_id', team.id)
        .order('jersey_number', { ascending: true, nullsFirst: false });

      // Patch missing fields so PlayerCard doesn't crash
      playersRes.data = (playersRes.data ?? []).map((p: any) => ({
        ...p,
        photo_url: null,
        is_private: false,
      }));
    }

    const coachesRes = await supabase
      .from('team_members')
      .select('id, profiles!team_members_profile_id_fkey(full_name, avatar_url)')
      .eq('team_id', team.id)
      .eq('role', 'coach');

    const pendingRes = await supabase
      .from('invites')
      .select('id, email')
      .eq('team_id', team.id)
      .eq('role', 'coach' as any)
      .is('accepted_at', null);

    setPlayers((playersRes.data as unknown as Player[]) ?? []);
    setCoaches((coachesRes.data as unknown as Coach[]) ?? []);
    setPendingCoaches((pendingRes.data as unknown as PendingCoach[]) ?? []);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  function openAddModal() {
    setName(''); setJersey(''); setPosition('');
    setParentName(''); setParentEmail('');
    setCoachName(''); setCoachEmail(''); setCoachRole(''); setCoachPhone('');
    setSuccessInfo(null);
    setAddStep('picker');
  }

  async function handleAddPlayer() {
    if (!name.trim() || !team || !profile) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);

    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .insert({
        team_id: team.id,
        full_name: name.trim(),
        jersey_number: jersey ? parseInt(jersey, 10) : null,
        position: position || null,
      })
      .select('id')
      .single();

    if (playerError || !playerData?.id) {
      setSaving(false);
      Alert.alert('Error', 'Could not add player. Please try again.');
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim());
    if (parentEmail.trim() && !emailOk) {
      setSaving(false);
      Alert.alert('Invalid email', 'Please enter a valid parent email address.');
      return;
    }

    if (parentEmail.trim()) {
      const { data: inviteData } = await supabase
        .from('invites')
        .insert({
          team_id: team.id,
          player_id: playerData.id,
          email: parentEmail.trim(),
          role: 'parent',
          created_by: profile.id,
        } as any)
        .select('token')
        .single();

      if (inviteData?.token) {
        const token       = (inviteData as any).token as string;
        const appStoreUrl = 'https://apps.apple.com/app/pulse-fc/id6740793498';
        const deepLink    = `${process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app'}/join?token=${token}`;
        const greeting    = parentName.trim() ? `Hi ${parentName.trim()},` : 'Hi,';
        const body =
          `${greeting}\n\n` +
          `${name.trim()} has been added to the ${team.name} squad at ${clubName}.\n\n` +
          `${clubName} manages schedules, game day RSVPs, and team communications through Pulse FC. ` +
          `Create your account below to stay connected throughout the season.\n\n` +
          `Accept your invite:\n${deepLink}\n\n` +
          `Or enter invite code: ${token}`;

        await supabase.functions.invoke('send-team-email', {
          body: {
            to: [{ email: parentEmail.trim(), name: parentName.trim() || '' }],
            cc: [],
            subject: `${name.trim()} has been added to ${team.name} · ${clubName}`,
            body,
            from_name: profile.full_name ?? 'Your Coach',
            team_name: team.name,
            from_email: 'info@pulse-fc.app',
            reply_to: null,
            attachments: [],
            club_logo_url: logoUrl,
            club_name: clubName,
            primary_color: primaryColor,
          },
        });
        setSuccessInfo({ type: 'player', firstName: name.trim().split(' ')[0], email: parentEmail.trim() });
      } else {
        // Invite insert failed — player added but email not sent
        setSuccessInfo({ type: 'player_no_email', firstName: name.trim().split(' ')[0], email: '' });
      }
    } else {
      setSuccessInfo({ type: 'player_no_email', firstName: name.trim().split(' ')[0], email: '' });
    }

    setSaving(false);
    setAddStep('success');
    fetchData();
  }

  async function handleAddCoach() {
    if (!coachName.trim() || !coachEmail.trim() || !team || !profile) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);

    const { data: inviteData } = await supabase
      .from('invites')
      .insert({
        team_id: team.id,
        email: coachEmail.trim().toLowerCase(),
        role: 'coach',
        created_by: profile.id,
      } as any)
      .select('token')
      .single();

    if (inviteData?.token) {
      const token      = (inviteData as any).token as string;
      const deepLink   = `${process.env.EXPO_PUBLIC_APP_URL ?? 'https://pulse-fc.app'}/join?token=${token}`;
      const roleLabel  = coachRole || 'Coach';
      const greeting   = `Hi ${coachName.trim()},`;
      const body =
        `${greeting}\n\nYou've been added as ${roleLabel} for ${team.name} on ${clubName}.\n\n` +
        `Download the app to manage the squad, build lineups, and communicate with parents:\n` +
        `https://apps.apple.com/app/pulse-fc\n\n` +
        `Already have the app? Use this link to join your team:\n${deepLink}\n\n` +
        `Or enter invite code: ${token}`;

      await supabase.functions.invoke('send-team-email', {
        body: {
          to: [{ email: coachEmail.trim(), name: coachName.trim() }],
          cc: [],
          subject: `You've been added as ${roleLabel} for ${team.name}`,
          body,
          from_name: profile.full_name ?? clubName,
          team_name: team.name,
          from_email: 'info@pulse-fc.app',
          reply_to: null,
          attachments: [],
          club_logo_url: logoUrl,
          club_name: clubName,
          primary_color: primaryColor,
        },
      });
    }

    setSaving(false);
    setSuccessInfo({ type: 'coach', firstName: coachName.trim().split(' ')[0], email: coachEmail.trim() });
    setAddStep('success');
    fetchData();
  }

  if (teamLoading || loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={primaryColor} size="large" />
      </View>
    );
  }

  if (!team) {
    return (
      <View style={st.center}>
        <Ionicons name="people-outline" size={48} color={PULSE_COLORS.ui.muted} />
        <Text style={{ color: PULSE_COLORS.ui.textSecondary, fontSize: 17, fontWeight: '700', marginTop: 16 }}>No teams yet</Text>
        <Text style={{ color: PULSE_COLORS.ui.muted, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }}>Import your club or create a team to get started.</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>

      <ClubHeader
        title="Roster"
        subtitle={team?.name}
        right={isCoach ? (
          <>
            <TouchableOpacity
              onPress={() => router.push(`/(app)/${clubSlug}/admin/roster-import` as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#7C3AED', shadowColor: '#A855F7', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 10, elevation: 6 }}
            >
              <Ionicons name="sparkles" size={13} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>AI</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[headerBtnStyle, { backgroundColor: secondaryColor }]} onPress={openAddModal}>
              <Ionicons name="add" size={16} color={onSecondary} />
              <Text style={[headerBtnTextStyle, { color: onSecondary }]}>Add</Text>
            </TouchableOpacity>
          </>
        ) : undefined}
      />

      {/* ── Search bar ── */}
      <View style={st.searchRow}>
        <Ionicons name="search-outline" size={16} color={PULSE_COLORS.ui.muted} style={st.searchIcon} />
        <TextInput
          style={st.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search players…"
          placeholderTextColor={PULSE_COLORS.ui.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Grid ── */}
      <FlatList
        data={filteredPlayers}
        keyExtractor={p => p.id}
        numColumns={2}
        columnWrapperStyle={st.cardRow}
        contentContainerStyle={st.grid}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
        ListHeaderComponent={
          <ListHeader
            coaches={coaches}
            pendingCoaches={pendingCoaches}
            count={filteredPlayers.length}
            clubSlug={clubSlug ?? ''}
            onCoachPress={(id) => router.push(`/(app)/${clubSlug}/coach/${id}?source=member` as any)}
            onPendingCoachPress={(id) => router.push(`/(app)/${clubSlug}/coach/${id}?source=invite` as any)}
          />
        }
        ListEmptyComponent={
          <View style={st.empty}>
            {logoUrl ? <Image source={{ uri: logoUrl }} style={{ position: 'absolute', width: 160, height: 160, opacity: 0.05 }} resizeMode="contain" /> : null}
            <View style={st.emptyIcon}>
              <Ionicons name="people-outline" size={30} color={PULSE_COLORS.ui.muted} />
            </View>
            <Text style={st.emptyTitle}>No players yet</Text>
            <Text style={st.emptySub}>
              {isCoach ? 'Add your first player to get started.' : "Your coach hasn't added the roster yet."}
            </Text>
            {isCoach && (
              <TouchableOpacity style={[st.emptyBtn, { backgroundColor: primaryColor }]} onPress={openAddModal}>
                <Text style={st.emptyBtnText}>+ Add Player</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <PlayerCard
            item={item}
            isCoach={isCoach}
            myProfileId={myProfileId}
            onPress={() => router.push(`/(app)/${clubSlug}/player/${item.id}` as any)}
          />
        )}
      />

      {/* ── Add modal (picker → form → success) ── */}
      <Modal visible={addStep !== null} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={st.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={st.sheet}>
            <View style={st.sheetHandle} />

            {/* ── Success ── */}
            {addStep === 'success' && successInfo && (
              <View style={st.successBox}>
                <View style={[st.successIconWrap, {
                  borderColor: successInfo.type === 'coach'
                    ? 'rgba(96,165,250,0.4)' : `${PULSE_COLORS.brand.green}55`,
                  shadowColor: successInfo.type === 'coach'
                    ? '#60A5FA' : PULSE_COLORS.brand.green,
                }]}>
                  <Ionicons
                    name={successInfo.type === 'coach' ? 'shield-checkmark' : 'checkmark'}
                    size={36}
                    color={successInfo.type === 'coach' ? '#60A5FA' : PULSE_COLORS.brand.green}
                  />
                </View>
                <Text style={st.successTitle}>
                  {successInfo.firstName} {successInfo.type === 'coach' ? 'invited' : 'added'}
                </Text>
                <Text style={st.successSub}>
                  {successInfo.type === 'coach'
                    ? 'Coach invite sent to'
                    : successInfo.type === 'player'
                      ? 'Parent invite sent to'
                      : 'Added to the squad — no invite sent'}
                </Text>
                {(successInfo.type === 'player' || successInfo.type === 'coach') && (
                  <View style={[st.successEmailPill, successInfo.type === 'coach' && { borderColor: 'rgba(96,165,250,0.22)', backgroundColor: 'rgba(96,165,250,0.08)' }]}>
                    <Ionicons name="mail-outline" size={13} color={successInfo.type === 'coach' ? '#60A5FA' : PULSE_COLORS.brand.green} />
                    <Text style={[st.successEmailText, successInfo.type === 'coach' && { color: '#60A5FA' }]} numberOfLines={1}>
                      {successInfo.email}
                    </Text>
                  </View>
                )}
                {successInfo.type === 'player_no_email' && (
                  <Text style={{ fontSize: 12, color: PULSE_COLORS.ui.muted, textAlign: 'center', marginTop: 8, marginBottom: 24, paddingHorizontal: 8, lineHeight: 18 }}>
                    You can add a parent email from the roster later.
                  </Text>
                )}
                <TouchableOpacity
                  style={[st.successDoneBtn, { backgroundColor: successInfo.type === 'coach' ? '#60A5FA' : primaryColor }]}
                  onPress={() => setAddStep(null)}
                >
                  <Text style={st.saveText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Picker ── */}
            {addStep === 'picker' && (
              <>
                <View style={st.sheetHeaderRow}>
                  <Text style={st.sheetTitle}>Add to Roster</Text>
                  <TouchableOpacity onPress={() => setAddStep(null)} style={st.sheetClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={20} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={st.pickerCard} onPress={() => setAddStep('player')} activeOpacity={0.78}>
                  <View style={[st.pickerIconWrap, { backgroundColor: rgba(0.10), borderColor: rgba(0.22) }]}>
                    <Ionicons name="football-outline" size={22} color={primaryColor} />
                  </View>
                  <View style={st.pickerMeta}>
                    <Text style={st.pickerTitle}>Player</Text>
                    <Text style={st.pickerSub}>Add to the squad, optionally invite parent</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.border} />
                </TouchableOpacity>

                <TouchableOpacity style={[st.pickerCard, { marginTop: 10 }]} onPress={() => setAddStep('coach')} activeOpacity={0.78}>
                  <View style={[st.pickerIconWrap, { backgroundColor: 'rgba(96,165,250,0.10)', borderColor: 'rgba(96,165,250,0.22)' }]}>
                    <Ionicons name="shield-checkmark-outline" size={22} color="#60A5FA" />
                  </View>
                  <View style={st.pickerMeta}>
                    <Text style={st.pickerTitle}>Coach / Staff</Text>
                    <Text style={st.pickerSub}>Sends an invite to join as coaching staff</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.border} />
                </TouchableOpacity>

                <TouchableOpacity style={[st.cancelBtn, { marginTop: 20, alignItems: 'center' }]} onPress={() => setAddStep(null)}>
                  <Text style={st.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Player form ── */}
            {addStep === 'player' && (
              <>
                <View style={st.sheetHeaderRow}>
                  <TouchableOpacity onPress={() => setAddStep('picker')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-back" size={22} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={st.sheetTitle}>Add Player</Text>
                    <Text style={st.sheetSub}>Add a parent email to send an instant invite.</Text>
                  </View>
                  <TouchableOpacity onPress={() => setAddStep(null)} style={st.sheetClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={20} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                  <Text style={st.sectionDivLabel}>PLAYER</Text>

                  <Text style={st.inputLabel}>Full name *</Text>
                  <TextInput style={st.input} value={name} onChangeText={setName} placeholder="Jane Smith" placeholderTextColor={PULSE_COLORS.ui.muted} autoFocus />

                  <View style={st.rowInputs}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.inputLabel}>Jersey</Text>
                      <TextInput style={st.input} value={jersey} onChangeText={setJersey} placeholder="#10" placeholderTextColor={PULSE_COLORS.ui.muted} keyboardType="number-pad" />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={st.inputLabel}>Position</Text>
                      <View style={st.posRow}>
                        {POSITIONS.map(pos => {
                          const active = position === pos;
                          const c = POS[pos];
                          return (
                            <TouchableOpacity key={pos} style={[st.posChip, active && { backgroundColor: c.bg, borderColor: c.border }]} onPress={() => setPosition(position === pos ? '' : pos)}>
                              <Text style={[st.posChipText, active && { color: c.primary }]}>{pos}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  <View style={st.parentDivider}>
                    <View style={st.parentDividerLine} />
                    <Text style={st.parentDividerLabel}>PARENT / GUARDIAN</Text>
                    <View style={st.parentDividerLine} />
                  </View>

                  <Text style={st.inputLabel}>Parent name</Text>
                  <TextInput style={st.input} value={parentName} onChangeText={setParentName} placeholder="Sarah Smith" placeholderTextColor={PULSE_COLORS.ui.muted} autoCapitalize="words" />

                  <Text style={st.inputLabel}>Parent email</Text>
                  <TextInput style={st.input} value={parentEmail} onChangeText={setParentEmail} placeholder="sarah@example.com" placeholderTextColor={PULSE_COLORS.ui.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                  {parentEmail.trim().length > 0 && (
                    <View style={st.inviteHint}>
                      <Ionicons name="mail-outline" size={13} color={PULSE_COLORS.brand.green} />
                      <Text style={st.inviteHintText}>Invite email will be sent automatically</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={[st.modalBtns, { marginTop: 20 }]}>
                  <TouchableOpacity style={st.cancelBtn} onPress={() => setAddStep('picker')}>
                    <Text style={st.cancelText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.saveBtn, { backgroundColor: primaryColor }, !name.trim() && { opacity: 0.4 }]} onPress={handleAddPlayer} disabled={!name.trim() || saving}>
                    {saving ? <ActivityIndicator color="#000" size="small" /> : <Text style={st.saveText}>{parentEmail.trim() ? 'Add & Invite' : 'Add Player'}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Coach form ── */}
            {addStep === 'coach' && (
              <>
                <View style={st.sheetHeaderRow}>
                  <TouchableOpacity onPress={() => setAddStep('picker')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-back" size={22} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={st.sheetTitle}>Add Coach</Text>
                    <Text style={st.sheetSub}>They'll receive an invite to join as coaching staff.</Text>
                  </View>
                  <TouchableOpacity onPress={() => setAddStep(null)} style={st.sheetClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={20} color={PULSE_COLORS.ui.muted} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                  <Text style={st.inputLabel}>Full name *</Text>
                  <TextInput style={st.input} value={coachName} onChangeText={setCoachName} placeholder="Mike Johnson" placeholderTextColor={PULSE_COLORS.ui.muted} autoCapitalize="words" autoFocus />

                  <Text style={st.inputLabel}>Email address *</Text>
                  <TextInput style={st.input} value={coachEmail} onChangeText={setCoachEmail} placeholder="coach@example.com" placeholderTextColor={PULSE_COLORS.ui.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

                  <Text style={st.inputLabel}>Phone number</Text>
                  <TextInput style={st.input} value={coachPhone} onChangeText={setCoachPhone} placeholder="+1 (555) 000-0000" placeholderTextColor={PULSE_COLORS.ui.muted} keyboardType="phone-pad" />

                  <Text style={st.inputLabel}>Role</Text>
                  <View style={st.posRow}>
                    {['Head Coach', 'Assistant', 'Manager'].map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[st.posChip, coachRole === r && { backgroundColor: 'rgba(96,165,250,0.14)', borderColor: 'rgba(96,165,250,0.35)' }]}
                        onPress={() => setCoachRole(coachRole === r ? '' : r)}
                      >
                        <Text style={[st.posChipText, coachRole === r && { color: '#60A5FA' }]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <View style={[st.modalBtns, { marginTop: 20 }]}>
                  <TouchableOpacity style={st.cancelBtn} onPress={() => setAddStep('picker')}>
                    <Text style={st.cancelText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.saveBtn, { backgroundColor: '#60A5FA' }, (!coachName.trim() || !coachEmail.trim()) && { opacity: 0.4 }]}
                    onPress={handleAddCoach}
                    disabled={!coachName.trim() || !coachEmail.trim() || saving}
                  >
                    {saving ? <ActivityIndicator color="#000" size="small" /> : <Text style={st.saveText}>Send Invite</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COACH_SZ = 46;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.background },

  // ── Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title:    { fontSize: 28, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.5 },
  teamName: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PULSE_COLORS.brand.green,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Search bar
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginTop: 10, marginBottom: 4,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1, fontSize: 15, color: PULSE_COLORS.ui.text,
  },

  // ── Grid
  grid:    { paddingHorizontal: H_PAD, paddingBottom: 40 },
  cardRow: { gap: CARD_GAP, marginBottom: CARD_GAP },

  // ── List header
  listHeader: { marginBottom: 6 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.muted,
    letterSpacing: 2, marginBottom: 12, marginTop: 24,
  },
  squadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  squadCount: { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // ── Coach card
  coachCard: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  coachRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  coachDivider: { borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  coachImg: { width: COACH_SZ, height: COACH_SZ, borderRadius: COACH_SZ / 2 },
  coachImgFallback: {
    width: COACH_SZ, height: COACH_SZ, borderRadius: COACH_SZ / 2,
    backgroundColor: '#0F1F14',
    borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  coachInitials: { fontSize: 16, fontWeight: '900', color: PULSE_COLORS.brand.green },
  coachMeta: { flex: 1 },
  coachName: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  coachRole: { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 1 },
  coachTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)',
  },
  coachTagText: { fontSize: 9, fontWeight: '800', color: PULSE_COLORS.brand.green, letterSpacing: 1 },

  // ── Player card
  card: {
    width: CARD_W,
    borderRadius: 16,
    backgroundColor: PULSE_COLORS.ui.background,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },

  // Photo zone
  photoZone: {
    width: '100%',
    height: PHOTO_H,
    backgroundColor: '#080F0B',
    overflow: 'hidden',
  },

  // No-photo placeholder
  placeholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  bgRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.07)',
    backgroundColor: 'rgba(34,197,94,0.025)',
  },
  placeholderInitials: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 60,
    width: CARD_W * 0.72,
    textAlign: 'center',
  },

  // Position badge (top-right on photo zone)
  posBadge: {
    position: 'absolute', top: 10, right: 10,
    borderRadius: 8, borderWidth: 1.5,
    paddingHorizontal: 7, paddingVertical: 4,
  },
  posBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  privateLockBadge: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Name strip
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopWidth: 1,
    borderTopColor: PULSE_COLORS.ui.border,
    gap: 0,
  },
  stripNumCol: {
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripNum: {
    fontSize: 18,
    fontWeight: '900',
    color: PULSE_COLORS.brand.green,
    letterSpacing: -0.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  stripDivider: {
    width: 1,
    height: 28,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    marginHorizontal: 10,
  },
  stripNames: { flex: 1, justifyContent: 'center' },
  stripFirst: {
    fontSize: 13,
    fontWeight: '700',
    color: PULSE_COLORS.ui.text,
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  stripLast: {
    fontSize: 11,
    fontWeight: '500',
    color: PULSE_COLORS.ui.muted,
    letterSpacing: -0.1,
    lineHeight: 15,
    marginTop: 2,
  },

  // ── Empty
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center', marginBottom: 24 },
  emptyBtn:   { backgroundColor: PULSE_COLORS.brand.green, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  emptyBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },

  // ── Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 46,
    maxHeight: '88%',
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: PULSE_COLORS.ui.border,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12,
  },
  sheetClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: PULSE_COLORS.ui.surface, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: PULSE_COLORS.ui.text, marginBottom: 4 },
  sheetSub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, lineHeight: 18 },
  sectionDivLabel: {
    fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.5, marginTop: 4, marginBottom: 0,
  },
  inputLabel: {
    fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    letterSpacing: 0.8, marginBottom: 8, marginTop: 16,
  },
  rowInputs: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  input: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
    color: PULSE_COLORS.ui.text, fontSize: 16,
  },
  posRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 0 },
  posChip: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surface,
  },
  posChipText: { color: PULSE_COLORS.ui.muted, fontWeight: '800', fontSize: 12 },
  parentDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 0,
  },
  parentDividerLine: { flex: 1, height: 1, backgroundColor: PULSE_COLORS.ui.surfaceAlt },
  parentDividerLabel: {
    fontSize: 10, fontWeight: '800', color: PULSE_COLORS.ui.muted,
    letterSpacing: 1.5,
  },
  inviteHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: 'rgba(34,197,94,0.07)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)',
  },
  inviteHintText: { fontSize: 12, color: PULSE_COLORS.brand.green, fontWeight: '600' },
  successBox: { alignItems: 'center', paddingTop: 28, paddingBottom: 8 },
  successIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
    shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  successTitle: {
    fontSize: 26, fontWeight: '800', color: PULSE_COLORS.ui.text,
    letterSpacing: -0.5, marginBottom: 8,
  },
  successSub: {
    fontSize: 13, color: PULSE_COLORS.ui.muted, textAlign: 'center',
  },
  successEmailPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 10, marginBottom: 32,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)',
    maxWidth: '100%',
  },
  successEmailText: {
    fontSize: 13, color: PULSE_COLORS.brand.green,
    fontWeight: '600', flexShrink: 1,
  },
  successDoneBtn: {
    alignSelf: 'stretch', padding: 16, borderRadius: 16, alignItems: 'center',
  },

  // ── Picker cards
  pickerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    padding: 16,
  },
  pickerIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  pickerMeta: { flex: 1 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 3 },
  pickerSub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, lineHeight: 18 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 16,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, alignItems: 'center',
  },
  cancelText: { color: PULSE_COLORS.ui.muted, fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 2, padding: 15, borderRadius: 16,
    backgroundColor: PULSE_COLORS.brand.green, alignItems: 'center',
  },
  saveText: { color: '#000', fontWeight: '800', fontSize: 15 },
});
