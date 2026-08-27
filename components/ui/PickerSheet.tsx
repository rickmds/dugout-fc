import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PULSE_COLORS } from '../../constants/colors';
import { useClub } from '../../hooks/useClub';

// A scrollable bottom-sheet list picker for a single numeric value (duration,
// arrival buffer, etc.) — tap a row to select and auto-close.
export default function PickerSheet({
  visible, title, options, value, onChange, onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const { primaryColor, rgba } = useClub();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ps.overlay} activeOpacity={1} onPress={onClose} />
      <View style={ps.sheet}>
        <View style={ps.handle} />
        <Text style={ps.title}>{title}</Text>
        <FlatList
          data={options}
          keyExtractor={(o) => String(o.value)}
          style={{ maxHeight: 320 }}
          initialScrollIndex={Math.max(0, options.findIndex((o) => o.value === value))}
          getItemLayout={(_, i) => ({ length: 52, offset: 52 * i, index: i })}
          renderItem={({ item }) => {
            const sel = item.value === value;
            return (
              <TouchableOpacity
                style={[ps.row, sel && [ps.rowSelected, { backgroundColor: rgba(0.08) }]]}
                onPress={() => { onChange(item.value); onClose(); }}
              >
                <Text style={[ps.rowText, sel && [ps.rowTextSelected, { color: primaryColor }]]}>{item.label}</Text>
                {sel && <Ionicons name="checkmark" size={18} color={primaryColor} />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const ps = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, backgroundColor: PULSE_COLORS.ui.border,
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  title: {
    fontSize: 16, fontWeight: '700', color: PULSE_COLORS.ui.text,
    padding: 16, borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, height: 52,
    borderBottomWidth: 1, borderBottomColor: PULSE_COLORS.ui.border,
  },
  rowSelected: { backgroundColor: 'rgba(34,197,94,0.08)' },
  rowText: { fontSize: 15, color: PULSE_COLORS.ui.text },
  rowTextSelected: { color: PULSE_COLORS.brand.green, fontWeight: '700' },
});
