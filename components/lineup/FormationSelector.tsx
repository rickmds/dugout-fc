import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Formation, GameFormat, FORMATIONS_BY_FORMAT } from '../../constants/formations';
import { DUGOUT_COLORS } from '../../constants/colors';

const FORMATS: GameFormat[] = ['4v4', '7v7', '9v9', '11v11'];

type Props = {
  format: GameFormat;
  onFormatChange: (f: GameFormat) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  favourites: string[];
  onToggleFavourite: (id: string) => void;
};

export function FormationSelector({
  format,
  onFormatChange,
  selectedId,
  onSelect,
  favourites,
  onToggleFavourite,
}: Props) {
  const [tooltip, setTooltip] = useState<Formation | null>(null);

  const formations = FORMATIONS_BY_FORMAT[format];
  const favouritesForFormat = formations.filter((f) => favourites.includes(f.id));

  function renderPill(item: Formation, inFavsRow = false) {
    const isSelected = item.id === selectedId;
    const isFav = favourites.includes(item.id);

    return (
      <TouchableOpacity
        key={item.id + (inFavsRow ? '-fav' : '')}
        style={[styles.pill, isSelected && styles.pillSelected]}
        onPress={() => onSelect(item.id)}
        onLongPress={() => setTooltip(item)}
        delayLongPress={400}
        activeOpacity={0.75}
      >
        <View style={styles.pillBody}>
          <Text style={[styles.pillName, isSelected && styles.pillNameSelected]}>
            {item.name}
          </Text>
          <Text style={styles.pillNickname}>{item.nickname}</Text>
        </View>
        <TouchableOpacity
          style={styles.starBtn}
          onPress={() => onToggleFavourite(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isFav ? 'star' : 'star-outline'}
            size={14}
            color={isFav ? '#FBBF24' : DUGOUT_COLORS.ui.muted}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>

      {/* Format toggle */}
      <View style={styles.formatBar}>
        {FORMATS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.formatBtn, format === f && styles.formatBtnActive]}
            onPress={() => onFormatChange(f)}
            activeOpacity={0.75}
          >
            <Text style={[styles.formatBtnText, format === f && styles.formatBtnTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Favourites row */}
      {favouritesForFormat.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star" size={11} color="#FBBF24" />
            <Text style={styles.sectionLabel}>FAVOURITES</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.favsRow}
          >
            {favouritesForFormat.map((f) => renderPill(f, true))}
          </ScrollView>
        </View>
      )}

      {/* All formations grid */}
      <View style={styles.section}>
        {favouritesForFormat.length > 0 && (
          <Text style={styles.sectionLabel}>ALL FORMATIONS</Text>
        )}
        <View style={styles.grid}>
          {formations.map((f) => renderPill(f))}
        </View>
      </View>

      {/* Long-press tooltip */}
      <Modal
        visible={tooltip !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltip(null)}
      >
        <Pressable style={styles.tooltipOverlay} onPress={() => setTooltip(null)}>
          <View style={styles.tooltipCard}>
            <View style={styles.tooltipHeader}>
              <Text style={styles.tooltipName}>{tooltip?.name}</Text>
              <View style={styles.tooltipBadge}>
                <Text style={styles.tooltipNickname}>{tooltip?.nickname}</Text>
              </View>
            </View>
            <Text style={styles.tooltipDesc}>{tooltip?.description}</Text>
            <Text style={styles.tooltipHint}>Tap anywhere to dismiss</Text>
          </View>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: DUGOUT_COLORS.ui.background,
  },

  // ── Format toggle ─────────────────────────────────────────────────────────
  formatBar: {
    flexDirection: 'row',
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
  },
  formatBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  formatBtnActive: {
    backgroundColor: DUGOUT_COLORS.brand.green,
  },
  formatBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: DUGOUT_COLORS.ui.muted,
  },
  formatBtnTextActive: {
    color: '#000',
  },

  // ── Sections ─────────────────────────────────────────────────────────────
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: DUGOUT_COLORS.ui.muted,
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginBottom: 8,
  },

  // ── Favourites horizontal row ──────────────────────────────────────────
  favsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },

  // ── Formations grid ────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
  },

  // ── Pill ───────────────────────────────────────────────────────────────
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    width: '47%',
    minWidth: 140,
  },
  pillSelected: {
    borderColor: DUGOUT_COLORS.brand.green,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  pillBody: {
    flex: 1,
    gap: 2,
  },
  pillName: {
    fontSize: 14,
    fontWeight: '700',
    color: DUGOUT_COLORS.ui.text,
  },
  pillNameSelected: {
    color: DUGOUT_COLORS.brand.green,
  },
  pillNickname: {
    fontSize: 11,
    color: DUGOUT_COLORS.ui.muted,
  },
  starBtn: {
    paddingLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Tooltip modal ──────────────────────────────────────────────────────
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  tooltipCard: {
    backgroundColor: DUGOUT_COLORS.ui.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
    width: '100%',
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  tooltipName: {
    fontSize: 20,
    fontWeight: '800',
    color: DUGOUT_COLORS.ui.text,
  },
  tooltipBadge: {
    backgroundColor: DUGOUT_COLORS.ui.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: DUGOUT_COLORS.ui.border,
  },
  tooltipNickname: {
    fontSize: 12,
    fontWeight: '600',
    color: DUGOUT_COLORS.ui.muted,
  },
  tooltipDesc: {
    fontSize: 15,
    color: DUGOUT_COLORS.ui.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  tooltipHint: {
    fontSize: 12,
    color: DUGOUT_COLORS.ui.muted,
    textAlign: 'center',
  },
});
