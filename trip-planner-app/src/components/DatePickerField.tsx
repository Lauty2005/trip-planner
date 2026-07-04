import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';

// Selector de fecha propio, sin dependencias nativas nuevas: un modal con
// grilla de calendario armada a mano (Date + matemática de días básica).
// Se eligió esto en vez de @react-native-community/datetimepicker porque
// esta sesión de desarrollo no puede correr `npm install` para validar una
// dependencia nativa nueva — este componente funciona con lo que ya está
// instalado (Modal/Pressable/View son parte de react-native "core").

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

function parseISODate(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Grilla de 6 semanas x 7 días para el mes de `viewDate`, completando con
// días del mes anterior/siguiente para que siempre arranque en domingo.
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

export function DatePickerField({
  glyph,
  label,
  placeholder,
  value,
  onChange,
  minDate,
}: {
  glyph: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (iso: string) => void;
  // Fecha ISO mínima seleccionable (ej: hoy, o el check-in para el
  // check-out). Los días anteriores se muestran deshabilitados.
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const min = parseISODate(minDate);
  const [viewDate, setViewDate] = useState(() => selected ?? min ?? new Date());

  function handleOpen() {
    setViewDate(selected ?? min ?? new Date());
    setOpen(true);
  }

  function handleSelectDay(day: Date) {
    if (min && startOfDay(day) < startOfDay(min)) return;
    onChange(toISODate(day));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const grid = buildCalendarGrid(viewDate);
  const displayText = selected
    ? selected.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.fieldBox} onPress={handleOpen}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <Text style={[styles.fieldText, !displayText && styles.fieldPlaceholder]}>
          {displayText || placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Pressable interno sin handler propio de onPress más que no-op:
              corta la propagación para que tocar el calendario no cierre el
              modal (solo lo cierra tocar el fondo o "Cerrar"). */}
          <Pressable style={styles.calendarCard} onPress={() => {}}>
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
                const inMonth = day.getMonth() === viewDate.getMonth();
                const isSelected = selected != null && toISODate(day) === toISODate(selected);
                const isDisabled = !!min && startOfDay(day) < startOfDay(min);
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
  // minHeight: ver comentario del mismo fix en PriceField.tsx.
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 4,
    marginLeft: 4,
    minHeight: 28,
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
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { fontSize: 24, color: colors.stamp, paddingHorizontal: 12 },
  calendarTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '700', color: colors.ink },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 11, fontWeight: '600', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: { backgroundColor: colors.primary, borderRadius: radius.full },
  dayText: { fontSize: 14, color: colors.onSurface },
  dayTextOutside: { color: colors.outlineVariant },
  dayTextDisabled: { color: colors.outlineVariant },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  closeButton: { alignItems: 'center', paddingVertical: 8 },
  closeButtonText: { color: colors.onSurfaceVariant, fontWeight: '600' },
});
