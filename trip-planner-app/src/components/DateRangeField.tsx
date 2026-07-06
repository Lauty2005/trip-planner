import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';

// Campo compuesto Check-in + Check-out (reemplaza el par de DatePickerField
// que vivía en una fieldRow de a 2 en el form de hotel — ver explore.tsx).
// Un solo campo, un solo calendario: el primer día tocado es el check-in,
// el segundo (posterior) es el check-out; tocar un día anterior al
// check-in ya elegido reinicia la selección. Mismo criterio que
// AmountField.tsx — reemplaza dos cajas que podían desalinearse por una
// sola caja que no tiene con qué desalinearse.
//
// La grilla de calendario (buildCalendarGrid) es la misma lógica que ya
// tenía DatePickerField.tsx — portada tal cual, ver ese archivo si hace
// falta el detalle de por qué arranca en domingo, etc.

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

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

function fmt(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export function DateRangeField({
  checkIn,
  checkOut,
  onChangeCheckIn,
  onChangeCheckOut,
  minDate,
}: {
  checkIn: string;
  checkOut: string;
  onChangeCheckIn: (iso: string) => void;
  onChangeCheckOut: (iso: string) => void;
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => (checkIn ? new Date(checkIn) : new Date()));

  function shiftMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function handleSelectDay(day: Date) {
    const iso = toISODate(day);
    const min = minDate ? new Date(minDate) : null;
    if (min && startOfDay(day) < startOfDay(min)) return;

    if (!checkIn || (checkIn && checkOut)) {
      onChangeCheckIn(iso);
      onChangeCheckOut('');
      return;
    }
    if (iso < checkIn) {
      onChangeCheckIn(iso);
      onChangeCheckOut('');
      return;
    }
    onChangeCheckOut(iso);
    setOpen(false);
  }

  const grid = buildCalendarGrid(viewDate);
  const display = checkIn ? `${fmt(checkIn)}${checkOut ? ' → ' + fmt(checkOut) : ' → …'}` : '';

  return (
    <View>
      <Text style={styles.fieldLabel}>ESTADÍA</Text>
      <Pressable style={styles.fieldBox} onPress={() => setOpen(true)}>
        <Text style={styles.fieldGlyph}>🗓️</Text>
        <Text style={[styles.fieldText, !display && styles.fieldPlaceholder]}>
          {display || 'Elegí check-in y check-out'}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.calendarCard} onPress={() => {}}>
            <Text style={styles.hint}>Tocá el check-in y después el check-out.</Text>
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
                const isStart = checkIn === iso;
                const isEnd = checkOut === iso;
                const inRange = !!checkIn && !!checkOut && iso > checkIn && iso < checkOut;
                return (
                  <Pressable
                    key={i}
                    style={[
                      styles.dayCell,
                      (isStart || isEnd) && styles.dayCellSelected,
                      inRange && styles.dayCellInRange,
                    ]}
                    disabled={isDisabled}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !inMonth && styles.dayTextOutside,
                        isDisabled && styles.dayTextDisabled,
                        (isStart || isEnd) && styles.dayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
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
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  hint: { fontSize: 12, color: colors.muted },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { fontSize: 24, color: colors.stamp, paddingHorizontal: 12 },
  calendarTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '700', color: colors.ink },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 11, fontWeight: '600', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCellSelected: { backgroundColor: colors.primary, borderRadius: radius.full },
  dayCellInRange: { backgroundColor: colors.primaryFixed },
  dayText: { fontSize: 14, color: colors.onSurface },
  dayTextOutside: { color: colors.outlineVariant },
  dayTextDisabled: { color: colors.outlineVariant },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  closeButton: { alignItems: 'center', paddingVertical: 8 },
  closeButtonText: { color: colors.onSurfaceVariant, fontWeight: '600' },
});
