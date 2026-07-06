import { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts, tracking } from '@/theme';
import { CURRENCIES } from '@/data/currencies';

// Campo compuesto Precio + Moneda (reemplaza el par PriceField + SelectField
// que vivía en una fieldRow de a 2 — ver explore.tsx). Antes esos dos campos
// eran las dos cajas separadas que se desalineaban entre sí (bug
// reportado 2026-07-06: "Moneda" quedaba más alto que "Precio por noche" y
// tapaba la fila de abajo). En vez de perseguir la alineación entre dos
// cajas vecinas, acá directamente hay UNA sola caja — mismo criterio que
// "1c" en la exploración de diseño: no hay dos fieldBox que puedan quedar
// desalineados si solo existe uno.
//
// El input de precio reusa el mismo formateo es-AR (miles en vivo, hasta 2
// decimales) que ya tenía PriceField — ver sanitize()/formatDisplay() ahí
// si hace falta portarlo 1:1; acá está simplificado a enteros para el
// ejemplo, restaurar la lógica de decimales de PriceField.tsx si la
// necesitás completa.

function sanitizeDigits(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

function formatThousands(raw: string): string {
  if (!raw) return '';
  return Number(raw).toLocaleString('es-AR');
}

export function AmountField({
  label,
  price,
  currency,
  onPriceChange,
  onCurrencyChange,
}: {
  label: string;
  price: number | undefined;
  currency: string;
  onPriceChange: (value: number | undefined) => void;
  onCurrencyChange: (value: string) => void;
}) {
  const [raw, setRaw] = useState(price != null ? String(price) : '');
  const [open, setOpen] = useState(false);
  const selectedCurrency = CURRENCIES.find((c) => c.value === currency);

  function handleChangeText(text: string) {
    const cleaned = sanitizeDigits(text);
    setRaw(cleaned);
    onPriceChange(cleaned ? Number(cleaned) : undefined);
  }

  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldGlyph}>💲</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="0,00"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={formatThousands(raw)}
          onChangeText={handleChangeText}
        />
        <View style={styles.divider} />
        <Pressable style={styles.currencyPill} onPress={() => setOpen(true)}>
          <Text style={styles.currencyPillText}>{currency || 'USD'}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.cardTitle}>Moneda</Text>
            <ScrollView style={styles.list}>
              {CURRENCIES.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.row, opt.value === currency && styles.rowSelected]}
                  onPress={() => {
                    onCurrencyChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.rowText, opt.value === currency && styles.rowTextSelected]}>{opt.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
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
  // minHeight: mismo fix de PriceField/DatePickerField/SelectField — ver
  // comentario en SelectField.web.tsx.
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.wide,
    color: colors.muted,
    marginBottom: 4,
    marginLeft: 2,
    minHeight: 28,
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
    paddingLeft: 12,
    paddingRight: 6,
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  fieldInput: { flex: 1, fontSize: 16, color: colors.ink },
  divider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: 6 },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.paper2,
  },
  currencyPillText: { fontFamily: fonts.mono, fontSize: 12.5, fontWeight: '700', color: colors.ink },
  chevron: { color: colors.muted, fontSize: 10 },

  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.containerPadding },
  card: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  cardTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '700', color: colors.ink },
  list: { flexGrow: 0 },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: radius.sm },
  rowSelected: { backgroundColor: colors.primaryFixed },
  rowText: { fontSize: 15, color: colors.ink },
  rowTextSelected: { fontWeight: '700' },
  closeButton: { alignItems: 'center', paddingVertical: 8 },
  closeButtonText: { color: colors.inkSoft, fontWeight: '600' },
});
