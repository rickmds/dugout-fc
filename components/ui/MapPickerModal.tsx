import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MapApp } from '../../hooks/useMapApp';
import { PULSE_COLORS } from '../../constants/colors';

const MAP_OPTIONS: { app: MapApp; label: string; icon: string; color: string }[] = [
  { app: 'apple',  label: 'Apple Maps',  icon: 'map-outline',       color: '#007AFF' },
  { app: 'google', label: 'Google Maps', icon: 'navigate-outline',   color: '#EA4335' },
  { app: 'waze',   label: 'Waze',        icon: 'car-sport-outline',  color: '#33CCFF' },
];

type Props = {
  visible: boolean;
  onConfirm: (app: MapApp, remember: boolean) => void;
  onDismiss: () => void;
};

export function MapPickerModal({ visible, onConfirm, onDismiss }: Props) {
  const [selected, setSelected] = useState<MapApp>('apple');
  const [remember, setRemember] = useState(false);

  function handleOpen() {
    onConfirm(selected, remember);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>

          {/* Handle bar */}
          <View style={styles.handle} />

          <Text style={styles.title}>Open with...</Text>

          {/* App options */}
          <View style={styles.options}>
            {MAP_OPTIONS.map((opt) => {
              const isSelected = selected === opt.app;
              return (
                <TouchableOpacity
                  key={opt.app}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => setSelected(opt.app)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionIcon, { backgroundColor: `${opt.color}18` }]}>
                    <Ionicons name={opt.icon as any} size={20} color={opt.color} />
                  </View>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Remember toggle */}
          <View style={styles.rememberRow}>
            <View style={styles.rememberText}>
              <Text style={styles.rememberLabel}>Remember my choice</Text>
              <Text style={styles.rememberSub}>You can change this in Settings</Text>
            </View>
            <Switch
              value={remember}
              onValueChange={setRemember}
              trackColor={{ false: PULSE_COLORS.ui.border, true: PULSE_COLORS.brand.green }}
              thumbColor="#fff"
            />
          </View>

          {/* Actions */}
          <TouchableOpacity style={styles.openBtn} onPress={handleOpen}>
            <Ionicons name="navigate" size={16} color="#000" />
            <Text style={styles.openBtnText}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: PULSE_COLORS.ui.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: PULSE_COLORS.ui.border,
    alignSelf: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 18, fontWeight: '700', color: PULSE_COLORS.ui.text,
    marginBottom: 16,
  },

  options: {
    gap: 8, marginBottom: 20,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14,
  },
  optionRowSelected: {
    borderColor: PULSE_COLORS.brand.green,
    backgroundColor: 'rgba(34,197,94,0.06)',
  },
  optionIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: {
    flex: 1, fontSize: 16, fontWeight: '600', color: PULSE_COLORS.ui.text,
  },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: PULSE_COLORS.ui.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: PULSE_COLORS.brand.green },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: PULSE_COLORS.brand.green,
  },

  rememberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14, padding: 14, marginBottom: 20,
  },
  rememberText: { flex: 1, gap: 2 },
  rememberLabel: { fontSize: 15, fontWeight: '600', color: PULSE_COLORS.ui.text },
  rememberSub: { fontSize: 12, color: PULSE_COLORS.ui.muted },

  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: PULSE_COLORS.brand.green,
    borderRadius: 14, paddingVertical: 15, marginBottom: 10,
  },
  openBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  cancelBtn: {
    alignItems: 'center', paddingVertical: 13,
    backgroundColor: PULSE_COLORS.ui.surfaceAlt,
    borderWidth: 1, borderColor: PULSE_COLORS.ui.border,
    borderRadius: 14,
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: PULSE_COLORS.ui.textSecondary },
});
