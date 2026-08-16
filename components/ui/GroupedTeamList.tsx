import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';
import { groupTeamsByAgeGroup, sortTeamsByAgeAndGender, TEAM_GROUPING_THRESHOLD } from '../../lib/teamGrouping';

type BaseTeam = { id: string; age_group: string | null; name: string; gender?: string | null };

const GENDER_LABELS: Record<string, string> = { boys: 'Male', girls: 'Female', mixed: 'Mixed' };

type LabeledRow<T> = { key: string; label?: string; team?: T; divider: boolean };

// Inline "Male"/"Female" break within an expanded age group — not another
// tappable level (that would cost an extra tap to reach a team that's one
// tap away today, and actively hurts the common case of a group with only
// one or two teams in it), just a visual chunk so scanning a group of 7-9
// mixed teams isn't one undifferentiated list. Only appears when a group
// actually mixes genders — a single-gender group showing its own label
// would just be a redundant line, not new information.
function buildLabeledRows<T extends BaseTeam>(data: T[], showDividers: boolean): LabeledRow<T>[] {
  const distinctGenders = new Set(data.map((t) => t.gender).filter((g): g is string => !!g && g in GENDER_LABELS));
  const useLabels = distinctGenders.size >= 2;

  const rows: LabeledRow<T>[] = [];
  let lastGender: string | null = null;
  let seenAny = false;
  for (const t of data) {
    const g = t.gender ?? null;
    const isNewCluster = useLabels && g !== lastGender && g && g in GENDER_LABELS;
    if (isNewCluster) rows.push({ key: `label-${g}`, label: GENDER_LABELS[g!], divider: false });
    rows.push({ key: t.id, team: t, divider: showDividers && seenAny && !isNewCluster });
    lastGender = g;
    seenAny = true;
  }
  return rows;
}

interface GroupedTeamListProps<T extends BaseTeam> {
  teams: T[];
  renderRow: (team: T) => React.ReactNode;
  emptyText?: string;
  /** Left offset for the divider between rows, to line up with a row's own icon/padding. */
  dividerInset?: number;
  /** Off for callers whose own row style already separates rows (padding, active-state background) without a line. */
  showDividers?: boolean;
}

// Shared between club settings' team management list and the Home team
// switcher — both browse the same underlying "every team an org_admin can
// see" set and both want the same answer to "how do I find one team out of
// a lot of them quickly": below the threshold, a flat list sorted by age
// then gender is already fast to scan, so headers would just be overhead.
// Above it, each age group collapses behind a tap so scanning 30+ teams
// doesn't mean scrolling past 30+ rows.
export default function GroupedTeamList<T extends BaseTeam>({
  teams,
  renderRow,
  emptyText = 'No teams yet',
  dividerInset = 0,
  showDividers = true,
}: GroupedTeamListProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (teams.length === 0) {
    return (
      <View style={gs.emptyRow}>
        <Text style={gs.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const dividerStyle = { ...gs.divider, marginLeft: dividerInset };

  if (teams.length <= TEAM_GROUPING_THRESHOLD) {
    const sorted = sortTeamsByAgeAndGender(teams);
    return (
      <>
        {buildLabeledRows(sorted, showDividers).map((row) => (
          <View key={row.key}>
            {row.label ? (
              <Text style={gs.genderLabel}>{row.label}</Text>
            ) : (
              <>
                {row.divider && <View style={dividerStyle} />}
                {renderRow(row.team!)}
              </>
            )}
          </View>
        ))}
      </>
    );
  }

  const sections = groupTeamsByAgeGroup(teams);

  function toggle(title: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <>
      {sections.map((section) => {
        const isOpen = expanded.has(section.title);
        return (
          <View key={section.title} style={gs.sectionWrap}>
            <TouchableOpacity
              style={[gs.sectionHeader, isOpen && gs.sectionHeaderOpen]}
              onPress={() => toggle(section.title)}
              activeOpacity={0.7}
            >
              <Text style={gs.sectionHeaderText}>{section.title}</Text>
              <View style={gs.sectionHeaderRight}>
                <View style={gs.countPill}>
                  <Text style={gs.countPillText}>{section.data.length}</Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={PULSE_COLORS.ui.muted} />
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={gs.sectionBody}>
                {buildLabeledRows(section.data, showDividers).map((row) => (
                  <View key={row.key}>
                    {row.label ? (
                      <Text style={gs.genderLabel}>{row.label}</Text>
                    ) : (
                      <>
                        {row.divider && <View style={dividerStyle} />}
                        {renderRow(row.team!)}
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

const gs = StyleSheet.create({
  emptyRow: { paddingVertical: 16, alignItems: 'center' },
  emptyText: { color: PULSE_COLORS.ui.muted, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: PULSE_COLORS.ui.border },

  sectionWrap: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
  },
  sectionHeaderOpen: {
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  sectionHeaderText: {
    fontSize: 14, fontWeight: '700', color: PULSE_COLORS.ui.text,
    letterSpacing: 0.1,
  },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countPill: {
    minWidth: 24, paddingHorizontal: 7, height: 21, borderRadius: 11,
    backgroundColor: PULSE_COLORS.ui.background,
    alignItems: 'center', justifyContent: 'center',
  },
  countPillText: { fontSize: 11, fontWeight: '700', color: PULSE_COLORS.ui.textSecondary },

  genderLabel: {
    fontSize: 10, fontWeight: '700', color: PULSE_COLORS.ui.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 5,
  },

  sectionBody: {
    borderWidth: 1, borderTopWidth: 0, borderColor: PULSE_COLORS.ui.border,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    backgroundColor: PULSE_COLORS.ui.surface,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
