import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';

// Campo compuesto Fecha + Hora (reemplaza el par DatePickerField +
// TimePickerField que vivía en una fieldRow de a 2 — salida/llegada del
// form de vuelo en explore.tsx). Un solo campo abre un solo Modal: arriba
// el calendario de siempre, abajo las dos columnas hora/minuto — elegir el
// día NO cierra el modal (todavía falta la hora); elegir hora Y minuto sí
// cierra, para no obligar a dos toques separados en dos campos.

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildCalendarGrid(viewDate: Date): Date[] {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function DateTimeField({
  label,
  glyph = '🗓️',
  date,
  time,
  onChangeDate,
  onChangeTime,
  minDate,
}: {
  label: string;
  glyph?: string;
  date: string;
  time: string;
  onChangeDate: (iso: string) => void;
  onChangeTime: (hhmm: string) => void;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (date ? new Date(date) : new Date()));
  const [draftHour, setDraftHour] = useState(time ? time.split(':')[0] : '');
  const [draftMinute, setDraftMinute] = useState(time ? time.split(':')[1] : '');

  function handleOpen() {
    setViewDate(date ? new Date(date) : new Date());
    setDraftHour(time ? time.split(':')[0] : '');
    setDraftMinute(time ? time.split(':')[1] : '');
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function handleSelectDay(day: Date) {
    const min = minDate ? new Date(minDate) : null;
    if (min && startOfDay(day) < startOfDay(min)) return;
    onChangeDate(toISODate(day));
    if (draftHour && draftMinute) setOpen(false);
  }

  function handleSelectHour(h: string) {
    setDraftHour(h);
    if (date && draftMinute) {
      onChangeTime(`${h}:${draftMinute}`);
      setOpen(false);
    }
  }

  function handleSelectMinute(m: string) {
    setDraftMinute(m);
    if (date && draftHour) {
      onChangeTime(`${draftHour}:${m}`);
      setOpen(false);
    }
  }

  const grid = buildCalendarGrid(viewDate);
  const display = date
    ? new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) + (time ? ` · ${time}` : '')
    : '';

  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Pressable style={styles.fieldBox} onPress={handleOpen}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <Text style={[styles.fieldText, !display && styles.fieldPlaceholder]}>{display || 'Elegí fecha y hora'}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.hint}>Elegí el día y después la hora.</Text>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => shiftMonth(-1)} hitSlop={8}>
                <Text style={styles.navArrow}>‹</Text>
              </Pressable>
              <Text style={styles.calendarTitle}>
                {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </Text>
              <Pressable onPress={() => shiftMonth(1)} hitSlop={8}>
                <Text style={styles.navArrow}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((w, i) => (
                <Text key={i} style={styles.weekdayLabel}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {grid.map((day, i) => {
                const iso = toISODate(day);
                const inMonth = day.getMonth() === viewDate.getMonth();
                const min = minDate ? new Date(minDate) : null;
                const isDisabled = !!min && startOfDay(day) < startOfDay(min);
                const isSelected = date === iso;
                return (
                  <Pressable
                    key={i}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                    disabled={isDisabled}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !inMonth && styles.dayTextOutside,
                        isDisabled && styles.dayTextDisabled,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.divider} />
            <Text style={styles.timeLabel}>HORA</Text>
            <View style={styles.timeColumns}>
              <ScrollView style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <Pressable key={h} style={[styles.timeCell, h === draftHour && styles.timeCellSelected]} onPress={() => handleSelectHour(h)}>
                    <Text style={[styles.timeCellText, h === draftHour && styles.timeCellTextSelected]}>{h}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <Pressable key={m} style={[styles.timeCell, m === draftMinute && styles.timeCellSelected]} onPress={() => handleSelectMinute(m)}>
                    <Text style={[styles.timeCellText, m === draftMinute && styles.timeCellTextSelected]}>{m}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CELL_HEIGHT = 36;

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 4,
    marginLeft: 4,
  },
  fieldBox: {
    height: spacing.fieldHeight,
    boxSizing: 'border-box' as any,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  fieldText: { flex: 1, fontSize: 16, color: colors.ink },
  fieldPlaceholder: { color: colors.muted },

  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.containerPadding },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackSm,
    ...cardShadow,
  },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { fontSize: 22, color: colors.stamp, paddingHorizontal: 10 },
  calendarTitle: { fontFamily: fonts.displaySemibold, fontSize: 15, fontWeight: '700', color: colors.ink },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 10.5, fontWeight: '600', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCellSelected: { backgroundColor: colors.primary, borderRadius: radius.full },
  dayText: { fontSize: 13, color: colors.onSurface },
  dayTextOutside: { color: colors.outlineVariant },
  dayTextDisabled: { color: colors.outlineVariant },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
  timeLabel: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: tracking.wide, textTransform: 'uppercase', color: colors.muted },
  timeColumns: { flexDirection: 'row', gap: 6, height: CELL_HEIGHT * 3.2 },
  timeColumn: { flex: 1 },
  timeCell: { height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  timeCellSelected: { backgroundColor: colors.primary },
  timeCellText: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink },
  timeCellTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  closeButton: { alignItems: 'center', paddingVertical: 6 },
  closeButtonText: { color: colors.onSurfaceVariant, fontWeight: '600' },
});
