import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';

// Selector de hora — mismo espíritu que DatePickerField (modal a medida,
// sin @react-native-community/datetimepicker ni ninguna dependencia nueva):
// dos columnas scrolleables (hora 00-23, minuto 00-59) en vez del <input
// type="time"> nativo del navegador, que en nativo no existe. Ver
// TimePickerField.web.tsx para el equivalente en web.

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parseTime(value: string): { h: string; m: string } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { h: '', m: '' };
  return { h: match[1].padStart(2, '0'), m: match[2] };
}

export function TimePickerField({
  glyph,
  label,
  value,
  onChange,
}: {
  glyph: string;
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState('');
  const [draftMinute, setDraftMinute] = useState('');

  function handleOpen() {
    const parsed = parseTime(value);
    setDraftHour(parsed.h);
    setDraftMinute(parsed.m);
    setOpen(true);
  }

  function handleConfirm() {
    if (!draftHour || !draftMinute) return;
    onChange(`${draftHour}:${draftMinute}`);
    setOpen(false);
  }

  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Pressable style={styles.fieldBox} onPress={handleOpen}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]}>{value || 'Elegí una hora'}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.cardTitle}>{label}</Text>

            <View style={styles.columns}>
              <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <Pressable
                    key={h}
                    style={[styles.cell, h === draftHour && styles.cellSelected]}
                    onPress={() => setDraftHour(h)}
                  >
                    <Text style={[styles.cellText, h === draftHour && styles.cellTextSelected]}>{h}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.colon}>:</Text>

              <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.cell, m === draftMinute && styles.cellSelected]}
                    onPress={() => setDraftMinute(m)}
                  >
                    <Text style={[styles.cellText, m === draftMinute && styles.cellTextSelected]}>{m}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable
              style={[styles.confirmButton, !(draftHour && draftMinute) && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!(draftHour && draftMinute)}
            >
              <Text style={styles.confirmButtonText}>Listo</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL_HEIGHT = 40;

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    color: colors.muted,
    marginBottom: 4,
    marginLeft: 2,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  fieldText: { flex: 1, fontSize: 16, color: colors.ink },
  fieldPlaceholder: { color: colors.muted },

  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.containerPadding,
  },
  card: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  cardTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },

  columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: CELL_HEIGHT * 5 },
  column: { width: 64 },
  colon: { fontFamily: fonts.displaySemibold, fontSize: 20, fontWeight: '700', color: colors.muted, marginHorizontal: 4 },
  cell: { height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  cellSelected: { backgroundColor: colors.primary },
  cellText: { fontFamily: fonts.mono, fontSize: 16, color: colors.ink },
  cellTextSelected: { color: colors.onPrimary, fontWeight: '700' },

  confirmButton: { backgroundColor: colors.ink, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center' },
  confirmButtonDisabled: { opacity: 0.4 },
  confirmButtonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600' },
});
