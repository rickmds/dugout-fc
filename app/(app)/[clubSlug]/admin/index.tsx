import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../hooks/useAuth';
import { useTeam } from '../../../../hooks/useTeam';
import { PULSE_COLORS } from '../../../../constants/colors';
import { useClub } from '../../../../hooks/useClub';
import ClubHeader, { headerBtnStyle } from '../../../../components/ui/ClubHeader';
import TeamEditModal from '../../../../components/ui/TeamEditModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  title: string;
  type: 'game' | 'training' | 'other';
  event_date: string;
  event_time: string | null;
  location: string | null;
  attending: number;
  not_attending: number;
};

type AttendancePlayer = {
  id: string;
  full_name: string;
  jersey_number: number | null;
  attended: number;
  total: number;
  pct: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_CFG = {
  game:     { label: 'Game',     color: '#F59E0B', icon: 'football-outline'  as const },
  training: { label: 'Training', color: '#3B82F6', icon: 'barbell-outline'   as const },
  other:    { label: 'Other',    color: '#9CA3AF', icon: 'pin-outline'        as const },
};

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff < 7) return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Section row ──────────────────────────────────────────────────────────────

function SectionRow({ label, linkLabel, onLink, primaryColor }: {
  label: string; linkLabel?: string; onLink?: () => void; primaryColor?: string;
}) {
  return (
    <View style={secSt.row}>
      <Text style={secSt.label}>{label}</Text>
      {linkLabel && (
        <TouchableOpacity onPress={onLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[secSt.link, primaryColor ? { color: primaryColor } : {}]}>{linkLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const secSt = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 28, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.muted, letterSpacing: 1 },
  link:  { fontSize: 13, fontWeight: '600' },
});

// ─── Featured next-up card ────────────────────────────────────────────────────

function AttendanceBar({ attending, notAttending, total }: { attending: number; notAttending: number; total: number }) {
  if (total === 0) return null;
  const goingPct    = Math.min(100, Math.round((attending    / total) * 100));
  const cantPct     = Math.min(100 - goingPct, Math.round((notAttending / total) * 100));
  const pendingPct  = 100 - goingPct - cantPct;
  return (
    <View style={abSt.wrap}>
      <View style={abSt.track}>
        {goingPct > 0   && <View style={[abSt.seg, { flex: goingPct,   backgroundColor: '#22C55E' }]} />}
        {cantPct > 0    && <View style={[abSt.seg, { flex: cantPct,    backgroundColor: '#EF4444' }]} />}
        {pendingPct > 0 && <View style={[abSt.seg, { flex: pendingPct, backgroundColor: PULSE_COLORS.ui.border }]} />}
      </View>
      <View style={abSt.legend}>
        <View style={abSt.legendItem}>
          <View style={[abSt.dot, { backgroundColor: '#22C55E' }]} />
          <Text style={abSt.legendText}>{attending} going</Text>
        </View>
        <View style={abSt.legendItem}>
          <View style={[abSt.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={abSt.legendText}>{notAttending} can't</Text>
        </View>
        <View style={abSt.legendItem}>
          <View style={[abSt.dot, { backgroundColor: PULSE_COLORS.ui.border }]} />
          <Text style={abSt.legendText}>{total - attending - notAttending} pending</Text>
        </View>
      </View>
    </View>
  );
}
const abSt = StyleSheet.create({
  wrap:        { gap: 7, marginBottom: 16 },
  track:       { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: PULSE_COLORS.ui.border },
  seg:         { height: '100%' },
  legend:      { flexDirection: 'row', gap: 12 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  legendText:  { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '500' },
});

function NextUpCard({ ev, total, primaryColor, secondaryColor, onPress, onEdit }: {
  ev: EventRow; total: number; primaryColor: string; secondaryColor: string;
  onPress: () => void; onEdit: () => void;
}) {
  const cfg = TYPE_CFG[ev.type] ?? TYPE_CFG.other;

  return (
    <TouchableOpacity
      style={[nuSt.card, { borderColor: `${cfg.color}28` }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[nuSt.stripe, { backgroundColor: cfg.color }]} />

      <View style={nuSt.body}>
        {/* Type badge + date */}
        <View style={nuSt.metaRow}>
          <View style={[nuSt.typeBadge, { backgroundColor: `${cfg.color}18` }]}>
            <Ionicons name={cfg.icon} size={11} color={cfg.color} />
            <Text style={[nuSt.typeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={nuSt.dateText}>
            {formatDate(ev.event_date)}{ev.event_time ? `  ·  ${formatTime(ev.event_time)}` : ''}
          </Text>
        </View>

        {/* Title */}
        <Text style={nuSt.title} numberOfLines={2}>{ev.title}</Text>

        {/* Location */}
        {ev.location ? (
          <View style={nuSt.locationRow}>
            <Ionicons name="location-outline" size={13} color={PULSE_COLORS.ui.muted} />
            <Text style={nuSt.locationText} numberOfLines={1}>{ev.location}</Text>
          </View>
        ) : (
          <View style={{ height: 6 }} />
        )}

        {/* Attendance bar */}
        <AttendanceBar attending={ev.attending} notAttending={ev.not_attending} total={total} />

        {/* Actions */}
        <View style={nuSt.actions}>
          <TouchableOpacity
            style={[nuSt.primaryBtn, { backgroundColor: primaryColor }]}
            onPress={onPress}
            activeOpacity={0.85}
          >
            <Text style={nuSt.primaryBtnText}>View details</Text>
            <Ionicons name="chevron-forward" size={14} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={nuSt.secondaryBtn}
            onPress={onEdit}
            activeOpacity={0.75}
          >
            <Ionicons name="create-outline" size={15} color={PULSE_COLORS.ui.text} />
            <Text style={nuSt.secondaryBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const nuSt = StyleSheet.create({
  card:          { flexDirection: 'row', backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 18, borderWidth: 1, marginHorizontal: 16, overflow: 'hidden' },
  stripe:        { width: 5, alignSelf: 'stretch' },
  body:          { flex: 1, padding: 16, gap: 0 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  typeBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  typeText:      { fontSize: 10, fontWeight: '700' },
  dateText:      { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500', flex: 1 },
  title:         { fontSize: 20, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.3, marginBottom: 6 },
  locationRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  locationText:  { fontSize: 12, color: PULSE_COLORS.ui.muted, flex: 1 },
  actions:       { flexDirection: 'row', gap: 10 },
  primaryBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 11 },
  primaryBtnText:{ fontSize: 14, fontWeight: '800', color: '#000' },
  secondaryBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: PULSE_COLORS.ui.border },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
});

// ─── Compact event card (upcoming list + past) ────────────────────────────────

function EventCard({ ev, total, isPast, onPress, onEdit }: {
  ev: EventRow; total: number; isPast: boolean;
  onPress: () => void; onEdit: () => void;
}) {
  const cfg = TYPE_CFG[ev.type] ?? TYPE_CFG.other;
  const goingPct   = total > 0 ? Math.min(100, Math.round((ev.attending      / total) * 100)) : 0;
  const cantPct    = total > 0 ? Math.min(100 - goingPct, Math.round((ev.not_attending / total) * 100)) : 0;
  const pendingPct = 100 - goingPct - cantPct;

  return (
    <TouchableOpacity
      style={[ecSt.card, isPast && ecSt.cardPast]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[ecSt.stripe, { backgroundColor: cfg.color }]} />
      <View style={ecSt.body}>
        <View style={ecSt.topRow}>
          <View style={[ecSt.typeBadge, { backgroundColor: `${cfg.color}18` }]}>
            <Ionicons name={cfg.icon} size={10} color={cfg.color} />
            <Text style={[ecSt.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <Text style={ecSt.title} numberOfLines={1}>{ev.title}</Text>
        <Text style={ecSt.meta}>
          {formatDate(ev.event_date)}
          {ev.event_time ? `  ·  ${formatTime(ev.event_time)}` : ''}
          {ev.location ? `  ·  ${ev.location}` : ''}
        </Text>
        {total > 0 && (
          <View style={ecSt.barTrack}>
            {goingPct   > 0 && <View style={[ecSt.barSeg, { flex: goingPct,   backgroundColor: '#22C55E' }]} />}
            {cantPct    > 0 && <View style={[ecSt.barSeg, { flex: cantPct,    backgroundColor: '#EF4444' }]} />}
            {pendingPct > 0 && <View style={[ecSt.barSeg, { flex: pendingPct, backgroundColor: PULSE_COLORS.ui.border }]} />}
          </View>
        )}
      </View>
      <View style={ecSt.rsvpBadge}>
        <Text style={ecSt.rsvpGoing}>{ev.attending}</Text>
        <Text style={ecSt.rsvpOf}>/{total}</Text>
      </View>
      <TouchableOpacity style={ecSt.editBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="create-outline" size={17} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
const ecSt = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 14, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, overflow: 'hidden' },
  cardPast:  { opacity: 0.5 },
  stripe:    { width: 4, alignSelf: 'stretch' },
  body:      { flex: 1, paddingVertical: 10, paddingLeft: 12, paddingRight: 8, gap: 2 },
  topRow:    { marginBottom: 2 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, alignSelf: 'flex-start' },
  typeLabel: { fontSize: 9, fontWeight: '700' },
  title:     { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text },
  meta:      { fontSize: 11, color: PULSE_COLORS.ui.muted },
  barTrack:  { height: 4, borderRadius: 2, overflow: 'hidden', flexDirection: 'row', marginTop: 6, backgroundColor: PULSE_COLORS.ui.border },
  barSeg:    { height: '100%' },
  rsvpBadge: { flexDirection: 'row', alignItems: 'baseline', paddingRight: 2 },
  rsvpGoing: { fontSize: 14, fontWeight: '800', color: '#22C55E' },
  rsvpOf:    { fontSize: 10, color: PULSE_COLORS.ui.muted, fontWeight: '600' },
  editBtn:   { padding: 11 },
});

// ─── 3-col manage cards ───────────────────────────────────────────────────────

function ManageCard({ icon, label, color, bg, onPress }: {
  icon: any; label: string; color: string; bg: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={mcSt.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[mcSt.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={mcSt.label} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}
const mcSt = StyleSheet.create({
  card:  { flex: 1, alignItems: 'center', backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, paddingVertical: 18, gap: 8 },
  icon:  { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: PULSE_COLORS.ui.text, textAlign: 'center', paddingHorizontal: 4 },
});

// ─── AI tool row cards (grouped) ──────────────────────────────────────────────

function AiToolCard({ icon, color, bg, label, desc, onPress, showDivider }: {
  icon: any; color: string; bg: string; label: string; desc: string;
  onPress: () => void; showDivider?: boolean;
}) {
  return (
    <>
      {showDivider && <View style={atSt.divider} />}
      <TouchableOpacity style={atSt.row} onPress={onPress} activeOpacity={0.75}>
        <View style={[atSt.icon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={atSt.label}>{label}</Text>
          <Text style={atSt.desc}>{desc}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
      </TouchableOpacity>
    </>
  );
}
const atSt = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  icon:    { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  desc:    { fontSize: 12, color: PULSE_COLORS.ui.muted, lineHeight: 16 },
  divider: { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginHorizontal: 16 },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { primaryColor, rgba, secondaryColor, onSecondary } = useClub();
  const { clubSlug } = useLocalSearchParams<{ clubSlug: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { team, allTeams, selectTeam, loading: teamLoading, refetch } = useTeam();

  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [past,     setPast]     = useState<EventRow[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [search, setSearch]               = useState('');
  const [editTeamOpen, setEditTeamOpen]   = useState(false);

  const [attendancePlayers,  setAttendancePlayers]  = useState<AttendancePlayer[]>([]);
  const [pastEventCount,     setPastEventCount]     = useState(0);
  const [attendanceExpanded, setAttendanceExpanded] = useState(false);
  const [eventsWithoutSurface, setEventsWithoutSurface] = useState(0);
  const [surfaceNudgeDismissed, setSurfaceNudgeDismissed] = useState(false);

  const avgRsvp = useMemo(() => {
    if (!upcoming.length || !total) return '—';
    const avg = upcoming.reduce((s, e) => s + e.attending / total, 0) / upcoming.length;
    return `${Math.round(avg * 100)}%`;
  }, [upcoming, total]);

  const load = useCallback(async () => {
    if (!team) {
      if (!teamLoading) setLoading(false);
      return;
    }
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [upRes, pastRes, playerRes, pastEventsRes, rosterRes] = await Promise.all([
      supabase.from('events')
        .select('id, title, type, event_date, event_time, location')
        .eq('team_id', team.id).gte('event_date', today)
        .is('cancelled_at', null)
        .order('event_date').order('event_time').limit(20),
      supabase.from('events')
        .select('id, title, type, event_date, event_time, location')
        .eq('team_id', team.id).lt('event_date', today)
        .is('cancelled_at', null)
        .order('event_date', { ascending: false }).limit(5),
      supabase.from('players')
        .select('*', { count: 'exact', head: true }).eq('team_id', team.id),
      supabase.from('events')
        .select('id')
        .eq('team_id', team.id).lt('event_date', today)
        .is('cancelled_at', null),
      supabase.from('players')
        .select('id, full_name, jersey_number')
        .eq('team_id', team.id)
        .order('jersey_number'),
    ]);

    const playerCount = playerRes.count ?? 0;
    setTotal(playerCount);

    // ── Attendance calculation ──────────────────────────────────────────────
    const pastEventIds = (pastEventsRes.data ?? []).map((e) => e.id);
    setPastEventCount(pastEventIds.length);
    if (pastEventIds.length > 0 && (rosterRes.data ?? []).length > 0) {
      const { data: rsvps } = await supabase
        .from('event_attendance')
        .select('event_id, player_id')
        .in('event_id', pastEventIds)
        .eq('status', 'present');
      const attendedMap: Record<string, number> = {};
      (rsvps ?? []).forEach((r) => {
        attendedMap[r.player_id] = (attendedMap[r.player_id] ?? 0) + 1;
      });
      const roster = (rosterRes.data ?? []) as { id: string; full_name: string; jersey_number: number | null }[];
      const players: AttendancePlayer[] = roster.map((p) => {
        const attended = attendedMap[p.id] ?? 0;
        return {
          id: p.id,
          full_name: p.full_name,
          jersey_number: p.jersey_number,
          attended,
          total: pastEventIds.length,
          pct: Math.round((attended / pastEventIds.length) * 100),
        };
      }).sort((a, b) => b.pct - a.pct);
      setAttendancePlayers(players);
    } else {
      setAttendancePlayers([]);
    }

    async function enrich(rows: any[]): Promise<EventRow[]> {
      if (!rows.length) return [];
      const ids = rows.map((r) => r.id);
      const { data: rsvps } = await supabase
        .from('event_rsvps').select('event_id, status').in('event_id', ids);
      const attendingMap: Record<string, number> = {};
      const notAttendingMap: Record<string, number> = {};
      (rsvps ?? []).forEach((r) => {
        if (r.status === 'attending') attendingMap[r.event_id] = (attendingMap[r.event_id] ?? 0) + 1;
        if (r.status === 'not_attending') notAttendingMap[r.event_id] = (notAttendingMap[r.event_id] ?? 0) + 1;
      });
      return rows.map((r) => ({
        ...r,
        attending: attendingMap[r.id] ?? 0,
        not_attending: notAttendingMap[r.id] ?? 0,
      }));
    }

    const [upEnriched, pastEnriched, surfaceRes] = await Promise.all([
      enrich(upRes.data ?? []),
      enrich(pastRes.data ?? []),
      supabase.from('events').select('*', { count: 'exact', head: true })
        .eq('team_id', team.id).gte('event_date', today).is('cancelled_at', null).is('field_type', null),
    ]);

    setUpcoming(upEnriched);
    setPast(pastEnriched);
    setEventsWithoutSurface(surfaceRes.count ?? 0);
    setLoading(false);
  }, [team?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load, teamLoading]));

  const slug = clubSlug ?? '';
  const isOrgAdmin = profile?.role === 'org_admin';
  const filteredTeams = useMemo(
    () => allTeams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
    [allTeams, search],
  );

  return (
    <View style={st.root}>
      <ClubHeader
        title={team?.name ?? 'Select Team'}
        subtitle="Admin Panel"
        onBack={() => router.back()}
        onPressTitle={(isOrgAdmin || allTeams.length > 1) ? () => { setSearch(''); setPickerVisible(true); } : undefined}
        right={
          <TouchableOpacity
            style={[headerBtnStyle as object, { backgroundColor: secondaryColor }]}
            onPress={() => router.push(`/(app)/${slug}/create-event` as any)}
          >
            <Ionicons name="add" size={16} color={onSecondary} />
            <Text style={{ color: onSecondary, fontWeight: '800', fontSize: 12 }}>Event</Text>
          </TouchableOpacity>
        }
      />

      {/* Team edit modal */}
      <TeamEditModal
        visible={editTeamOpen}
        team={team}
        primaryColor={primaryColor}
        onClose={() => setEditTeamOpen(false)}
        onSaved={async () => { setEditTeamOpen(false); await refetch(); }}
      />

      {/* Team picker modal */}
      <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={tp.root}>
          <View style={tp.header}>
            <Text style={tp.title}>Switch team</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={PULSE_COLORS.ui.text} />
            </TouchableOpacity>
          </View>
          <View style={tp.searchWrap}>
            <Ionicons name="search-outline" size={16} color={PULSE_COLORS.ui.muted} />
            <TextInput
              style={tp.searchInput}
              placeholder="Search teams…"
              placeholderTextColor={PULSE_COLORS.ui.muted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filteredTeams}
            keyExtractor={(t) => t.id}
            contentContainerStyle={tp.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.id === team?.id;
              return (
                <TouchableOpacity
                  style={[tp.row, active && { backgroundColor: `${primaryColor}12` }]}
                  onPress={() => { selectTeam(item.id); setPickerVisible(false); }}
                  activeOpacity={0.75}
                >
                  <View style={[tp.dot, { backgroundColor: active ? primaryColor : PULSE_COLORS.ui.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[tp.rowName, active && { color: primaryColor }]}>{item.name}</Text>
                    {item.age_group ? <Text style={tp.rowMeta}>{item.age_group}{item.season ? `  ·  ${item.season}` : ''}</Text> : null}
                  </View>
                  {active && <Ionicons name="checkmark" size={16} color={primaryColor} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={tp.empty}>
                <Text style={tp.emptyText}>No teams match "{search}"</Text>
              </View>
            }
          />
        </View>
      </Modal>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={primaryColor} size="large" />
        </View>
      ) : !team ? (
        <ScrollView contentContainerStyle={st.noTeamScroll} showsVerticalScrollIndicator={false}>
          <Ionicons name="shield-outline" size={52} color={PULSE_COLORS.ui.muted} />
          <Text style={st.noTeamTitle}>No teams yet</Text>
          <Text style={st.noTeamBody}>Get your club set up using one of the options below.</Text>

          <TouchableOpacity style={[st.noTeamCard, { borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,255,255,0.07)' }]} onPress={() => router.push(`/(app)/${slug}/admin/club-import` as any)} activeOpacity={0.75}>
            <View style={[st.noTeamCardIcon, { backgroundColor: primaryColor }]}>
              <Ionicons name="sparkles" size={22} color="#ffffff" />
            </View>
            <View style={st.noTeamCardText}>
              <Text style={st.noTeamCardTitle}>Import Club with AI</Text>
              <Text style={st.noTeamCardSub}>Upload a spreadsheet — AI creates all your teams, players and coaches</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={[st.noTeamCard, { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surface }]} onPress={() => router.push(`/(app)/${slug}/admin/club-schedule` as any)} activeOpacity={0.75}>
            <View style={[st.noTeamCardIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
              <Ionicons name="calendar" size={22} color="#3B82F6" />
            </View>
            <View style={st.noTeamCardText}>
              <Text style={st.noTeamCardTitle}>Import Season Schedule</Text>
              <Text style={st.noTeamCardSub}>Upload a PDF or spreadsheet and AI adds all events automatically</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={[st.noTeamCard, { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surface }]} onPress={() => router.push(`/(app)/${slug}/create-event` as any)} activeOpacity={0.75}>
            <View style={[st.noTeamCardIcon, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
              <Ionicons name="add-circle" size={22} color="#F97316" />
            </View>
            <View style={st.noTeamCardText}>
              <Text style={st.noTeamCardTitle}>Create Event</Text>
              <Text style={st.noTeamCardSub}>Manually add a game, training session or other event</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

          {/* Stats strip */}
          <View style={st.statsRow}>
            <View style={st.statCell}>
              <Text style={[st.statNum, { color: primaryColor }]}>{total}</Text>
              <Text style={st.statLabel}>Players</Text>
            </View>
            <View style={st.statDivider} />
            <View style={st.statCell}>
              <Text style={[st.statNum, { color: primaryColor }]}>{upcoming.length}</Text>
              <Text style={st.statLabel}>Events</Text>
            </View>
            <View style={st.statDivider} />
            <View style={st.statCell}>
              <Text style={[st.statNum, { color: primaryColor }]}>{avgRsvp}</Text>
              <Text style={st.statLabel}>Avg RSVP</Text>
            </View>
          </View>

          {/* Surface type nudge */}
          {!surfaceNudgeDismissed && eventsWithoutSurface > 0 && (
            <View style={st.nudgeBanner}>
              <View style={st.nudgeIconWrap}>
                <Ionicons name="layers-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.nudgeTitle}>
                  {eventsWithoutSurface} upcoming {eventsWithoutSurface === 1 ? 'event' : 'events'} missing a surface type
                </Text>
                <Text style={st.nudgeSub}>
                  Open Edit Event and add Grass, Turf or Indoor — it shows on players' home cards
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSurfaceNudgeDismissed(true)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Ionicons name="close" size={18} color={PULSE_COLORS.ui.muted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Featured next event */}
          {upcoming.length > 0 && (
            <>
              <SectionRow label="NEXT UP" />
              <NextUpCard
                ev={upcoming[0]}
                total={total}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                onPress={() => router.push(`/(app)/${slug}/event/${upcoming[0].id}` as any)}
                onEdit={() => router.push(`/(app)/${slug}/edit-event/${upcoming[0].id}` as any)}
              />
            </>
          )}

          {/* Remaining upcoming */}
          {upcoming.length > 1 && (
            <>
              <SectionRow
                label="UPCOMING"
                linkLabel="See all"
                onLink={() => router.push(`/(app)/${slug}/(tabs)/schedule` as any)}
                primaryColor={primaryColor}
              />
              <View style={st.eventList}>
                {upcoming.slice(1, 5).map((ev) => (
                  <EventCard
                    key={ev.id} ev={ev} total={total} isPast={false}
                    onPress={() => router.push(`/(app)/${slug}/event/${ev.id}` as any)}
                    onEdit={() => router.push(`/(app)/${slug}/edit-event/${ev.id}` as any)}
                  />
                ))}
              </View>
            </>
          )}

          {/* Empty schedule state */}
          {upcoming.length === 0 && (
            <>
              <SectionRow label="SCHEDULE" />
              <View style={st.emptyCard}>
                <Ionicons name="calendar-outline" size={28} color={PULSE_COLORS.ui.muted} />
                <Text style={st.emptyTitle}>No upcoming events</Text>
                <TouchableOpacity onPress={() => router.push(`/(app)/${slug}/create-event` as any)}>
                  <Text style={[st.emptyLink, { color: primaryColor }]}>Create your first event →</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Attendance */}
          <SectionRow label="ATTENDANCE" />
          <View style={st.aiGroup}>
            {pastEventCount === 0 ? (
              <View style={st.attendanceEmpty}>
                <Ionicons name="bar-chart-outline" size={24} color={PULSE_COLORS.ui.muted} />
                <Text style={st.attendanceEmptyText}>No completed events yet — attendance will appear here.</Text>
              </View>
            ) : (
              <>
                {(attendanceExpanded ? attendancePlayers : attendancePlayers.slice(0, 5)).map((p, i) => {
                  const barColor = p.pct >= 75 ? '#22C55E' : p.pct >= 50 ? '#F59E0B' : '#EF4444';
                  return (
                    <View key={p.id}>
                      {i > 0 && <View style={atndSt.divider} />}
                      <View style={atndSt.row}>
                        <View style={atndSt.jersey}>
                          <Text style={atndSt.jerseyText}>{p.jersey_number ?? '—'}</Text>
                        </View>
                        <Text style={atndSt.name} numberOfLines={1}>{p.full_name}</Text>
                        <View style={atndSt.rightCol}>
                          <Text style={[atndSt.pct, { color: barColor }]}>{p.attended}/{p.total} · {p.pct}%</Text>
                          <View style={atndSt.barTrack}>
                            <View style={[atndSt.barFill, { flex: p.pct, backgroundColor: barColor }]} />
                            {p.pct < 100 && <View style={[atndSt.barEmpty, { flex: 100 - p.pct }]} />}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {attendancePlayers.length > 5 && (
                  <>
                    <View style={atndSt.divider} />
                    <TouchableOpacity style={atndSt.viewAllRow} onPress={() => setAttendanceExpanded((e) => !e)} activeOpacity={0.7}>
                      <Text style={[atndSt.viewAllText, { color: primaryColor }]}>
                        {attendanceExpanded ? 'Show less' : `View all ${attendancePlayers.length} players`}
                      </Text>
                      <Ionicons
                        name={attendanceExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={primaryColor}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>

          {/* Manage */}
          <SectionRow label="MANAGE" />
          <View style={st.manageGrid}>
            <ManageCard
              icon="add-circle-outline" label="Create Event"
              color={primaryColor} bg={rgba(0.12)}
              onPress={() => router.push(`/(app)/${slug}/create-event` as any)}
            />
            <ManageCard
              icon="people-outline" label="Roster"
              color="#3B82F6" bg="rgba(59,130,246,0.12)"
              onPress={() => router.push(`/(app)/${slug}/(tabs)/roster` as any)}
            />
            <ManageCard
              icon="megaphone-outline" label="Announce"
              color="#8B5CF6" bg="rgba(139,92,246,0.12)"
              onPress={() => router.push(`/(app)/${slug}/(tabs)/chat` as any)}
            />
          </View>
          {isOrgAdmin && (
            <TouchableOpacity
              style={[st.pendingInvitesBtn, { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surface, marginBottom: 0 }]}
              onPress={() => router.push(`/(app)/${slug}/admin/club-calendar` as any)}
              activeOpacity={0.8}
            >
              <View style={[st.pendingInvitesIcon, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
                <Ionicons name="calendar-outline" size={18} color="#6366F1" />
              </View>
              <View style={st.pendingInvitesMeta}>
                <Text style={st.pendingInvitesLabel}>Club Calendar</Text>
                <Text style={st.pendingInvitesSub}>All teams' games and training, week by week</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[st.pendingInvitesBtn, { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surface }]}
            onPress={() => router.push(`/(app)/${slug}/admin/pending-invites` as any)}
            activeOpacity={0.8}
          >
            <View style={[st.pendingInvitesIcon, { backgroundColor: 'rgba(234,179,8,0.1)' }]}>
              <Ionicons name="mail-outline" size={18} color="#EAB308" />
            </View>
            <View style={st.pendingInvitesMeta}>
              <Text style={st.pendingInvitesLabel}>Pending Invites</Text>
              <Text style={st.pendingInvitesSub}>Resend reminders to coaches and parents</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
          </TouchableOpacity>

          {team && (
            <TouchableOpacity
              style={[st.pendingInvitesBtn, { borderColor: PULSE_COLORS.ui.border, backgroundColor: PULSE_COLORS.ui.surface }]}
              onPress={() => setEditTeamOpen(true)}
              activeOpacity={0.8}
            >
              <View style={[st.pendingInvitesIcon, { backgroundColor: rgba(0.1) }]}>
                <Ionicons name="settings-outline" size={18} color={primaryColor} />
              </View>
              <View style={st.pendingInvitesMeta}>
                <Text style={st.pendingInvitesLabel}>Team Settings</Text>
                <Text style={st.pendingInvitesSub}>Edit team name, age group and season</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={PULSE_COLORS.ui.muted} />
            </TouchableOpacity>
          )}

          {/* AI tools */}
          <SectionRow label="AI TOOLS" />
          <View style={st.aiGroup}>
            {isOrgAdmin && (
              <>
                <AiToolCard
                  icon="sparkles-outline" color="#8B5CF6" bg="rgba(139,92,246,0.12)"
                  label="Import Club"
                  desc="Create all teams, coaches and players at once"
                  onPress={() => router.push(`/(app)/${slug}/admin/club-import` as any)}
                  showDivider
                />
                <AiToolCard
                  icon="calendar-outline" color="#F97316" bg="rgba(249,115,22,0.12)"
                  label="Club Schedule"
                  desc="Import the full season schedule from the league"
                  onPress={() => router.push(`/(app)/${slug}/admin/club-schedule` as any)}
                />
              </>
            )}
          </View>

          {/* Develop */}
          <SectionRow label="DEVELOP" />
          <View style={st.aiGroup}>
            <AiToolCard
              icon="ribbon-outline" color="#A855F7" bg="rgba(168,85,247,0.12)"
              label="Player Evaluations"
              desc="Rate players and generate AI-powered report cards"
              onPress={() => router.push(`/(app)/${slug}/admin/evaluations` as any)}
            />
          </View>

          {/* Reports */}
          <SectionRow label="REPORTS" />
          <View style={st.aiGroup}>
            <AiToolCard
              icon="bar-chart-outline" color="#22c55e" bg="rgba(34,197,94,0.12)"
              label="Season Stats"
              desc="Playing time ranking and percentage for every player"
              onPress={() => router.push(`/(app)/${slug}/admin/season-stats` as any)}
            />
            <AiToolCard
              icon="videocam-outline" color="#8B5CF6" bg="rgba(139,92,246,0.12)"
              label="Recordings"
              desc="All game and training recordings linked to events"
              onPress={() => router.push(`/(app)/${slug}/admin/recordings` as any)}
            />
            <AiToolCard
              icon="people-outline" color="#F59E0B" bg="rgba(245,158,11,0.12)"
              label="Guest Activity"
              desc="All cross-team guest appearances for your club"
              onPress={() => router.push(`/(app)/${slug}/admin/guest-activity` as any)}
            />
          </View>

          {/* Recent results */}
          {past.length > 0 && (
            <>
              <SectionRow label="RECENT RESULTS" />
              <View style={st.eventList}>
                {past.map((ev) => (
                  <EventCard
                    key={ev.id} ev={ev} total={total} isPast
                    onPress={() => router.push(`/(app)/${slug}/event/${ev.id}` as any)}
                    onEdit={() => router.push(`/(app)/${slug}/edit-event/${ev.id}` as any)}
                  />
                ))}
              </View>
            </>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:   { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noTeamScroll:    { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48, gap: 12 },
  noTeamTitle:     { fontSize: 20, fontWeight: '700', color: PULSE_COLORS.ui.text, marginTop: 16 },
  noTeamBody:      { fontSize: 14, color: PULSE_COLORS.ui.muted, textAlign: 'center', marginBottom: 8 },
  noTeamCard:      { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  noTeamCardIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noTeamCardText:  { flex: 1 },
  noTeamCardTitle: { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  noTeamCardSub:   { fontSize: 13, color: PULSE_COLORS.ui.muted, lineHeight: 18 },
  scroll: { paddingTop: 4, paddingBottom: 24 },

  // Surface type nudge
  nudgeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)', padding: 14,
  },
  nudgeIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  nudgeTitle:  { fontSize: 13, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 3 },
  nudgeSub:    { fontSize: 12, color: PULSE_COLORS.ui.textSecondary, lineHeight: 17 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  backBtn:      { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.3 },
  headerSub:    { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 1, fontWeight: '500' },
  teamSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  createBtnText: { fontSize: 13, fontWeight: '800', color: '#000' },

  // Stats
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PULSE_COLORS.ui.surface,
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },
  statCell:    { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 3 },
  statDivider: { width: 1, height: 40, backgroundColor: PULSE_COLORS.ui.border },
  statNum:     { fontSize: 22, fontWeight: '800' },
  statLabel:   { fontSize: 11, color: PULSE_COLORS.ui.muted, fontWeight: '600' },

  // Event list
  eventList: { marginHorizontal: 16, gap: 8 },

  // Empty
  emptyCard: {
    alignItems: 'center', paddingVertical: 32,
    backgroundColor: PULSE_COLORS.ui.surface,
    marginHorizontal: 16, borderRadius: 16,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border, gap: 8,
  },
  emptyTitle: { fontSize: 15, color: PULSE_COLORS.ui.textSecondary, fontWeight: '500' },
  emptyLink:  { fontSize: 14, fontWeight: '600', marginTop: 4 },

  // Manage 3-col grid
  manageGrid: { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
  pendingInvitesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 10, padding: 14,
    borderRadius: 14, borderWidth: 1,
  },
  pendingInvitesIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pendingInvitesMeta: { flex: 1 },
  pendingInvitesLabel: { fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text, marginBottom: 2 },
  pendingInvitesSub:   { fontSize: 12, color: PULSE_COLORS.ui.muted },

  // AI tools grouped card
  aiGroup: {
    marginHorizontal: 16,
    backgroundColor: PULSE_COLORS.ui.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PULSE_COLORS.ui.border,
    overflow: 'hidden',
  },

  // Attendance
  attendanceEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20,
  },
  attendanceEmptyText: { fontSize: 13, color: PULSE_COLORS.ui.muted, flex: 1, lineHeight: 18 },
});

// ─── Attendance row styles ────────────────────────────────────────────────────

const atndSt = StyleSheet.create({
  divider:    { height: 1, backgroundColor: PULSE_COLORS.ui.border, marginHorizontal: 16 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  jersey:     { width: 28, height: 28, borderRadius: 7, backgroundColor: PULSE_COLORS.ui.surfaceAlt, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  jerseyText: { fontSize: 11, fontWeight: '800', color: PULSE_COLORS.ui.text },
  name:       { flex: 1, fontSize: 13, fontWeight: '600', color: PULSE_COLORS.ui.text },
  rightCol:   { alignItems: 'flex-end', gap: 4, minWidth: 90 },
  pct:        { fontSize: 11, fontWeight: '700' },
  barTrack:   { height: 4, borderRadius: 2, overflow: 'hidden', flexDirection: 'row', width: 80, backgroundColor: PULSE_COLORS.ui.border },
  barFill:    { height: '100%' },
  barEmpty:   { height: '100%' },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12 },
  viewAllText:{ fontSize: 13, fontWeight: '600' },
});

// ─── Team picker modal styles ─────────────────────────────────────────────────

const tp = StyleSheet.create({
  root:        { flex: 1, backgroundColor: PULSE_COLORS.ui.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  title:       { fontSize: 20, fontWeight: '800', color: PULSE_COLORS.ui.text, letterSpacing: -0.3 },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: PULSE_COLORS.ui.surface, borderRadius: 12, borderWidth: 1, borderColor: PULSE_COLORS.ui.border, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: PULSE_COLORS.ui.text },
  list:        { paddingBottom: 40 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border },
  dot:         { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowName:     { fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text },
  rowMeta:     { fontSize: 12, color: PULSE_COLORS.ui.muted, marginTop: 2 },
  empty:       { padding: 40, alignItems: 'center' },
  emptyText:   { fontSize: 14, color: PULSE_COLORS.ui.muted },
});
