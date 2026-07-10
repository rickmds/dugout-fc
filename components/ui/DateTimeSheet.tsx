import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PULSE_COLORS } from '../../constants/colors';

const ITEM_H    = 54;
const SIDE      = 2;
const COL_H     = ITEM_H * (SIDE * 2 + 1);
const DATE_DAYS = 730; // 2 years

const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];

function WheelCol({
  items, initIndex, onSelect, flex = 1,
}: {
  items: string[]; initIndex: number; onSelect: (i: number) => void; flex?: number;
}) {
  const listRef = useRef<FlatList>(null);
  const [sel, setSel] = useState(initIndex);
  const padded = [...Array(SIDE).fill(''), ...items, ...Array(SIDE).fill('')];

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, initIndex) * ITEM_H,
        animated: false,
      });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  function settle(e: any) {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, raw));
    setSel(clamped);
    onSelect(clamped);
  }

  return (
    <View style={{ flex, height: COL_H, overflow: 'hidden' }}>
      <FlatList
        ref={listRef}
        data={padded}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        bounces={false}
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
        onMomentumScrollEnd={settle}
        renderItem={({ item, index: i }) => {
          const dist = Math.abs((i - SIDE) - sel);
          return (
            <View style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
              {item ? (
                <Text style={{
                  fontSize: dist === 0 ? 20 : 16,
                  fontWeight: dist === 0 ? '700' : '400',
                  color: dist === 0 ? '#FFF' : dist === 1 ? '#555' : '#2B2B2B',
                }}>{item}</Text>
              ) : null}
            </View>
          );
        }}
      />
      {/* selection band */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: ITEM_H * SIDE, left: 12, right: 12,
        height: ITEM_H,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.15)',
      }} />
    </View>
  );
}

export function DateTimeSheet({
  visible, mode, value, minimumDate, minuteInterval = 5, title, onConfirm, onClose,
}: {
  visible: boolean;
  mode: 'date' | 'time';
  value: Date;
  minimumDate?: Date;
  minuteInterval?: number;
  title: string;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const mins = useMemo(() =>
    Array.from({ length: Math.floor(60 / minuteInterval) }, (_, i) =>
      String(i * minuteInterval).padStart(2, '0')
    ),
    [minuteInterval]
  );

  // Build a flat list of Date objects starting from minimumDate (or today)
  const dateList = useMemo(() => {
    const base = new Date(minimumDate ?? new Date());
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: DATE_DAYS }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, []);

  // "Wed, Jun 18" — weekday sits right next to the date as you scroll
  const dateLabels = useMemo(() =>
    dateList.map(d =>
      d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    ),
    [dateList]
  );

  function findDateIdx(v: Date) {
    const target = new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
    const idx = dateList.findIndex(d => d.getTime() === target);
    return Math.max(0, idx);
  }

  const [dateIdx,   setDateIdx]   = useState(() => findDateIdx(value));
  const h0 = value.getHours();
  // index 0='1', ..., index 10='11', index 11='12'
  const [hourIdx,   setHourIdx]   = useState(h0 % 12 === 0 ? 11 : (h0 % 12) - 1);
  const [minIdx,    setMinIdx]    = useState(
    Math.min(Math.round(value.getMinutes() / minuteInterval), mins.length - 1)
  );
  const [periodIdx, setPeriodIdx] = useState(h0 >= 12 ? 1 : 0);
  const [colKey,    setColKey]    = useState(0);

  useEffect(() => {
    if (!visible) return;
    const hh = value.getHours();
    setDateIdx(findDateIdx(value));
    setHourIdx(hh % 12 === 0 ? 11 : (hh % 12) - 1);
    setMinIdx(Math.min(Math.round(value.getMinutes() / minuteInterval), mins.length - 1));
    setPeriodIdx(hh >= 12 ? 1 : 0);
    setColKey(k => k + 1);
  }, [visible]);

  function buildDate() { return new Date(dateList[dateIdx]); }

  function buildTime() {
    const out = new Date(value);
    // hourIdx 0='1' ... 10='11' 11='12'; h12%12 handles the noon/midnight wrap
    out.setHours((hourIdx + 1) % 12 + (periodIdx === 1 ? 12 : 0), parseInt(mins[minIdx]), 0, 0);
    return out;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.side}>
            <Text style={s.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.title}>{title}</Text>
          <TouchableOpacity
            onPress={() => { onConfirm(mode === 'date' ? buildDate() : buildTime()); onClose(); }}
            style={s.side}
          >
            <Text style={s.done}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={s.wheelRow}>
          {mode === 'date' ? (
            // Single column — "Wed, Jun 18" rolls together, weekday always visible next to date
            <WheelCol
              key={`date${colKey}`}
              items={dateLabels}
              initIndex={dateIdx}
              onSelect={setDateIdx}
              flex={1}
            />
          ) : (
            <>
              <WheelCol key={`h${colKey}`}  items={HOURS}       initIndex={hourIdx}   onSelect={setHourIdx}   flex={2} />
              <WheelCol key={`mn${colKey}`} items={mins}        initIndex={minIdx}    onSelect={setMinIdx}    flex={2} />
              <WheelCol key={`p${colKey}`}  items={['AM','PM']} initIndex={periodIdx} onSelect={setPeriodIdx} flex={2} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:    { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 48 },
  handle:   { width: 40, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
  },
  side:     { minWidth: 64 },
  title:    { fontSize: 15, fontWeight: '700', color: '#FFF' },
  cancel:   { fontSize: 15, color: '#555' },
  done:     { fontSize: 15, fontWeight: '700', color: PULSE_COLORS.brand.green, textAlign: 'right' },
  wheelRow: { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
});
